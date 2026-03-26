/**
 * community-core — Motor Central Unificado de Comunitário
 * 
 * Responsabilidades:
 *   - tick: Processar contas elegíveis (ambos modos)
 *   - process_device: Processar uma conta específica
 *   - daily_reset: Reset diário de contadores comunitários
 * 
 * Modos:
 *   - warmup_managed: Comunitário dentro do aquecimento automático
 *   - community_only: Comunitário dedicado/avulso
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

// ══════════════════════════════════════════════════════════
// COMMUNITY DAY START (por chip type)
// ══════════════════════════════════════════════════════════
function getCommunityStartDay(chipState: string): number {
  if (chipState === "unstable") return 9;
  if (chipState === "recovered") return 7;
  return 6; // new
}

// ══════════════════════════════════════════════════════════
// PROGRESSÃO DE DUPLAS (warmup_managed)
// ══════════════════════════════════════════════════════════
function getPairsTarget(communityDay: number): { min: number; max: number } {
  if (communityDay <= 1) return { min: 1, max: 3 };
  if (communityDay === 2) return { min: 2, max: 5 };
  if (communityDay === 3) return { min: 4, max: 7 };
  if (communityDay <= 6) return { min: 5, max: 8 };
  return { min: 6, max: 10 };
}

// ══════════════════════════════════════════════════════════
// INTENSITY PRESETS (community_only)
// ══════════════════════════════════════════════════════════
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
// BRT TIMEZONE HELPERS
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
// MESSAGE GENERATOR (20-300 chars, emoji, numeros)
// ══════════════════════════════════════════════════════════
const SAUDACOES = ["oi", "oii", "oiii", "olá", "e aí", "eai", "fala", "salve", "opa", "hey", "bom dia", "boa tarde", "boa noite", "tudo bem", "tudo certo", "fala parceiro"];
const PERGUNTAS = ["como está seu dia", "como está o trabalho", "como está sua família", "está tudo bem por aí", "como estão as coisas", "conseguiu resolver aquilo", "como foi a semana", "como anda o serviço", "como tá a saúde", "o que aprontou hoje", "como foi o fds", "como tá o projeto", "já conseguiu aquilo", "como tá o estudo", "como foi a viagem", "como tá o clima aí", "como tá a academia", "já assistiu aquele filme"];
const COMENTARIOS = ["hoje o dia foi corrido", "aqui está bem tranquilo", "estou resolvendo umas coisas", "hoje trabalhei bastante", "aqui está tudo certo", "hoje foi puxado", "tô meio ocupado hoje", "dia longo hoje", "finalmente deu uma folga", "tô correndo atrás das coisas", "hoje rendeu bastante", "tô focado aqui no trabalho", "semana puxada essa", "hoje foi produtivo", "por aqui tudo certo", "mandando ver no trabalho", "dia movimentado hoje", "tô planejando uns negócios"];
const COMPLEMENTOS = ["faz tempo que não falamos", "lembrei disso agora", "estava pensando nisso", "vi algo parecido hoje", "me veio na cabeça agora", "pensei nisso mais cedo", "lembrei de vc", "vi vc online e lembrei", "me falaram disso"];
const EMOJIS = ["🙂", "😂", "😅", "😄", "👍", "🙏", "🔥", "👀", "😎", "🤝", "😊", "🤔", "💯", "👏", "✌️", "🎉", "🙌", "😁", "🤗", "👌", "💪", "🌟", "😃", "🤙", "👋", "❤️", "😆", "🫡", "🤣"];
const RESPOSTAS_CURTAS = ["ss", "sim", "aham", "pode crer", "verdade", "isso aí", "com certeza", "beleza", "blz", "joia", "show", "massa", "top", "boa", "firmeza", "haha", "kkk", "kkkk", "é mesmo", "pois é", "entendi", "ah sim", "de boa"];
const OPINIOES = [
  "acho que esse ano vai ser diferente, tenho muita esperança de dias melhores",
  "tô otimista com o futuro, muita coisa boa vindo por aí se Deus quiser",
  "cada vez mais difícil achar coisa boa, mas a gente segue firme e forte",
  "o mercado tá complicado, mas quem se esforça sempre encontra oportunidade",
  "tô repensando muita coisa na vida, acho que faz parte do crescimento",
  "preciso descansar mais, o corpo pede e a gente tem que ouvir né",
  "tô curtindo mais ficar em casa, é bom demais ter paz e sossego",
  "tô aprendendo a ter mais paciência, nem tudo acontece no nosso tempo",
  "cada dia é uma conquista, a gente tem que valorizar cada momento",
  "o importante é ter paz de espírito, o resto a gente vai resolvendo",
];
const COTIDIANO = [
  "acabei de almoçar agora, comi muito bem hoje graças a Deus",
  "tô no trânsito parado faz uns vinte minutos, tá osso",
  "choveu demais aqui na região, parecia que não ia parar nunca",
  "acordei cedo hoje e aproveitei pra resolver umas coisas pendentes",
  "café da manhã ficou top hoje, fiz aquele capricho todo especial",
  "acabei de sair da academia, treino pesado mas valeu a pena",
  "fiz um bolo caseiro pra família e ficou uma delícia",
  "tô estudando uma coisa nova, é difícil mas tô gostando bastante",
  "comecei a caminhar de manhã e já tô sentindo diferença no corpo",
  "tô assistindo uma série boa demais, não consigo parar de ver",
  "dormi super bem ontem, acordei renovado, fazia tempo que não dormia assim",
  "tomei um açaí agora com granola e banana, melhor coisa do mundo",
];
const REFLEXOES = [
  "sabe o que eu penso, a gente tem que aproveitar cada momento porque passa muito rápido",
  "ontem eu tava lembrando de como as coisas eram diferentes uns anos atrás",
  "às vezes eu paro pra pensar no quanto a gente evoluiu",
  "tô numa fase da vida que tô priorizando paz e tranquilidade",
  "essa semana foi intensa demais, mas no final deu tudo certo",
  "tô aprendendo que nem tudo precisa de resposta imediata",
];
const HISTORIAS = [
  "ontem aconteceu uma coisa engraçada, eu fui no mercado e encontrei um amigo que não via há anos",
  "meu vizinho adotou um cachorro e agora o bicho late o dia inteiro mas ele é muito fofo",
  "fui almoçar num restaurante novo e a comida era tão boa que já marquei de voltar",
  "tentei fazer uma receita nova e deu tudo errado mas pelo menos a cozinha ficou cheirosa",
  "meu filho falou uma coisa tão engraçada ontem que eu quase chorei de rir",
  "tava dirigindo e vi o pôr do sol mais bonito que já vi na vida",
  "recebi uma mensagem de um amigo antigo e matamos a saudade conversando por horas",
];
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
  if (s === 14) {
    const f = pickRandom(FRASES_NUMERO).replace("{n}", String(randInt(2, 15)));
    return cap(maybeEmoji(`${f}, ${pickRandom(COMENTARIOS)}`));
  }
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
  let fb = `${pickRandom(SAUDACOES)}, ${pickRandom(COTIDIANO)}. ${pickRandom(OPINIOES)}. ${pickRandom(COMPLEMENTOS)}`;
  if (fb.length < 20) fb += ` ${pickRandom(REFLEXOES)}`;
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
          if (parsed?.error || parsed?.code === 404 || parsed?.status === "error") {
            lastErr = `${at.path}: ${raw.substring(0, 240)}`;
            continue;
          }
          return parsed;
        } catch { return { ok: true, raw }; }
      }
      if (res.status === 405 || res.status === 404) { lastErr = `${res.status} @ ${at.path}`; continue; }
      lastErr = `${res.status} @ ${at.path}: ${raw.substring(0, 240)}`;
    } catch (e) {
      lastErr = `${at.path}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new Error(`Send failed: ${lastErr}`);
}

// ══════════════════════════════════════════════════════════
// CORE: ELEGIBILIDADE
// ══════════════════════════════════════════════════════════
interface EligibilityResult {
  eligible: boolean;
  reason: string;
  membership?: any;
  device?: any;
  cycle?: any;
}

async function checkEligibility(db: any, deviceId: string): Promise<EligibilityResult> {
  const { data: membership } = await db.from("warmup_community_membership")
    .select("*").eq("device_id", deviceId).maybeSingle();

  if (!membership) return { eligible: false, reason: "no_membership" };
  if (membership.community_mode === "disabled") return { eligible: false, reason: "mode_disabled" };
  if (!membership.is_enabled) return { eligible: false, reason: "not_enabled" };

  const { data: device } = await db.from("devices")
    .select("id, status, number, uazapi_token, uazapi_base_url, name, user_id")
    .eq("id", deviceId).maybeSingle();

  if (!device || !CONNECTED_STATUSES.includes(device.status)) {
    return { eligible: false, reason: "device_disconnected", device };
  }
  if (!device.uazapi_token || !device.uazapi_base_url || !device.number) {
    return { eligible: false, reason: "device_not_configured", device };
  }

  if (membership.cooldown_until && new Date(membership.cooldown_until) > new Date()) {
    return { eligible: false, reason: "cooldown_active", membership };
  }

  if (membership.daily_limit > 0 && membership.messages_today >= membership.daily_limit) {
    return { eligible: false, reason: "daily_limit_reached", membership };
  }

  // Max 1 active session per device
  const { count: activeSessions } = await db.from("community_sessions")
    .select("id", { count: "exact", head: true })
    .or(`device_a.eq.${deviceId},device_b.eq.${deviceId}`)
    .eq("status", "active");

  if ((activeSessions || 0) > 0) {
    return { eligible: false, reason: "session_active", membership };
  }

  // Time window
  const startHour = membership.start_hour || "08:00";
  const endHour = membership.end_hour || "19:00";
  const activeDays = Array.isArray(membership.active_days) ? membership.active_days : ["mon", "tue", "wed", "thu", "fri"];
  if (!isWithinWindow(startHour, endHour, activeDays)) {
    return { eligible: false, reason: "outside_window", membership };
  }

  // warmup_managed checks
  if (membership.community_mode === "warmup_managed") {
    const { data: cycle } = await db.from("warmup_cycles")
      .select("id, user_id, chip_state, day_index, phase, is_running")
      .eq("device_id", deviceId).eq("is_running", true).maybeSingle();

    if (!cycle) return { eligible: false, reason: "no_active_cycle", membership };

    const startDay = getCommunityStartDay(cycle.chip_state || "new");
    if ((cycle.day_index || 1) < startDay) {
      return { eligible: false, reason: "warmup_day_too_early", membership, cycle };
    }

    if (membership.community_day < 1) {
      return { eligible: false, reason: "community_day_not_started", membership, cycle };
    }

    return { eligible: true, reason: "ok", membership, device, cycle };
  }

  return { eligible: true, reason: "ok", membership, device };
}

// ══════════════════════════════════════════════════════════
// CORE: PAREAMENTO
// ══════════════════════════════════════════════════════════
async function findOrCreatePair(
  db: any, deviceId: string, userId: string, mode: string, cycleId?: string,
): Promise<any | null> {
  // Check existing active pairs
  const [{ data: pairsA }, { data: pairsB }] = await Promise.all([
    db.from("community_pairs").select("id, instance_id_a, instance_id_b, session_id, messages_total, target_messages, community_mode, status")
      .eq("instance_id_a", deviceId).eq("status", "active"),
    db.from("community_pairs").select("id, instance_id_a, instance_id_b, session_id, messages_total, target_messages, community_mode, status")
      .eq("instance_id_b", deviceId).eq("status", "active"),
  ]);

  const existingPairs = [...(pairsA || []), ...(pairsB || [])];

  // If there's an active pair with remaining messages, use it
  for (const pair of existingPairs) {
    if (pair.messages_total < pair.target_messages) return pair;
  }

  // Close completed pairs
  const completedIds = existingPairs.filter(p => p.messages_total >= p.target_messages).map(p => p.id);
  if (completedIds.length > 0) {
    await db.from("community_pairs")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .in("id", completedIds);
  }

  // Avoid today's partners (excessive repetition)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: todayPairs } = await db.from("community_pairs")
    .select("instance_id_a, instance_id_b")
    .or(`instance_id_a.eq.${deviceId},instance_id_b.eq.${deviceId}`)
    .gte("created_at", todayStart.toISOString());

  const todayPartners = new Set<string>();
  for (const p of todayPairs || []) {
    if (p.instance_id_a !== deviceId) todayPartners.add(p.instance_id_a);
    if (p.instance_id_b !== deviceId) todayPartners.add(p.instance_id_b);
  }

  // Query eligible candidates (all modes, cross-user)
  const { data: candidates } = await db.from("warmup_community_membership")
    .select("device_id, user_id, community_mode, community_day")
    .eq("is_enabled", true).eq("is_eligible", true)
    .neq("community_mode", "disabled").neq("device_id", deviceId)
    .limit(200);

  if (!candidates?.length) return null;

  const candidateIds = candidates.map((c: any) => c.device_id);
  const { data: candidateDevices } = await db.from("devices")
    .select("id, status, number, user_id").in("id", candidateIds);

  const deviceMap = Object.fromEntries((candidateDevices || []).map((d: any) => [d.id, d]));

  // Find busy devices (already in active sessions)
  const [{ data: busyA }, { data: busyB }] = await Promise.all([
    db.from("community_sessions").select("device_a, device_b").in("device_a", candidateIds).eq("status", "active"),
    db.from("community_sessions").select("device_a, device_b").in("device_b", candidateIds).eq("status", "active"),
  ]);
  const busyDevices = new Set<string>();
  for (const s of [...(busyA || []), ...(busyB || [])]) {
    busyDevices.add(s.device_a);
    busyDevices.add(s.device_b);
  }

  // Sort: own accounts first, avoid today's partners, random shuffle otherwise
  const sorted = candidates
    .filter((c: any) => {
      const dev = deviceMap[c.device_id];
      if (!dev) return false;
      if (!CONNECTED_STATUSES.includes(dev.status)) return false;
      if (!dev.number) return false;
      if (busyDevices.has(c.device_id)) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const ownA = a.user_id === userId ? 0 : 1;
      const ownB = b.user_id === userId ? 0 : 1;
      if (ownA !== ownB) return ownA - ownB;
      const todayA = todayPartners.has(a.device_id) ? 1 : 0;
      const todayB = todayPartners.has(b.device_id) ? 1 : 0;
      return todayA - todayB;
    });

  if (!sorted.length) return null;

  const partner = sorted[0];
  const targetMessages = 120;

  const { data: newPair } = await db.from("community_pairs")
    .insert({
      cycle_id: cycleId || null,
      instance_id_a: deviceId,
      instance_id_b: partner.device_id,
      status: "active",
      community_mode: mode,
      target_messages: targetMessages,
      messages_total: 0,
      meta: { initiator: Math.random() < 0.5 ? "a" : "b" },
    })
    .select("*").maybeSingle();

  return newPair;
}

// ══════════════════════════════════════════════════════════
// CORE: CRIAR SESSÃO
// ══════════════════════════════════════════════════════════
async function createSession(db: any, pair: any, membership: any, mode: string): Promise<any> {
  let minDelay = 30, maxDelay = 90;
  let pauseAfterMin = 8, pauseAfterMax = 15;
  let pauseDurationMin = 60, pauseDurationMax = 180;

  if (mode === "community_only") {
    const preset = INTENSITY_PRESETS[membership.intensity || "medium"];
    minDelay = membership.custom_min_delay_seconds ?? preset.min_delay;
    maxDelay = membership.custom_max_delay_seconds ?? preset.max_delay;
    pauseAfterMin = membership.custom_pause_after_min ?? preset.pause_after_min;
    pauseAfterMax = membership.custom_pause_after_max ?? preset.pause_after_max;
    pauseDurationMin = membership.custom_pause_duration_min ?? preset.pause_duration_min;
    pauseDurationMax = membership.custom_pause_duration_max ?? preset.pause_duration_max;
  }

  const [{ data: devA }, { data: devB }] = await Promise.all([
    db.from("devices").select("user_id").eq("id", pair.instance_id_a).maybeSingle(),
    db.from("devices").select("user_id").eq("id", pair.instance_id_b).maybeSingle(),
  ]);

  const { data: session } = await db.from("community_sessions")
    .insert({
      pair_id: pair.id,
      device_a: pair.instance_id_a,
      device_b: pair.instance_id_b,
      user_a: devA?.user_id,
      user_b: devB?.user_id,
      community_mode: mode,
      target_messages: pair.target_messages || 120,
      status: "active",
      min_delay_seconds: minDelay,
      max_delay_seconds: maxDelay,
      pause_after_messages_min: pauseAfterMin,
      pause_after_messages_max: pauseAfterMax,
      pause_duration_min: pauseDurationMin,
      pause_duration_max: pauseDurationMax,
      messages_total: 0,
      messages_sent_a: 0,
      messages_sent_b: 0,
    })
    .select("*").maybeSingle();

  if (session) {
    await db.from("community_pairs").update({ session_id: session.id }).eq("id", pair.id);
  }

  return session;
}

// ══════════════════════════════════════════════════════════
// CORE: EXECUTAR BLOCO - Motor de ida e volta
// Envia UMA mensagem do sender, depois agenda o turno do outro lado.
// O bloco continua até atingir target_messages ou falha.
// ══════════════════════════════════════════════════════════
async function executeSessionTurn(
  db: any,
  session: any,
  senderDeviceId: string,
): Promise<{ success: boolean; error?: string; completed?: boolean; session_id: string }> {
  // Fresh session state
  const { data: freshSession } = await db.from("community_sessions")
    .select("*").eq("id", session.id).maybeSingle();

  if (!freshSession || freshSession.status !== "active") {
    return { success: false, error: "session_not_active", session_id: session.id };
  }

  // Already reached target?
  if (freshSession.messages_total >= freshSession.target_messages) {
    await finishSession(db, freshSession, "target_reached");
    return { success: true, completed: true, session_id: session.id };
  }

  // Get sender device
  const { data: senderDevice } = await db.from("devices")
    .select("id, number, uazapi_token, uazapi_base_url, user_id, name, status")
    .eq("id", senderDeviceId).maybeSingle();

  if (!senderDevice?.uazapi_token || !senderDevice?.uazapi_base_url || !senderDevice?.number) {
    await finishSession(db, freshSession, "sender_not_configured");
    return { success: false, error: "sender_not_configured", session_id: session.id };
  }
  if (!CONNECTED_STATUSES.includes(senderDevice.status)) {
    await finishSession(db, freshSession, "sender_disconnected");
    return { success: false, error: "sender_disconnected", session_id: session.id };
  }

  // Get receiver device
  const receiverDeviceId = freshSession.device_a === senderDeviceId ? freshSession.device_b : freshSession.device_a;
  const { data: receiverDevice } = await db.from("devices")
    .select("id, number, status, user_id, name")
    .eq("id", receiverDeviceId).maybeSingle();

  if (!receiverDevice?.number || !CONNECTED_STATUSES.includes(receiverDevice.status)) {
    await finishSession(db, freshSession, "receiver_disconnected");
    return { success: false, error: "receiver_offline", session_id: session.id };
  }

  const baseUrl = senderDevice.uazapi_base_url.replace(/\/+$/, "");
  const peerPhone = receiverDevice.number.replace(/\+/g, "");
  const msg = generateMessage();
  const msgIndex = freshSession.messages_total;

  try {
    await sendText(baseUrl, senderDevice.uazapi_token, peerPhone, msg);
  } catch (err: any) {
    // Log failed
    await db.from("community_session_logs").insert({
      session_id: freshSession.id, pair_id: freshSession.pair_id,
      sender_device_id: senderDeviceId, receiver_device_id: receiverDeviceId,
      sender_user_id: senderDevice.user_id,
      message_content: msg, message_index: msgIndex,
      status: "failed", error_message: err.message?.substring(0, 500),
    });

    // 3 consecutive failures = end session
    const { count: recentFails } = await db.from("community_session_logs")
      .select("id", { count: "exact", head: true })
      .eq("session_id", freshSession.id).eq("status", "failed")
      .order("created_at", { ascending: false }).limit(3);

    if ((recentFails || 0) >= 3) {
      await finishSession(db, freshSession, "consecutive_failures");
    }

    return { success: false, error: err.message, session_id: freshSession.id };
  }

  // Log success
  await db.from("community_session_logs").insert({
    session_id: freshSession.id, pair_id: freshSession.pair_id,
    sender_device_id: senderDeviceId, receiver_device_id: receiverDeviceId,
    sender_user_id: senderDevice.user_id,
    message_content: msg, message_index: msgIndex,
    status: "sent",
    delay_applied_seconds: 0,
  });

  // Update session counters
  const isSenderA = senderDeviceId === freshSession.device_a;
  const newTotal = freshSession.messages_total + 1;
  const updateData: any = {
    messages_total: newTotal,
    last_sender: senderDeviceId,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (isSenderA) updateData.messages_sent_a = (freshSession.messages_sent_a || 0) + 1;
  else updateData.messages_sent_b = (freshSession.messages_sent_b || 0) + 1;

  const completed = newTotal >= freshSession.target_messages;
  if (completed) {
    updateData.status = "completed";
    updateData.completed_at = new Date().toISOString();
    updateData.end_reason = "target_reached";
  }

  await db.from("community_sessions").update(updateData).eq("id", freshSession.id);

  // Update pair counter
  await db.from("community_pairs").update({ messages_total: newTotal }).eq("id", freshSession.pair_id);

  // Update sender membership (messages_today)
  const { data: senderMbr } = await db.from("warmup_community_membership")
    .select("messages_today, pairs_today").eq("device_id", senderDeviceId).maybeSingle();

  await db.from("warmup_community_membership").update({
    messages_today: (senderMbr?.messages_today || 0) + 1,
    last_session_at: new Date().toISOString(),
    last_partner_device_id: receiverDeviceId,
    last_error: null,
  }).eq("device_id", senderDeviceId);

  // Warmup audit log
  if (freshSession.community_mode === "warmup_managed") {
    const { data: cycle } = await db.from("warmup_cycles")
      .select("id").eq("device_id", senderDeviceId).eq("is_running", true).maybeSingle();
    if (cycle) {
      await db.from("warmup_audit_logs").insert({
        user_id: senderDevice.user_id,
        device_id: senderDeviceId,
        cycle_id: cycle.id,
        level: "info",
        event_type: "community_turn_sent",
        message: `Comunitário: bloco ${freshSession.id} msg ${newTotal}/${freshSession.target_messages}`,
        meta: { session_id: freshSession.id, pair_id: freshSession.pair_id, community_day: 0, mode: freshSession.community_mode },
      });
      await db.rpc("increment_warmup_budget", { p_cycle_id: cycle.id, p_increment: 1, p_unique_recipient: false }).catch(() => {});
    }
  }

  if (completed) {
    await finishSession(db, { ...freshSession, messages_total: newTotal }, "target_reached");
  } else {
    // SCHEDULE NEXT TURN for the OTHER device
    const delay = randInt(freshSession.min_delay_seconds || 30, freshSession.max_delay_seconds || 90);

    // Check if pause is needed after N consecutive messages
    const pauseAfter = randInt(freshSession.pause_after_messages_min || 8, freshSession.pause_after_messages_max || 15);
    let actualDelay = delay;
    if (newTotal > 0 && newTotal % pauseAfter === 0) {
      actualDelay += randInt(freshSession.pause_duration_min || 60, freshSession.pause_duration_max || 180);
    }

    // Use EdgeRuntime.waitUntil for the next turn
    EdgeRuntime.waitUntil((async () => {
      await new Promise(r => setTimeout(r, actualDelay * 1000));
      // Re-check session is still active before continuing
      const { data: checkSession } = await db.from("community_sessions")
        .select("status").eq("id", freshSession.id).maybeSingle();
      if (checkSession?.status !== "active") return;

      // Re-check receiver is still connected
      const { data: checkReceiver } = await db.from("devices")
        .select("status").eq("id", receiverDeviceId).maybeSingle();
      if (!checkReceiver || !CONNECTED_STATUSES.includes(checkReceiver.status)) {
        await finishSession(db, freshSession, "receiver_disconnected_mid_block");
        return;
      }

      // Execute next turn (the other side sends now)
      await executeSessionTurn(db, freshSession, receiverDeviceId);
    })());
  }

  return { success: true, completed, session_id: freshSession.id };
}

// ══════════════════════════════════════════════════════════
// FINISH SESSION: encerrar bloco + cooldown + atualizar contadores
// ══════════════════════════════════════════════════════════
async function finishSession(db: any, session: any, endReason: string) {
  const now = new Date().toISOString();

  // Update session
  await db.from("community_sessions").update({
    status: "completed",
    completed_at: now,
    end_reason: endReason,
    updated_at: now,
  }).eq("id", session.id);

  // Close pair
  await db.from("community_pairs").update({
    status: "closed",
    closed_at: now,
  }).eq("id", session.pair_id);

  // Apply cooldown + increment pairs_today for both devices
  const cooldownMinutes = randInt(15, 45);
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

  // Log to daily stats
  const todayBrt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  for (const devId of [session.device_a, session.device_b]) {
    const { data: dev } = await db.from("devices").select("user_id").eq("id", devId).maybeSingle();
    if (dev) {
      await db.from("community_daily_stats").upsert({
        device_id: devId,
        user_id: dev.user_id,
        stat_date: todayBrt,
        community_mode: session.community_mode,
        sessions_completed: 1,
        pairs_completed: 1,
      }, { onConflict: "device_id,stat_date" });
    }
  }

  console.log(`[community-core] Session ${session.id} finished: ${endReason}, msgs: ${session.messages_total}/${session.target_messages}`);
}

// ══════════════════════════════════════════════════════════
// CORE: PROCESSAR DISPOSITIVO
// ══════════════════════════════════════════════════════════
async function processDevice(db: any, deviceId: string): Promise<any> {
  const eligibility = await checkEligibility(db, deviceId);
  if (!eligibility.eligible) {
    await db.from("warmup_community_membership").update({
      last_error: `Inelegível: ${eligibility.reason}`,
    }).eq("device_id", deviceId);
    return { device_id: deviceId, status: "ineligible", reason: eligibility.reason };
  }

  const { membership, device, cycle } = eligibility;
  const mode = membership.community_mode;

  // Check pairs limit
  if (mode === "warmup_managed") {
    const target = getPairsTarget(membership.community_day);
    if ((membership.pairs_today || 0) >= target.max) {
      return { device_id: deviceId, status: "pairs_limit_reached", pairs_today: membership.pairs_today, max: target.max };
    }
  }

  // Find or create pair
  const pair = await findOrCreatePair(db, deviceId, device.user_id, mode, cycle?.id);
  if (!pair) {
    await db.from("warmup_community_membership").update({
      last_error: "Nenhum parceiro disponível",
    }).eq("device_id", deviceId);
    return { device_id: deviceId, status: "no_partner" };
  }

  // Get or create session
  let session: any = null;
  if (pair.session_id) {
    const { data: existing } = await db.from("community_sessions")
      .select("*").eq("id", pair.session_id).eq("status", "active").maybeSingle();
    session = existing;
  }
  if (!session) {
    session = await createSession(db, pair, membership, mode);
    if (!session) return { device_id: deviceId, status: "session_creation_failed" };
  }

  // Determine who sends first (alternate)
  let senderDeviceId = deviceId;
  if (session.last_sender) {
    // The OTHER side should send next
    senderDeviceId = session.last_sender === session.device_a ? session.device_b : session.device_a;
  } else {
    // New session: use initiator from pair meta
    const meta = pair.meta || {};
    senderDeviceId = meta.initiator === "b" ? pair.instance_id_b : pair.instance_id_a;
  }

  // Execute the turn
  const result = await executeSessionTurn(db, session, senderDeviceId);

  if (result.success) {
    await db.from("warmup_community_membership").update({ last_error: null }).eq("device_id", deviceId);
  }

  return {
    device_id: deviceId,
    status: result.success ? "sent" : "error",
    completed: result.completed,
    error: result.error,
    session_id: session?.id,
    messages_total: session?.messages_total + (result.success ? 1 : 0),
    target_messages: session?.target_messages,
  };
}

// ══════════════════════════════════════════════════════════
// TICK: Processar contas community_only elegíveis
// ══════════════════════════════════════════════════════════
async function handleTick(db: any) {
  const { data: memberships } = await db.from("warmup_community_membership")
    .select("device_id, user_id, community_mode, messages_today, daily_limit, cooldown_until, start_hour, end_hour, active_days")
    .eq("community_mode", "community_only").eq("is_enabled", true).eq("is_eligible", true)
    .limit(100);

  if (!memberships?.length) return { processed: 0 };

  let processed = 0;
  const results: any[] = [];

  for (const m of memberships) {
    if (m.daily_limit > 0 && m.messages_today >= m.daily_limit) continue;
    if (m.cooldown_until && new Date(m.cooldown_until) > new Date()) continue;
    const activeDays = Array.isArray(m.active_days) ? m.active_days : ["mon", "tue", "wed", "thu", "fri"];
    if (!isWithinWindow(m.start_hour || "08:00", m.end_hour || "19:00", activeDays)) continue;

    try {
      const result = await processDevice(db, m.device_id);
      results.push(result);
      processed++;
    } catch (err: any) {
      console.error(`[community-core] Error processing ${m.device_id}:`, err.message);
      results.push({ device_id: m.device_id, status: "error", error: err.message });
    }
    await new Promise(r => setTimeout(r, randInt(2000, 5000)));
  }

  return { processed, results };
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

  // Close stale sessions (>4h without activity)
  const staleThreshold = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  await db.from("community_sessions")
    .update({ status: "completed", completed_at: now, end_reason: "stale_timeout" })
    .eq("status", "active").lt("last_message_at", staleThreshold);

  await db.from("community_pairs")
    .update({ status: "closed", closed_at: now })
    .eq("status", "active");

  return { ok: true, reset_at: now, managed_count: managed?.length || 0 };
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
      case "tick":
        return json(await handleTick(db));
      case "process_device":
        if (!body.device_id) return json({ error: "device_id required" }, 400);
        return json(await processDevice(db, body.device_id));
      case "daily_reset":
        return json(await handleDailyReset(db));
      case "check_eligibility":
        if (!body.device_id) return json({ error: "device_id required" }, 400);
        return json(await checkEligibility(db, body.device_id));
      default:
        return json(await handleTick(db));
    }
  } catch (err: any) {
    console.error("[community-core] Error:", err.message);
    return json({ error: err.message }, 500);
  }
});
