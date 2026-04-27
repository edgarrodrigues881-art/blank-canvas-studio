// Cron worker: runs every minute, picks schedules due in the current BRT minute and publishes
import { createClient } from "npm:@supabase/supabase-js@2";
import { publishToDevices } from "../_shared/status-publish.ts";

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

function brtParts(date: Date) {
  // BRT = UTC-3, no DST
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(date);
  const get = (t: string) => fmt.find((p) => p.type === t)?.value || "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fallbackBaseUrl = Deno.env.get("UAZAPI_BASE_URL") || "";
    const fallbackToken = Deno.env.get("UAZAPI_TOKEN") || "";

    const admin: any = createClient(supabaseUrl, serviceKey);
    const now = new Date();
    const { date, hhmm, weekday } = brtParts(now);

    console.log(`[status-schedule-tick] BRT now=${date} ${hhmm} weekday=${weekday}`);

    const { data: schedules, error } = await admin
      .from("status_schedules")
      .select("*")
      .eq("enabled", true);

    if (error) return json({ error: error.message }, 500);

    const dueList = (schedules || []).filter((s: any) => {
      if (!s.weekdays?.includes(weekday)) return false;
      if (!s.times?.includes(hhmm)) return false;
      const runKey = `${date}_${hhmm}`;
      if (s.last_run_key === runKey) return false; // already executed this minute
      return true;
    });

    console.log(`[status-schedule-tick] due=${dueList.length}/${schedules?.length || 0}`);

    let executed = 0;

    for (const sched of dueList) {
      const runKey = `${date}_${hhmm}`;

      // Atomic claim: only one process should execute this schedule for this slot
      const { data: claimed } = await admin
        .from("status_schedules")
        .update({ last_run_key: runKey, last_run_at: now.toISOString() })
        .eq("id", sched.id)
        .neq("last_run_key", runKey)
        .select("id")
        .maybeSingle();

      if (!claimed) {
        console.log(`[status-schedule-tick] skipped ${sched.id} (already claimed)`);
        continue;
      }

      // Resolve devices
      let deviceIds: string[] = [];
      if (sched.device_mode === "all_online") {
        const { data: devices } = await admin
          .from("devices")
          .select("id, status")
          .eq("user_id", sched.user_id)
          .neq("login_type", "report_wa")
          .in("status", ["Ready", "Connected", "authenticated", "open", "active"]);
        deviceIds = (devices || []).map((d: any) => d.id);
      } else {
        deviceIds = sched.device_ids || [];
      }

      if (deviceIds.length === 0) {
        console.log(`[status-schedule-tick] schedule ${sched.id} has no devices, skipping`);
        continue;
      }

      try {
        const r = await publishToDevices(
          admin,
          sched.user_id,
          {
            type: sched.type,
            text_content: sched.text_content,
            media_url: sched.media_url,
            caption: sched.caption,
            background_color: sched.background_color,
            font: sched.font,
          },
          deviceIds,
          fallbackBaseUrl,
          fallbackToken,
          sched.id,
        );

        await admin
          .from("status_schedules")
          .update({ run_count: (sched.run_count || 0) + 1 })
          .eq("id", sched.id);

        executed++;
        console.log(`[status-schedule-tick] ${sched.id} → ok=${r.success_count} err=${r.error_count}`);
      } catch (e: any) {
        console.error(`[status-schedule-tick] schedule ${sched.id} failed:`, e?.message);
      }
    }

    return json({ ok: true, brt_time: hhmm, due: dueList.length, executed });
  } catch (err: any) {
    console.error("[status-schedule-tick] error", err);
    return json({ error: err?.message || "Erro interno" }, 500);
  }
});
