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

    for (const device of devices) {
      if (!device.uazapi_base_url || !device.uazapi_token) continue;
      if (!["Ready", "Connected", "authenticated"].includes(device.status)) continue;

      try {
        // Fetch chats from UAZAPI
        const baseUrl = device.uazapi_base_url.replace(/\/$/, "");
        const resp = await fetch(`${baseUrl}/chat/fetchChats`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: device.uazapi_token,
          },
          body: JSON.stringify({ count: 50 }),
        });

        if (!resp.ok) {
          console.error(`Device ${device.name}: fetch failed ${resp.status}`);
          continue;
        }

        const chats = await resp.json();
        if (!Array.isArray(chats)) {
          console.error(`Device ${device.name}: unexpected response`, typeof chats);
          continue;
        }

        for (const chat of chats) {
          // Skip groups and status broadcasts
          const jid = chat.id || chat.jid || chat.chatId || "";
          if (!jid || jid.endsWith("@g.us") || jid.includes("status@") || jid === "status") continue;

          const phone = jid.replace("@s.whatsapp.net", "").replace("@c.us", "");
          const name = chat.name || chat.pushName || chat.notify || phone;
          const lastMsg = chat.lastMessage?.body || chat.last_message?.text || chat.msg?.conversation || "";
          const lastMsgAt = chat.lastMessage?.timestamp
            ? new Date(chat.lastMessage.timestamp * 1000).toISOString()
            : chat.t ? new Date(chat.t * 1000).toISOString()
            : new Date().toISOString();
          const unread = chat.unreadCount || chat.unread || 0;
          const avatar = chat.profilePicUrl || chat.imgUrl || null;

          // Upsert conversation
          const { error: upsertErr } = await admin
            .from("conversations")
            .upsert(
              {
                user_id: userId,
                device_id: device.id,
                remote_jid: jid,
                name,
                phone,
                avatar_url: avatar,
                last_message: lastMsg.substring(0, 500),
                last_message_at: lastMsgAt,
                unread_count: unread,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,device_id,remote_jid" }
            );

          if (upsertErr) {
            console.error(`Upsert error for ${jid}:`, upsertErr.message);
          } else {
            totalSynced++;
          }
        }

        // Now fetch recent messages for synced conversations
        const { data: convs } = await admin
          .from("conversations")
          .select("id, remote_jid")
          .eq("user_id", userId)
          .eq("device_id", device.id)
          .order("last_message_at", { ascending: false })
          .limit(20);

        if (convs) {
          for (const conv of convs) {
            try {
              const msgResp = await fetch(`${baseUrl}/chat/fetchMessages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", token: device.uazapi_token },
                body: JSON.stringify({ chatId: conv.remote_jid, count: 30 }),
              });

              if (!msgResp.ok) continue;
              const messages = await msgResp.json();
              if (!Array.isArray(messages)) continue;

              for (const msg of messages) {
                const waId = msg.id?._serialized || msg.id?.id || msg.key?.id || `${Date.now()}-${Math.random()}`;
                const content = msg.body || msg.text || msg.conversation || msg.caption || "";
                const fromMe = msg.fromMe ?? msg.key?.fromMe ?? false;
                const timestamp = msg.timestamp || msg.t
                  ? new Date((msg.timestamp || msg.t) * 1000).toISOString()
                  : new Date().toISOString();

                let mediaType: string | null = null;
                let mediaUrl: string | null = null;
                let audioDuration: number | null = null;

                if (msg.type === "image" || msg.mimetype?.startsWith("image")) {
                  mediaType = "image";
                  mediaUrl = msg.mediaUrl || msg.directPath || null;
                } else if (msg.type === "audio" || msg.type === "ptt" || msg.mimetype?.startsWith("audio")) {
                  mediaType = "audio";
                  audioDuration = msg.duration || msg.seconds || null;
                  mediaUrl = msg.mediaUrl || null;
                } else if (msg.type === "document") {
                  mediaType = "document";
                  mediaUrl = msg.mediaUrl || null;
                }

                await admin.from("conversation_messages").upsert(
                  {
                    conversation_id: conv.id,
                    user_id: userId,
                    remote_jid: conv.remote_jid,
                    content,
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
            } catch (e) {
              console.error(`Messages fetch error for ${conv.remote_jid}:`, e);
            }
          }
        }
      } catch (e) {
        console.error(`Device ${device.name} sync error:`, e);
      }
    }

    return new Response(JSON.stringify({ synced: totalSynced, devices: devices.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-conversations error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
