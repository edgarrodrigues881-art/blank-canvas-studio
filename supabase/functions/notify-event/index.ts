// Centralized notification dispatcher.
// Inserts into ai_smart_alerts (deduped via uniq index) and forwards to
// the user's configured WhatsApp group using the shared report_wa instance.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_TYPES = new Set([
  "human_request", "closing_opportunity",
  "dispatch_event", "task_reminder", "appointment_reminder", "followup_event",
]);

interface NotifyPayload {
  user_id: string;
  alert_type: string;
  title: string;
  description: string;
  source_table?: string | null;
  source_id?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  context_message?: string | null;
  severity?: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, unknown>;
}

const TYPE_TO_TOGGLE: Record<string, string> = {
  human_request: "alert_human_request",
  closing_opportunity: "alert_closing_opportunity",
  dispatch_event: "alert_scheduled_dispatch",
  task_reminder: "alert_task_reminder",
  appointment_reminder: "alert_appointment_reminder",
  followup_event: "alert_followup_event",
};

const TYPE_EMOJI: Record<string, string> = {
  human_request: "👤",
  closing_opportunity: "🏆",
  dispatch_event: "📤",
  task_reminder: "✅",
  appointment_reminder: "📅",
  followup_event: "🔁",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as NotifyPayload;
    if (!body?.user_id || !VALID_TYPES.has(body.alert_type) || !body.title) {
      return new Response(JSON.stringify({ error: "invalid_payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Read user config
    const { data: cfg } = await admin
      .from("ai_alerts_config")
      .select("*")
      .eq("user_id", body.user_id)
      .maybeSingle();

    if (cfg && cfg.enabled === false) {
      return new Response(JSON.stringify({ skipped: "notifications_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const toggleKey = TYPE_TO_TOGGLE[body.alert_type];
    if (cfg && toggleKey && cfg[toggleKey] === false) {
      return new Response(JSON.stringify({ skipped: "type_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Insert alert (idempotent on source)
    const { data: inserted, error: insErr } = await admin
      .from("ai_smart_alerts")
      .insert({
        user_id: body.user_id,
        alert_type: body.alert_type,
        severity: body.severity ?? "medium",
        title: body.title,
        description: body.description,
        contact_name: body.contact_name ?? null,
        contact_phone: body.contact_phone ?? null,
        context_message: body.context_message ?? null,
        source_table: body.source_table ?? null,
        source_id: body.source_id ?? null,
        metadata: body.metadata ?? {},
      })
      .select("id")
      .maybeSingle();

    // Duplicate (unique index hit) — short-circuit silently
    if (insErr && (insErr.code === "23505" || /duplicate/i.test(insErr.message))) {
      return new Response(JSON.stringify({ deduped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Forward to WhatsApp group if configured
    if (cfg?.notify_whatsapp && cfg.whatsapp_target_jid) {
      // Resolve effective device — prefer cfg.whatsapp_device_id, else report_wa device
      let deviceId: string | null = cfg.whatsapp_device_id ?? null;
      if (!deviceId) {
        const { data: rwa } = await admin
          .from("report_wa_configs").select("device_id")
          .eq("user_id", body.user_id).maybeSingle();
        deviceId = rwa?.device_id ?? null;
      }
      if (deviceId) {
        const { data: dev } = await admin
          .from("devices")
          .select("uazapi_token, status")
          .eq("id", deviceId).maybeSingle();
        if (dev?.uazapi_token && (dev.status === "Ready" || dev.status === "Connected" || dev.status === "authenticated")) {
          const emoji = TYPE_EMOJI[body.alert_type] || "🔔";
          const lines = [
            `${emoji} *${body.title}*`,
            "",
            body.description,
          ];
          if (body.contact_name || body.contact_phone) {
            lines.push("", `👤 ${body.contact_name || ""} ${body.contact_phone ? `(${body.contact_phone})` : ""}`.trim());
          }
          if (body.context_message) lines.push("", `_${body.context_message}_`);
          const text = lines.join("\n");

          try {
            const res = await fetch(`${Deno.env.get("UAZAPI_BASE_URL")}/send/text`, {
              method: "POST",
              headers: { "Content-Type": "application/json", token: dev.uazapi_token },
              body: JSON.stringify({ number: cfg.whatsapp_target_jid, text }),
            });
            if (res.ok && inserted?.id) {
              await admin.from("ai_smart_alerts").update({
                whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString(),
              }).eq("id", inserted.id);
            } else if (inserted?.id) {
              const errTxt = await res.text();
              await admin.from("ai_smart_alerts").update({
                whatsapp_error: `HTTP ${res.status}: ${errTxt.substring(0, 180)}`,
              }).eq("id", inserted.id);
            }
          } catch (e: any) {
            if (inserted?.id) {
              await admin.from("ai_smart_alerts").update({
                whatsapp_error: (e?.message || "send error").substring(0, 200),
              }).eq("id", inserted.id);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, id: inserted?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
