// Dispatcher: processes pending CRM follow-ups
// - Cancels follow-ups whose lead has replied (when cancel_on_reply=true)
// - Sends 'auto' messages via UAZAPI
// - Generates+sends 'ai_hybrid' messages via Lovable AI Gateway
// - Leaves 'manual' as pending notification (frontend shows it)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL") || "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function generateAIMessage(prompt: string, leadName: string | null): Promise<string> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const sys = `Você escreve mensagens de follow-up para WhatsApp em português brasileiro, no máximo 2-3 frases curtas, tom consultivo e humano. Sem emojis em excesso. Personalize com o nome do lead se fornecido.`;
  const user = `${leadName ? `Nome do lead: ${leadName}\n` : ""}Objetivo: ${prompt}\n\nEscreva apenas a mensagem final.`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j?.choices?.[0]?.message?.content?.trim() || "";
}

async function sendViaUazapi(token: string, phone: string, text: string) {
  if (!UAZAPI_BASE_URL || !token) throw new Error("UAZAPI not configured for device");
  const r = await fetch(`${UAZAPI_BASE_URL}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ number: phone, text }),
  });
  if (!r.ok) throw new Error(`UAZAPI ${r.status}: ${await r.text()}`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const now = new Date().toISOString();
    // Claim due follow-ups
    const { data: due, error } = await supabase
      .from("crm_followups")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .limit(50);
    if (error) throw error;

    const results: any[] = [];

    for (const f of due || []) {
      try {
        // Lock
        const { data: claim } = await supabase
          .from("crm_followups")
          .update({ status: "processing", attempt_count: (f.attempt_count || 0) + 1 })
          .eq("id", f.id)
          .eq("status", "pending")
          .select()
          .single();
        if (!claim) continue;

        // Check cancel_on_reply
        if (f.cancel_on_reply) {
          const { data: contact } = await supabase
            .from("service_contacts")
            .select("last_message_at, last_message_content")
            .eq("user_id", f.user_id)
            .eq("phone", f.contact_phone)
            .maybeSingle();
          // If lead messaged after follow-up creation, cancel
          if (contact?.last_message_at && new Date(contact.last_message_at) > new Date(f.created_at)) {
            await supabase.from("crm_followups").update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              cancelled_reason: "Lead respondeu antes do envio",
            }).eq("id", f.id);
            results.push({ id: f.id, action: "cancelled_replied" });
            continue;
          }
        }

        // Manual mode: just notify
        if (f.mode === "manual") {
          await supabase.from("notifications").insert({
            user_id: f.user_id,
            title: "🔔 Follow-up agendado",
            message: `Hora de fazer follow-up com ${f.contact_name || f.contact_phone}`,
            type: "info",
          });
          await supabase.from("crm_followups").update({
            status: "sent", sent_at: new Date().toISOString(),
          }).eq("id", f.id);
          results.push({ id: f.id, action: "notified" });
          continue;
        }

        // Need a device for sending
        let deviceId = f.device_id;
        let deviceToken: string | null = null;
        if (!deviceId) {
          const { data: dev } = await supabase
            .from("devices")
            .select("id, token, status")
            .eq("user_id", f.user_id)
            .in("status", ["Ready", "Connected", "authenticated", "open", "active"])
            .neq("login_type", "report_wa")
            .limit(1)
            .maybeSingle();
          if (!dev) throw new Error("Nenhuma instância conectada disponível");
          deviceId = dev.id;
          deviceToken = (dev as any).token;
        } else {
          const { data: dev } = await supabase
            .from("devices").select("token").eq("id", deviceId).maybeSingle();
          deviceToken = (dev as any)?.token || null;
        }
        if (!deviceToken) throw new Error("Token da instância não encontrado");

        // Build message
        let text = f.message || "";
        if (f.mode === "ai_hybrid") {
          text = await generateAIMessage(f.ai_prompt || "", f.contact_name);
        }
        if (!text) throw new Error("Mensagem vazia");

        await sendViaUazapi(deviceToken, f.contact_phone, text);

        await supabase.from("crm_followups").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          message: text, // persist final text (esp. for AI)
          device_id: deviceId,
        }).eq("id", f.id);

        results.push({ id: f.id, action: "sent" });
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        const attemptCount = (f.attempt_count || 0) + 1;
        const isFinalFailure = attemptCount >= 3;
        await supabase.from("crm_followups").update({
          status: isFinalFailure ? "failed" : "pending",
          error_message: errMsg,
        }).eq("id", f.id);
        results.push({ id: f.id, action: "error", error: errMsg });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("crm-followup-dispatch error", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
