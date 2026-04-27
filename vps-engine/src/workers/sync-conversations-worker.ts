// ══════════════════════════════════════════════════════════
// VPS Engine — Sync Conversations Worker
// Periodically pulls private chats + recent messages from UAZAPI
// for every connected device of every user, and upserts them
// into the `conversations` and `conversation_messages` tables.
//
// This worker REPLACES the heavy lifting of the
// `sync-conversations` Supabase Edge Function which was hitting
// the 150-400s CPU limit when users had many instances.
//
// Strategy:
//   - Run every 60s globally
//   - Process devices in parallel batches (10 at a time)
//   - Per device: fetch top 30 private chats, then fetch recent
//     messages for the top 15 chats in parallel
//   - 8s timeout per HTTP call so a single hung instance doesn't
//     block the whole tick
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";
import { buildEquivalentChatIds } from "../utils/phone-variants";

const log = createLogger("sync-conversations");

export let lastSyncConversationsTickAt: Date | null = null;

type JsonObject = Record<string, any>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" ? (value as JsonObject) : {};
}

function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function collectMessageNodes(message: any): JsonObject[] {
  const root = asObject(message);
  const msg = asObject(root.message);
  const inner = asObject(msg.message);
  const payload = asObject(root.data);
  const payloadMsg = asObject(payload.message);
  return [root, msg, inner, payload, payloadMsg]
    .filter((n, i, arr) => Object.keys(n).length > 0 && arr.indexOf(n) === i);
}

function inferMediaType(typeValue: string, mimeValue: string, urlValue: string): string | null {
  const t = typeValue.toLowerCase();
  const mime = mimeValue.toLowerCase();
  const url = urlValue.toLowerCase();
  if (["audio", "ptt", "voice"].includes(t)) return "audio";
  if (["image", "photo"].includes(t)) return "image";
  if (t === "video") return "video";
  if (["document", "file"].includes(t)) return "document";
  if (t === "sticker") return "sticker";
  if (t === "contact") return "contact";
  if (t === "location") return "location";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.includes("application/")) return "document";
  if (/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/.test(url)) return "image";
  if (/\.(mp3|ogg|wav|aac|m4a|opus|webm)(\?|$)/.test(url)) return "audio";
  if (/\.(mp4|mov|avi|mkv|webm)(\?|$)/.test(url)) return "video";
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|csv)(\?|$)/.test(url)) return "document";
  return null;
}

async function fetchWithTimeout(url: string, headers: any, method = "GET", body?: any, ms = 8000): Promise<any> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    const opts: RequestInit = { method, headers };
    if (body && method === "POST") opts.body = JSON.stringify(body);
    (opts as any).signal = c.signal;
    const res = await fetch(url, opts);
    clearTimeout(t);
    if (!res.ok) { try { await res.text(); } catch { /* ignore */ } return null; }
    return await res.json();
  } catch { return null; }
}

async function upsertConversationForEquivalentJid(
  db: any,
  userId: string,
  deviceId: string,
  payload: {
    remoteJid: string;
    name: string;
    phone: string;
    avatar: string | null;
    lastMessage: string;
    lastMessageAt: string;
    unreadCount: number;
  },
): Promise<{ id: string | null; error: any }> {
  const candidates = buildEquivalentChatIds(payload.remoteJid);
  const { data: existingMatches } = await db
    .from("conversations")
    .select("id, remote_jid, phone, name, created_at")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .in("remote_jid", candidates.length ? candidates : [payload.remoteJid])
    .order("created_at", { ascending: true })
    .limit(5);

  const existing = existingMatches?.[0];
  if (existing) {
    const preferredName = existing.name && existing.name !== existing.phone
      ? existing.name
      : payload.name.substring(0, 255);
    const { error } = await db
      .from("conversations")
      .update({
        name: preferredName,
        phone: existing.phone || payload.phone,
        avatar_url: payload.avatar,
        last_message: payload.lastMessage.substring(0, 500),
        last_message_at: payload.lastMessageAt,
        unread_count: payload.unreadCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return { id: existing.id, error };
  }

  const { data, error } = await db
    .from("conversations")
    .upsert(
      {
        user_id: userId,
        device_id: deviceId,
        remote_jid: payload.remoteJid,
        name: payload.name.substring(0, 255),
        phone: payload.phone,
        avatar_url: payload.avatar,
        last_message: payload.lastMessage.substring(0, 500),
        last_message_at: payload.lastMessageAt,
        unread_count: payload.unreadCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_id,remote_jid" },
    )
    .select("id")
    .maybeSingle();

  return { id: data?.id || null, error };
}

interface DeviceRow {
  id: string;
  name: string | null;
  user_id: string;
  status: string;
  uazapi_token: string;
  uazapi_base_url: string;
}

async function syncDevice(db: any, device: DeviceRow): Promise<{ synced: number }> {
  const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
  const apiHeaders = {
    token: device.uazapi_token,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  let synced = 0;

  try {
    // 1) Fetch chat list — primary endpoint, single fallback
    let chats: any[] = [];
    const chatData = await fetchWithTimeout(
      `${baseUrl}/chat/find`, apiHeaders, "POST",
      { operator: "AND", sort: "-wa_lastMsgTimestamp", limit: 30 },
    );
    if (chatData) {
      const arr = chatData.chats || chatData.data || chatData.result || (Array.isArray(chatData) ? chatData : null);
      if (Array.isArray(arr)) chats = arr;
    }
    if (chats.length === 0) {
      const fb = await fetchWithTimeout(`${baseUrl}/chats?count=30`, apiHeaders, "GET");
      if (fb) {
        const arr = fb.chats || fb.data || (Array.isArray(fb) ? fb : null);
        if (Array.isArray(arr)) chats = arr;
      }
    }
    if (chats.length === 0) return { synced: 0 };

    const privateChats = chats.filter((c: any) => {
      const jid = c.wa_chatid || c.JID || c.jid || c.id || c.chatId || c.chatid || "";
      return jid && !jid.endsWith("@g.us") && !jid.includes("status@") && jid !== "status";
    });

    // 2) Upsert conversations
    for (const chat of privateChats) {
      const jid = chat.wa_chatid || chat.JID || chat.jid || chat.id || chat.chatId || chat.chatid || "";
      const phone = jid.replace("@s.whatsapp.net", "").replace("@c.us", "");
      const name = chat.wa_name || chat.lead_name || chat.Name || chat.name || chat.pushName || chat.notify || chat.Contact?.name || phone;
      const lastMsg = chat.wa_lastMessageText || chat.wa_lastMsgText || chat.LastMessage?.Text || chat.lastMessage?.body || chat.last_message?.text || chat.msg?.conversation || "";
      const lastMsgTs = chat.wa_lastMsgTimestamp || chat.wa_lastMessageTimestamp || chat.LastMessage?.Timestamp || chat.lastMessage?.timestamp || chat.t || chat.timestamp;
      const lastMsgAt = lastMsgTs
        ? new Date(typeof lastMsgTs === "number" && lastMsgTs < 1e12 ? lastMsgTs * 1000 : lastMsgTs).toISOString()
        : new Date().toISOString();
      const unread = chat.wa_unreadCount || chat.UnreadCount || chat.unreadCount || chat.unread || 0;
      const avatar = chat.image || chat.imagePreview || chat.ProfilePicUrl || chat.profilePicUrl || chat.imgUrl || chat.Contact?.profilePicUrl || null;

      const { error } = await upsertConversationForEquivalentJid(db, device.user_id, device.id, {
        remoteJid: jid, name, phone, avatar,
        lastMessage: lastMsg || "",
        lastMessageAt: lastMsgAt,
        unreadCount: unread,
      });
      if (!error) synced++;
    }

    // 3) Fetch messages — top 50 conversations in PARALLEL
    const { data: convs } = await db
      .from("conversations")
      .select("id, remote_jid, last_message")
      .eq("user_id", device.user_id)
      .eq("device_id", device.id)
      .order("last_message_at", { ascending: false })
      .limit(50);

    if (!convs || convs.length === 0) return { synced };

    const msgResults = await Promise.all(convs.map(async (conv: any) => {
      const data = await fetchWithTimeout(
        `${baseUrl}/message/find`, apiHeaders, "POST",
        { chatid: conv.remote_jid, limit: 20 },
      );
      let arr: any[] = [];
      if (data) {
        arr = data.messages || data.data || data.result || (Array.isArray(data) ? data : []);
        if (!Array.isArray(arr)) arr = [];
      }
      return { conv, messages: arr };
    }));

    for (const { conv, messages } of msgResults) {
      if (messages.length === 0) continue;

      // Track most recent message to update conversation preview
      let newestPreview: { content: string; ts: string; mediaType: string | null } | null = null;

      for (const msg of messages) {
        const messageNodes = collectMessageNodes(msg);
        const waId = msg.key?.id || msg.id?._serialized || msg.id?.id || msg.messageId
          || `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const content = firstString(
          msg.body, msg.text, msg.caption, msg.content,
          ...messageNodes.flatMap((n) => [
            n.conversation, n.text, n.body,
            n.extendedTextMessage?.text,
            n.imageMessage?.caption,
            n.videoMessage?.caption,
            n.documentMessage?.caption,
            n.documentMessage?.fileName,
            typeof n.content === "string" ? n.content : "",
            n.content?.text,
          ]),
        );
        const fromMe = msg.key?.fromMe ?? msg.fromMe ?? false;
        const rawTs = msg.messageTimestamp || msg.timestamp || msg.t;
        const timestamp = rawTs
          ? new Date(typeof rawTs === "number" && rawTs < 1e12 ? rawTs * 1000 : Number(rawTs)).toISOString()
          : new Date().toISOString();

        const mediaUrl = firstString(
          msg.mediaUrl, msg.media_url, msg.file, msg.fileUrl, msg.url,
          ...messageNodes.flatMap((n) => [
            n.mediaUrl, n.media_url, n.file, n.fileUrl, n.file_url,
            n.url, n.link,
            n.imageMessage?.url, n.audioMessage?.url, n.pttMessage?.url,
            n.videoMessage?.url, n.documentMessage?.url,
          ]),
        ) || null;

        const mediaType = inferMediaType(
          firstString(msg.type, msg.messageType, msg.TypeMessage,
            ...messageNodes.flatMap((n) => [n.type, n.messageType, n.TypeMessage])),
          firstString(msg.mimetype, msg.mimeType,
            ...messageNodes.flatMap((n) => [n.mimetype, n.mimeType, n.audioMessage?.mimetype, n.imageMessage?.mimetype, n.videoMessage?.mimetype, n.documentMessage?.mimetype])),
          mediaUrl || "",
        );

        const audioDuration = mediaType === "audio"
          ? Number(
            msg.duration || msg.seconds
            || messageNodes.map((n) => n.audioMessage?.seconds || n.pttMessage?.seconds || n.duration || n.seconds || null)
              .find((v) => typeof v === "number" && v > 0)
            || 0,
          ) || null
          : null;

        await db.from("conversation_messages").upsert(
          {
            conversation_id: conv.id,
            user_id: device.user_id,
            remote_jid: conv.remote_jid,
            content: content.substring(0, 5000),
            direction: fromMe ? "sent" : "received",
            status: fromMe ? (msg.ack >= 3 ? "read" : msg.ack >= 2 ? "delivered" : "sent") : "received",
            media_type: mediaType,
            media_url: mediaUrl,
            audio_duration: audioDuration,
            whatsapp_message_id: waId,
            created_at: timestamp,
          },
          { onConflict: "whatsapp_message_id" },
        );
      }
    }

    return { synced };
  } catch (e: any) {
    log.warn(`[${device.name}] sync error: ${e?.message || "unknown"}`);
    return { synced };
  }
}

export async function syncConversationsTick(): Promise<void> {
  const db = getDb();
  const startTime = Date.now();
  const DEADLINE_MS = 55_000; // leave headroom before next 60s tick

  // Fetch all eligible (connected) devices across all users
  const { data: devices, error } = await db
    .from("devices")
    .select("id, name, user_id, status, uazapi_token, uazapi_base_url")
    .neq("login_type", "report_wa")
    .not("uazapi_token", "is", null)
    .not("uazapi_base_url", "is", null)
    .in("status", ["Ready", "Connected", "authenticated"]);

  if (error) {
    log.error(`Error fetching devices: ${error.message}`);
    return;
  }

  const eligible = (devices || []) as DeviceRow[];
  if (eligible.length === 0) {
    lastSyncConversationsTickAt = new Date();
    return;
  }

  let totalSynced = 0;
  let totalDevices = 0;

  // Process devices in parallel batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    if (Date.now() - startTime > DEADLINE_MS) {
      log.info(`Deadline approaching: processed ${totalDevices}/${eligible.length} devices`);
      break;
    }
    const batch = eligible.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((d) => syncDevice(db, d)));
    for (const r of results) {
      totalDevices++;
      if (r.status === "fulfilled") totalSynced += r.value.synced;
    }
  }

  const elapsed = Date.now() - startTime;
  if (totalSynced > 0 || totalDevices > 0) {
    log.info(`Sync conversations: ${totalDevices} devices, ${totalSynced} chats upserted, ${elapsed}ms`);
  }

  lastSyncConversationsTickAt = new Date();
}
