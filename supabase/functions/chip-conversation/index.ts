/**
 * chip-conversation — Stub leve
 * 
 * Apenas CRUD e lifecycle (start/pause/resume/stop/create/update/delete).
 * O processamento pesado (tick) roda na VPS via chip-conversation-worker.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action, conversation_id } = body;

    console.log(`[chip-conversation] action=${action} conv=${conversation_id}`);

    // Tick is handled by VPS worker — reject if called directly
    if (action === "tick") {
      return json({ ok: true, message: "tick handled by VPS worker" });
    }

    // Authenticate user for all other actions
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "Não autorizado" }, 401);

    switch (action) {
      case "create":
        return await handleCreate(admin, user.id, body);
      case "update":
        return await handleUpdate(admin, user.id, body);
      case "delete":
        return await handleDelete(admin, user.id, conversation_id);
      case "start":
        return await handleStart(admin, user.id, conversation_id);
      case "pause":
        return await handlePause(admin, user.id, conversation_id);
      case "resume":
        return await handleResume(admin, user.id, conversation_id);
      case "stop":
        return await handleStop(admin, user.id, conversation_id);
      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (e: any) {
    console.error("chip-conversation error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════
// LIGHTWEIGHT ACTION HANDLERS (DB only, no processing)
// ══════════════════════════════════════════════════════════

async function handleCreate(admin: any, userId: string, body: any) {
  const { data, error } = await admin.from("chip_conversations").insert({
    user_id: userId,
    name: body.name || "Conversa automática",
    status: "idle",
    device_ids: body.device_ids || [],
    min_delay_seconds: body.min_delay_seconds ?? 15,
    max_delay_seconds: body.max_delay_seconds ?? 60,
    pause_after_messages_min: body.pause_after_messages_min ?? 4,
    pause_after_messages_max: body.pause_after_messages_max ?? 8,
    pause_duration_min: body.pause_duration_min ?? 120,
    pause_duration_max: body.pause_duration_max ?? 300,
    duration_hours: body.duration_hours ?? 1,
    duration_minutes: body.duration_minutes ?? 0,
    start_hour: body.start_hour ?? "08:00",
    end_hour: body.end_hour ?? "18:00",
    messages_per_cycle_min: body.messages_per_cycle_min ?? 10,
    messages_per_cycle_max: body.messages_per_cycle_max ?? 30,
    active_days: body.active_days ?? ["mon", "tue", "wed", "thu", "fri"],
  }).select().single();

  if (error) throw new Error(error.message);
  return json({ ok: true, conversation: data });
}

async function handleUpdate(admin: any, userId: string, body: any) {
  const { conversation_id, ...updates } = body;
  delete updates.action;
  delete updates.user_id;
  delete updates.id;
  delete updates.status;

  const { error } = await admin.from("chip_conversations")
    .update(updates)
    .eq("id", conversation_id)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return json({ ok: true });
}

async function handleDelete(admin: any, userId: string, conversationId: string) {
  await admin.from("chip_conversation_logs")
    .delete()
    .eq("conversation_id", conversationId);

  const { error } = await admin.from("chip_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return json({ ok: true });
}

async function handleStart(admin: any, userId: string, conversationId: string) {
  const { data: conv, error } = await admin.from("chip_conversations")
    .select("status, device_ids")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (error || !conv) return json({ error: "Conversa não encontrada" }, 404);

  const status = String(conv.status || "").toLowerCase();
  if (status === "active" || status === "running") {
    return json({ error: "Já está em execução" }, 400);
  }

  const deviceIds = conv.device_ids as string[];
  if (!deviceIds || deviceIds.length < 2) {
    return json({ error: "Selecione pelo menos 2 chips para conversar" }, 400);
  }

  await admin.from("chip_conversations")
    .update({ status: "active", started_at: new Date().toISOString(), completed_at: null, last_error: null })
    .eq("id", conversationId)
    .eq("user_id", userId);

  // VPS worker will pick it up on the next tick (every 30s)
  return json({ ok: true, status: "active" });
}

async function handlePause(admin: any, userId: string, conversationId: string) {
  await admin.from("chip_conversations")
    .update({ status: "paused" })
    .eq("id", conversationId)
    .eq("user_id", userId);

  return json({ ok: true, status: "paused" });
}

async function handleResume(admin: any, userId: string, conversationId: string) {
  await admin.from("chip_conversations")
    .update({ status: "active", last_error: null })
    .eq("id", conversationId)
    .eq("user_id", userId);

  // VPS worker will pick it up on the next tick (every 30s)
  return json({ ok: true, status: "active" });
}

async function handleStop(admin: any, userId: string, conversationId: string) {
  await admin.from("chip_conversations")
    .update({ status: "idle", completed_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId);

  return json({ ok: true, status: "idle" });
}
