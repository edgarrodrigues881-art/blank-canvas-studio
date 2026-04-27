// ══════════════════════════════════════════════════════════
// VPS Engine — Status Schedule Worker
// Replaces status-schedule-tick Edge Function (cron 1min)
// Picks status_schedules due in the current BRT minute and publishes
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";
import { config as appConfig } from "../core/config";

const log = createLogger("status-schedule");

export let lastStatusScheduleTickAt: Date | null = null;

export type StatusType = "text" | "image" | "video" | "audio";

interface StatusPayload {
  type: StatusType;
  text_content?: string | null;
  media_url?: string | null;
  caption?: string | null;
  background_color?: string | null;
  font?: number | null;
}

function brtParts(date: Date) {
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

function buildAttempts(payload: StatusPayload): { path: string; body: Record<string, unknown> }[] {
  const { type, text_content, media_url, caption, background_color, font } = payload;
  if (type === "text") {
    const text = (text_content || "").trim();
    return [
      { path: "/send/status", body: { type: "text", text, backgroundColor: background_color || "#25D366", font: font ?? 1 } },
      { path: "/message/sendStatus", body: { type: "text", text, backgroundColor: background_color || "#25D366", font: font ?? 1 } },
    ];
  }
  if (type === "image") {
    return [
      { path: "/send/status", body: { type: "image", file: media_url, caption: caption || "" } },
      { path: "/send/status", body: { type: "image", media: media_url, caption: caption || "" } },
      { path: "/message/sendStatus", body: { type: "image", file: media_url, caption: caption || "" } },
    ];
  }
  if (type === "video") {
    return [
      { path: "/send/status", body: { type: "video", file: media_url, caption: caption || "" } },
      { path: "/send/status", body: { type: "video", media: media_url, caption: caption || "" } },
      { path: "/message/sendStatus", body: { type: "video", file: media_url, caption: caption || "" } },
    ];
  }
  return [
    { path: "/send/status", body: { type: "audio", file: media_url } },
    { path: "/send/status", body: { type: "audio", media: media_url } },
    { path: "/message/sendStatus", body: { type: "audio", file: media_url } },
  ];
}

async function postStatusOnDevice(baseUrl: string, token: string, payload: StatusPayload) {
  const attempts = buildAttempts(payload);
  let lastErr = "";
  for (const attempt of attempts) {
    try {
      const res = await fetch(`${baseUrl}${attempt.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", token },
        body: JSON.stringify(attempt.body),
      });
      const raw = await res.text();
      let parsed: any = {};
      try { parsed = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
      const explicitFailure = Boolean(parsed?.error || parsed?.status === "error" || parsed?.code === 404);
      if (res.ok && !explicitFailure) return { sent: true as const, parsed };
      lastErr = `${res.status} @ ${attempt.path}: ${(typeof parsed?.message === "string" && parsed.message) || (typeof parsed?.error === "string" && parsed.error) || raw.substring(0, 200)}`;
      if (res.status === 401 || res.status === 403) break;
    } catch (e: any) {
      lastErr = `${attempt.path}: ${e?.message || String(e)}`;
    }
  }
  return { sent: false as const, error: lastErr || "Falha ao publicar status" };
}

async function publishToDevices(
  db: any,
  userId: string,
  payload: StatusPayload,
  deviceIds: string[],
  fallbackBaseUrl: string,
  fallbackToken: string,
  scheduleId?: string | null,
) {
  const { data: post } = await db.from("status_posts").insert({
    user_id: userId,
    schedule_id: scheduleId || null,
    type: payload.type,
    text_content: payload.text_content || null,
    media_url: payload.media_url || null,
    media_type: payload.type !== "text" ? payload.type : null,
    caption: payload.caption || null,
    background_color: payload.background_color || null,
    font: payload.font ?? null,
    device_ids: deviceIds,
    status: "sending",
  }).select().single();

  const { data: devices } = await db.from("devices")
    .select("id, name, number, uazapi_token, uazapi_base_url, status")
    .eq("user_id", userId)
    .in("id", deviceIds);

  const results: any[] = [];
  let success = 0;
  let errors = 0;

  for (const dev of (devices || [])) {
    const baseUrl = String(dev.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
    const token = String(dev.uazapi_token || fallbackToken || "").trim();
    if (!baseUrl || !token) {
      results.push({ device_id: dev.id, name: dev.name, success: false, error: "API não configurada" });
      errors++;
      continue;
    }
    const r = await postStatusOnDevice(baseUrl, token, payload);
    if (r.sent) {
      success++;
      results.push({ device_id: dev.id, name: dev.name, success: true });
    } else {
      errors++;
      results.push({ device_id: dev.id, name: dev.name, success: false, error: r.error });
    }
  }

  if (post) {
    const finalStatus = success === 0 ? "failed" : "completed";
    await db.from("status_posts").update({
      status: finalStatus, success_count: success, error_count: errors, results,
    }).eq("id", post.id);
  }
  return { success_count: success, error_count: errors };
}

export async function statusScheduleTick(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const { date, hhmm, weekday } = brtParts(now);
  const fallbackBaseUrl = (appConfig.defaultUazapiBaseUrl || "").trim();
  const fallbackToken = (appConfig.defaultUazapiToken || "").trim();

  const { data: schedules, error } = await db
    .from("status_schedules")
    .select("*")
    .eq("enabled", true);

  if (error) {
    log.error(`Error fetching schedules: ${error.message}`);
    return;
  }

  const dueList = (schedules || []).filter((s: any) => {
    if (!s.weekdays?.includes(weekday)) return false;
    if (!s.times?.includes(hhmm)) return false;
    const runKey = `${date}_${hhmm}`;
    if (s.last_run_key === runKey) return false;
    return true;
  });

  if (dueList.length === 0) {
    lastStatusScheduleTickAt = new Date();
    return;
  }

  log.info(`BRT now=${date} ${hhmm} due=${dueList.length}/${schedules?.length || 0}`);

  let executed = 0;
  for (const sched of dueList) {
    const runKey = `${date}_${hhmm}`;

    // Atomic claim
    const { data: claimed } = await db.from("status_schedules")
      .update({ last_run_key: runKey, last_run_at: now.toISOString() })
      .eq("id", sched.id)
      .neq("last_run_key", runKey)
      .select("id")
      .maybeSingle();

    if (!claimed) continue;

    let deviceIds: string[] = [];
    if (sched.device_mode === "all_online") {
      const { data: devices } = await db.from("devices")
        .select("id, status")
        .eq("user_id", sched.user_id)
        .neq("login_type", "report_wa")
        .in("status", ["Ready", "Connected", "authenticated", "open", "active"]);
      deviceIds = (devices || []).map((d: any) => d.id);
    } else {
      deviceIds = sched.device_ids || [];
    }

    if (deviceIds.length === 0) continue;

    try {
      const r = await publishToDevices(db, sched.user_id, {
        type: sched.type,
        text_content: sched.text_content,
        media_url: sched.media_url,
        caption: sched.caption,
        background_color: sched.background_color,
        font: sched.font,
      }, deviceIds, fallbackBaseUrl, fallbackToken, sched.id);

      await db.from("status_schedules")
        .update({ run_count: (sched.run_count || 0) + 1 })
        .eq("id", sched.id);

      executed++;
      log.info(`schedule ${sched.id} → ok=${r.success_count} err=${r.error_count}`);
    } catch (e: any) {
      log.error(`schedule ${sched.id} failed: ${e?.message || e}`);
    }
  }

  if (executed > 0) log.info(`executed=${executed}/${dueList.length}`);
  lastStatusScheduleTickAt = new Date();
}
