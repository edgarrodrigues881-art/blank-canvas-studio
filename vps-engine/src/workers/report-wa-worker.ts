// ══════════════════════════════════════════════════════════
// VPS Engine — Report WA Worker
// Replaces report-wa-cron Edge Function (cron 1min)
// Sends WhatsApp reports for campaigns and warmup activity
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";

const log = createLogger("report-wa");

export let lastReportWaTickAt: Date | null = null;

interface DeviceCreds {
  baseUrl: string;
  token: string;
  device: { name: string; number: string | null };
}

async function getDeviceCredentials(db: any, deviceId: string, userId: string): Promise<DeviceCreds | null> {
  const { data: device } = await db.from("devices")
    .select("uazapi_token, uazapi_base_url, name, number")
    .eq("id", deviceId).eq("user_id", userId).single();
  if (!device) return null;
  const baseUrl = (device.uazapi_base_url || "").replace(/\/+$/, "");
  const token = device.uazapi_token || "";
  if (!baseUrl || !token) return null;
  return { baseUrl, token, device };
}

async function uazapiRequest(baseUrl: string, token: string, path: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = { token, Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  let res = await fetch(`${baseUrl}${path}`, opts);
  if (res.status === 405 && method === "POST") {
    res = await fetch(`${baseUrl}${path}`, { method: "GET", headers: { token, Accept: "application/json" } });
  }
  return res;
}

async function sendToGroup(creds: DeviceCreds, groupId: string, message: string): Promise<boolean> {
  if (!groupId) return false;
  const attempts = [
    { path: "/send/text", body: { number: groupId, text: message } },
    { path: "/chat/send-text", body: { to: groupId, body: message } },
    { path: "/message/sendText", body: { chatId: groupId, text: message } },
    { path: "/message/sendText", body: { to: groupId, text: message } },
  ];
  for (const a of attempts) {
    try {
      const res = await uazapiRequest(creds.baseUrl, creds.token, a.path, "POST", a.body);
      const raw = await res.text();
      let data: any = {};
      try { data = JSON.parse(raw); } catch { /* ignore */ }
      if (res.status >= 200 && res.status < 300) {
        if (data.error || data.code === 404) continue;
        return true;
      }
    } catch { /* try next */ }
  }
  return false;
}

async function wasRecentlySent(db: any, userId: string, pattern: string, minutesAgo = 5): Promise<boolean> {
  const since = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  const { data } = await db.from("report_wa_logs")
    .select("id").eq("user_id", userId).ilike("message", pattern)
    .gte("created_at", since).limit(1);
  return !!(data && data.length > 0);
}

async function logEvent(db: any, userId: string, level: string, message: string) {
  await db.from("report_wa_logs").insert({ user_id: userId, level, message });
}

export async function reportWaTick(): Promise<void> {
  const db = getDb();

  const { data: configs } = await db.from("report_wa_configs")
    .select("user_id, device_id, group_id, group_name, toggle_campaigns, toggle_warmup, toggle_instances, alert_disconnect, alert_campaign_end, alert_high_failures, connection_status, warmup_group_id, campaigns_group_id, connection_group_id")
    .not("device_id", "is", null);

  if (!configs || configs.length === 0) {
    lastReportWaTickAt = new Date();
    return;
  }

  const now = new Date();
  const nowBRT = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  let totalSent = 0;

  for (const config of configs) {
    const creds = await getDeviceCredentials(db, config.device_id!, config.user_id);
    if (!creds) continue;

    const { data: deviceRow } = await db.from("devices").select("status").eq("id", config.device_id!).maybeSingle();
    const devStatus = (deviceRow?.status || "").toLowerCase();
    const isOnline = ["ready", "connected", "authenticated", "open"].includes(devStatus);
    if (!isOnline) continue;

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // ═══ CAMPAIGN ALERTS ═══
    if (config.toggle_campaigns) {
      const targetGroupId = (config.campaigns_group_id || "").trim() || config.group_id;
      if (targetGroupId) {
        // Paused
        const { data: paused } = await db.from("campaigns")
          .select("id, name, status, sent_count, total_contacts, updated_at")
          .eq("user_id", config.user_id).eq("status", "paused").gte("updated_at", fiveMinAgo);

        for (const camp of (paused || [])) {
          if (await wasRecentlySent(db, config.user_id, `%campanha%${camp.name}%pausada%`)) continue;
          const msg = `⏸ CAMPANHA PAUSADA\n\nCampanha: ${camp.name}\n\n📊 Progresso:\n✅ Enviadas: ${camp.sent_count || 0}/${camp.total_contacts || 0}\n\n⏱ Horário: ${nowBRT}\n\nA campanha foi pausada pelo operador.`;
          if (await sendToGroup(creds, targetGroupId, msg)) totalSent++;
          await logEvent(db, config.user_id, "INFO", `Campanha "${camp.name}" pausada — alerta enviado`);
        }

        // Finished
        const { data: finished } = await db.from("campaigns")
          .select("id, name, status, sent_count, delivered_count, failed_count, total_contacts, started_at, completed_at, updated_at")
          .eq("user_id", config.user_id).in("status", ["completed", "failed"]).gte("updated_at", fiveMinAgo);

        for (const camp of (finished || [])) {
          const statusLabel = camp.status === "completed" ? "FINALIZADA" : "ERRO";
          if (await wasRecentlySent(db, config.user_id, `%campanha%${camp.name}%${statusLabel.toLowerCase()}%`)) continue;
          const pending = Math.max(0, (camp.total_contacts || 0) - (camp.sent_count || 0) - (camp.failed_count || 0));
          let duration = "";
          if (camp.started_at && camp.completed_at) {
            const diffMs = new Date(camp.completed_at).getTime() - new Date(camp.started_at).getTime();
            const mins = Math.floor(diffMs / 60000);
            const secs = Math.floor((diffMs % 60000) / 1000);
            duration = mins > 0 ? `${mins}min ${secs}s` : `${secs}s`;
          }
          const icon = camp.status === "completed" ? "📣" : "❌";
          const msg = `${icon} CAMPANHA ${statusLabel}\n\nCampanha: ${camp.name}\n\n📊 Resultado da campanha\n\n👥 Total de contatos: ${camp.total_contacts || 0}\n\n✅ Mensagens enviadas: ${camp.sent_count || 0}\n📬 Mensagens entregues: ${camp.delivered_count || 0}\n\n❌ Falhas registradas: ${camp.failed_count || 0}\n⏳ Pendentes: ${pending}\n\n⏱ Tempo total de execução:\n${duration || "N/A"}\n\nStatus da campanha: ${camp.status === "completed" ? "Concluída" : "Erro"}`;
          if (await sendToGroup(creds, targetGroupId, msg)) totalSent++;
          await logEvent(db, config.user_id, "INFO", `Campanha "${camp.name}" ${statusLabel.toLowerCase()} — alerta enviado`);
        }

        // High failures
        if (config.alert_high_failures) {
          const { data: active } = await db.from("campaigns")
            .select("id, name, sent_count, failed_count, total_contacts")
            .eq("user_id", config.user_id).eq("status", "sending");

          for (const camp of (active || [])) {
            const total = (camp.sent_count || 0) + (camp.failed_count || 0);
            if (total >= 10 && (camp.failed_count || 0) / total > 0.3) {
              if (await wasRecentlySent(db, config.user_id, `%${camp.name}%falhas detectadas%`, 15)) continue;
              const rate = Math.round(((camp.failed_count || 0) / total) * 100);
              const msg = `🚨 FALHAS DETECTADAS\n\nCampanha: ${camp.name}\n\n⚠️ Taxa de falha: ${rate}%\n❌ Falhas: ${camp.failed_count || 0}/${total}\n\n⏱ Horário: ${nowBRT}\n\nA taxa de falha está acima de 30%. Considere pausar a campanha para investigação.`;
              if (await sendToGroup(creds, targetGroupId, msg)) totalSent++;
              await logEvent(db, config.user_id, "WARN", `Campanha "${camp.name}" falhas detectadas (${rate}%) — alerta enviado`);
            }
          }
        }
      }
    }

    // ═══ WARMUP ALERTS (only at 19:30 BRT) ═══
    if (config.toggle_warmup) {
      const warmupTarget = (config.warmup_group_id || "").trim() || config.group_id;
      const nowBrt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const isWarmupReportTime = (nowBrt.getHours() === 19 && nowBrt.getMinutes() >= 30 && nowBrt.getMinutes() < 31);
      if (warmupTarget && isWarmupReportTime) {
        const { data: cycles } = await db.from("warmup_cycles")
          .select("id, device_id, day_index, days_total, phase, chip_state, daily_interaction_budget_used, daily_interaction_budget_target, daily_unique_recipients_used, daily_unique_recipients_cap, started_at, updated_at")
          .eq("user_id", config.user_id).eq("is_running", true);

        for (const cycle of (cycles || [])) {
          if (await wasRecentlySent(db, config.user_id, `%aquecimento%${cycle.device_id.substring(0, 8)}%`, 60 * 23)) continue;

          const { data: dev } = await db.from("devices").select("name, number, status").eq("id", cycle.device_id).maybeSingle();
          if (!dev) continue;

          const todayBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
          const { data: dailyStat } = await db.from("warmup_daily_stats")
            .select("messages_sent, messages_failed, messages_total")
            .eq("device_id", cycle.device_id).eq("stat_date", todayBRT).maybeSingle();

          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: auditLogs } = await db.from("warmup_audit_logs")
            .select("id, event_type, level")
            .eq("user_id", config.user_id).eq("device_id", cycle.device_id).gte("created_at", oneDayAgo);

          const logs = auditLogs || [];
          const groupMsgs = logs.filter((l: any) => l.event_type === "group_msg_sent" || l.event_type === "group_interaction").length;
          const autosaveMsgs = logs.filter((l: any) => l.event_type === "autosave_msg_sent" || l.event_type === "autosave_interaction").length;
          const communityMsgs = logs.filter((l: any) => ["community_msg_sent", "community_interaction", "community_turn_sent", "community_conversation_completed"].includes(l.event_type)).length;
          const auditTotal = groupMsgs + autosaveMsgs + communityMsgs;
          const errors = logs.filter((l: any) => l.level === "error").length;
          const warnings = logs.filter((l: any) => l.level === "warn").length;

          const totalSentMsgs = Math.max(dailyStat?.messages_sent || 0, auditTotal);
          const totalFailed = Math.max(dailyStat?.messages_failed || 0, errors);

          const phaseLabels: Record<string, string> = {
            pre_24h: "Pré 24h", groups_only: "Grupos", autosave_enabled: "Auto Save",
            community_light: "Comunitário Light", community_enabled: "Comunitário",
            completed: "Concluído", paused: "Pausado",
          };
          const chipLabels: Record<string, string> = { new: "Chip Novo", recovered: "Recuperado", unstable: "Chip Fraco" };
          const statusIcon = ["Ready", "Connected", "connected", "authenticated", "open"].includes(dev.status || "") ? "🟢 Online" : "🔴 Offline";

          const msg = `🔥 RELATÓRIO DE AQUECIMENTO\n\n🖥 Instância: ${dev.name}\n📞 Número: ${dev.number || "N/A"}\n📋 Perfil: ${chipLabels[cycle.chip_state] || cycle.chip_state}\n📅 Dia: ${cycle.day_index}/${cycle.days_total}\n🔄 Fase: ${phaseLabels[cycle.phase] || cycle.phase}\n\n📊 Atividade do dia\n\n👥 Msgs em grupos: ${groupMsgs}\n💾 Msgs Auto Save: ${autosaveMsgs}\n🤝 Msgs Comunitário: ${communityMsgs}\n📨 Total enviadas: ${totalSentMsgs}\n${totalFailed > 0 ? `❌ Falhas: ${totalFailed}\n` : ""}${warnings > 0 ? `⚠️ Avisos: ${warnings}\n` : ""}\n🔎 Status: ${statusIcon}\n⏱ ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
          if (await sendToGroup(creds, warmupTarget, msg)) totalSent++;
          await logEvent(db, config.user_id, "INFO", `Resumo aquecimento ${cycle.device_id.substring(0, 8)} enviado: ${totalSentMsgs} msgs, ${totalFailed} erros`);
        }
      }
    }
  }

  if (totalSent > 0) log.info(`Sent ${totalSent} report messages`);
  lastReportWaTickAt = new Date();
}
