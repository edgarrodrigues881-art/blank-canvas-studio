/**
 * community-core — Motor Central Unificado de Comunitário v3
 * 
 * SCHEDULER PHASES (chamadas pelo tick a cada 2min):
 *   Phase 1: cleanup_stale     — Limpar sessões travadas/órfãs
 *   Phase 2: update_eligibility — Atualizar elegibilidade de todas as contas
 *   Phase 3: form_pairs        — Formar novas duplas (com fairness e rodízio)
 *   Phase 4: start_sessions    — Iniciar sessões para duplas formadas (max N por ciclo)
 *   Phase 5: monitor_sessions  — Acompanhar sessões em andamento
 *   Phase 6: release_cooldowns — Liberar contas cujo cooldown expirou
 * 
 * Modos:
 *   - warmup_managed: Comunitário dentro do aquecimento automático
 *   - community_only: Comunitário dedicado/avulso
 * 
 * Actions:
 *   - tick: Executa todas as phases em ordem
 *   - process_device: Processa uma conta específica (forçar manualmente)
 *   - daily_reset: Reset diário de contadores
 *   - check_eligibility: Verificar elegibilidade de uma conta
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CONNECTED_STATUSES = ["Ready", "Connected", "authenticated", "open", "active"];
const MAX_NEW_SESSIONS_PER_TICK = 3; // Max novas sessões por tick (evita burst)
const STALE_SESSION_HOURS = 4;
const COOLDOWN_MIN_MINUTES = 15;
const COOLDOWN_MAX_MINUTES = 45;
const TARGET_MESSAGES_PER_BLOCK = 120;
const MIN_SPACING_BETWEEN_PAIRS_MINUTES = 20; // Espaçamento mínimo entre novas duplas da mesma conta
const MAX_SAME_PAIR_PER_DAY = 1; // Evitar repetir mesmo par no mesmo dia (exceção controlada = 1)

// ══════════════════════════════════════════════════════════
// CHIP & PROGRESSION
// ══════════════════════════════════════════════════════════
function getCommunityStartDay(chipState: string): number {
  if (chipState === "unstable") return 9;
  if (chipState === "recovered") return 7;
  return 6;
}

function getPairsTarget(communityDay: number): { min: number; max: number } {
  if (communityDay <= 1) return { min: 1, max: 3 };
  if (communityDay === 2) return { min: 2, max: 5 };
  if (communityDay === 3) return { min: 4, max: 7 };
  if (communityDay <= 6) return { min: 5, max: 8 };
  return { min: 6, max: 10 };
}

const INTENSITY_PRESETS: Record<string, {
  daily_limit: number; peers_min: number; peers_max: number; msgs_per_peer: number;
  min_delay: number; max_delay: number;
  pause_after_min: number; pause_after_max: number;
  pause_duration_min: number; pause_duration_max: number;
}> = {
  low: { daily_limit: 300, peers_min: 2, peers_max: 4, msgs_per_peer: 80, min_delay: 45, max_delay: 120, pause_after_min: 8, pause_after_max: 15, pause_duration_min: 120, pause_duration_max: 300 },
  medium: { daily_limit: 500, peers_min: 3, peers_max: 6, msgs_per_peer: 120, min_delay: 30, max_delay: 90, pause_after_min: 10, pause_after_max: 20, pause_duration_min: 60, pause_duration_max: 180 },
  high: { daily_limit: 700, peers_min: 5, peers_max: 10, msgs_per_peer: 120, min_delay: 15, max_delay: 60, pause_after_min: 12, pause_after_max: 25, pause_duration_min: 45, pause_duration_max: 120 },
};

// ══════════════════════════════════════════════════════════
// BRT TIMEZONE
// ══════════════════════════════════════════════════════════
function getBrtNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}
function getBrtHourMinute(): string {
  const brt = getBrtNow();
  return `${String(brt.getHours()).padStart(2, "0")}:${String(brt.getMinutes()).padStart(2, "0")}`;
}
function getBrtDayOfWeek(): string {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][getBrtNow().getDay()];
}
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
      const res = await fetch(`${baseUrl}${at.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(at.body),
      });
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
// PHASE 1: CLEANUP STALE — Limpar sessões travadas/órfãs
// ══════════════════════════════════════════════════════════
async function phaseCleanupStale(db: any): Promise<{ cleaned_sessions: number; cleaned_pairs: number }> {
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - STALE_SESSION_HOURS * 60 * 60 * 1000).toISOString();

  // Sessões ativas sem atividade há mais de 4h
  const { data: staleSessions } = await db.from("community_sessions")
    .select("id, pair_id, device_a, device_b, messages_total, target_messages")
    .eq("status", "active")
    .lt("updated_at", staleThreshold);

  let cleanedSessions = 0;
  for (const s of staleSessions || []) {
    await db.from("community_sessions").update({
      status: "completed", completed_at: now, end_reason: "stale_timeout", updated_at: now,
    }).eq("id", s.id);

    await db.from("community_pairs").update({
      status: "closed", closed_at: now,
    }).eq("id", s.pair_id);

    cleanedSessions++;
    console.log(`[cleanup] Stale session ${s.id}: ${s.messages_total}/${s.target_messages}`);
  }

  // Pares "active" sem sessão ativa (órfãos)
  const { data: orphanPairs } = await db.from("community_pairs")
    .select("id, session_id")
    .eq("status", "active")
    .lt("created_at", staleThreshold);

  let cleanedPairs = 0;
  for (const p of orphanPairs || []) {
    // Check if has active session
    if (p.session_id) {
      const { data: sess } = await db.from("community_sessions")
        .select("status").eq("id", p.session_id).maybeSingle();
      if (sess?.status === "active") continue; // session is alive, skip
    }
    await db.from("community_pairs").update({ status: "closed", closed_at: now }).eq("id", p.id);
    cleanedPairs++;
  }

  return { cleaned_sessions: cleanedSessions, cleaned_pairs: cleanedPairs };
}

// ══════════════════════════════════════════════════════════
// PHASE 2: UPDATE ELIGIBILITY — Atualizar is_eligible de cada conta
// ══════════════════════════════════════════════════════════
async function phaseUpdateEligibility(db: any): Promise<{ updated: number; eligible: number; reasons: Record<string, number> }> {
  const { data: memberships } = await db.from("warmup_community_membership")
    .select("id, device_id, community_mode, community_day, is_enabled, daily_limit, messages_today, pairs_today, cooldown_until, start_hour, end_hour, active_days, user_id")
    .eq("is_enabled", true)
    .neq("community_mode", "disabled")
    .limit(500);

  if (!memberships?.length) return { updated: 0, eligible: 0, reasons: {} };

  // Batch load devices
  const deviceIds = memberships.map((m: any) => m.device_id);
  const { data: devices } = await db.from("devices")
    .select("id, status, number, uazapi_token, uazapi_base_url")
    .in("id", deviceIds);
  const deviceMap = Object.fromEntries((devices || []).map((d: any) => [d.id, d]));

  // Batch load active sessions
  const [{ data: sessA }, { data: sessB }] = await Promise.all([
    db.from("community_sessions").select("device_a").in("device_a", deviceIds).eq("status", "active"),
    db.from("community_sessions").select("device_b").in("device_b", deviceIds).eq("status", "active"),
  ]);
  const busyDevices = new Set<string>();
  for (const s of [...(sessA || []), ...(sessB || [])]) {
    busyDevices.add(s.device_a || s.device_b);
  }

  // Batch load warmup_managed cycles
  const { data: cycles } = await db.from("warmup_cycles")
    .select("device_id, chip_state, day_index, is_running")
    .in("device_id", deviceIds)
    .eq("is_running", true);
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

    // warmup_managed specifics
    if (eligible && m.community_mode === "warmup_managed") {
      const cycle = cycleMap[m.device_id];
      if (!cycle) {
        eligible = false; reason = "no_active_cycle";
      } else {
        const startDay = getCommunityStartDay(cycle.chip_state || "new");
        if ((cycle.day_index || 1) < startDay) {
          eligible = false; reason = "warmup_day_too_early";
        } else if (m.community_day < 1) {
          eligible = false; reason = "community_day_not_started";
        } else {
          // Check pairs limit
          const target = getPairsTarget(m.community_day);
          if ((m.pairs_today || 0) >= target.max) {
            eligible = false; reason = "pairs_limit_reached";
          }
        }
      }
    }

    if (eligible) eligibleCount++;
    if (!eligible) reasons[reason] = (reasons[reason] || 0) + 1;

    await db.from("warmup_community_membership").update({
      is_eligible: eligible,
      last_error: eligible ? null : `Inelegível: ${reason}`,
    }).eq("id", m.id);
  }

  return { updated: memberships.length, eligible: eligibleCount, reasons };
}

// ══════════════════════════════════════════════════════════
// PHASE 3: FORM PAIRS — Formar novas duplas com fairness refinada
// ══════════════════════════════════════════════════════════
async function phaseFormPairs(db: any): Promise<{
  pairs_formed: number;
  rejected: Array<{ device: string; reason: string; partner?: string }>;
  logs: string[];
}> {
  const logs: string[] = [];

  // Get eligible devices that don't have active pairs
  const { data: eligible } = await db.from("warmup_community_membership")
    .select("device_id, user_id, community_mode, community_day, pairs_today, messages_today, daily_limit, last_session_at, last_partner_device_id")
    .eq("is_eligible", true).eq("is_enabled", true)
    .neq("community_mode", "disabled")
    .limit(200);

  if (!eligible?.length || eligible.length < 2) return { pairs_formed: 0, rejected: [], logs: ["insufficient_eligible"] };

  // Get devices with active pairs already
  const allDeviceIds = eligible.map((e: any) => e.device_id);
  const [{ data: pairsA }, { data: pairsB }] = await Promise.all([
    db.from("community_pairs").select("instance_id_a").in("instance_id_a", allDeviceIds).eq("status", "active"),
    db.from("community_pairs").select("instance_id_b").in("instance_id_b", allDeviceIds).eq("status", "active"),
  ]);
  const pairedDevices = new Set<string>();
  for (const p of [...(pairsA || []), ...(pairsB || [])]) {
    pairedDevices.add(p.instance_id_a || p.instance_id_b);
  }

  // Filter to only unpaired eligible devices + check spacing
  const now = Date.now();
  const spacingMs = MIN_SPACING_BETWEEN_PAIRS_MINUTES * 60 * 1000;
  const unpaired = eligible.filter((e: any) => {
    if (pairedDevices.has(e.device_id)) return false;
    // Espaçamento mínimo: se a última sessão terminou há menos de MIN_SPACING minutos, pular
    if (e.last_session_at) {
      const elapsed = now - new Date(e.last_session_at).getTime();
      if (elapsed < spacingMs) {
        logs.push(`spacing_block:${e.device_id.substring(0,8)}:${Math.round(elapsed/60000)}min`);
        return false;
      }
    }
    return true;
  });
  if (unpaired.length < 2) return { pairs_formed: 0, rejected: [], logs };

  // Get today's pair history for anti-repetition
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: todayPairsAll } = await db.from("community_pairs")
    .select("instance_id_a, instance_id_b")
    .gte("created_at", todayStart.toISOString());

  // Build today's partner count per device
  const todayPartnerCount: Record<string, Record<string, number>> = {};
  for (const p of todayPairsAll || []) {
    if (!todayPartnerCount[p.instance_id_a]) todayPartnerCount[p.instance_id_a] = {};
    if (!todayPartnerCount[p.instance_id_b]) todayPartnerCount[p.instance_id_b] = {};
    todayPartnerCount[p.instance_id_a][p.instance_id_b] = (todayPartnerCount[p.instance_id_a][p.instance_id_b] || 0) + 1;
    todayPartnerCount[p.instance_id_b][p.instance_id_a] = (todayPartnerCount[p.instance_id_b][p.instance_id_a] || 0) + 1;
  }

  // Count unique partners today per device (for variety metric)
  const uniquePartnersToday: Record<string, number> = {};
  for (const devId of Object.keys(todayPartnerCount)) {
    uniquePartnersToday[devId] = Object.keys(todayPartnerCount[devId]).length;
  }

  // Shuffle first for randomness, then sort by load (prevents always picking same devices first)
  const shuffled = [...unpaired].sort(() => Math.random() - 0.5);
  const sorted = shuffled.sort((a: any, b: any) => (a.pairs_today || 0) - (b.pairs_today || 0));

  // Get warmup_managed cycle_ids
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

    // Find candidates (not self, not already paired this tick)
    const candidates = sorted.filter((c: any) => {
      if (c.device_id === device.device_id) return false;
      if (pairedThisTick.has(c.device_id)) return false;
      return true;
    });

    if (!candidates.length) {
      rejected.push({ device: device.device_id, reason: "no_candidates" });
      continue;
    }

    // Score candidates with refined fairness
    const scored = candidates.map((c: any) => {
      let score = 100;

      // Prefer own accounts (same user) +20
      if (c.user_id === device.user_id) score += 20;

      // ANTI-REPETITION: Heavily penalize same pair on same day
      const timesToday = todayPartnerCount[device.device_id]?.[c.device_id] || 0;
      if (timesToday >= MAX_SAME_PAIR_PER_DAY) {
        score -= 200; // Effectively blocks unless no other option
      } else if (timesToday > 0) {
        score -= 80; // Strong penalty even for 1 repeat
      }

      // Prefer devices with fewer pairs today (balanced load)
      score -= (c.pairs_today || 0) * 8;

      // Favor variety: prefer devices that have had fewer unique partners today
      const partnerVariety = uniquePartnersToday[c.device_id] || 0;
      score -= partnerVariety * 3;

      // Penalize if this device was the last partner (avoid back-to-back)
      if (device.last_partner_device_id === c.device_id) score -= 25;

      // Balance cross-user: slight bonus for cross-user pairing variety
      if (c.user_id !== device.user_id) score += 5;

      // Random jitter for natural variety
      score += randInt(0, 12);

      return { ...c, score, timesToday };
    });

    scored.sort((a: any, b: any) => b.score - a.score);

    // Pick best candidate that hasn't exceeded daily pair limit
    let partner = null;
    for (const candidate of scored) {
      if (candidate.timesToday >= MAX_SAME_PAIR_PER_DAY) {
        // Only use if NO other option exists (exceção controlada)
        const hasAlternative = scored.some((s: any) =>
          s.device_id !== candidate.device_id &&
          (todayPartnerCount[device.device_id]?.[s.device_id] || 0) < MAX_SAME_PAIR_PER_DAY &&
          s.score > -50
        );
        if (hasAlternative) {
          rejected.push({ device: device.device_id, reason: "same_pair_repeated_today", partner: candidate.device_id });
          logs.push(`repeat_skip:${device.device_id.substring(0,8)}<->${candidate.device_id.substring(0,8)}:${candidate.timesToday}x`);
          continue;
        }
        // Exceção controlada: usa mesmo par por falta de alternativa
        logs.push(`repeat_forced:${device.device_id.substring(0,8)}<->${candidate.device_id.substring(0,8)}`);
      }
      partner = candidate;
      break;
    }

    if (!partner) {
      rejected.push({ device: device.device_id, reason: "all_partners_blocked" });
      continue;
    }

    const cycleId = cycleIdMap[device.device_id] || cycleIdMap[partner.device_id] || null;
    const mode = device.community_mode === "warmup_managed" || partner.community_mode === "warmup_managed"
      ? "warmup_managed" : "community_only";

    await db.from("community_pairs").insert({
      cycle_id: cycleId,
      instance_id_a: device.device_id,
      instance_id_b: partner.device_id,
      status: "active",
      community_mode: mode,
      target_messages: TARGET_MESSAGES_PER_BLOCK,
      messages_total: 0,
      meta: {
        initiator: Math.random() < 0.5 ? "a" : "b",
        formed_at: new Date().toISOString(),
        score: partner.score,
        cross_user: device.user_id !== partner.user_id,
        repeat_count: partner.timesToday,
      },
    });

    pairedThisTick.add(device.device_id);
    pairedThisTick.add(partner.device_id);
    formed.push(`${device.device_id.substring(0, 8)}<->${partner.device_id.substring(0, 8)}`);
    logs.push(`paired:${device.device_id.substring(0,8)}<->${partner.device_id.substring(0,8)}:score=${partner.score}:cross=${device.user_id !== partner.user_id}`);
  }

  return { pairs_formed: formed.length, rejected, logs };
}

// ══════════════════════════════════════════════════════════
// PHASE 4: START SESSIONS — Iniciar sessões para duplas sem sessão
// ══════════════════════════════════════════════════════════
async function phaseStartSessions(db: any): Promise<{ started: number; errors: string[] }> {
  // Get active pairs without a session
  const { data: pairsNoSession } = await db.from("community_pairs")
    .select("id, instance_id_a, instance_id_b, community_mode, target_messages, meta")
    .eq("status", "active")
    .is("session_id", null)
    .limit(MAX_NEW_SESSIONS_PER_TICK);

  if (!pairsNoSession?.length) return { started: 0, errors: [] };

  let started = 0;
  const errors: string[] = [];

  for (const pair of pairsNoSession) {
    // Double-check both devices are still eligible
    const [{ data: devA }, { data: devB }] = await Promise.all([
      db.from("devices").select("id, status, number, uazapi_token, uazapi_base_url, user_id").eq("id", pair.instance_id_a).maybeSingle(),
      db.from("devices").select("id, status, number, uazapi_token, uazapi_base_url, user_id").eq("id", pair.instance_id_b).maybeSingle(),
    ]);

    // Validate both are connected
    if (!devA || !CONNECTED_STATUSES.includes(devA.status) || !devA.number || !devA.uazapi_token) {
      await db.from("community_pairs").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", pair.id);
      errors.push(`pair ${pair.id}: device_a not ready`);
      continue;
    }
    if (!devB || !CONNECTED_STATUSES.includes(devB.status) || !devB.number || !devB.uazapi_token) {
      await db.from("community_pairs").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", pair.id);
      errors.push(`pair ${pair.id}: device_b not ready`);
      continue;
    }

    // Check neither device has another active session (concurrency guard)
    const { count: activeA } = await db.from("community_sessions")
      .select("id", { count: "exact", head: true })
      .or(`device_a.eq.${pair.instance_id_a},device_b.eq.${pair.instance_id_a}`)
      .eq("status", "active");
    const { count: activeB } = await db.from("community_sessions")
      .select("id", { count: "exact", head: true })
      .or(`device_a.eq.${pair.instance_id_b},device_b.eq.${pair.instance_id_b}`)
      .eq("status", "active");

    if ((activeA || 0) > 0 || (activeB || 0) > 0) {
      errors.push(`pair ${pair.id}: device already in session`);
      continue;
    }

    // Get membership configs for delay params
    const { data: mbrA } = await db.from("warmup_community_membership")
      .select("intensity, custom_min_delay_seconds, custom_max_delay_seconds, custom_pause_after_min, custom_pause_after_max, custom_pause_duration_min, custom_pause_duration_max")
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

    const { data: session } = await db.from("community_sessions")
      .insert({
        pair_id: pair.id,
        device_a: pair.instance_id_a,
        device_b: pair.instance_id_b,
        user_a: devA.user_id,
        user_b: devB.user_id,
        community_mode: pair.community_mode,
        target_messages: pair.target_messages || TARGET_MESSAGES_PER_BLOCK,
        status: "active",
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
        pause_after_messages_min: pauseAfterMin,
        pause_after_messages_max: pauseAfterMax,
        pause_duration_min: pauseDurationMin,
        pause_duration_max: pauseDurationMax,
        messages_total: 0, messages_sent_a: 0, messages_sent_b: 0,
      })
      .select("*").maybeSingle();

    if (session) {
      await db.from("community_pairs").update({ session_id: session.id }).eq("id", pair.id);

      // Kick off the first turn
      const meta = pair.meta || {};
      const firstSender = meta.initiator === "b" ? pair.instance_id_b : pair.instance_id_a;

      EdgeRuntime.waitUntil((async () => {
        await new Promise(r => setTimeout(r, randInt(3000, 8000))); // Small initial delay
        await executeSessionTurn(db, session, firstSender);
      })());

      started++;
    } else {
      errors.push(`pair ${pair.id}: session insert failed`);
    }
  }

  return { started, errors };
}

// ══════════════════════════════════════════════════════════
// PHASE 5: MONITOR SESSIONS — Retomar sessões paradas
// ══════════════════════════════════════════════════════════
async function phaseMonitorSessions(db: any): Promise<{ resumed: number }> {
  // Find active sessions that haven't had activity in 3+ minutes
  // (should have had another turn by now based on delay config)
  const stuckThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  const { data: stuckSessions } = await db.from("community_sessions")
    .select("id, device_a, device_b, last_sender, messages_total, target_messages, min_delay_seconds, max_delay_seconds, pause_after_messages_min, pause_after_messages_max, pause_duration_min, pause_duration_max, pair_id, community_mode")
    .eq("status", "active")
    .lt("updated_at", stuckThreshold)
    .limit(5);

  let resumed = 0;
  for (const session of stuckSessions || []) {
    if (session.messages_total >= session.target_messages) {
      await finishSession(db, session, "target_reached");
      continue;
    }

    // Determine who should send next
    let nextSender = session.device_a;
    if (session.last_sender) {
      nextSender = session.last_sender === session.device_a ? session.device_b : session.device_a;
    }

    // Check if next sender is still connected
    const { data: dev } = await db.from("devices")
      .select("status, uazapi_token").eq("id", nextSender).maybeSingle();
    if (!dev || !CONNECTED_STATUSES.includes(dev.status) || !dev.uazapi_token) {
      await finishSession(db, session, "device_disconnected_on_resume");
      continue;
    }

    // Resume
    EdgeRuntime.waitUntil((async () => {
      await new Promise(r => setTimeout(r, randInt(2000, 5000)));
      await executeSessionTurn(db, session, nextSender);
    })());

    resumed++;
  }

  return { resumed };
}

// ══════════════════════════════════════════════════════════
// PHASE 6: RELEASE COOLDOWNS
// ══════════════════════════════════════════════════════════
async function phaseReleaseCooldowns(db: any): Promise<{ released: number }> {
  const { data: cooledOff, count } = await db.from("warmup_community_membership")
    .update({ cooldown_until: null })
    .lt("cooldown_until", new Date().toISOString())
    .neq("community_mode", "disabled")
    .select("id", { count: "exact", head: true });

  return { released: count || 0 };
}

// ══════════════════════════════════════════════════════════
// SESSION TURN EXECUTION
// ══════════════════════════════════════════════════════════
async function executeSessionTurn(
  db: any, session: any, senderDeviceId: string,
): Promise<{ success: boolean; error?: string; completed?: boolean }> {
  // Get fresh session state
  const { data: fresh } = await db.from("community_sessions")
    .select("*").eq("id", session.id).maybeSingle();

  if (!fresh || fresh.status !== "active") return { success: false, error: "session_not_active" };
  if (fresh.messages_total >= fresh.target_messages) {
    await finishSession(db, fresh, "target_reached");
    return { success: true, completed: true };
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

    // 3 consecutive failures = end
    const { count: recentFails } = await db.from("community_session_logs")
      .select("id", { count: "exact", head: true })
      .eq("session_id", fresh.id).eq("status", "failed")
      .order("created_at", { ascending: false }).limit(3);

    if ((recentFails || 0) >= 3) {
      await finishSession(db, fresh, "consecutive_failures");
    } else {
      // Retry after delay
      EdgeRuntime.waitUntil((async () => {
        await new Promise(r => setTimeout(r, randInt(30, 60) * 1000));
        const { data: check } = await db.from("community_sessions").select("status").eq("id", fresh.id).maybeSingle();
        if (check?.status === "active") await executeSessionTurn(db, fresh, senderDeviceId);
      })());
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

  // Update session counters
  const isSenderA = senderDeviceId === fresh.device_a;
  const newTotal = fresh.messages_total + 1;
  const updateData: any = {
    messages_total: newTotal,
    last_sender: senderDeviceId,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    last_error: null,
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
      await db.rpc("increment_warmup_budget", { p_cycle_id: cycle.id, p_increment: 1, p_unique_recipient: false }).catch(() => {});
    }
  }

  if (completed) {
    await finishSession(db, { ...fresh, messages_total: newTotal }, "target_reached");
  } else {
    // Schedule next turn for OTHER device with proper delay
    const delay = randInt(fresh.min_delay_seconds || 30, fresh.max_delay_seconds || 90);
    const pauseAfter = randInt(fresh.pause_after_messages_min || 8, fresh.pause_after_messages_max || 15);
    let actualDelay = delay;
    if (newTotal > 0 && newTotal % pauseAfter === 0) {
      actualDelay += randInt(fresh.pause_duration_min || 60, fresh.pause_duration_max || 180);
    }

    EdgeRuntime.waitUntil((async () => {
      await new Promise(r => setTimeout(r, actualDelay * 1000));
      const { data: check } = await db.from("community_sessions").select("status").eq("id", fresh.id).maybeSingle();
      if (check?.status !== "active") return;
      const { data: checkRecv } = await db.from("devices").select("status").eq("id", receiverDeviceId).maybeSingle();
      if (!checkRecv || !CONNECTED_STATUSES.includes(checkRecv.status)) {
        await finishSession(db, fresh, "receiver_disconnected_mid_block");
        return;
      }
      await executeSessionTurn(db, fresh, receiverDeviceId);
    })());
  }

  return { success: true, completed };
}

// ══════════════════════════════════════════════════════════
// FINISH SESSION
// ══════════════════════════════════════════════════════════
async function finishSession(db: any, session: any, endReason: string) {
  const now = new Date().toISOString();

  await db.from("community_sessions").update({
    status: "completed", completed_at: now, end_reason: endReason, updated_at: now,
  }).eq("id", session.id);

  await db.from("community_pairs").update({
    status: "closed", closed_at: now,
  }).eq("id", session.pair_id);

  // Cooldown + pairs_today for both
  const cooldownMinutes = randInt(COOLDOWN_MIN_MINUTES, COOLDOWN_MAX_MINUTES);
  const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString();

  for (const devId of [session.device_a, session.device_b]) {
    const { data: mbr } = await db.from("warmup_community_membership")
      .select("pairs_today").eq("device_id", devId).maybeSingle();
    if (mbr) {
      await db.from("warmup_community_membership").update({
        pairs_today: (mbr.pairs_today || 0) + 1,
        cooldown_until: cooldownUntil,
      }).eq("device_id", devId);
    }
  }

  console.log(`[community-core] Session ${session.id} finished: ${endReason}, msgs: ${session.messages_total}/${session.target_messages}`);
}

// ══════════════════════════════════════════════════════════
// TICK: Executa todas as phases em ordem
// ══════════════════════════════════════════════════════════
async function handleTick(db: any) {
  const tickStart = Date.now();
  const results: any = { tick_at: new Date().toISOString() };

  // Phase 1: Cleanup
  results.cleanup = await phaseCleanupStale(db);

  // Phase 2: Update eligibility
  results.eligibility = await phaseUpdateEligibility(db);

  // Phase 3: Form pairs
  results.pairing = await phaseFormPairs(db);

  // Phase 4: Start sessions
  results.sessions = await phaseStartSessions(db);

  // Phase 5: Monitor stuck sessions
  results.monitor = await phaseMonitorSessions(db);

  // Phase 6: Release cooldowns
  results.cooldowns = await phaseReleaseCooldowns(db);

  results.duration_ms = Date.now() - tickStart;
  return results;
}

// ══════════════════════════════════════════════════════════
// PROCESS_DEVICE: Forçar manualmente uma conta específica
// ══════════════════════════════════════════════════════════
async function processDevice(db: any, deviceId: string) {
  // Update eligibility for this device
  const { data: mbr } = await db.from("warmup_community_membership")
    .select("*").eq("device_id", deviceId).maybeSingle();

  if (!mbr) return { status: "no_membership" };

  // Check if already in active session
  const { count: activeSessions } = await db.from("community_sessions")
    .select("id", { count: "exact", head: true })
    .or(`device_a.eq.${deviceId},device_b.eq.${deviceId}`)
    .eq("status", "active");

  if ((activeSessions || 0) > 0) {
    return { status: "session_already_active" };
  }

  // Check for existing active pair
  const [{ data: pA }, { data: pB }] = await Promise.all([
    db.from("community_pairs").select("*").eq("instance_id_a", deviceId).eq("status", "active").maybeSingle(),
    db.from("community_pairs").select("*").eq("instance_id_b", deviceId).eq("status", "active").maybeSingle(),
  ]);
  const existingPair = pA || pB;

  if (existingPair && !existingPair.session_id) {
    // Has pair but no session — start it
    const result = await phaseStartSessions(db);
    return { status: "session_started_from_existing_pair", ...result };
  }

  // No pair — run pairing + session start
  await phaseUpdateEligibility(db);
  await phaseFormPairs(db);
  const sessResult = await phaseStartSessions(db);

  return { status: "processed", ...sessResult };
}

// ══════════════════════════════════════════════════════════
// DAILY RESET
// ══════════════════════════════════════════════════════════
async function handleDailyReset(db: any) {
  const now = new Date().toISOString();

  await db.from("warmup_community_membership")
    .update({ messages_today: 0, pairs_today: 0, cooldown_until: null, last_daily_reset_at: now, last_error: null })
    .neq("community_mode", "disabled").eq("is_enabled", true);

  // Increment community_day for warmup_managed
  const { data: managed } = await db.from("warmup_community_membership")
    .select("id, community_day").eq("community_mode", "warmup_managed").eq("is_enabled", true);

  if (managed?.length) {
    for (const m of managed) {
      await db.from("warmup_community_membership")
        .update({ community_day: (m.community_day || 0) + 1 }).eq("id", m.id);
    }
  }

  // Close all stale
  await phaseCleanupStale(db);

  return { ok: true, reset_at: now, managed_count: managed?.length || 0 };
}

// ══════════════════════════════════════════════════════════
// CHECK ELIGIBILITY (individual)
// ══════════════════════════════════════════════════════════
async function checkEligibility(db: any, deviceId: string) {
  const { data: mbr } = await db.from("warmup_community_membership")
    .select("*").eq("device_id", deviceId).maybeSingle();
  if (!mbr) return { eligible: false, reason: "no_membership" };
  if (mbr.community_mode === "disabled") return { eligible: false, reason: "mode_disabled" };

  const { data: dev } = await db.from("devices")
    .select("id, status, number, uazapi_token, uazapi_base_url").eq("id", deviceId).maybeSingle();
  if (!dev || !CONNECTED_STATUSES.includes(dev.status)) return { eligible: false, reason: "device_disconnected" };
  if (!dev.uazapi_token || !dev.uazapi_base_url || !dev.number) return { eligible: false, reason: "device_not_configured" };

  if (mbr.cooldown_until && new Date(mbr.cooldown_until) > new Date()) return { eligible: false, reason: "cooldown_active", cooldown_until: mbr.cooldown_until };
  if (mbr.daily_limit > 0 && mbr.messages_today >= mbr.daily_limit) return { eligible: false, reason: "daily_limit_reached" };

  const { count } = await db.from("community_sessions")
    .select("id", { count: "exact", head: true })
    .or(`device_a.eq.${deviceId},device_b.eq.${deviceId}`).eq("status", "active");
  if ((count || 0) > 0) return { eligible: false, reason: "session_active" };

  const activeDays = Array.isArray(mbr.active_days) ? mbr.active_days : ["mon", "tue", "wed", "thu", "fri"];
  if (!isWithinWindow(mbr.start_hour || "08:00", mbr.end_hour || "19:00", activeDays)) return { eligible: false, reason: "outside_window" };

  if (mbr.community_mode === "warmup_managed") {
    const { data: cycle } = await db.from("warmup_cycles")
      .select("id, chip_state, day_index, is_running").eq("device_id", deviceId).eq("is_running", true).maybeSingle();
    if (!cycle) return { eligible: false, reason: "no_active_cycle" };
    if ((cycle.day_index || 1) < getCommunityStartDay(cycle.chip_state || "new")) return { eligible: false, reason: "warmup_day_too_early" };
    if (mbr.community_day < 1) return { eligible: false, reason: "community_day_not_started" };
    const target = getPairsTarget(mbr.community_day);
    if ((mbr.pairs_today || 0) >= target.max) return { eligible: false, reason: "pairs_limit_reached" };
  }

  return {
    eligible: true, community_mode: mbr.community_mode, community_day: mbr.community_day,
    messages_today: mbr.messages_today, pairs_today: mbr.pairs_today, daily_limit: mbr.daily_limit,
  };
}

// ══════════════════════════════════════════════════════════
// HANDLER
// ══════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const internalSecret = req.headers.get("x-internal-secret");

  const isAnonKey = bearerToken === anonKey;
  const isInternal = !!(internalSecret && internalSecret === Deno.env.get("INTERNAL_TICK_SECRET"));

  let userAuth: any = null;
  if (!isAnonKey && !isInternal && bearerToken) {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await db.auth.getUser(bearerToken);
    userAuth = user;
  }

  if (!isAnonKey && !isInternal && !userAuth) return json({ error: "Unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  try {
    switch (body.action) {
      case "tick": return json(await handleTick(db));
      case "process_device":
        if (!body.device_id) return json({ error: "device_id required" }, 400);
        return json(await processDevice(db, body.device_id));
      case "daily_reset": return json(await handleDailyReset(db));
      case "check_eligibility":
        if (!body.device_id) return json({ error: "device_id required" }, 400);
        return json(await checkEligibility(db, body.device_id));
      default: return json(await handleTick(db));
    }
  } catch (err: any) {
    console.error("[community-core] Error:", err.message);
    return json({ error: err.message }, 500);
  }
});
