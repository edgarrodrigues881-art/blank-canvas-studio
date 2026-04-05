import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body).substring(0, 500));

    const admin = createClient(supabaseUrl, serviceKey);

    // Extract event data - UAZAPI sends different formats
    const event = body.event || body.type || "";
    const instanceId = body.instanceId || body.instance || "";
    const data = body.data || body.message || body;

    // Find the device by instance
    let device: any = null;
    if (instanceId) {
      const { data: devices } = await admin
        .from("devices")
        .select("id, user_id, name, uazapi_base_url")
        .or(`name.eq.${instanceId},uazapi_base_url.ilike.%${instanceId}%`)
        .limit(1);
      device = devices?.[0];
    }

    if (!device) {
      // Try to find by phone number in the message
      const remoteJid = data.key?.remoteJid || data.from || data.chatId || "";
      if (!remoteJid) {
        return new Response(JSON.stringify({ ok: true, skipped: "no_device_found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!device) {
      return new Response(JSON.stringify({ ok: true, skipped: "device_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle message events
    if (event.includes("message") || event.includes("msg") || data.key || data.message) {
      const remoteJid = data.key?.remoteJid || data.from || data.chatId || "";
      if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("status@")) {
        return new Response(JSON.stringify({ ok: true, skipped: "group_or_status" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fromMe = data.key?.fromMe ?? data.fromMe ?? false;
      const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
      const name = data.pushName || data.notify || data.name || phone;
      const content = data.message?.conversation
        || data.message?.extendedTextMessage?.text
        || data.body || data.text || data.caption || "";
      const waId = data.key?.id || data.id?._serialized || `wh-${Date.now()}`;
      const timestamp = data.messageTimestamp
        ? new Date(Number(data.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();

      let mediaType: string | null = null;
      let mediaUrl: string | null = null;
      let audioDuration: number | null = null;

      const msgObj = data.message || {};
      if (msgObj.imageMessage) {
        mediaType = "image";
        mediaUrl = msgObj.imageMessage.url || null;
      } else if (msgObj.audioMessage) {
        mediaType = "audio";
        audioDuration = msgObj.audioMessage.seconds || null;
      } else if (msgObj.documentMessage) {
        mediaType = "document";
        mediaUrl = msgObj.documentMessage.url || null;
      }

      // Upsert conversation
      const { data: conv, error: convErr } = await admin
        .from("conversations")
        .upsert(
          {
            user_id: device.user_id,
            device_id: device.id,
            remote_jid: remoteJid,
            name,
            phone,
            last_message: content.substring(0, 500) || (mediaType ? `[${mediaType}]` : ""),
            last_message_at: timestamp,
            unread_count: fromMe ? 0 : 1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,device_id,remote_jid" }
        )
        .select("id")
        .single();

      if (convErr) {
        console.error("Conversation upsert error:", convErr);
        // Try to get existing conversation
        const { data: existing } = await admin
          .from("conversations")
          .select("id")
          .eq("user_id", device.user_id)
          .eq("device_id", device.id)
          .eq("remote_jid", remoteJid)
          .single();

        if (!existing) {
          return new Response(JSON.stringify({ error: "Failed to upsert conversation" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Insert message with existing conversation
        await admin.from("conversation_messages").upsert(
          {
            conversation_id: existing.id,
            user_id: device.user_id,
            remote_jid: remoteJid,
            content,
            direction: fromMe ? "sent" : "received",
            status: fromMe ? "sent" : "received",
            media_type: mediaType,
            media_url: mediaUrl,
            audio_duration: audioDuration,
            whatsapp_message_id: waId,
            created_at: timestamp,
          },
          { onConflict: "whatsapp_message_id", ignoreDuplicates: true }
        );
      } else if (conv) {
        // Increment unread if not from me
        if (!fromMe) {
          await admin.rpc("", {}).catch(() => {});
          // Just update unread count manually
          const { data: currentConv } = await admin
            .from("conversations")
            .select("unread_count")
            .eq("id", conv.id)
            .single();

          if (currentConv) {
            await admin
              .from("conversations")
              .update({ unread_count: (currentConv.unread_count || 0) + 1 })
              .eq("id", conv.id);
          }
        }

        await admin.from("conversation_messages").upsert(
          {
            conversation_id: conv.id,
            user_id: device.user_id,
            remote_jid: remoteJid,
            content,
            direction: fromMe ? "sent" : "received",
            status: fromMe ? "sent" : "received",
            media_type: mediaType,
            media_url: mediaUrl,
            audio_duration: audioDuration,
            whatsapp_message_id: waId,
            created_at: timestamp,
          },
          { onConflict: "whatsapp_message_id", ignoreDuplicates: true }
        );
      }

      console.log(`Message saved: ${fromMe ? "sent" : "received"} from ${phone} on ${device.name}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("webhook-conversations error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
