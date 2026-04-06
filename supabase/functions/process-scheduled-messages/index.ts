import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  // Fetch pending messages where scheduled_at <= now
  const { data: pending, error } = await sb
    .from("scheduled_messages")
    .select("*, devices!scheduled_messages_device_id_fkey(id, name, number, uazapi_base_url, uazapi_token, status)")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .limit(20);

  if (error) {
    console.error("Error fetching scheduled messages:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!pending?.length) {
    return new Response(JSON.stringify({ processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let sent = 0;
  let failed = 0;

  for (const msg of pending) {
    try {
      // Get device — either the specified one or first available
      let device = msg.devices;
      if (!device?.uazapi_base_url || !device?.uazapi_token) {
        // Find first available device for user
        const { data: availableDevices } = await sb
          .from("devices")
          .select("id, name, number, uazapi_base_url, uazapi_token, status")
          .eq("user_id", msg.user_id)
          .in("status", ["Ready", "Connected", "authenticated"])
          .not("uazapi_base_url", "is", null)
          .not("uazapi_token", "is", null)
          .neq("login_type", "report_wa")
          .limit(1);

        device = availableDevices?.[0];
      }

      if (!device?.uazapi_base_url || !device?.uazapi_token) {
        await sb.from("scheduled_messages").update({
          status: "failed",
          error_message: "Nenhuma instância conectada disponível",
        }).eq("id", msg.id);
        failed++;
        continue;
      }

      // Send via existing UAZAPI endpoints (same pattern as campaign worker)
      const cleanPhone = msg.contact_phone.replace(/[^0-9]/g, "");
      const endpoints = [
        { path: "/send/text", body: { number: cleanPhone, text: msg.message_content } },
        { path: "/chat/send-text", body: { number: cleanPhone, to: cleanPhone, body: msg.message_content, text: msg.message_content } },
        { path: "/message/sendText", body: { chatId: cleanPhone, text: msg.message_content } },
      ];

      let sendOk = false;
      let lastErr = "";

      for (const ep of endpoints) {
        try {
          const res = await fetch(`${device.uazapi_base_url}${ep.path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: device.uazapi_token, Accept: "application/json" },
            body: JSON.stringify(ep.body),
          });
          const raw = await res.text();
          if (res.ok) {
            try {
              const p = JSON.parse(raw);
              if (p?.error || p?.code === 404) { lastErr = raw; continue; }
            } catch {}
            sendOk = true;
            break;
          }
          if (res.status === 405) { lastErr = `405 @ ${ep.path}`; continue; }
          lastErr = `${res.status}: ${raw.substring(0, 200)}`;
        } catch (e: any) {
          lastErr = e.message;
        }
      }

      if (sendOk) {
        await sb.from("scheduled_messages").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          device_id: device.id,
          error_message: null,
        }).eq("id", msg.id);
        sent++;
      } else {
        await sb.from("scheduled_messages").update({
          status: "failed",
          error_message: lastErr.substring(0, 500),
        }).eq("id", msg.id);
        failed++;
      }
    } catch (e: any) {
      console.error(`Error processing scheduled message ${msg.id}:`, e);
      await sb.from("scheduled_messages").update({
        status: "failed",
        error_message: e.message?.substring(0, 500),
      }).eq("id", msg.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ processed: pending.length, sent, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
