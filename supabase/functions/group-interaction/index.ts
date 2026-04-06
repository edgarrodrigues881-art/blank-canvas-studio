/**
 * group-interaction — Stub leve
 * 
 * Apenas lifecycle (start/pause/resume/stop).
 * O processamento pesado (tick) roda na VPS via group-interaction-worker.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomBetween(min: number, max: number): number {
  const safeMin = Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0;
  const safeMax = Number.isFinite(max) ? Math.max(safeMin, Math.floor(max)) : safeMin;
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function safeNonNegativeInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action, interactionId } = body;

    console.log(`[group-interaction] action=${action} id=${interactionId}`);

    // Tick is handled by VPS worker — noop if called directly
    if (action === "tick") {
      return jsonRes({ ok: true, message: "tick handled by VPS worker" });
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) return jsonRes({ error: "Não autorizado" }, 401);

    if (action === "start" || action === "resume") {
      const { data: current } = await admin.from("group_interactions")
        .select("status, started_at, min_delay_seconds, max_delay_seconds, next_action_at")
        .eq("id", interactionId).eq("user_id", user.id).single();

      if (!current) return jsonRes({ error: "Automação não encontrada" }, 404);

      const { error } = await admin.from("group_interactions")
        .update({
          status: "running",
          started_at: current.started_at || new Date().toISOString(),
          completed_at: null,
          last_error: null,
          next_action_at: new Date(Date.now() + randomBetween(
            safeNonNegativeInt(current.min_delay_seconds, 0) * 1000,
            Math.max(safeNonNegativeInt(current.min_delay_seconds, 0), safeNonNegativeInt(current.max_delay_seconds, 0)) * 1000,
          )).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", interactionId).eq("user_id", user.id);

      if (error) throw error;
      // VPS worker will pick it up on the next tick (every 20s)
      return jsonRes({ ok: true, status: "running" });
    }

    if (action === "pause") {
      const { error } = await admin.from("group_interactions")
        .update({ status: "paused", next_action_at: null, updated_at: new Date().toISOString() })
        .eq("id", interactionId).eq("user_id", user.id);
      if (error) throw error;
      return jsonRes({ ok: true, status: "paused" });
    }

    if (action === "stop") {
      const { error } = await admin.from("group_interactions")
        .update({ status: "idle", completed_at: new Date().toISOString(), next_action_at: null, updated_at: new Date().toISOString() })
        .eq("id", interactionId).eq("user_id", user.id);
      if (error) throw error;
      return jsonRes({ ok: true, status: "idle" });
    }

    return jsonRes({ error: "Ação inválida" }, 400);
  } catch (err: any) {
    console.error("group-interaction error:", err);
    return jsonRes({ error: err.message }, 500);
  }
});
