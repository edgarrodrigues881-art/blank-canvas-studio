// ══════════════════════════════════════════════════════════
// VPS Engine — Auto Save Schedule Worker
// Processes recurring autosave_schedules directly from the VPS loop.
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";
import { DeviceLockManager } from "../core/device-lock-manager";
import { acquireGlobalSlot, releaseGlobalSlot } from "../core/global-semaphore";
import { uazapiSendText } from "../integrations/uazapi";
import { generateNaturalMessage } from "../utils/message-generator";

const log = createLogger("autosave-schedule");

const CONNECTED_STATUSES = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"];
const activeSchedules = new Set<string>();

export let lastAutosaveScheduleTickAt: Date | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();

function randInt(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

function brtParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(date);
  const get = (type: string) => fmt.find((part) => part.type === type)?.value || "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

function normalizeIdList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function isPauseDisabled(schedule: any): boolean {
  return Number(schedule.pause_every_min || 0) === 0
    || Number(schedule.pause_every_max || 0) === 0
    || Number(schedule.pause_duration_min || 0) === 0
    || Number(schedule.pause_duration_max || 0) === 0;
}

function isDefinitiveInvalidSendError(message: string): boolean {
  const normalized = message.toLowerCase();
  // Frases explícitas
  const phrases = [
    "not_in_whatsapp",
    "not in whatsapp",
    "numero nao existe",
    "número não existe",
    "invalid number",
    "jid does not exist",
    "no whatsapp",
    "user not found",
  ];
  if (phrases.some((needle) => normalized.includes(needle))) return true;
  // Códigos HTTP que a UAZAPI retorna no /message/sendText quando o número não tem WhatsApp
  // (405 Method Not Allowed, 404 Not Found, 400 Bad Request no endpoint sendText)
  if (/\b(405|404|400)\b.*\/message\/sendtext/i.test(message)) return true;
  return false;
}

function humanizeSendError(message: string): string {
  const normalized = message.toLowerCase();
  if (isDefinitiveInvalidSendError(message)) {
    return "Número sem WhatsApp ativo — contato desativado automaticamente";
  }
  if (/\b429\b/.test(message) || normalized.includes("rate limit")) {
    return "Muitas mensagens em pouco tempo — tente reduzir o ritmo";
  }
  if (/\b401\b|\b403\b/.test(message) || normalized.includes("unauthorized")) {
    return "Token da instância inválido ou expirado";
  }
  if (/\b5\d\d\b/.test(message) || normalized.includes("timeout") || normalized.includes("econn")) {
    return "Servidor WhatsApp indisponível no momento";
  }
  if (normalized.includes("disconnected") || normalized.includes("not connected")) {
    return "Instância desconectada";
  }
  return "Falha ao enviar mensagem";
}

async function resolveDevices(db: any, schedule: any) {
  const deviceIds = normalizeIdList(schedule.device_ids);
  if (deviceIds.length === 0) return [];

  const { data } = await db.from("devices")
    .select("id, name, number, status, uazapi_base_url, uazapi_token")
    .eq("user_id", schedule.user_id)
    .in("id", deviceIds)
    .neq("login_type", "report_wa");

  return (data || []).filter((device: any) =>
    CONNECTED_STATUSES.includes(device.status)
    && String(device.uazapi_base_url || "").trim()
    && String(device.uazapi_token || "").trim()
  );
}

async function claimContact(db: any, userId: string, excludedPhones: string[]) {
  const { data, error } = await db.rpc("claim_next_autosave_schedule_contact", {
    p_user_id: userId,
    p_exclude_phones: excludedPhones,
  });
  if (error) throw new Error(`claim_next_autosave_schedule_contact: ${error.message}`);
  return data?.[0] || null;
}

async function insertLog(db: any, schedule: any, device: any, contact: any, message: string, status: "sent" | "failed", error?: string) {
  await db.from("autosave_schedule_logs").insert({
    schedule_id: schedule.id,
    user_id: schedule.user_id,
    device_id: device.id,
    device_name: device.name || device.number || null,
    contact_phone: contact?.phone_e164 || "",
    contact_name: contact?.contact_name || null,
    message_content: message,
    status,
    error_message: error || null,
    sent_at: nowIso(),
  });
}

async function processSchedule(schedule: any) {
  const db = getDb();
  const scheduleId = schedule.id as string;
  const lockIds: string[] = [];
  let globalSlotAcquired = false;
  const runDate = brtParts(new Date()).date;

  try {
    const { data: claimed } = await db.from("autosave_schedules")
      .update({ status: "running", started_at: nowIso(), last_run_date: runDate, last_error: null, updated_at: nowIso() })
      .eq("id", scheduleId)
      .eq("status", "scheduled")
      .or(`last_run_date.is.null,last_run_date.neq.${runDate}`)
      .select("*")
      .maybeSingle();

    if (!claimed) return;

    const devices = await resolveDevices(db, claimed);
    if (devices.length === 0) {
      await db.from("autosave_schedules").update({
        status: "scheduled",
        last_run_date: null,
        last_error: "Nenhuma instância conectada com API configurada",
        updated_at: nowIso(),
      }).eq("id", scheduleId);
      return;
    }

    await acquireGlobalSlot(`autosave:${scheduleId.slice(0, 8)}`);
    globalSlotAcquired = true;

    for (const device of devices) {
      const taskId = `autosave_${scheduleId}_${device.id}`;
      if (DeviceLockManager.tryAcquire(device.id, "autosave_schedule", taskId)) {
        lockIds.push(device.id);
      }
    }

    const activeDevices = devices.filter((device: any) => lockIds.includes(device.id));
    if (activeDevices.length === 0) {
      await db.from("autosave_schedules").update({
        status: "scheduled",
        last_run_date: null,
        last_error: "Instâncias ocupadas por outro disparo",
        updated_at: nowIso(),
      }).eq("id", scheduleId);
      return;
    }

    const dailyLimit = Math.max(1, Math.min(
      Number(claimed.max_limit_per_instance || 1),
      Number(claimed.initial_limit_per_instance || 1) + Number(claimed.days_executed || 0) * Number(claimed.daily_increment || 0),
    ));
    const messagesPerContact = Math.max(1, Number(claimed.messages_per_instance || 1));
    const betweenMsgMin = Math.max(1, Number(claimed.min_delay_seconds || 8));
    const betweenMsgMax = Math.max(betweenMsgMin, Number(claimed.max_delay_seconds || 20));
    const betweenContactMin = Math.max(1, Number(claimed.between_contacts_min_seconds || 30));
    const betweenContactMax = Math.max(betweenContactMin, Number(claimed.between_contacts_max_seconds || 90));
    const pauseDisabled = isPauseDisabled(claimed);
    const pauseEveryMin = Math.max(1, Number(claimed.pause_every_min || 10));
    const pauseEveryMax = Math.max(pauseEveryMin, Number(claimed.pause_every_max || 20));
    const pauseDurationMin = Math.max(1, Number(claimed.pause_duration_min || 60));
    const pauseDurationMax = Math.max(pauseDurationMin, Number(claimed.pause_duration_max || 180));
    let nextPauseAfter = pauseDisabled ? Number.MAX_SAFE_INTEGER : randInt(pauseEveryMin, pauseEveryMax);

    let sent = 0;
    let failed = 0;
    let contactsTouched = 0;
    const excludedPhones: string[] = [];

    for (const device of activeDevices) {
      for (let contactIndex = 0; contactIndex < dailyLimit; contactIndex++) {
        const { data: live } = await db.from("autosave_schedules").select("status").eq("id", scheduleId).maybeSingle();
        if (live?.status !== "running") throw new Error(`Interrompido: status atual ${live?.status || "desconhecido"}`);

        const contact = await claimContact(db, claimed.user_id, excludedPhones);
        if (!contact) {
          log.warn(`schedule ${scheduleId.slice(0, 8)}: sem contatos disponíveis`);
          break;
        }
        excludedPhones.push(String(contact.phone_e164 || ""));
        contactsTouched++;

        for (let messageIndex = 0; messageIndex < messagesPerContact; messageIndex++) {
          const message = generateNaturalMessage("autosave");
          try {
            await uazapiSendText(
              String(device.uazapi_base_url || "").replace(/\/+$/, ""),
              String(device.uazapi_token || "").trim(),
              String(contact.phone_e164 || "").replace(/\D/g, ""),
              message,
            );
            sent++;
            await insertLog(db, claimed, device, contact, message, "sent");
          } catch (error: any) {
            failed++;
            const errMsg = String(error?.message || error || "Erro ao enviar").slice(0, 500);
            const isInvalid = isDefinitiveInvalidSendError(errMsg);
            const friendly = humanizeSendError(errMsg);
            await insertLog(db, claimed, device, contact, message, "failed", friendly);
            if (isInvalid) {
              try { await db.rpc("mark_autosave_contact_invalid", { p_contact_id: contact.id, p_reason: friendly }); } catch {}
            }
          }

          await db.from("autosave_schedules").update({
            total_sent: Number(claimed.total_sent || 0) + sent,
            total_failed: Number(claimed.total_failed || 0) + failed,
            updated_at: nowIso(),
          }).eq("id", scheduleId);

          if (messageIndex < messagesPerContact - 1) await sleep(randInt(betweenMsgMin, betweenMsgMax) * 1000);
        }

        if (contactsTouched >= nextPauseAfter) {
          await sleep(randInt(pauseDurationMin, pauseDurationMax) * 1000);
          nextPauseAfter += randInt(pauseEveryMin, pauseEveryMax);
        } else {
          await sleep(randInt(betweenContactMin, betweenContactMax) * 1000);
        }
      }
    }

    await db.from("autosave_schedules").update({
      status: "scheduled",
      days_executed: Number(claimed.days_executed || 0) + 1,
      completed_at: nowIso(),
      last_error: failed > 0 ? `${failed} falha(s) no último ciclo` : null,
      updated_at: nowIso(),
    }).eq("id", scheduleId);

    log.info(`schedule ${scheduleId.slice(0, 8)} done: sent=${sent} failed=${failed} devices=${activeDevices.length}`);
  } catch (error: any) {
    const errMsg = String(error?.message || error || "Erro desconhecido").slice(0, 500);
    const { data: live } = await db.from("autosave_schedules").select("status").eq("id", scheduleId).maybeSingle();
    const keepUserStatus = ["paused", "completed"].includes(String(live?.status || ""));
    await db.from("autosave_schedules")
      .update({ last_error: errMsg, updated_at: nowIso(), ...(keepUserStatus ? {} : { status: "scheduled" }) })
      .eq("id", scheduleId);
    log.error(`schedule ${scheduleId.slice(0, 8)} failed: ${errMsg}`);
  } finally {
    for (const deviceId of lockIds) DeviceLockManager.release(deviceId, `autosave_${scheduleId}_${deviceId}`);
    if (globalSlotAcquired) releaseGlobalSlot(`autosave:${scheduleId.slice(0, 8)}`);
    activeSchedules.delete(scheduleId);
  }
}

export async function autosaveScheduleTick(): Promise<void> {
  const db = getDb();
  const { date, hhmm, weekday } = brtParts(new Date());

  const { data: schedules, error } = await db.from("autosave_schedules")
    .select("*")
    .eq("status", "scheduled")
    .or(`last_run_date.is.null,last_run_date.neq.${date}`)
    .lte("time_of_day", hhmm)
    .limit(10);

  if (error) {
    log.error(`Error fetching schedules: ${error.message}`);
    return;
  }

    const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const staleRuns = await db.from("autosave_schedules")
      .select("id, updated_at")
      .eq("status", "running")
      .or(`last_run_date.is.null,last_run_date.neq.${date}`)
      .lt("updated_at", staleBefore)
      .limit(10);

    for (const stale of staleRuns.data || []) {
      await db.from("autosave_schedules").update({
        status: "scheduled",
        last_error: "Execução anterior travou no VPS; liberado automaticamente para retomar",
        updated_at: nowIso(),
      }).eq("id", stale.id).eq("status", "running");
    }

  for (const schedule of schedules || []) {
    const weekdays = Array.isArray(schedule.weekdays) ? schedule.weekdays.map(Number) : [];
    if (!weekdays.includes(weekday)) continue;
    if (activeSchedules.has(schedule.id)) continue;
    activeSchedules.add(schedule.id);
    void processSchedule(schedule);
  }

  lastAutosaveScheduleTickAt = new Date();
}
