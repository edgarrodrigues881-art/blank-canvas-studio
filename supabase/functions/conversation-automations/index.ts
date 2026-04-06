import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, user_id, conversation_id, automation_type, device_id, remote_jid } = body;

    const admin = createClient(supabaseUrl, serviceKey);

    // ── Process a single automation trigger ──
    if (action === "trigger") {
      if (!user_id || !conversation_id || !automation_type) {
        return json({ error: "Missing user_id, conversation_id, or automation_type" }, 400);
      }

      // Get user's automation config
      const { data: config } = await admin
        .from("conversation_automations")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();

      if (!config) return json({ ok: true, skipped: "no_config" });

      let enabled = false;
      let message = "";

      if (automation_type === "welcome" && config.welcome_enabled) {
        enabled = true;
        message = config.welcome_message;
      } else if (automation_type === "followup" && config.followup_enabled) {
        enabled = true;
        message = config.followup_message;
      } else if (automation_type === "awaiting" && config.awaiting_enabled) {
        enabled = true;
        message = config.awaiting_message;
      }

      if (!enabled || !message) return json({ ok: true, skipped: "disabled" });

      // Check for duplicate automation (don't send same type within 10 minutes)
      const { data: conv } = await admin
        .from("conversations")
        .select("last_automation_at, last_automation_type, assigned_to")
        .eq("id", conversation_id)
        .single();

      if (conv?.last_automation_type === automation_type && conv?.last_automation_at) {
        const lastAt = new Date(conv.last_automation_at).getTime();
        if (Date.now() - lastAt < 10 * 60 * 1000) {
          return json({ ok: true, skipped: "duplicate_cooldown" });
        }
      }

      // If someone is assigned and actively attending, skip auto-message
      if (conv?.assigned_to && automation_type !== "awaiting") {
        return json({ ok: true, skipped: "human_active" });
      }

      // Get device info for sending
      const { data: convFull } = await admin
        .from("conversations")
        .select("device_id, remote_jid")
        .eq("id", conversation_id)
        .single();

      const deviceId = device_id || convFull?.device_id;
      const jid = remote_jid || convFull?.remote_jid;

      if (!deviceId || !jid) {
        return json({ ok: true, skipped: "no_device_or_jid" });
      }

      // Get device connection info
      const { data: device } = await admin
        .from("devices")
        .select("id, uazapi_base_url, uazapi_token, status")
        .eq("id", deviceId)
        .single();

      if (!device?.uazapi_base_url || !device?.uazapi_token) {
        return json({ ok: true, skipped: "device_not_configured" });
      }

      if (!["Ready", "Connected", "authenticated", "connected", "open"].includes(device.status)) {
        return json({ ok: true, skipped: "device_offline" });
      }

      // Send the message via UAZAPI
      const base = device.uazapi_base_url.replace(/\/+$/, "");
      const number = jid.includes("@") ? jid : `${jid.replace(/\D/g, "")}@s.whatsapp.net`;

      let sent = false;
      let sendError = "";

      // Try multiple endpoints
      const attempts = [
        { path: "/chat/send/text", body: { number, text: message } },
        { path: "/send/text", body: { number, text: message } },
        { path: "/message/text", body: { number, text: message } },
      ];

      for (const attempt of attempts) {
        try {
          const resp = await fetch(`${base}${attempt.path}`, {
            method: "POST",
            headers: {
              token: device.uazapi_token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(attempt.body),
          });

          if (resp.ok) {
            sent = true;
            break;
          }
          const text = await resp.text();
          sendError = `${attempt.path}: ${resp.status} ${text.substring(0, 100)}`;
        } catch (e: any) {
          sendError = `${attempt.path}: ${e.message}`;
        }
      }

      // Save message to conversation_messages
      if (sent) {
        await admin.from("conversation_messages").insert({
          conversation_id,
          user_id,
          remote_jid: jid,
          content: message,
          direction: "sent",
          status: "sent",
          is_ai_response: true,
          responded_by: "automation",
          created_at: new Date().toISOString(),
        });

        // Update conversation
        await admin.from("conversations").update({
          last_message: message.substring(0, 500),
          last_message_at: new Date().toISOString(),
          last_automation_at: new Date().toISOString(),
          last_automation_type: automation_type,
        }).eq("id", conversation_id);
      }

      // Log the automation
      await admin.from("conversation_automation_logs").insert({
        user_id,
        conversation_id,
        automation_type,
        message_sent: message.substring(0, 500),
        status: sent ? "sent" : "failed",
        error_message: sent ? null : sendError,
        triggered_at: new Date().toISOString(),
      });

      return json({ ok: true, sent, error: sent ? null : sendError });
    }

    // ── Check follow-ups (called by cron) ──
    if (action === "check_followups") {
      // Find all configs with followup enabled
      const { data: configs } = await admin
        .from("conversation_automations")
        .select("user_id, followup_minutes, followup_message")
        .eq("followup_enabled", true);

      if (!configs?.length) return json({ ok: true, checked: 0 });

      let triggered = 0;

      for (const cfg of configs) {
        const cutoff = new Date(Date.now() - cfg.followup_minutes * 60 * 1000).toISOString();

        // Find conversations that received a message but user hasn't replied
        const { data: convs } = await admin
          .from("conversations")
          .select("id, device_id, remote_jid")
          .eq("user_id", cfg.user_id)
          .gt("unread_count", 0)
          .lt("last_message_at", cutoff)
          .or("last_automation_type.is.null,last_automation_type.neq.followup")
          .limit(10);

        for (const conv of convs || []) {
          // Check that the last message was received (not sent)
          const { data: lastMsg } = await admin
            .from("conversation_messages")
            .select("direction")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (lastMsg?.direction !== "received") continue;

          // Trigger the follow-up
          try {
            await fetch(`${supabaseUrl}/functions/v1/conversation-automations`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${serviceKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                action: "trigger",
                user_id: cfg.user_id,
                conversation_id: conv.id,
                automation_type: "followup",
                device_id: conv.device_id,
                remote_jid: conv.remote_jid,
              }),
            });
            triggered++;
          } catch (e) {
            console.error("Follow-up trigger error:", e);
          }
        }
      }

      return json({ ok: true, checked: configs.length, triggered });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("conversation-automations error:", err);
    return json({ error: err.message }, 500);
  }
});
