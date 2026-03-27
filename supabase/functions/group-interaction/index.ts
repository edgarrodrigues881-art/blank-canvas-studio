import { createClient } from "npm:@supabase/supabase-js@2";
import { addResolvedGroup, fetchDeviceGroups, normalizeGroupName, resolveGroupFromInvite, resolveGroupJid } from "./group-resolution.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ───── Message Bank (fallback when no user content) ───── */
const FALLBACK_MESSAGES: Record<string, string[]> = {
  abertura: [
    "Bom dia pessoal! 🌞", "Opa, tudo certo por aqui?", "E aí galera, como estão? 👋",
    "Boa tarde pessoal! Como tá o dia?", "Fala pessoal, tudo tranquilo?",
  ],
  continuacao: [
    "Alguém mais tá trabalhando agora?", "Hoje tá corrido hein", "Alguém tem novidade pra contar?",
    "O dia tá rendendo pelo menos?", "Tô no corre aqui mas passando pra dar um oi",
  ],
  pergunta: [
    "Como vocês estão organizando a semana?", "Alguém tem dica de app bom?",
    "Qual ferramenta vocês mais usam?", "Alguém já testou isso?",
  ],
  resposta_curta: [
    "Com certeza!", "Verdade", "Concordo total", "Boa!", "Valeu pela dica 👍", "Top 🔥",
  ],
  engajamento: [
    "Pessoal, bora interagir mais no grupo!", "Quem concorda dá um 👍",
    "Vamos movimentar esse grupo 🚀", "Quem tá online? 🖐",
  ],
  encerramento: [
    "Bom, vou indo pessoal! Até mais 👋", "Até mais pessoal!",
    "Boa noite a todos! 🌙", "Vou ficar offline agora. Até! ✌️",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomBetween(min: number, max: number): number {
  const safeMin = Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0;
  const safeMax = Number.isFinite(max) ? Math.max(safeMin, Math.floor(max)) : safeMin;
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safePositiveInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function safeNonNegativeInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : fallback;
}

function safeLimit(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : Number.MAX_SAFE_INTEGER;
}

const MAX_INLINE_TICK_DELAY_MS = 45_000;
const CLAIM_TOLERANCE_MS = 2_000;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80",
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&q=80",
];

const FALLBACK_AUDIOS = [
  "https://cdn.freesound.org/previews/531/531947_4397472-lq.mp3",
  "https://cdn.freesound.org/previews/456/456058_5765826-lq.mp3",
  "https://cdn.freesound.org/previews/462/462808_8386274-lq.mp3",
  "https://cdn.freesound.org/previews/367/367125_6652158-lq.mp3",
];

let imagePoolCache: string[] | null = null;
let audioPoolCache: string[] | null = null;

function getCategoryForIndex(i: number, total: number): string {
  if (i === 0) return "abertura";
  if (i === total - 1) return "encerramento";
  return pickRandom(["continuacao", "pergunta", "resposta_curta", "engajamento", "continuacao"]);
}

function addAliasHint(aliasesByIdentifier: Map<string, string[]>, identifier: string, alias: string | null | undefined) {
  const cleanIdentifier = String(identifier || "").trim();
  const cleanAlias = String(alias || "").trim();
  if (!cleanIdentifier || !cleanAlias) return;

  const current = aliasesByIdentifier.get(cleanIdentifier) || [];
  if (!current.includes(cleanAlias)) {
    aliasesByIdentifier.set(cleanIdentifier, [...current, cleanAlias]);
  }
}

async function getStoredGroupHints(admin: any, deviceId: string | null, identifiers: string[]) {
  const aliasesByIdentifier = new Map<string, string[]>();
  const directGroups = new Map<string, { jid: string; name: string }>();
  const links = [...new Set((identifiers || []).map((value) => String(value || "").trim()).filter(Boolean))];

  if (links.length === 0) return { aliasesByIdentifier, directGroups };

  const queries: Promise<any>[] = [
    admin.from("warmup_groups").select("link, name").in("link", links),
    admin.from("warmup_groups_pool").select("external_group_ref, name").in("external_group_ref", links),
  ];

  if (deviceId) {
    queries.push(
      admin
        .from("warmup_instance_groups")
        .select("invite_link, group_name, group_jid")
        .eq("device_id", deviceId)
        .in("invite_link", links),
    );
  }

  const [warmupGroupsRes, poolGroupsRes, instanceGroupsRes] = await Promise.all(queries);

  for (const row of warmupGroupsRes?.data || []) {
    addAliasHint(aliasesByIdentifier, row.link, row.name);
  }

  for (const row of poolGroupsRes?.data || []) {
    addAliasHint(aliasesByIdentifier, row.external_group_ref, row.name);
  }

  for (const row of instanceGroupsRes?.data || []) {
    addAliasHint(aliasesByIdentifier, row.invite_link, row.group_name);
    if (row.group_jid) {
      addResolvedGroup(directGroups as Map<string, { jid: string; name: string }>, {
        jid: row.group_jid,
        name: row.group_name,
        invite: row.invite_link,
      });
    }
  }

  return { aliasesByIdentifier, directGroups };
}

async function getUserWarmupMessages(admin: any, userId: string): Promise<string[]> {
  const { data, error } = await admin.from("warmup_messages")
    .select("content")
    .eq("user_id", userId);

  if (error || !data?.length) {
    return Object.values(FALLBACK_MESSAGES).flat();
  }

  const messages = data
    .map((row: any) => String(row.content || "").trim())
    .filter((content: string) => content.length > 0);

  return messages.length > 0 ? messages : Object.values(FALLBACK_MESSAGES).flat();
}

async function getImagePool(admin: any): Promise<string[]> {
  if (imagePoolCache) return imagePoolCache;

  try {
    const { data: files, error } = await admin.storage.from("media").list("warmup-media", { limit: 100 });
    if (!error && files?.length > 0) {
      const base = `${SUPABASE_URL}/storage/v1/object/public/media/warmup-media`;
      const urls = files
        .filter((file: any) => file.name && !file.name.startsWith(".") && /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name))
        .map((file: any) => `${base}/${encodeURIComponent(file.name)}`);

      if (urls.length > 0) {
        imagePoolCache = urls;
        return urls;
      }
    }
  } catch {
    // ignore and fallback
  }

  imagePoolCache = FALLBACK_IMAGES;
  return imagePoolCache;
}

async function getAudioPool(admin: any): Promise<string[]> {
  if (audioPoolCache) return audioPoolCache;

  try {
    const { data: files, error } = await admin.storage.from("media").list("warmup-audio", { limit: 100 });
    if (!error && files?.length > 0) {
      const base = `${SUPABASE_URL}/storage/v1/object/public/media/warmup-audio`;
      const urls = files
        .filter((file: any) => file.name && !file.name.startsWith(".") && /\.(ogg|mp3|m4a|opus|wav)$/i.test(file.name))
        .map((file: any) => `${base}/${encodeURIComponent(file.name)}`);

      if (urls.length > 0) {
        audioPoolCache = urls;
        return urls;
      }
    }
  } catch {
    // ignore and fallback
  }

  audioPoolCache = FALLBACK_AUDIOS;
  return audioPoolCache;
}

function pickAutomaticContentType(options: {
  hasImage: boolean;
  hasSticker: boolean;
  hasAudio: boolean;
}) {
  const bag = ["text", "text", "text", "text", "text"];
  if (options.hasImage) bag.push("image", "image");
  if (options.hasSticker) bag.push("sticker", "sticker");
  if (options.hasAudio) bag.push("audio");
  return pickRandom(bag);
}

async function uazapiSendText(baseUrl: string, token: string, number: string, text: string) {
  const safeText = String(text || "").trim();
  if (!safeText) throw new Error("Texto vazio para envio");

  const isGroup = number.includes("@g.us");
  const attempts: Array<{ path: string; body: Record<string, unknown> }> = isGroup
    ? [
        { path: "/send/text", body: { chatId: number, text: safeText } },
        { path: "/send/text", body: { chatId: number, number, text: safeText } },
        { path: "/send/text", body: { number, text: safeText } },
        { path: "/chat/send-text", body: { chatId: number, body: safeText } },
        { path: "/chat/send-text", body: { chatId: number, text: safeText } },
        { path: "/chat/send-text", body: { chatId: number, to: number, body: safeText, text: safeText } },
        { path: "/message/sendText", body: { chatId: number, text: safeText } },
        { path: "/message/sendText", body: { number, text: safeText } },
      ]
    : (() => {
        const chatId = number.includes("@") ? number : `${number}@s.whatsapp.net`;
        return [
          { path: "/send/text", body: { number, text: safeText } },
          { path: "/send/text", body: { chatId, text: safeText } },
          { path: "/chat/send-text", body: { number, to: number, chatId, body: safeText, text: safeText } },
          { path: "/message/sendText", body: { chatId, text: safeText } },
          { path: "/message/sendText", body: { number, text: safeText } },
        ];
      })();

  let lastErr = "";
  for (const attempt of attempts) {
    try {
      const response = await fetch(`${baseUrl}${attempt.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(attempt.body),
      });

      const raw = await response.text();
      if (response.ok) {
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          if (parsed?.error || parsed?.code === 404 || parsed?.status === "error") {
            lastErr = `${attempt.path}: ${raw.substring(0, 240)}`;
            continue;
          }
          return parsed;
        } catch {
          return { ok: true, raw };
        }
      }

      if (response.status === 405 || response.status === 404) {
        lastErr = `${response.status} @ ${attempt.path}`;
        continue;
      }

      lastErr = `${response.status} @ ${attempt.path}: ${raw.substring(0, 240)}`;
    } catch (error) {
      lastErr = `${attempt.path}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  throw new Error(`Text send failed: ${lastErr}`);
}

async function uazapiSendImage(baseUrl: string, token: string, number: string, imageUrl: string, caption: string) {
  if (!imageUrl) throw new Error("Image URL ausente");
  const safeCaption = (caption || "📸").trim() || "📸";

  const response = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token, Accept: "application/json" },
    body: JSON.stringify({ number, file: imageUrl, type: "image", caption: safeCaption }),
  });

  const raw = await response.text();
  if (response.ok) {
    try { return JSON.parse(raw); } catch { return { ok: true, raw }; }
  }

  throw new Error(`Image send failed: ${response.status} — ${raw.substring(0, 240)}`);
}

async function uazapiSendSticker(baseUrl: string, token: string, number: string, imageUrl: string) {
  if (!imageUrl) throw new Error("Sticker URL ausente");

  const response = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token, Accept: "application/json" },
    body: JSON.stringify({ number, file: imageUrl, type: "sticker" }),
  });

  const raw = await response.text();
  if (response.ok) {
    try { return JSON.parse(raw); } catch { return { ok: true, raw }; }
  }

  throw new Error(`Sticker send failed: ${response.status} — ${raw.substring(0, 240)}`);
}

async function uazapiSendAudio(baseUrl: string, token: string, number: string, audioUrl: string) {
  if (!audioUrl) throw new Error("Audio URL ausente");

  const attempts = [
    { path: "/send/media", body: { number, file: audioUrl, type: "audio", ptt: true } },
    { path: "/send/media", body: { number, file: audioUrl, type: "audio" } },
  ];

  let lastErr = "";
  for (const attempt of attempts) {
    try {
      const response = await fetch(`${baseUrl}${attempt.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(attempt.body),
      });

      const raw = await response.text();
      if (response.ok) {
        try { return JSON.parse(raw); } catch { return { ok: true, raw }; }
      }
      lastErr = `${response.status} @ ${attempt.path}: ${raw.substring(0, 240)}`;
    } catch (error) {
      lastErr = `${attempt.path}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  throw new Error(`Audio send failed: ${lastErr}`);
}

/** Pick content type based on weights */
function pickContentType(types: Record<string, boolean>, weights: Record<string, number>): string {
  const enabled = Object.keys(types).filter((k) => types[k]);
  if (enabled.length === 0) return "text";
  const totalWeight = enabled.reduce((s, k) => s + (weights[k] || 1), 0);
  let rand = Math.random() * totalWeight;
  for (const k of enabled) {
    rand -= weights[k] || 1;
    if (rand <= 0) return k;
  }
  return enabled[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action, interactionId, scheduled_for } = body;

    if (action === "tick") {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

      if (!token || (token !== serviceRoleKey && token !== anonKey)) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return await handleTick(admin, interactionId, scheduled_for ?? null);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "start" || action === "resume") {
      const { data: current } = await admin.from("group_interactions")
        .select("status, started_at, min_delay_seconds, max_delay_seconds, next_action_at").eq("id", interactionId).eq("user_id", user.id).single();
      if (!current) return new Response(JSON.stringify({ error: "Automação não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const hasFutureTick = current.next_action_at && new Date(current.next_action_at).getTime() > Date.now();
      if (current.status === "running" && hasFutureTick) {
        return jsonOk({ ok: true, status: "running", next_action_at: current.next_action_at });
      }

      const { error } = await admin.from("group_interactions")
        .update({
          status: "running",
          started_at: current.started_at || new Date().toISOString(),
          completed_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", interactionId).eq("user_id", user.id);
      if (error) throw error;

      const initialDelay = randomBetween(
        safeNonNegativeInt(current.min_delay_seconds, 0),
        Math.max(safeNonNegativeInt(current.min_delay_seconds, 0), safeNonNegativeInt(current.max_delay_seconds, safeNonNegativeInt(current.min_delay_seconds, 0))),
      );
      await scheduleNextTick(admin, interactionId, initialDelay);

      return jsonOk({ ok: true, status: "running" });
    }

    if (action === "pause") {
      const { error } = await admin.from("group_interactions")
        .update({ status: "paused", next_action_at: null, updated_at: new Date().toISOString() }).eq("id", interactionId).eq("user_id", user.id);
      if (error) throw error;
      return jsonOk({ ok: true, status: "paused" });
    }

    if (action === "stop") {
      const { error } = await admin.from("group_interactions")
        .update({ status: "idle", completed_at: new Date().toISOString(), next_action_at: null, updated_at: new Date().toISOString() })
        .eq("id", interactionId).eq("user_id", user.id);
      if (error) throw error;
      return jsonOk({ ok: true, status: "idle" });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("group-interaction error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function jsonOk(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function processInteraction(admin: any, interactionId: string, userId: string) {
  return handleTick(admin, interactionId, null, userId);
}

async function dispatchTick(interactionId: string, scheduledFor?: string | null) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

  const res = await fetch(`${supabaseUrl}/functions/v1/group-interaction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      action: "tick",
      interactionId,
      scheduled_for: scheduledFor ?? null,
    }),
  });

  const text = await res.text();
  console.log(`[group-interaction] dispatchTick status=${res.status} body=${text.substring(0, 200)}`);
}

async function scheduleNextTick(admin: any, interactionId: string, delaySec: number, scheduledFor?: string | null) {
  const safeDelay = Math.max(0, Math.floor(Number(delaySec) || 0));
  const targetIso = scheduledFor ?? new Date(Date.now() + safeDelay * 1000).toISOString();

  const { data, error } = await admin.from("group_interactions")
    .update({ next_action_at: targetIso, updated_at: new Date().toISOString() })
    .eq("id", interactionId)
    .in("status", ["running", "active"])
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;

  const remainingMs = new Date(targetIso).getTime() - Date.now();
  if (remainingMs >= 0 && remainingMs <= MAX_INLINE_TICK_DELAY_MS) {
    dispatchTick(interactionId, targetIso).catch((err) => {
      console.error("[group-interaction] scheduleNextTick dispatch failed:", err);
    });
  }

  return true;
}

async function claimDueTick(admin: any, interactionId: string, scheduledFor?: string | null) {
  const { data: current, error } = await admin
    .from("group_interactions")
    .select("status, next_action_at")
    .eq("id", interactionId)
    .maybeSingle();

  if (error) throw error;
  if (!current || !["running", "active"].includes(current.status) || !current.next_action_at) {
    return false;
  }

  if (scheduledFor) {
    const currentMs = new Date(current.next_action_at).getTime();
    const expectedMs = new Date(scheduledFor).getTime();
    if (!Number.isFinite(currentMs) || !Number.isFinite(expectedMs)) return false;
    if (Math.abs(currentMs - expectedMs) > CLAIM_TOLERANCE_MS) return false;
    if (currentMs - Date.now() > CLAIM_TOLERANCE_MS) return false;
  }

  const { data: claimed, error: claimError } = await admin
    .from("group_interactions")
    .update({ next_action_at: null, updated_at: new Date().toISOString() })
    .eq("id", interactionId)
    .in("status", ["running", "active"])
    .eq("next_action_at", current.next_action_at)
    .select("id")
    .maybeSingle();

  if (claimError) throw claimError;
  return !!claimed;
}

async function handleTick(admin: any, interactionId: string, scheduledFor?: string | null, providedUserId?: string) {
  try {
    if (scheduledFor) {
      const remainingMs = new Date(scheduledFor).getTime() - Date.now();
      if (Number.isFinite(remainingMs) && remainingMs > 0) {
        if (remainingMs > MAX_INLINE_TICK_DELAY_MS) {
          await scheduleNextTick(admin, interactionId, Math.ceil(remainingMs / 1000), scheduledFor);
          return jsonOk({ ok: true, skipped: true, reason: "waiting_for_schedule" });
        }
        await sleep(remainingMs);
      }

      const claimed = await claimDueTick(admin, interactionId, scheduledFor);
      if (!claimed) {
        return jsonOk({ ok: true, skipped: true, reason: "tick_already_claimed" });
      }
    }

    const { data: config, error: cfgErr } = await admin
      .from("group_interactions").select("*").eq("id", interactionId).single();
    if (cfgErr || !config || !["running", "active"].includes(config.status)) return jsonOk({ ok: true, skipped: true, reason: "not_running" });

    const userId = providedUserId || config.user_id;

    const groupIds: string[] = Array.isArray(config.group_ids) ? config.group_ids : [];
    if (groupIds.length === 0) {
      await admin.from("group_interactions").update({ last_error: "Nenhum grupo selecionado", next_action_at: null }).eq("id", interactionId);
      return jsonOk({ ok: true, skipped: true, reason: "no_groups" });
    }

    // Time window check
    const now = new Date();
    const brNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const currentHour = `${String(brNow.getHours()).padStart(2, "0")}:${String(brNow.getMinutes()).padStart(2, "0")}`;
    if (currentHour < config.start_hour || currentHour > config.end_hour) {
      await scheduleNextTick(admin, interactionId, 60);
      return jsonOk({ ok: true, skipped: true, reason: "outside_window" });
    }

    // Day check
    const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const activeDays: string[] = config.active_days || [];
    if (activeDays.length > 0 && !activeDays.includes(dayMap[brNow.getDay()])) {
      await scheduleNextTick(admin, interactionId, 300);
      return jsonOk({ ok: true, skipped: true, reason: "inactive_day" });
    }

    // Duration check
    if (config.started_at) {
      const maxMs = (config.duration_hours * 60 + config.duration_minutes) * 60 * 1000;
      if (maxMs > 0 && now.getTime() - new Date(config.started_at).getTime() > maxMs) {
        await admin.from("group_interactions").update({
          status: "completed", completed_at: new Date().toISOString(), next_action_at: null,
        }).eq("id", interactionId);
        return jsonOk({ ok: true, status: "completed" });
      }
    }

    // Device
    let device = null;
    if (config.device_id) {
      const { data: d } = await admin.from("devices")
        .select("id, name, uazapi_token, uazapi_base_url, status")
        .eq("id", config.device_id).single();
      device = d;
    }
    if (!device?.uazapi_token || !device?.uazapi_base_url) {
      await admin.from("group_interactions").update({
        last_error: "Nenhum dispositivo válido configurado",
        next_action_at: null,
      }).eq("id", interactionId);
      return jsonOk({ ok: true, skipped: true, reason: "invalid_device" });
    }

    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");

    // Resolve group links to JIDs
    console.log(`[group-interaction] Fetching device groups to resolve ${groupIds.length} identifiers...`);
    const groupMap = await fetchDeviceGroups(baseUrl, device.uazapi_token);
    const { aliasesByIdentifier, directGroups } = await getStoredGroupHints(admin, config.device_id, groupIds);
    for (const [key, value] of directGroups.entries()) {
      groupMap.set(key, value);
    }
    console.log(`[group-interaction] Device has ${groupMap.size} group entries in map`);

    const resolvedGroups: { jid: string; name: string }[] = [];
    const unresolvedGroups: string[] = [];
    for (const gid of groupIds) {
      const aliases = aliasesByIdentifier.get(gid) || [];
      let resolved = resolveGroupJid(gid, groupMap, aliases);
      if (!resolved) {
        const resolvedFromInvite = await resolveGroupFromInvite(baseUrl, device.uazapi_token, gid);
        if (resolvedFromInvite) {
          addResolvedGroup(groupMap, { jid: resolvedFromInvite.jid, name: resolvedFromInvite.name, invite: gid });
          for (const alias of aliases) {
            addResolvedGroup(groupMap, { jid: resolvedFromInvite.jid, name: alias, invite: gid });
          }
          resolved = resolveGroupJid(gid, groupMap, aliases);
          console.log(`[group-interaction] Invite fallback resolved ${gid} => ${resolvedFromInvite.jid}`);
        }
      }
      if (resolved) {
        resolvedGroups.push(resolved);
      } else {
        unresolvedGroups.push(gid);
      }
    }

    if (unresolvedGroups.length > 0) {
      console.log(`[group-interaction] Could not resolve ${unresolvedGroups.length} groups: ${unresolvedGroups.join(", ")}`);
    }

    if (resolvedGroups.length === 0) {
      await admin.from("group_interactions").update({
        last_error: `Nenhum grupo pôde ser resolvido. O dispositivo precisa estar nos grupos selecionados. (${groupIds.length} links, ${groupMap.size} grupos no dispositivo)`,
        updated_at: new Date().toISOString(),
      }).eq("id", interactionId);
      await scheduleNextTick(admin, interactionId, 120);
      return jsonOk({ ok: true, skipped: true, reason: "groups_not_resolved" });
    }

    console.log(`[group-interaction] Resolved ${resolvedGroups.length} groups: ${resolvedGroups.map(g => g.name || g.jid).join(", ")}`);
    if (unresolvedGroups.length > 0) {
      const knownAliases = unresolvedGroups.map((gid) => `${gid} => ${(aliasesByIdentifier.get(gid) || []).map(normalizeGroupName).join(" | ") || "sem alias"}`);
      console.log(`[group-interaction] Alias hints: ${knownAliases.join(" ; ")}`);
    }

    const [warmupTexts, systemImagePool, systemAudioPool] = await Promise.all([
      getUserWarmupMessages(admin, userId),
      getImagePool(admin),
      getAudioPool(admin),
    ]);

    // Load user media library
    const { data: userMedia } = await admin.from("group_interaction_media")
      .select("*").eq("user_id", userId).eq("is_active", true)
      .or(`interaction_id.eq.${interactionId},interaction_id.is.null`);
    const mediaByType: Record<string, any[]> = {};
    for (const m of userMedia || []) {
      (mediaByType[m.media_type] ??= []).push(m);
    }

    // Today's messages count
    const todayStart = new Date(brNow);
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayTotal } = await admin.from("group_interaction_logs")
      .select("*", { count: "exact", head: true })
      .eq("interaction_id", interactionId)
      .gte("sent_at", todayStart.toISOString());

    console.log(`[group-interaction] Execution plan: delay=${config.min_delay_seconds}-${config.max_delay_seconds}s, total_sent=${todayTotal || 0}`);

    const rotatedGroups = resolvedGroups.filter((group) => group.jid !== config.last_group_used);
    const group = pickRandom(rotatedGroups.length > 0 ? rotatedGroups : resolvedGroups);
    const groupJid = group.jid;
    const groupName = group.name;
    const chosenType = pickAutomaticContentType({
      hasImage: (mediaByType.image?.length || 0) > 0 || systemImagePool.length > 0,
      hasSticker: (mediaByType.sticker?.length || 0) > 0 || systemImagePool.length > 0,
      hasAudio: (mediaByType.audio?.length || 0) > 0 || systemAudioPool.length > 0,
    });
    const category = getCategoryForIndex((todayTotal || 0) % 5, 5);

    let messageText = "";
    let fileUrl: string | null = null;

    const fallbackTexts = FALLBACK_MESSAGES[category] || FALLBACK_MESSAGES.continuacao;
    const getTextMessage = () => {
      if (warmupTexts.length > 0) return pickRandom(warmupTexts);
      return pickRandom(fallbackTexts);
    };

    let sentOk = false;
    let sendError: string | null = null;
    const appliedDelay = randomBetween(
      safeNonNegativeInt(config.min_delay_seconds, 0),
      Math.max(safeNonNegativeInt(config.min_delay_seconds, 0), safeNonNegativeInt(config.max_delay_seconds, safeNonNegativeInt(config.min_delay_seconds, 0))),
    );

    try {
      if (chosenType === "image") {
        const picked = mediaByType.image?.length ? pickRandom(mediaByType.image) : null;
        const resolvedImageUrl = String(picked?.file_url || pickRandom(systemImagePool) || "").trim();
        fileUrl = resolvedImageUrl || null;
        const caption = String(picked?.content || "").trim() || getTextMessage();
        await uazapiSendImage(baseUrl, device.uazapi_token, groupJid, resolvedImageUrl, "");
        await sleep(randomBetween(1000, 3000));
        await uazapiSendText(baseUrl, device.uazapi_token, groupJid, caption);
        messageText = `[IMG+TXT] ${caption}`;
      } else if (chosenType === "sticker") {
        const picked = mediaByType.sticker?.length ? pickRandom(mediaByType.sticker) : null;
        const resolvedStickerUrl = String(picked?.file_url || pickRandom(systemImagePool) || "").trim();
        fileUrl = resolvedStickerUrl || null;
        await uazapiSendSticker(baseUrl, device.uazapi_token, groupJid, resolvedStickerUrl);
        messageText = `[STICKER] ${picked?.content || "🎭"}`;
      } else if (chosenType === "audio") {
        const picked = mediaByType.audio?.length ? pickRandom(mediaByType.audio) : null;
        const resolvedAudioUrl = String(picked?.file_url || pickRandom(systemAudioPool) || "").trim();
        fileUrl = resolvedAudioUrl || null;
        await uazapiSendAudio(baseUrl, device.uazapi_token, groupJid, resolvedAudioUrl);
        messageText = `[AUDIO] ${picked?.content || "🎤"}`;
      } else {
        messageText = getTextMessage();
        await uazapiSendText(baseUrl, device.uazapi_token, groupJid, messageText);
      }

      sentOk = true;
      sendError = null;
    } catch (sendErr: any) {
      sendError = sendErr.message;
    }

    await admin.from("group_interaction_logs").insert({
      interaction_id: interactionId,
      user_id: userId,
      group_id: groupJid,
      group_name: groupName,
      message_content: messageText,
      message_category: `${chosenType}:${category}`,
      device_id: device.id,
      status: sentOk ? "sent" : "failed",
      error_message: sendError,
      pause_applied_seconds: appliedDelay,
      sent_at: new Date().toISOString(),
    });

    if (sentOk) {
      await admin.from("group_interactions").update({
        total_messages_sent: (config.total_messages_sent || 0) + 1,
        last_group_used: groupJid,
        last_content_sent: messageText,
        last_sent_at: new Date().toISOString(),
        today_count: (todayTotal || 0) + 1,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", interactionId);
    } else {
      await admin.from("group_interactions").update({
        last_error: sendError,
        updated_at: new Date().toISOString(),
      }).eq("id", interactionId);
    }

    const nextDelay = appliedDelay;

    await scheduleNextTick(admin, interactionId, nextDelay);
    return jsonOk({ ok: true, sent: sentOk, next_delay_seconds: nextDelay, error: sendError });
  } catch (err: any) {
    console.error("processInteraction error:", err);
    await admin.from("group_interactions").update({
      last_error: err.message,
      updated_at: new Date().toISOString(),
    }).eq("id", interactionId).catch(() => {});
    await scheduleNextTick(admin, interactionId, 120).catch(() => {});
    return jsonOk({ ok: false, error: err.message });
  }
}
