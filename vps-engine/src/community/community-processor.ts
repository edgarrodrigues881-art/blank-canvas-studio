// ══════════════════════════════════════════════════════════
// VPS Engine — Community Processor (migrated from community-core Edge Function)
// Handles all 6 phases of community warmup + session execution
// ══════════════════════════════════════════════════════════

import { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "../core/logger";
import { getBrtHourMinute, getBrtDayOfWeek } from "../utils/brt";

const log = createLogger("community");

// ── Constants ──
const CONNECTED_STATUSES = ["Ready", "Connected", "authenticated", "open", "active"];
const MAX_NEW_SESSIONS_PER_TICK = 3;
const STALE_SESSION_HOURS = 4;
const COOLDOWN_MIN_MINUTES = 15;
const COOLDOWN_MAX_MINUTES = 45;
const TARGET_MESSAGES_PER_BLOCK = 120;
const MIN_SPACING_BETWEEN_PAIRS_MINUTES = 20;
const MAX_SAME_PAIR_PER_DAY = 1;

// ── Helpers ──
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Intensity presets ──
const INTENSITY_PRESETS: Record<string, {
  daily_limit: number; peers_min: number; peers_max: number; msgs_per_peer: number;
  min_delay: number; max_delay: number;
  pause_after_min: number; pause_after_max: number;
  pause_duration_min: number; pause_duration_max: number;
  cooldown_min: number; cooldown_max: number;
}> = {
  low: { daily_limit: 300, peers_min: 2, peers_max: 4, msgs_per_peer: 80, min_delay: 45, max_delay: 120, pause_after_min: 8, pause_after_max: 15, pause_duration_min: 120, pause_duration_max: 300, cooldown_min: 30, cooldown_max: 60 },
  medium: { daily_limit: 500, peers_min: 3, peers_max: 6, msgs_per_peer: 120, min_delay: 30, max_delay: 90, pause_after_min: 10, pause_after_max: 20, pause_duration_min: 60, pause_duration_max: 180, cooldown_min: 15, cooldown_max: 45 },
  high: { daily_limit: 700, peers_min: 5, peers_max: 10, msgs_per_peer: 120, min_delay: 15, max_delay: 60, pause_after_min: 12, pause_after_max: 25, pause_duration_min: 45, pause_duration_max: 120, cooldown_min: 10, cooldown_max: 30 },
};

export { INTENSITY_PRESETS };

// ── Chip & Progression ──

// ── BRT Window ──
function isWithinWindow(startHour: string, endHour: string, activeDays: string[]): boolean {
  const now = getBrtHourMinute();
  const day = getBrtDayOfWeek();
  if (!activeDays.includes(day)) return false;
  return now >= startHour && now <= endHour;
}

// ══════════════════════════════════════════════════════════
// MESSAGE GENERATOR (20-300 chars)
// ══════════════════════════════════════════════════════════
const SAUDACOES = ["oi", "oii", "oiii", "olá", "e aí", "eai", "fala", "salve", "opa", "hey", "bom dia", "boa tarde", "boa noite", "tudo bem", "tudo certo", "fala parceiro"];
const PERGUNTAS = ["como está seu dia", "como está o trabalho", "como está sua família", "está tudo bem por aí", "como estão as coisas", "conseguiu resolver aquilo", "como foi a semana", "como anda o serviço", "como tá a saúde", "o que aprontou hoje", "como foi o fds", "como tá o projeto", "já conseguiu aquilo", "como tá o estudo", "como foi a viagem", "como tá o clima aí", "como tá a academia", "já assistiu aquele filme"];
const COMENTARIOS = ["hoje o dia foi corrido", "aqui está bem tranquilo", "estou resolvendo umas coisas", "hoje trabalhei bastante", "aqui está tudo certo", "hoje foi puxado", "tô meio ocupado hoje", "dia longo hoje", "finalmente deu uma folga", "tô correndo atrás das coisas", "hoje rendeu bastante", "tô focado aqui no trabalho", "semana puxada essa", "hoje foi produtivo", "por aqui tudo certo", "mandando ver no trabalho", "dia movimentado hoje", "tô planejando uns negócios"];
const COMPLEMENTOS = ["faz tempo que não falamos", "lembrei disso agora", "estava pensando nisso", "vi algo parecido hoje", "me veio na cabeça agora", "pensei nisso mais cedo", "lembrei de vc", "vi vc online e lembrei", "me falaram disso"];
const EMOJIS = ["🙂", "😂", "😅", "😄", "👍", "🙏", "🔥", "👀", "😎", "🤝", "😊", "🤔", "💯", "👏", "✌️", "🎉", "🙌", "😁", "🤗", "👌", "💪", "🌟", "😃", "🤙", "👋", "❤️", "😆", "🫡", "🤣"];
const RESPOSTAS_CURTAS = ["ss", "sim", "aham", "pode crer", "verdade", "isso aí", "com certeza", "beleza", "blz", "joia", "show", "massa", "top", "boa", "firmeza", "haha", "kkk", "kkkk", "é mesmo", "pois é", "entendi", "ah sim", "de boa"];
const OPINIOES = ["acho que esse ano vai ser diferente, tenho muita esperança de dias melhores", "tô otimista com o futuro, muita coisa boa vindo por aí se Deus quiser", "cada vez mais difícil achar coisa boa, mas a gente segue firme e forte", "o mercado tá complicado, mas quem se esforça sempre encontra oportunidade", "tô repensando muita coisa na vida, acho que faz parte do crescimento", "preciso descansar mais, o corpo pede e a gente tem que ouvir né", "tô curtindo mais ficar em casa, é bom demais ter paz e sossego", "tô aprendendo a ter mais paciência, nem tudo acontece no nosso tempo", "cada dia é uma conquista, a gente tem que valorizar cada momento", "o importante é ter paz de espírito, o resto a gente vai resolvendo"];
const COTIDIANO = ["acabei de almoçar agora, comi muito bem hoje graças a Deus", "tô no trânsito parado faz uns vinte minutos, tá osso", "choveu demais aqui na região, parecia que não ia parar nunca", "acordei cedo hoje e aproveitei pra resolver umas coisas pendentes", "café da manhã ficou top hoje, fiz aquele capricho todo especial", "acabei de sair da academia, treino pesado mas valeu a pena", "fiz um bolo caseiro pra família e ficou uma delícia", "tô estudando uma coisa nova, é difícil mas tô gostando bastante", "comecei a caminhar de manhã e já tô sentindo diferença no corpo", "tô assistindo uma série boa demais, não consigo parar de ver", "dormi super bem ontem, acordei renovado, fazia tempo que não dormia assim", "tomei um açaí agora com granola e banana, melhor coisa do mundo"];
const REFLEXOES = ["sabe o que eu penso, a gente tem que aproveitar cada momento porque passa muito rápido", "ontem eu tava lembrando de como as coisas eram diferentes uns anos atrás", "às vezes eu paro pra pensar no quanto a gente evoluiu", "tô numa fase da vida que tô priorizando paz e tranquilidade", "essa semana foi intensa demais, mas no final deu tudo certo", "tô aprendendo que nem tudo precisa de resposta imediata"];
const HISTORIAS = ["ontem aconteceu uma coisa engraçada, eu fui no mercado e encontrei um amigo que não via há anos", "meu vizinho adotou um cachorro e agora o bicho late o dia inteiro mas ele é muito fofo", "fui almoçar num restaurante novo e a comida era tão boa que já marquei de voltar", "tentei fazer uma receita nova e deu tudo errado mas pelo menos a cozinha ficou cheirosa", "meu filho falou uma coisa tão engraçada ontem que eu quase chorei de rir", "tava dirigindo e vi o pôr do sol mais bonito que já vi na vida", "recebi uma mensagem de um amigo antigo e matamos a saudade conversando por horas"];
const FRASES_NUMERO = ["faz {n} dias que pensei nisso", "já tem uns {n} dias", "uns {n} meses atrás"];

const recentMsgs: string[] = [];
function maybeEmoji(msg: string): string {
  const r = Math.random();
  if (r < 0.55) return msg;
  if (r < 0.85) return `${msg} ${pickRandom(EMOJIS)}`;
  return `${msg} ${pickRandom(EMOJIS)}${pickRandom(EMOJIS)}`;
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function buildMsg(): string {
  const s = randInt(1, 28);
  if (s <= 2) return pickRandom(RESPOSTAS_CURTAS);
  if (s <= 4) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(PERGUNTAS)}?`));
  if (s <= 6) return cap(maybeEmoji(`${pickRandom(PERGUNTAS)}?`));
  if (s <= 8) return cap(maybeEmoji(`${pickRandom(COMENTARIOS)}, ${pickRandom(COMPLEMENTOS)}`));
  if (s <= 10) return cap(maybeEmoji(`${pickRandom(OPINIOES)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s <= 12) return cap(maybeEmoji(`${pickRandom(COTIDIANO)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s === 13) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(COMENTARIOS)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s === 14) { const f = pickRandom(FRASES_NUMERO).replace("{n}", String(randInt(2, 15))); return cap(maybeEmoji(`${f}, ${pickRandom(COMENTARIOS)}`)); }
  if (s <= 17) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(OPINIOES)}`));
  if (s <= 20) return cap(maybeEmoji(pickRandom(REFLEXOES)));
  if (s <= 23) return cap(maybeEmoji(pickRandom(HISTORIAS)));
  if (s <= 25) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(COTIDIANO)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s <= 27) return cap(maybeEmoji(`${pickRandom(COMENTARIOS)}, ${pickRandom(OPINIOES)}`));
  return cap(maybeEmoji(`${pickRandom(HISTORIAS)}. ${pickRandom(COMPLEMENTOS)}`));
}
function generateMessage(): string {
  for (let attempt = 0; attempt < 120; attempt++) {
    const msg = buildMsg();
    if (msg.length >= 20 && msg.length <= 300 && !recentMsgs.includes(msg)) {
      recentMsgs.push(msg);
      if (recentMsgs.length > 200) recentMsgs.shift();
      return msg;
    }
  }
  let fb = `${pickRandom(SAUDACOES)}, ${pickRandom(COTIDIANO)}. ${pickRandom(OPINIOES)}`;
  return cap(maybeEmoji(fb)).substring(0, 300);
}

// ══════════════════════════════════════════════════════════
// UAZAPI SEND
// ══════════════════════════════════════════════════════════
async function sendText(baseUrl: string, token: string, number: string, text: string) {
  const safeText = String(text || "").trim();
  if (!safeText) throw new Error("Texto vazio");
  const chatId = number.includes("@") ? number : `${number}@s.whatsapp.net`;
  const attempts = [
    { path: "/send/text", body: { number, text: safeText } },
    { path: "/send/text", body: { chatId, text: safeText } },
    { path: "/chat/send-text", body: { number, to: number, chatId, body: safeText, text: safeText } },
    { path: "/message/sendText", body: { chatId, text: safeText } },
  ];
  let lastErr = "";
  for (const at of attempts) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch(`${baseUrl}${at.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(at.body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const raw = await res.text();
      if (res.ok) {
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          if (parsed?.error || parsed?.code === 404 || parsed?.status === "error") { lastErr = `${at.path}: ${raw.substring(0, 240)}`; continue; }
          return parsed;
        } catch { return { ok: true, raw }; }
      }
      if (res.status === 405 || res.status === 404) { lastErr = `${res.status} @ ${at.path}`; continue; }
      lastErr = `${res.status} @ ${at.path}: ${raw.substring(0, 240)}`;
    } catch (e) { lastErr = `${at.path}: ${e instanceof Error ? e.message : String(e)}`; }
  }
  throw new Error(`Send failed: ${lastErr}`);
}

// ══════════════════════════════════════════════════════════
// AUDIT LOG HELPER
// ══════════════════════════════════════════════════════════
async function auditLog(db: SupabaseClient, params: {
  device_id?: string; user_id?: string; session_id?: string; pair_id?: string;
  partner_device_id?: string; event_type: string; level?: string; message: string;
  reason?: string | null; meta?: any; community_mode?: string; community_day?: number;
}) {
  try {
    await db.from("community_audit_logs").insert({
      device_id: params.device_id || null,
      user_id: params.user_id || null,
      session_id: params.session_id || null,
      pair_id: params.pair_id || null,
      partner_device_id: params.partner_device_id || null,
      event_type: params.event_type,
      level: params.level || "info",
      message: params.message,
      reason: params.reason || null,
      meta: params.meta || {},
      community_mode: params.community_mode || null,
      community_day: params.community_day || null,
    });
  } catch (e) {
    log.warn(`[audit] Insert failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ══════════════════════════════════════════════════════════
// PHASE 1: CLEANUP STALE
// ══════════════════════════════════════════════════════════
async function phaseCleanupStale(db: SupabaseClient): Promise<{ cleaned_sessions: number; cleaned_pairs: number }> {
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - STALE_SESSION_HOURS * 60 * 60 * 1000).toISOString();

  const { data: staleSessions } = await db.from("community_sessions")
    .select("id, pair_id, device_a, device_b, messages_total, target_messages, user_a, user_b, community_mode")
    .eq("status", "active")
    .lt("updated_at", staleThreshold);

  let cleanedSessions = 0;
  for (const s of staleSessions || []) {
    await db.from("community_sessions").update({
      status: "completed", completed_at: now, end_reason: "stale_timeout", updated_at: now,
    }).eq("id", s.id);
    await db.from("community_pairs").update({ status: "closed", closed_at: now }).eq("id", s.pair_id);

    await auditLog(db, {
      device_id: s.device_a, user_id: s.user_a, session_id: s.id, pair_id: s.pair_id,
      partner_device_id: s.device_b, event_type: "session_stale_cleanup", level: "warn",
      message: `Sessão travada limpa: ${s.messages_total}/${s.target_messages} msgs`,
      reason: "stale_timeout", community_mode: s.community_mode,
      meta: { messages_total: s.messages_total, target: s.target_messages },
    });
    cleanedSessions++;
  }

  const { data: orphanPairs } = await db.from("community_pairs")
    .select("id, session_id, instance_id_a, instance_id_b")
    .eq("status", "active").lt("created_at", staleThreshold);

  let cleanedPairs = 0;
  for (const p of orphanPairs || []) {
    if (p.session_id) {
      const { data: sess } = await db.from("community_sessions").select("status").eq("id", p.session_id).maybeSingle();
      if (sess?.status === "active") continue;
    }
    await db.from("community_pairs").update({ status: "closed", closed_at: now }).eq("id", p.id);
    await auditLog(db, {
      device_id: p.instance_id_a, pair_id: p.id, partner_device_id: p.instance_id_b,
      event_type: "pair_orphan_cleanup", level: "warn",
      message: `Par órfão limpo`, reason: "orphan_pair",
    });
    cleanedPairs++;
  }

  return { cleaned_sessions: cleanedSessions, cleaned_pairs: cleanedPairs };
}

// ══════════════════════════════════════════════════════════
// PHASE 2: UPDATE ELIGIBILITY
// ══════════════════════════════════════════════════════════
async function phaseUpdateEligibility(db: SupabaseClient): Promise<{ updated: number; eligible: number; reasons: Record<string, number> }> {
  const { data: memberships } = await db.from("warmup_community_membership")
    .select("id, device_id, community_mode, community_day, is_enabled, daily_limit, messages_today, pairs_today, cooldown_until, start_hour, end_hour, active_days, user_id, is_eligible, daily_pairs_min, daily_pairs_max, target_messages_per_pair, cooldown_min_minutes, cooldown_max_minutes")
    .eq("is_enabled", true).neq("community_mode", "disabled").limit(500);

  if (!memberships?.length) return { updated: 0, eligible: 0, reasons: {} };

  const deviceIds = memberships.map((m: any) => m.device_id);
  const { data: devices } = await db.from("devices").select("id, status, number, uazapi_token, uazapi_base_url").in("id", deviceIds);
  const deviceMap = Object.fromEntries((devices || []).map((d: any) => [d.id, d]));

  const [{ data: sessA }, { data: sessB }] = await Promise.all([
    db.from("community_sessions").select("device_a").in("device_a", deviceIds).eq("status", "active"),
    db.from("community_sessions").select("device_b").in("device_b", deviceIds).eq("status", "active"),
  ]);
  const busyDevices = new Set<string>();
  for (const s of [...(sessA || []), ...(sessB || [])] as any[]) busyDevices.add(s.device_a || s.device_b);

  const { data: cycles } = await db.from("warmup_cycles")
    .select("device_id, chip_state, day_index, is_running").in("device_id", deviceIds).eq("is_running", true);
  const cycleMap = Object.fromEntries((cycles || []).map((c: any) => [c.device_id, c]));

  const reasons: Record<string, number> = {};
  let eligibleCount = 0;

  for (const m of memberships) {
    let eligible = true;
    let reason = "";

    const dev = deviceMap[m.device_id];
    if (!dev || !CONNECTED_STATUSES.includes(dev.status)) {
      eligible = false; reason = "device_disconnected";
    } else if (!dev.uazapi_token || !dev.uazapi_base_url || !dev.number) {
      eligible = false; reason = "device_not_configured";
    } else if (m.cooldown_until && new Date(m.cooldown_until) > new Date()) {
      eligible = false; reason = "cooldown_active";
    } else if (m.daily_limit > 0 && m.messages_today >= m.daily_limit) {
      eligible = false; reason = "daily_limit_reached";
    } else if (busyDevices.has(m.device_id)) {
      eligible = false; reason = "session_active";
    } else {
      const activeDays = Array.isArray(m.active_days) ? m.active_days : ["mon", "tue", "wed", "thu", "fri"];
      if (!isWithinWindow(m.start_hour || "08:00", m.end_hour || "19:00", activeDays)) {
        eligible = false; reason = "outside_window";
      }
    }

    // warmup_managed devices are handled by warmup-processor — skip in community-processor
    if (eligible && m.community_mode === "warmup_managed") {
      eligible = false; reason = "handled_by_warmup_processor";
    }

    if (eligible && m.community_mode === "community_only") {
      const pairsMax = m.daily_pairs_max || 6;
      if ((m.pairs_today || 0) >= pairsMax) {
        eligible = false; reason = "pairs_limit_reached";
      }
    }

    if (eligible) eligibleCount++;
    if (!eligible) reasons[reason] = (reasons[reason] || 0) + 1;

    const wasEligible = m.is_eligible;
    if (wasEligible !== eligible) {
      await auditLog(db, {
        device_id: m.device_id, user_id: m.user_id,
        event_type: "eligibility_changed", level: eligible ? "info" : "warn",
        message: eligible ? "Conta tornou-se elegível" : `Bloqueada: ${reason}`,
        reason: eligible ? null : reason,
        community_mode: m.community_mode, community_day: m.community_day,
        meta: { was_eligible: wasEligible, pairs_today: m.pairs_today, messages_today: m.messages_today },
      });
    }

    await db.from("warmup_community_membership").update({
      is_eligible: eligible,
      last_error: eligible ? null : `Inelegível: ${reason}`,
      last_job: "update_eligibility",
      last_pair_reject_reason: eligible ? null : reason,
    }).eq("id", m.id);
  }

  return { updated: memberships.length, eligible: eligibleCount, reasons };
}

// ══════════════════════════════════════════════════════════
// PHASE 3: FORM PAIRS
// ══════════════════════════════════════════════════════════
async function phaseFormPairs(db: SupabaseClient): Promise<{
  pairs_formed: number;
  rejected: Array<{ device: string; reason: string; partner?: string }>;
  logs: string[];
}> {
  const logs: string[] = [];

  const { data: eligible } = await db.from("warmup_community_membership")
    .select("device_id, user_id, community_mode, community_day, pairs_today, messages_today, daily_limit, last_session_at, last_partner_device_id, daily_pairs_min, daily_pairs_max, target_messages_per_pair, partner_repeat_policy, cross_user_preference, own_accounts_allowed")
    .eq("is_eligible", true).eq("is_enabled", true).neq("community_mode", "disabled").limit(200);

  if (!eligible?.length || eligible.length < 2) return { pairs_formed: 0, rejected: [], logs: ["insufficient_eligible"] };

  const allDeviceIds = eligible.map((e: any) => e.device_id);
  const [{ data: pairsA }, { data: pairsB }] = await Promise.all([
    db.from("community_pairs").select("instance_id_a").in("instance_id_a", allDeviceIds).eq("status", "active"),
    db.from("community_pairs").select("instance_id_b").in("instance_id_b", allDeviceIds).eq("status", "active"),
  ]);
  const pairedDevices = new Set<string>();
  for (const p of [...(pairsA || []), ...(pairsB || [])] as any[]) pairedDevices.add(p.instance_id_a || p.instance_id_b);

  const now = Date.now();
  const spacingMs = MIN_SPACING_BETWEEN_PAIRS_MINUTES * 60 * 1000;
  const unpaired = eligible.filter((e: any) => {
    if (pairedDevices.has(e.device_id)) return false;
    if (e.last_session_at) {
      const elapsed = now - new Date(e.last_session_at).getTime();
      if (elapsed < spacingMs) {
        logs.push(`spacing_block:${e.device_id.substring(0, 8)}:${Math.round(elapsed / 60000)}min`);
        auditLog(db, {
          device_id: e.device_id, user_id: e.user_id,
          event_type: "pair_rejected", level: "info",
          message: `Espaçamento insuficiente: ${Math.round(elapsed / 60000)}min < ${MIN_SPACING_BETWEEN_PAIRS_MINUTES}min`,
          reason: "spacing_block", community_mode: e.community_mode, community_day: e.community_day,
        });
        return false;
      }
    }
    return true;
  });
  if (unpaired.length < 2) return { pairs_formed: 0, rejected: [], logs };

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { data: todayPairsAll } = await db.from("community_pairs")
    .select("instance_id_a, instance_id_b").gte("created_at", todayStart.toISOString());

  const todayPartnerCount: Record<string, Record<string, number>> = {};
  for (const p of todayPairsAll || []) {
    if (!todayPartnerCount[p.instance_id_a]) todayPartnerCount[p.instance_id_a] = {};
    if (!todayPartnerCount[p.instance_id_b]) todayPartnerCount[p.instance_id_b] = {};
    todayPartnerCount[p.instance_id_a][p.instance_id_b] = (todayPartnerCount[p.instance_id_a][p.instance_id_b] || 0) + 1;
    todayPartnerCount[p.instance_id_b][p.instance_id_a] = (todayPartnerCount[p.instance_id_b][p.instance_id_a] || 0) + 1;
  }

  const uniquePartnersToday: Record<string, number> = {};
  for (const devId of Object.keys(todayPartnerCount)) {
    uniquePartnersToday[devId] = Object.keys(todayPartnerCount[devId]).length;
  }

  const shuffled = [...unpaired].sort(() => Math.random() - 0.5);
  const sorted = shuffled.sort((a: any, b: any) => (a.pairs_today || 0) - (b.pairs_today || 0));

  const managedDeviceIds = sorted.filter((s: any) => s.community_mode === "warmup_managed").map((s: any) => s.device_id);
  const { data: managedCycles } = managedDeviceIds.length > 0
    ? await db.from("warmup_cycles").select("id, device_id").in("device_id", managedDeviceIds).eq("is_running", true)
    : { data: [] };
  const cycleIdMap = Object.fromEntries((managedCycles || []).map((c: any) => [c.device_id, c.id]));

  const pairedThisTick = new Set<string>();
  const formed: string[] = [];
  const rejected: Array<{ device: string; reason: string; partner?: string }> = [];

  for (const device of sorted) {
    if (pairedThisTick.has(device.device_id)) continue;
    if (formed.length >= MAX_NEW_SESSIONS_PER_TICK) break;

    const candidates = sorted.filter((c: any) => {
      if (c.device_id === device.device_id) return false;
      if (pairedThisTick.has(c.device_id)) return false;
      return true;
    });

    if (!candidates.length) {
      rejected.push({ device: device.device_id, reason: "no_candidates" });
      await auditLog(db, {
        device_id: device.device_id, user_id: device.user_id,
        event_type: "pair_rejected", level: "warn",
        message: "Sem candidatos disponíveis para pareamento",
        reason: "no_candidates", community_mode: device.community_mode, community_day: device.community_day,
      });
      continue;
    }

    const scored = candidates.map((c: any) => {
      let score = 100;
      const isSameUser = c.user_id === device.user_id;
      const crossPref = device.cross_user_preference || "balanced";
      const ownAllowed = device.own_accounts_allowed !== false;

      if (isSameUser) {
        if (!ownAllowed) score -= 500;
        else if (crossPref === "prefer_cross") score += 5;
        else if (crossPref === "prefer_own") score += 25;
        else score += 20;
      } else {
        if (crossPref === "prefer_cross") score += 20;
        else if (crossPref === "prefer_own") score += 5;
        else score += 5;
      }

      const timesToday = todayPartnerCount[device.device_id]?.[c.device_id] || 0;
      const repeatPolicy = device.partner_repeat_policy || "avoid_same_day";
      if (repeatPolicy === "strict_no_repeat" && timesToday > 0) score -= 500;
      else if (timesToday >= MAX_SAME_PAIR_PER_DAY) score -= 200;
      else if (timesToday > 0) score -= 80;

      score -= (c.pairs_today || 0) * 8;
      const partnerVariety = uniquePartnersToday[c.device_id] || 0;
      score -= partnerVariety * 3;
      if (device.last_partner_device_id === c.device_id) score -= 25;
      score += randInt(0, 12);
      return { ...c, score, timesToday };
    });

    scored.sort((a: any, b: any) => b.score - a.score);

    let partner = null;
    for (const candidate of scored) {
      if (candidate.timesToday >= MAX_SAME_PAIR_PER_DAY) {
        const hasAlternative = scored.some((s: any) =>
          s.device_id !== candidate.device_id &&
          (todayPartnerCount[device.device_id]?.[s.device_id] || 0) < MAX_SAME_PAIR_PER_DAY &&
          s.score > -50
        );
        if (hasAlternative) {
          rejected.push({ device: device.device_id, reason: "same_pair_repeated_today", partner: candidate.device_id });
          await auditLog(db, {
            device_id: device.device_id, user_id: device.user_id,
            partner_device_id: candidate.device_id,
            event_type: "pair_rejected", level: "info",
            message: `Par repetido hoje (${candidate.timesToday}x), alternativa disponível`,
            reason: "same_pair_repeated_today", community_mode: device.community_mode,
            meta: { times_today: candidate.timesToday, score: candidate.score },
          });
          continue;
        }
        await auditLog(db, {
          device_id: device.device_id, user_id: device.user_id,
          partner_device_id: candidate.device_id,
          event_type: "pair_repeat_forced", level: "warn",
          message: `Par repetido forçado: sem alternativa`,
          reason: "repeat_forced", community_mode: device.community_mode,
          meta: { times_today: candidate.timesToday },
        });
      }
      partner = candidate;
      break;
    }

    if (!partner) {
      rejected.push({ device: device.device_id, reason: "all_partners_blocked" });
      await auditLog(db, {
        device_id: device.device_id, user_id: device.user_id,
        event_type: "pair_rejected", level: "warn",
        message: "Todos parceiros bloqueados", reason: "all_partners_blocked",
        community_mode: device.community_mode, community_day: device.community_day,
      });
      await db.from("warmup_community_membership").update({
        last_pair_reject_reason: "all_partners_blocked", last_job: "form_pairs",
      }).eq("device_id", device.device_id);
      continue;
    }

    const cycleId = cycleIdMap[device.device_id] || cycleIdMap[partner.device_id] || null;
    const mode = device.community_mode === "warmup_managed" || partner.community_mode === "warmup_managed"
      ? "warmup_managed" : "community_only";

    const targetMsgs = mode === "community_only"
      ? (device.target_messages_per_pair || partner.target_messages_per_pair || TARGET_MESSAGES_PER_BLOCK)
      : TARGET_MESSAGES_PER_BLOCK;

    const { data: newPair } = await db.from("community_pairs").insert({
      cycle_id: cycleId, instance_id_a: device.device_id, instance_id_b: partner.device_id,
      status: "active", community_mode: mode, target_messages: targetMsgs,
      messages_total: 0,
      meta: {
        initiator: Math.random() < 0.5 ? "a" : "b",
        formed_at: new Date().toISOString(), score: partner.score,
        cross_user: device.user_id !== partner.user_id, repeat_count: partner.timesToday,
      },
    }).select("id").maybeSingle();

    pairedThisTick.add(device.device_id);
    pairedThisTick.add(partner.device_id);
    formed.push(`${device.device_id.substring(0, 8)}<->${partner.device_id.substring(0, 8)}`);

    await auditLog(db, {
      device_id: device.device_id, user_id: device.user_id,
      pair_id: newPair?.id, partner_device_id: partner.device_id,
      event_type: "pair_created", level: "info",
      message: `Dupla formada: score=${partner.score}, cross=${device.user_id !== partner.user_id}`,
      community_mode: mode, community_day: device.community_day,
      meta: { score: partner.score, cross_user: device.user_id !== partner.user_id, repeat_count: partner.timesToday },
    });

    await db.from("warmup_community_membership").update({
      last_job: "form_pairs", last_pair_reject_reason: null,
    }).eq("device_id", device.device_id);
  }

  return { pairs_formed: formed.length, rejected, logs };
}

// ══════════════════════════════════════════════════════════
// PHASE 4: START SESSIONS
// ══════════════════════════════════════════════════════════
async function phaseStartSessions(db: SupabaseClient): Promise<{ started: number; errors: string[] }> {
  const { data: pairsNoSession } = await db.from("community_pairs")
    .select("id, instance_id_a, instance_id_b, community_mode, target_messages, meta")
    .eq("status", "active").is("session_id", null).limit(MAX_NEW_SESSIONS_PER_TICK);

  if (!pairsNoSession?.length) return { started: 0, errors: [] };

  let started = 0;
  const errors: string[] = [];

  for (const pair of pairsNoSession) {
    const [{ data: devA }, { data: devB }] = await Promise.all([
      db.from("devices").select("id, status, number, uazapi_token, uazapi_base_url, user_id").eq("id", pair.instance_id_a).maybeSingle(),
      db.from("devices").select("id, status, number, uazapi_token, uazapi_base_url, user_id").eq("id", pair.instance_id_b).maybeSingle(),
    ]);

    if (!devA || !CONNECTED_STATUSES.includes(devA.status) || !devA.number || !devA.uazapi_token) {
      await db.from("community_pairs").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", pair.id);
      errors.push(`pair ${pair.id}: device_a not ready`);
      await auditLog(db, {
        device_id: pair.instance_id_a, pair_id: pair.id, partner_device_id: pair.instance_id_b,
        event_type: "session_start_failed", level: "error",
        message: "Conta A desconectada antes de iniciar sessão", reason: "disconnected_before_start",
      });
      continue;
    }
    if (!devB || !CONNECTED_STATUSES.includes(devB.status) || !devB.number || !devB.uazapi_token) {
      await db.from("community_pairs").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", pair.id);
      errors.push(`pair ${pair.id}: device_b not ready`);
      await auditLog(db, {
        device_id: pair.instance_id_b, pair_id: pair.id, partner_device_id: pair.instance_id_a,
        event_type: "session_start_failed", level: "error",
        message: "Conta B desconectada antes de iniciar sessão", reason: "disconnected_before_start",
      });
      continue;
    }

    // Concurrency guard
    const { count: activeA } = await db.from("community_sessions")
      .select("id", { count: "exact", head: true })
      .or(`device_a.eq.${pair.instance_id_a},device_b.eq.${pair.instance_id_a}`).eq("status", "active");
    const { count: activeB } = await db.from("community_sessions")
      .select("id", { count: "exact", head: true })
      .or(`device_a.eq.${pair.instance_id_b},device_b.eq.${pair.instance_id_b}`).eq("status", "active");

    if ((activeA || 0) > 0 || (activeB || 0) > 0) {
      errors.push(`pair ${pair.id}: device already in session`);
      await auditLog(db, {
        device_id: pair.instance_id_a, pair_id: pair.id, partner_device_id: pair.instance_id_b,
        event_type: "session_start_failed", level: "warn",
        message: "Conta já em sessão ativa", reason: "already_in_session",
      });
      continue;
    }

    const { data: mbrA } = await db.from("warmup_community_membership")
      .select("intensity, custom_min_delay_seconds, custom_max_delay_seconds, custom_pause_after_min, custom_pause_after_max, custom_pause_duration_min, custom_pause_duration_max, community_day")
      .eq("device_id", pair.instance_id_a).maybeSingle();

    let minDelay = 30, maxDelay = 90;
    let pauseAfterMin = 8, pauseAfterMax = 15;
    let pauseDurationMin = 60, pauseDurationMax = 180;

    if (pair.community_mode === "community_only" && mbrA) {
      const preset = INTENSITY_PRESETS[mbrA.intensity || "medium"];
      minDelay = mbrA.custom_min_delay_seconds ?? preset.min_delay;
      maxDelay = mbrA.custom_max_delay_seconds ?? preset.max_delay;
      pauseAfterMin = mbrA.custom_pause_after_min ?? preset.pause_after_min;
      pauseAfterMax = mbrA.custom_pause_after_max ?? preset.pause_after_max;
      pauseDurationMin = mbrA.custom_pause_duration_min ?? preset.pause_duration_min;
      pauseDurationMax = mbrA.custom_pause_duration_max ?? preset.pause_duration_max;
    }

    const { data: session } = await db.from("community_sessions").insert({
      pair_id: pair.id, device_a: pair.instance_id_a, device_b: pair.instance_id_b,
      user_a: devA.user_id, user_b: devB.user_id,
      community_mode: pair.community_mode,
      target_messages: pair.target_messages || TARGET_MESSAGES_PER_BLOCK,
      status: "active",
      min_delay_seconds: minDelay, max_delay_seconds: maxDelay,
      pause_after_messages_min: pauseAfterMin, pause_after_messages_max: pauseAfterMax,
      pause_duration_min: pauseDurationMin, pause_duration_max: pauseDurationMax,
      messages_total: 0, messages_sent_a: 0, messages_sent_b: 0,
    }).select("*").maybeSingle();

    if (session) {
      await db.from("community_pairs").update({ session_id: session.id }).eq("id", pair.id);
      await auditLog(db, {
        device_id: pair.instance_id_a, user_id: devA.user_id,
        session_id: session.id, pair_id: pair.id, partner_device_id: pair.instance_id_b,
        event_type: "session_started", level: "info",
        message: `Sessão iniciada: target=${session.target_messages}, delay=${minDelay}-${maxDelay}s`,
        community_mode: pair.community_mode, community_day: mbrA?.community_day,
        meta: { target: session.target_messages, cross_user: devA.user_id !== devB.user_id },
      });

      // Fire first turn asynchronously (non-blocking)
      const meta = pair.meta || {};
      const firstSender = meta.initiator === "b" ? pair.instance_id_b : pair.instance_id_a;
      setTimeout(async () => {
        try {
          await executeSessionTurn(db, session, firstSender);
        } catch (e) {
          log.error(`First turn error for session ${session.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }, randInt(3000, 8000));
      started++;
    } else {
      errors.push(`pair ${pair.id}: session insert failed`);
    }
  }

  return { started, errors };
}

// ══════════════════════════════════════════════════════════
// PHASE 5: MONITOR SESSIONS
// ══════════════════════════════════════════════════════════
async function phaseMonitorSessions(db: SupabaseClient): Promise<{ resumed: number }> {
  // Use 10 min threshold to account for max_delay (90s) + max_pause (180s) + buffer
  const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: stuckSessions } = await db.from("community_sessions")
    .select("id, device_a, device_b, last_sender, messages_total, target_messages, min_delay_seconds, max_delay_seconds, pause_after_messages_min, pause_after_messages_max, pause_duration_min, pause_duration_max, pair_id, community_mode, user_a, user_b, last_message_at")
    .eq("status", "active").lt("updated_at", stuckThreshold).limit(5);

  let resumed = 0;
  for (const session of stuckSessions || []) {
    if (session.messages_total >= session.target_messages) {
      await finishSession(db, session, "target_reached");
      continue;
    }

    let nextSender = session.device_a;
    if (session.last_sender) {
      nextSender = session.last_sender === session.device_a ? session.device_b : session.device_a;
    } else {
      const { data: memA } = await db.from("warmup_community_membership")
        .select("community_day").eq("device_id", session.device_a).maybeSingle();
      const { data: memB } = await db.from("warmup_community_membership")
        .select("community_day").eq("device_id", session.device_b).maybeSingle();
      nextSender = (memA?.community_day || 1) >= (memB?.community_day || 1) ? session.device_a : session.device_b;
    }

    const { data: dev } = await db.from("devices").select("status, uazapi_token").eq("id", nextSender).maybeSingle();
    if (!dev || !CONNECTED_STATUSES.includes(dev.status) || !dev.uazapi_token) {
      await finishSession(db, session, "device_disconnected_on_resume");
      continue;
    }

    await auditLog(db, {
      device_id: nextSender, session_id: session.id, pair_id: session.pair_id,
      event_type: "session_resumed", level: "warn",
      message: `Sessão retomada após travamento: ${session.messages_total}/${session.target_messages}`,
      community_mode: session.community_mode,
      meta: { messages_total: session.messages_total, target: session.target_messages },
    });

    // Resume turn asynchronously
    setTimeout(async () => {
      try {
        await executeSessionTurn(db, session, nextSender);
      } catch (e) {
        log.error(`Resume turn error for session ${session.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, randInt(2000, 5000));
    resumed++;
  }

  return { resumed };
}

// ══════════════════════════════════════════════════════════
// PHASE 6: RELEASE COOLDOWNS
// ══════════════════════════════════════════════════════════
async function phaseReleaseCooldowns(db: SupabaseClient): Promise<{ released: number }> {
  const { data: cooledOff } = await db.from("warmup_community_membership")
    .update({ cooldown_until: null })
    .lt("cooldown_until", new Date().toISOString())
    .neq("community_mode", "disabled")
    .select("id, device_id");

  for (const c of cooledOff || []) {
    await auditLog(db, {
      device_id: c.device_id, event_type: "cooldown_released", level: "info",
      message: "Cooldown expirado, conta liberada",
    });
  }

  return { released: cooledOff?.length || 0 };
}

// ══════════════════════════════════════════════════════════
// SESSION TURN EXECUTION
// ══════════════════════════════════════════════════════════
async function executeSessionTurn(
  db: SupabaseClient, session: any, senderDeviceId: string,
): Promise<{ success: boolean; error?: string; completed?: boolean }> {
  const { data: fresh } = await db.from("community_sessions").select("*").eq("id", session.id).maybeSingle();
  if (!fresh || fresh.status !== "active") return { success: false, error: "session_not_active" };
  if (fresh.messages_total >= fresh.target_messages) {
    await finishSession(db, fresh, "target_reached");
    return { success: true, completed: true };
  }

  // ANTI-FLOOD: Enforce alternation — same sender cannot send twice in a row
  if (fresh.last_sender === senderDeviceId && fresh.messages_total > 0) {
    log.warn(`Anti-flood: ${senderDeviceId.slice(0, 8)} tried to send twice in a row, switching to peer`);
    senderDeviceId = fresh.device_a === senderDeviceId ? fresh.device_b : fresh.device_a;
  }

  // ANTI-FLOOD: Skip if last message was sent very recently (< 8 seconds ago)
  if (fresh.last_message_at) {
    const elapsed = Date.now() - new Date(fresh.last_message_at).getTime();
    if (elapsed < 8000) {
      log.warn(`Anti-flood: session ${session.id} last msg ${elapsed}ms ago, skipping duplicate`);
      return { success: false, error: "too_fast" };
    }
  }

  const { data: sender } = await db.from("devices")
    .select("id, number, uazapi_token, uazapi_base_url, user_id, name, status")
    .eq("id", senderDeviceId).maybeSingle();

  if (!sender?.uazapi_token || !sender?.uazapi_base_url || !sender?.number || !CONNECTED_STATUSES.includes(sender.status)) {
    await finishSession(db, fresh, "sender_disconnected");
    return { success: false, error: "sender_disconnected" };
  }

  const receiverDeviceId = fresh.device_a === senderDeviceId ? fresh.device_b : fresh.device_a;
  const { data: receiver } = await db.from("devices")
    .select("id, number, status, user_id").eq("id", receiverDeviceId).maybeSingle();

  if (!receiver?.number || !CONNECTED_STATUSES.includes(receiver.status)) {
    await finishSession(db, fresh, "receiver_disconnected");
    return { success: false, error: "receiver_offline" };
  }

  const msg = generateMessage();
  const peerPhone = receiver.number.replace(/\+/g, "");
  const baseUrl = sender.uazapi_base_url.replace(/\/+$/, "");

  try {
    await sendText(baseUrl, sender.uazapi_token, peerPhone, msg);
  } catch (err: any) {
    await db.from("community_session_logs").insert({
      session_id: fresh.id, pair_id: fresh.pair_id,
      sender_device_id: senderDeviceId, receiver_device_id: receiverDeviceId,
      sender_user_id: sender.user_id,
      message_content: msg, message_index: fresh.messages_total,
      status: "failed", error_message: err.message?.substring(0, 500),
    });

    const { count: recentFails } = await db.from("community_session_logs")
      .select("id", { count: "exact", head: true })
      .eq("session_id", fresh.id).eq("status", "failed")
      .order("created_at", { ascending: false }).limit(3);

    if ((recentFails || 0) >= 3) {
      await finishSession(db, fresh, "consecutive_failures");
      await auditLog(db, {
        device_id: senderDeviceId, user_id: sender.user_id,
        session_id: fresh.id, pair_id: fresh.pair_id,
        event_type: "session_failed", level: "error",
        message: `Sessão encerrada por falhas consecutivas: ${err.message?.substring(0, 200)}`,
        reason: "consecutive_failures", community_mode: fresh.community_mode,
        meta: { messages_total: fresh.messages_total, target: fresh.target_messages, error: err.message?.substring(0, 300) },
      });
    } else {
      // Retry after delay
      setTimeout(async () => {
        try {
          const { data: check } = await db.from("community_sessions").select("status").eq("id", fresh.id).maybeSingle();
          if (check?.status === "active") await executeSessionTurn(db, fresh, senderDeviceId);
        } catch (e) {
          log.error(`Retry turn error for session ${fresh.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }, randInt(30, 60) * 1000);
    }
    return { success: false, error: err.message };
  }

  // Log success
  await db.from("community_session_logs").insert({
    session_id: fresh.id, pair_id: fresh.pair_id,
    sender_device_id: senderDeviceId, receiver_device_id: receiverDeviceId,
    sender_user_id: sender.user_id,
    message_content: msg, message_index: fresh.messages_total,
    status: "sent", delay_applied_seconds: 0,
  });

  const isSenderA = senderDeviceId === fresh.device_a;
  const newTotal = fresh.messages_total + 1;
  const updateData: any = {
    messages_total: newTotal, last_sender: senderDeviceId,
    last_message_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  if (isSenderA) updateData.messages_sent_a = (fresh.messages_sent_a || 0) + 1;
  else updateData.messages_sent_b = (fresh.messages_sent_b || 0) + 1;

  const completed = newTotal >= fresh.target_messages;
  if (completed) {
    updateData.status = "completed";
    updateData.completed_at = new Date().toISOString();
    updateData.end_reason = "target_reached";
  }

  await db.from("community_sessions").update(updateData).eq("id", fresh.id);
  await db.from("community_pairs").update({ messages_total: newTotal }).eq("id", fresh.pair_id);

  // Update sender membership
  const { data: senderMbr } = await db.from("warmup_community_membership")
    .select("messages_today").eq("device_id", senderDeviceId).maybeSingle();
  await db.from("warmup_community_membership").update({
    messages_today: (senderMbr?.messages_today || 0) + 1,
    last_session_at: new Date().toISOString(),
    last_partner_device_id: receiverDeviceId,
    last_error: null, last_job: "session_turn",
  }).eq("device_id", senderDeviceId);

  // Warmup audit log
  if (fresh.community_mode === "warmup_managed") {
    const { data: cycle } = await db.from("warmup_cycles")
      .select("id").eq("device_id", senderDeviceId).eq("is_running", true).maybeSingle();
    if (cycle) {
      await db.from("warmup_audit_logs").insert({
        user_id: sender.user_id, device_id: senderDeviceId, cycle_id: cycle.id,
        level: "info", event_type: "community_turn_sent",
        message: `Comunitário: bloco ${fresh.id} msg ${newTotal}/${fresh.target_messages}`,
        meta: { session_id: fresh.id, pair_id: fresh.pair_id, mode: fresh.community_mode },
      });
      await (db.rpc("increment_warmup_budget", { p_cycle_id: cycle.id, p_increment: 1, p_unique_recipient: false }) as any).catch(() => {});
    }
  }

  if (completed) {
    await finishSession(db, { ...fresh, messages_total: newTotal }, "target_reached");
  } else {
    // Schedule next turn with delay
    const delay = randInt(fresh.min_delay_seconds || 30, fresh.max_delay_seconds || 90);
    const pauseAfter = randInt(fresh.pause_after_messages_min || 8, fresh.pause_after_messages_max || 15);
    let actualDelay = delay;
    if (newTotal > 0 && newTotal % pauseAfter === 0) {
      actualDelay += randInt(fresh.pause_duration_min || 60, fresh.pause_duration_max || 180);
    }

    setTimeout(async () => {
      try {
        const { data: check } = await db.from("community_sessions").select("status").eq("id", fresh.id).maybeSingle();
        if (check?.status !== "active") return;
        const { data: checkRecv } = await db.from("devices").select("status").eq("id", receiverDeviceId).maybeSingle();
        if (!checkRecv || !CONNECTED_STATUSES.includes(checkRecv.status)) {
          await finishSession(db, fresh, "receiver_disconnected_mid_block");
          return;
        }
        await executeSessionTurn(db, fresh, receiverDeviceId);
      } catch (e) {
        log.error(`Next turn error for session ${fresh.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, actualDelay * 1000);
  }

  return { success: true, completed };
}

// ══════════════════════════════════════════════════════════
// FINISH SESSION
// ══════════════════════════════════════════════════════════
async function finishSession(db: SupabaseClient, session: any, endReason: string) {
  const now = new Date().toISOString();

  await db.from("community_sessions").update({
    status: "completed", completed_at: now, end_reason: endReason, updated_at: now,
  }).eq("id", session.id);

  await db.from("community_pairs").update({ status: "closed", closed_at: now }).eq("id", session.pair_id);

  let cdMin = COOLDOWN_MIN_MINUTES;
  let cdMax = COOLDOWN_MAX_MINUTES;

  for (const devId of [session.device_a, session.device_b]) {
    const { data: mbr } = await db.from("warmup_community_membership")
      .select("pairs_today, user_id, community_mode, community_day, cooldown_min_minutes, cooldown_max_minutes, intensity").eq("device_id", devId).maybeSingle();
    if (mbr) {
      if (mbr.community_mode === "community_only") {
        cdMin = mbr.cooldown_min_minutes || COOLDOWN_MIN_MINUTES;
        cdMax = mbr.cooldown_max_minutes || COOLDOWN_MAX_MINUTES;
      }
      const cooldownMinutes = randInt(cdMin, cdMax);
      const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString();
      await db.from("warmup_community_membership").update({
        pairs_today: (mbr.pairs_today || 0) + 1,
        cooldown_until: cooldownUntil,
        last_job: "session_finished",
      }).eq("device_id", devId);
    }
  }

  const cooldownMinutes = randInt(cdMin, cdMax);

  await auditLog(db, {
    device_id: session.device_a, user_id: session.user_a,
    session_id: session.id, pair_id: session.pair_id,
    partner_device_id: session.device_b,
    event_type: endReason === "target_reached" ? "session_completed" : "session_ended",
    level: endReason === "target_reached" ? "info" : "warn",
    message: `Sessão encerrada: ${endReason}, msgs: ${session.messages_total}/${session.target_messages}, cooldown: ${cooldownMinutes}min`,
    reason: endReason, community_mode: session.community_mode,
    meta: {
      messages_total: session.messages_total, target: session.target_messages,
      messages_sent_a: session.messages_sent_a, messages_sent_b: session.messages_sent_b,
      cooldown_minutes: cooldownMinutes, end_reason: endReason,
    },
  });

  log.info(`Session ${session.id} finished: ${endReason}, msgs: ${session.messages_total}/${session.target_messages}`);
}

// ══════════════════════════════════════════════════════════
// DAILY RESET
// ══════════════════════════════════════════════════════════
async function handleDailyReset(db: SupabaseClient) {
  const now = new Date().toISOString();
  await db.from("warmup_community_membership")
    .update({ messages_today: 0, pairs_today: 0, cooldown_until: null, last_daily_reset_at: now, last_error: null, last_pair_reject_reason: null })
    .neq("community_mode", "disabled").eq("is_enabled", true);

  const { data: managed } = await db.from("warmup_community_membership")
    .select("id, community_day").eq("community_mode", "warmup_managed").eq("is_enabled", true);

  if (managed?.length) {
    for (const m of managed) {
      await db.from("warmup_community_membership")
        .update({ community_day: (m.community_day || 0) + 1 }).eq("id", m.id);
    }
  }

  await phaseCleanupStale(db);

  await auditLog(db, {
    event_type: "daily_reset", level: "info",
    message: `Reset diário: ${managed?.length || 0} contas managed incrementadas`,
    meta: { managed_count: managed?.length || 0 },
  });

  return { ok: true, reset_at: now, managed_count: managed?.length || 0 };
}

// ══════════════════════════════════════════════════════════
// COMMUNITY TICK (main entry point from VPS loop)
// ══════════════════════════════════════════════════════════
export async function communityTick(db: SupabaseClient): Promise<any> {
  const tickStart = Date.now();
  const results: any = { tick_at: new Date().toISOString() };

  // Check if there are any enabled community members before doing work
  const { count } = await db.from("warmup_community_membership")
    .select("id", { count: "exact", head: true })
    .eq("is_enabled", true).neq("community_mode", "disabled");

  if (!count || count === 0) {
    return { skipped: true, reason: "no_active_community_members" };
  }

  results.cleanup = await phaseCleanupStale(db);
  results.eligibility = await phaseUpdateEligibility(db);
  results.pairing = await phaseFormPairs(db);
  results.sessions = await phaseStartSessions(db);
  results.monitor = await phaseMonitorSessions(db);
  results.cooldowns = await phaseReleaseCooldowns(db);

  results.duration_ms = Date.now() - tickStart;

  await auditLog(db, {
    event_type: "tick_completed", level: "info",
    message: `Tick: ${results.duration_ms}ms, elegíveis=${results.eligibility.eligible}, pares=${results.pairing.pairs_formed}, sessões=${results.sessions.started}, retomadas=${results.monitor.resumed}`,
    meta: results,
  });

  if (results.pairing.pairs_formed > 0 || results.sessions.started > 0 || results.monitor.resumed > 0) {
    log.info(`Community tick: eligible=${results.eligibility.eligible}, pairs=${results.pairing.pairs_formed}, sessions=${results.sessions.started}, resumed=${results.monitor.resumed}, ${results.duration_ms}ms`);
  }

  lastCommunityTickAt = new Date();
  return results;
}

// Export daily reset for use in warmup daily_reset jobs
export { handleDailyReset as communityDailyReset };

// Export status for health check
export let lastCommunityTickAt: Date | null = null;
export function getCommunityStatus() {
  return {
    lastTick: lastCommunityTickAt?.toISOString() || null,
  };
}
