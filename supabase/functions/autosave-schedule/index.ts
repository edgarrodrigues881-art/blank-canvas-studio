/**
 * autosave-schedule — Lifecycle stub (start/pause/resume/stop)
 * O processamento é executado pelo worker da VPS (autosave-schedule-worker)
 * que faz polling na tabela `autosave_schedules`.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);

    const authHeader = req.headers.get("authorization") ?? "";
    const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Não autorizado" }, 401);

    const { schedule_id, action } = await req.json();
    if (!schedule_id || !action) return json({ error: "schedule_id e action obrigatórios" }, 400);

    const updates: Record<string, unknown> = {};
    switch (action) {
      case "start":
      case "resume":
        updates.status = "running";
        updates.started_at = new Date().toISOString();
        updates.last_error = null;
        break;
      case "pause":
        updates.status = "paused";
        break;
      case "stop":
        updates.status = "completed";
        updates.completed_at = new Date().toISOString();
        break;
      default:
        return json({ error: "Ação inválida" }, 400);
    }

    const { error } = await admin
      .from("autosave_schedules")
      .update(updates)
      .eq("id", schedule_id)
      .eq("user_id", user.id);

    if (error) throw error;
    return json({ ok: true, status: updates.status });
  } catch (e) {
    console.error("autosave-schedule error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
