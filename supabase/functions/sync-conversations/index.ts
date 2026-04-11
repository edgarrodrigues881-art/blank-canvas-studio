import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildEquivalentChatIds } from "../_shared/phone-variants.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type JsonObject = Record<string, any>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" ? value as JsonObject : {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
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
    .filter((node, index, arr) => Object.keys(node).length > 0 && arr.indexOf(node) === index);
}

function inferMediaType(typeValue: string, mimeValue: string, urlValue: string): string | null {
  const typeStr = typeValue.toLowerCase();
  const mime = mimeValue.toLowerCase();
  const url = urlValue.toLowerCase();

  if (["audio", "ptt", "voice"].includes(typeStr)) return "audio";
  if (["image", "photo"].includes(typeStr)) return "image";
  if (typeStr === "video") return "video";
  if (["document", "file"].includes(typeStr)) return "document";
  if (typeStr === "sticker") return "sticker";
  if (typeStr === "contact") return "contact";
  if (typeStr === "location") return "location";

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

async function upsertConversationForEquivalentJid(
  admin: any,
  userId: string,
  deviceId: string,
  payload: {
    remoteJid: string;
    name: string;
    phone: string;
    avatar: string | null;
    lastMessage: string;
    lastMessageAt: string;
  },
) {
  const candidates = buildEquivalentChatIds(payload.remoteJid);
  const { data: existingMatches } = await admin
    .from("conversations")
    .select("id, remote_jid, phone, name, created_at")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .in("remote_jid", candidates)
    .order("created_at", { ascending: true })
    .limit(5);

  const existing = existingMatches?.[0];
  if (existing) {
    const preferredName = existing.name && existing.name !== existing.phone
      ? existing.name
      : payload.name.substring(0, 255);

    const { error } = await admin
      .from("conversations")
      .update({
        name: preferredName,
        phone: existing.phone || payload.phone,
        avatar_url: payload.avatar,
        last_message: payload.lastMessage.substring(0, 500),
        last_message_at: payload.lastMessageAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    return { id: existing.id, error };
  }

  const { data, error } = await admin
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_id,remote_jid" },
    )
    .select("id")
    .maybeSingle();

  return { id: data?.id || null, error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const admin = createClient(supabaseUrl, serviceKey);

    // Check if this is a single-conversation sync request
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const targetConversationId = body.conversation_id || null;
    const targetRemoteJid = body.remote_jid || null;

    // Get all user devices with tokens
    const { data: devices, error: devErr } = await admin
      .from("devices")
      .select("id, name, uazapi_base_url, uazapi_token, number, status")
      .eq("user_id", userId)
      .neq("login_type", "report_wa");

    if (devErr) throw devErr;
    if (!devices || devices.length === 0) {
      return new Response(JSON.stringify({ synced: 0, message: "Nenhum dispositivo encontrado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Single conversation sync mode ──
    if (targetConversationId || targetRemoteJid) {
      return await syncSingleConversation(admin, userId, devices, targetConversationId, targetRemoteJid);
    }

    let totalSynced = 0;
    const errors: string[] = [];

    for (const device of devices) {
      if (!device.uazapi_base_url || !device.uazapi_token) continue;
      if (!["Ready", "Connected", "authenticated"].includes(device.status)) continue;

      const baseUrl = device.uazapi_base_url.replace(/\/$/, "");
      const apiHeaders = {
        token: device.uazapi_token,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const fetchSafe = async (url: string, method = "GET", body?: any): Promise<any> => {
        try {
          const opts: RequestInit = { method, headers: apiHeaders };
          if (body && method === "POST") opts.body = JSON.stringify(body);
          const res = await fetch(url, opts);
          if (!res.ok) {
            console.error(`[${device.name}] ${method} ${url}: ${res.status}`);
            return null;
          }
          return await res.json();
        } catch (e: any) {
          console.error(`[${device.name}] fetch error ${url}: ${e.message}`);
          return null;
        }
      };

      try {
        // Try multiple endpoints to fetch chats (private conversations, not groups)
        let chats: any[] = [];

        // Endpoint 1: /chats (GET) - most common
        const data1 = await fetchSafe(`${baseUrl}/chats?count=100`);
        if (data1) {
          const arr = Array.isArray(data1.chats || data1.data || data1) ? (data1.chats || data1.data || data1) : [];
          chats = arr;
          console.log(`[${device.name}] /chats: ${arr.length} results`);
        }

        // Endpoint 2: /chat/list (GET) - fallback
        if (chats.length === 0) {
          const data2 = await fetchSafe(`${baseUrl}/chat/list?count=100`);
          if (data2) {
            const arr = Array.isArray(data2.chats || data2.data || data2) ? (data2.chats || data2.data || data2) : [];
            chats = arr;
            console.log(`[${device.name}] /chat/list: ${arr.length} results`);
          }
        }

        // Endpoint 3: /chat/getChats (GET) - another fallback
        if (chats.length === 0) {
          const data3 = await fetchSafe(`${baseUrl}/chat/getChats`);
          if (data3) {
            const arr = Array.isArray(data3.chats || data3.data || data3) ? (data3.chats || data3.data || data3) : [];
            chats = arr;
            console.log(`[${device.name}] /chat/getChats: ${arr.length} results`);
          }
        }

        // Endpoint 4: /chat/fetchChats (GET instead of POST)
        if (chats.length === 0) {
          const data4 = await fetchSafe(`${baseUrl}/chat/fetchChats`);
          if (data4) {
            const arr = Array.isArray(data4.chats || data4.data || data4) ? (data4.chats || data4.data || data4) : [];
            chats = arr;
            console.log(`[${device.name}] /chat/fetchChats GET: ${arr.length} results`);
          }
        }

        if (chats.length === 0) {
          console.log(`[${device.name}] No chats found from any endpoint`);
          errors.push(`${device.name}: nenhum chat encontrado`);
          continue;
        }

        // Filter only private chats (exclude groups and status)
        const privateChats = chats.filter((c: any) => {
          const jid = c.JID || c.jid || c.id || c.chatId || "";
          return jid && !jid.endsWith("@g.us") && !jid.includes("status@") && jid !== "status";
        });

        console.log(`[${device.name}] ${privateChats.length} private chats (of ${chats.length} total)`);

        for (const chat of privateChats) {
          const jid = chat.JID || chat.jid || chat.id || chat.chatId || "";
          const phone = jid.replace("@s.whatsapp.net", "").replace("@c.us", "");
          const name = chat.Name || chat.name || chat.pushName || chat.notify || chat.Contact?.name || phone;
          const lastMsg = chat.LastMessage?.Text || chat.lastMessage?.body || chat.last_message?.text || chat.msg?.conversation || "";
          const lastMsgTs = chat.LastMessage?.Timestamp || chat.lastMessage?.timestamp || chat.t || chat.timestamp;
          const lastMsgAt = lastMsgTs
            ? new Date(typeof lastMsgTs === "number" && lastMsgTs < 1e12 ? lastMsgTs * 1000 : lastMsgTs).toISOString()
            : new Date().toISOString();
          const unread = chat.UnreadCount || chat.unreadCount || chat.unread || 0;
          const avatar = chat.ProfilePicUrl || chat.profilePicUrl || chat.imgUrl || chat.Contact?.profilePicUrl || null;

          const { error: upsertErr } = await upsertConversationForEquivalentJid(admin, userId, device.id, {
            remoteJid: jid,
            name,
            phone,
            avatar,
            lastMessage: lastMsg || "",
            lastMessageAt: lastMsgAt,
          });

          if (upsertErr) {
            console.error(`[${device.name}] Upsert error for ${jid}:`, upsertErr.message);
          } else {
            totalSynced++;
          }
        }

        // Fetch recent messages for the top 15 conversations
        const { data: convs } = await admin
          .from("conversations")
          .select("id, remote_jid")
          .eq("user_id", userId)
          .eq("device_id", device.id)
          .order("last_message_at", { ascending: false })
          .limit(15);

        if (convs && convs.length > 0) {
          for (const conv of convs) {
            try {
              // Try multiple endpoints for fetching messages
              let messages: any[] = [];

              for (const chatId of buildEquivalentChatIds(conv.remote_jid)) {
                if (messages.length > 0) break;

                const msgData1 = await fetchSafe(`${baseUrl}/chat/fetchMessages`, "POST", { chatId, count: 30 });
                if (msgData1) {
                  messages = Array.isArray(msgData1.messages || msgData1.data || msgData1) ? (msgData1.messages || msgData1.data || msgData1) : [];
                }

                if (messages.length === 0) {
                  const msgData2 = await fetchSafe(`${baseUrl}/chat/messages?chatId=${encodeURIComponent(chatId)}&count=30`);
                  if (msgData2) {
                    messages = Array.isArray(msgData2.messages || msgData2.data || msgData2) ? (msgData2.messages || msgData2.data || msgData2) : [];
                  }
                }

                if (messages.length === 0) {
                  const msgData3 = await fetchSafe(`${baseUrl}/message/list?chatId=${encodeURIComponent(chatId)}&count=30`);
                  if (msgData3) {
                    messages = Array.isArray(msgData3.messages || msgData3.data || msgData3) ? (msgData3.messages || msgData3.data || msgData3) : [];
                  }
                }
              }

              if (messages.length === 0) continue;

              console.log(`[${device.name}] ${conv.remote_jid}: ${messages.length} messages`);

              for (const msg of messages) {
                const messageNodes = collectMessageNodes(msg);
                const waId = msg.key?.id || msg.id?._serialized || msg.id?.id || msg.messageId || `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                const content = firstString(
                  msg.body,
                  msg.text,
                  msg.caption,
                  msg.content,
                  ...messageNodes.flatMap((node) => [
                    node.conversation,
                    node.text,
                    node.body,
                    node.extendedTextMessage?.text,
                    node.imageMessage?.caption,
                    node.videoMessage?.caption,
                    node.documentMessage?.caption,
                    node.documentMessage?.fileName,
                    typeof node.content === "string" ? node.content : "",
                    node.content?.text,
                  ]),
                );
                const fromMe = msg.key?.fromMe ?? msg.fromMe ?? false;
                const rawTs = msg.messageTimestamp || msg.timestamp || msg.t;
                const timestamp = rawTs
                  ? new Date(typeof rawTs === "number" && rawTs < 1e12 ? rawTs * 1000 : Number(rawTs)).toISOString()
                  : new Date().toISOString();

                const mediaUrl = firstString(
                  msg.mediaUrl,
                  msg.media_url,
                  msg.file,
                  msg.fileUrl,
                  msg.url,
                  ...messageNodes.flatMap((node) => [
                    node.mediaUrl,
                    node.media_url,
                    node.file,
                    node.fileUrl,
                    node.file_url,
                    node.url,
                    node.link,
                    node.imageMessage?.url,
                    node.audioMessage?.url,
                    node.pttMessage?.url,
                    node.videoMessage?.url,
                    node.documentMessage?.url,
                  ]),
                ) || null;

                const mediaType = inferMediaType(
                  firstString(msg.type, msg.messageType, msg.TypeMessage, ...messageNodes.flatMap((node) => [node.type, node.messageType, node.TypeMessage])),
                  firstString(msg.mimetype, msg.mimeType, ...messageNodes.flatMap((node) => [node.mimetype, node.mimeType, node.audioMessage?.mimetype, node.imageMessage?.mimetype, node.videoMessage?.mimetype, node.documentMessage?.mimetype])),
                  mediaUrl || "",
                );

                const audioDuration = mediaType === "audio"
                  ? Number(
                    msg.duration
                    || msg.seconds
                    || messageNodes.map((node) => node.audioMessage?.seconds || node.pttMessage?.seconds || node.duration || node.seconds || null).find((value) => typeof value === "number" && value > 0)
                    || 0
                  ) || null
                  : null;

                await admin.from("conversation_messages").upsert(
                  {
                    conversation_id: conv.id,
                    user_id: userId,
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
                  { onConflict: "whatsapp_message_id" }
                );
              }
            } catch (e: any) {
              console.error(`[${device.name}] Messages error ${conv.remote_jid}:`, e.message);
            }
          }
        }
      } catch (e: any) {
        console.error(`[${device.name}] sync error:`, e.message);
        errors.push(`${device.name}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ synced: totalSynced, devices: devices.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("sync-conversations error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Single conversation sync: fetch messages from UAZAPI for a specific contact ──
async function syncSingleConversation(
  admin: any,
  userId: string,
  devices: any[],
  conversationId: string | null,
  remoteJid: string | null,
) {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Find the conversation(s) to sync
  let conversations: any[] = [];

  if (conversationId) {
    const { data: conv } = await admin.from("conversations")
      .select("id, device_id, remote_jid")
      .eq("id", conversationId)
      .eq("user_id", userId);
    conversations = conv || [];

    // Also find same contact on other devices
    if (conversations.length > 0) {
      const aliases = buildEquivalentChatIds(conversations[0].remote_jid);
      const { data: others } = await admin.from("conversations")
        .select("id, device_id, remote_jid")
        .eq("user_id", userId)
        .in("remote_jid", aliases)
        .neq("id", conversationId);
      if (others) conversations.push(...others);
    }
  } else if (remoteJid) {
    const aliases = buildEquivalentChatIds(remoteJid);
    const { data: convs } = await admin.from("conversations")
      .select("id, device_id, remote_jid")
      .eq("user_id", userId)
      .in("remote_jid", aliases);
    conversations = convs || [];
  }

  if (conversations.length === 0) {
    return json({ synced: 0, message: "Conversa não encontrada" });
  }

  let totalSynced = 0;

  for (const conv of conversations) {
    const device = devices.find((d: any) => d.id === conv.device_id);
    if (!device?.uazapi_base_url || !device?.uazapi_token) continue;
    if (!["Ready", "Connected", "authenticated"].includes(device.status)) continue;

    const baseUrl = device.uazapi_base_url.replace(/\/$/, "");
    const apiHeaders = { token: device.uazapi_token, Accept: "application/json", "Content-Type": "application/json" };

    const fetchSafe = async (url: string, method = "GET", body?: any): Promise<any> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const opts: RequestInit = { method, headers: apiHeaders, signal: controller.signal };
        if (body && method === "POST") opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        clearTimeout(timeoutId);
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };

    try {
      let messages: any[] = [];

      for (const chatId of buildEquivalentChatIds(conv.remote_jid)) {
        if (messages.length > 0) break;

        const endpoints = [
          { url: `${baseUrl}/chat/fetchMessages`, method: "POST", body: { chatId, count: 50 } },
          { url: `${baseUrl}/chat/messages?chatId=${encodeURIComponent(chatId)}&count=50`, method: "GET" },
          { url: `${baseUrl}/message/list?chatId=${encodeURIComponent(chatId)}&count=50`, method: "GET" },
          { url: `${baseUrl}/chat/getMessages?chatId=${encodeURIComponent(chatId)}&count=50`, method: "GET" },
        ];

        for (const ep of endpoints) {
          if (messages.length > 0) break;
          const data = await fetchSafe(ep.url, ep.method, ep.body);
          if (data) {
            messages = Array.isArray(data.messages || data.data || data) ? (data.messages || data.data || data) : [];
          }
        }
      }

      console.log(`[single-sync][${device.name}] ${conv.remote_jid}: ${messages.length} messages`);

      for (const msg of messages) {
        const msgNodes = collectMessageNodes(msg);
        const waId = msg.key?.id || msg.id?._serialized || msg.id?.id || msg.messageId || `sync-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const content = firstString(
          msg.body, msg.text, msg.caption, msg.content,
          ...msgNodes.flatMap((node) => [
            node.conversation, node.text, node.body,
            node.extendedTextMessage?.text,
            node.imageMessage?.caption,
            node.videoMessage?.caption,
            node.documentMessage?.caption,
            node.documentMessage?.fileName,
            typeof node.content === "string" ? node.content : "",
            node.content?.text,
          ]),
        );
        const fromMe = msg.key?.fromMe ?? msg.fromMe ?? false;
        const rawTs = msg.messageTimestamp || msg.timestamp || msg.t;
        const timestamp = rawTs
          ? new Date(typeof rawTs === "number" && rawTs < 1e12 ? rawTs * 1000 : Number(rawTs)).toISOString()
          : new Date().toISOString();

        const mediaUrl = firstString(
          msg.mediaUrl, msg.media_url, msg.file, msg.fileUrl, msg.url,
          ...msgNodes.flatMap((node) => [
            node.mediaUrl, node.media_url, node.file, node.fileUrl, node.url, node.link,
            node.imageMessage?.url, node.audioMessage?.url, node.pttMessage?.url,
            node.videoMessage?.url, node.documentMessage?.url,
          ]),
        ) || null;

        const mediaType = inferMediaType(
          firstString(msg.type, msg.messageType, msg.TypeMessage, ...msgNodes.flatMap((n) => [n.type, n.messageType, n.TypeMessage])),
          firstString(msg.mimetype, msg.mimeType, ...msgNodes.flatMap((n) => [n.mimetype, n.mimeType, n.audioMessage?.mimetype, n.imageMessage?.mimetype, n.videoMessage?.mimetype, n.documentMessage?.mimetype])),
          mediaUrl || "",
        );

        const mediaLabel = mediaType ? ({ audio: "🎧 Áudio", image: "📷 Foto", video: "🎬 Vídeo", document: "📎 Arquivo", sticker: "🏷️ Figurinha" } as Record<string, string>)[mediaType] || `[${mediaType}]` : "";
        const displayContent = content || mediaLabel || "[mensagem]";

        const audioDuration = mediaType === "audio"
          ? Number(msg.duration || msg.seconds || msgNodes.map((n) => n.audioMessage?.seconds || n.pttMessage?.seconds || n.duration || null).find((v) => typeof v === "number" && v > 0) || 0) || null
          : null;

        const { error: upsertErr } = await admin.from("conversation_messages").upsert(
          {
            conversation_id: conv.id,
            user_id: userId,
            remote_jid: conv.remote_jid,
            content: displayContent.substring(0, 5000),
            direction: fromMe ? "sent" : "received",
            status: fromMe ? (msg.ack >= 3 ? "read" : msg.ack >= 2 ? "delivered" : "sent") : "received",
            media_type: mediaType,
            media_url: mediaUrl,
            audio_duration: audioDuration,
            whatsapp_message_id: waId,
            created_at: timestamp,
          },
          { onConflict: "whatsapp_message_id" }
        );

        if (!upsertErr) totalSynced++;
      }
    } catch (e: any) {
      console.error(`[single-sync][${device.name}] error:`, e.message);
    }
  }

  return json({ synced: totalSynced, mode: "single_conversation" });
}
