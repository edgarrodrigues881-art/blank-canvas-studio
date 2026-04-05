import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

          const { error: upsertErr } = await admin
            .from("conversations")
            .upsert(
              {
                user_id: userId,
                device_id: device.id,
                remote_jid: jid,
                name: name.substring(0, 255),
                phone,
                avatar_url: avatar,
                last_message: (lastMsg || "").substring(0, 500),
                last_message_at: lastMsgAt,
                unread_count: unread,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,device_id,remote_jid" }
            );

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

              // Try /chat/fetchMessages POST
              const msgData1 = await fetchSafe(`${baseUrl}/chat/fetchMessages`, "POST", { chatId: conv.remote_jid, count: 30 });
              if (msgData1) {
                messages = Array.isArray(msgData1.messages || msgData1.data || msgData1) ? (msgData1.messages || msgData1.data || msgData1) : [];
              }

              // Fallback: /chat/messages GET
              if (messages.length === 0) {
                const msgData2 = await fetchSafe(`${baseUrl}/chat/messages?chatId=${encodeURIComponent(conv.remote_jid)}&count=30`);
                if (msgData2) {
                  messages = Array.isArray(msgData2.messages || msgData2.data || msgData2) ? (msgData2.messages || msgData2.data || msgData2) : [];
                }
              }

              // Fallback: /message/list
              if (messages.length === 0) {
                const msgData3 = await fetchSafe(`${baseUrl}/message/list?chatId=${encodeURIComponent(conv.remote_jid)}&count=30`);
                if (msgData3) {
                  messages = Array.isArray(msgData3.messages || msgData3.data || msgData3) ? (msgData3.messages || msgData3.data || msgData3) : [];
                }
              }

              if (messages.length === 0) continue;

              console.log(`[${device.name}] ${conv.remote_jid}: ${messages.length} messages`);

              for (const msg of messages) {
                const waId = msg.key?.id || msg.id?._serialized || msg.id?.id || msg.messageId || `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                const content = msg.message?.conversation
                  || msg.message?.extendedTextMessage?.text
                  || msg.body || msg.text || msg.caption || msg.content || "";
                const fromMe = msg.key?.fromMe ?? msg.fromMe ?? false;
                const rawTs = msg.messageTimestamp || msg.timestamp || msg.t;
                const timestamp = rawTs
                  ? new Date(typeof rawTs === "number" && rawTs < 1e12 ? rawTs * 1000 : Number(rawTs)).toISOString()
                  : new Date().toISOString();

                let mediaType: string | null = null;
                let mediaUrl: string | null = null;
                let audioDuration: number | null = null;
                const msgObj = msg.message || msg;

                if (msgObj.imageMessage || msg.type === "image" || msg.mimetype?.startsWith("image")) {
                  mediaType = "image";
                  mediaUrl = msgObj.imageMessage?.url || msg.mediaUrl || null;
                } else if (msgObj.audioMessage || msg.type === "audio" || msg.type === "ptt" || msg.mimetype?.startsWith("audio")) {
                  mediaType = "audio";
                  audioDuration = msgObj.audioMessage?.seconds || msg.duration || null;
                  mediaUrl = msg.mediaUrl || null;
                } else if (msgObj.documentMessage || msg.type === "document") {
                  mediaType = "document";
                  mediaUrl = msgObj.documentMessage?.url || msg.mediaUrl || null;
                }

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
                  { onConflict: "whatsapp_message_id", ignoreDuplicates: true }
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
