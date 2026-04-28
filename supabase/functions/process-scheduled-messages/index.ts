/**
 * process-scheduled-messages — Fallback dispatcher
 *
 * O processamento principal roda na VPS (scheduled-messages-worker).
 * Esta Edge Function existe como fallback caso o worker esteja offline.
 * É invocada por cron a cada minuto e processa até 20 mensagens pendentes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UAZAPI_BASE = Deno.env.get("UAZAPI_BASE_URL")!;

function normalizePhone(phone: string): string {
  let p = (phone || "").replace(/\D/g, "");
  if (p.length >= 10 && p.length <= 11) p = "55" + p;
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Reclama até 20 mensagens prontas para envio (status pending/retry com horário <= now)
  const { data: claimed, error: claimErr } = await sb.rpc("claim_scheduled_messages", { _limit: 20 });

  if (claimErr) {
    return new Response(JSON.stringify({ ok: false, error: claimErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const list = (claimed || []) as any[];
  let sent = 0, failed = 0;

  for (const msg of list) {
    try {
      // Busca o token UAZAPI da instância
      const { data: device } = await sb
        .from("devices")
        .select("token, status, name")
        .eq("id", msg.device_id)
        .maybeSingle();

      if (!device || !(device as any).token) {
        await sb.from("scheduled_messages").update({
          status: "failed",
          error_message: "Instância sem token ou inexistente",
          updated_at: new Date().toISOString(),
        }).eq("id", msg.id);
        failed++; continue;
      }

      const targetPhone = normalizePhone(msg.contact_phone);

      const resp = await fetch(`${UAZAPI_BASE}/send/text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "token": (device as any).token,
        },
        body: JSON.stringify({
          number: targetPhone,
          text: msg.message_content,
        }),
      });

      const okSend = resp.ok;
      const body = await resp.text();

      if (okSend) {
        await sb.from("scheduled_messages").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
          updated_at: new Date().toISOString(),
        }).eq("id", msg.id);
        sent++;
      } else {
        const attempts = (msg.attempts || 0) + 1;
        const max = msg.max_attempts || 3;
        const nextRetry = new Date(Date.now() + Math.min(60 * attempts, 300) * 1000).toISOString();
        await sb.from("scheduled_messages").update({
          status: attempts >= max ? "failed" : "retry",
          attempts,
          next_retry_at: attempts >= max ? null : nextRetry,
          error_message: `HTTP ${resp.status}: ${body.substring(0, 200)}`,
          updated_at: new Date().toISOString(),
        }).eq("id", msg.id);
        failed++;
      }
    } catch (e: any) {
      await sb.from("scheduled_messages").update({
        status: "retry",
        attempts: (msg.attempts || 0) + 1,
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
        error_message: e?.message || String(e),
        updated_at: new Date().toISOString(),
      }).eq("id", msg.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    claimed: list.length,
    sent,
    failed,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
