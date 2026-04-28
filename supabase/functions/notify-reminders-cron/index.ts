// Periodic scanner — every minute, find tasks/agenda events approaching due
// time according to user-configured lead minutes, and dispatch reminders via
// the centralized notify-event function. Deduplication is enforced by the
// uniq_ai_alert_source index in ai_smart_alerts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function dispatch(payload: Record<string, unknown>) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("[notify-reminders-cron] dispatch failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  let tasksScanned = 0;
  let tasksFired = 0;
  let eventsScanned = 0;
  let eventsFired = 0;

  try {
    // Pull all enabled configs that have at least one reminder toggle on
    const { data: configs } = await admin
      .from("ai_alerts_config")
      .select("user_id, enabled, alert_task_reminder, alert_appointment_reminder, task_lead_minutes, appointment_lead_minutes")
      .eq("enabled", true);

    for (const cfg of configs || []) {
      const userId = (cfg as any).user_id as string;

      // ============== TASKS ==============
      if ((cfg as any).alert_task_reminder) {
        const lead = Math.max(1, Number((cfg as any).task_lead_minutes ?? 30));
        const windowEnd = new Date(now.getTime() + lead * 60 * 1000);

        const { data: tasks } = await admin
          .from("tasks")
          .select("id, title, due_at, status, lead_name, lead_phone")
          .eq("user_id", userId)
          .neq("status", "done")
          .neq("status", "archived")
          .not("due_at", "is", null)
          .lte("due_at", windowEnd.toISOString())
          .gte("due_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
          .limit(50);

        for (const t of tasks || []) {
          tasksScanned++;
          const dueAt = new Date((t as any).due_at);
          const minsLeft = Math.round((dueAt.getTime() - now.getTime()) / 60000);
          const overdue = minsLeft < 0;

          const title = overdue
            ? `Tarefa atrasada: ${(t as any).title}`
            : `Tarefa em ${minsLeft}min: ${(t as any).title}`;
          const desc = overdue
            ? `A tarefa "${(t as any).title}" venceu há ${Math.abs(minsLeft)} minutos.`
            : `A tarefa "${(t as any).title}" vence em ${minsLeft} minutos.`;

          await dispatch({
            user_id: userId,
            alert_type: "task_reminder",
            title,
            description: desc,
            source_table: "tasks",
            source_id: (t as any).id,
            contact_name: (t as any).lead_name ?? null,
            contact_phone: (t as any).lead_phone ?? null,
            severity: overdue ? "high" : "medium",
            metadata: { due_at: (t as any).due_at, overdue, minutes_left: minsLeft },
          });
          tasksFired++;
        }
      }

      // ============== AGENDA EVENTS ==============
      if ((cfg as any).alert_appointment_reminder) {
        const lead = Math.max(1, Number((cfg as any).appointment_lead_minutes ?? 15));
        const windowEnd = new Date(now.getTime() + lead * 60 * 1000);

        const { data: events } = await admin
          .from("crm_agenda_events")
          .select("id, title, start_at, lead_name, lead_phone, location, status")
          .eq("user_id", userId)
          .not("status", "eq", "completed")
          .not("start_at", "is", null)
          .lte("start_at", windowEnd.toISOString())
          .gte("start_at", now.toISOString())
          .limit(50);

        for (const ev of events || []) {
          eventsScanned++;
          const startAt = new Date((ev as any).start_at);
          const minsLeft = Math.round((startAt.getTime() - now.getTime()) / 60000);

          await dispatch({
            user_id: userId,
            alert_type: "appointment_reminder",
            title: `Compromisso em ${minsLeft}min: ${(ev as any).title}`,
            description: `"${(ev as any).title}" começa em ${minsLeft} minutos${(ev as any).location ? ` — ${(ev as any).location}` : ""}.`,
            source_table: "crm_agenda_events",
            source_id: (ev as any).id,
            contact_name: (ev as any).lead_name ?? null,
            contact_phone: (ev as any).lead_phone ?? null,
            severity: "medium",
            metadata: { start_at: (ev as any).start_at, minutes_left: minsLeft, location: (ev as any).location },
          });
          eventsFired++;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, tasksScanned, tasksFired, eventsScanned, eventsFired }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[notify-reminders-cron] error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
