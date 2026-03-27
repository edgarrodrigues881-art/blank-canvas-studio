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

function safePositiveInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function safeLimit(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : Number.MAX_SAFE_INTEGER;
}

const MAX_INLINE_TICK_DELAY_MS = 45_000;

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
        .select("status, started_at, min_delay_seconds, max_delay_seconds").eq("id", interactionId).eq("user_id", user.id).single();
      if (!current) return new Response(JSON.stringify({ error: "Automação não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      if (current.status === "running") return jsonOk({ ok: true, status: "running" });

      const { error } = await admin.from("group_interactions")
        .update({
          status: "running",
          started_at: current.started_at || new Date().toISOString(),
          completed_at: null,
          last_error: null,
          next_action_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", interactionId).eq("user_id", user.id);
      if (error) throw error;

      const initialDelay = randomBetween(
        safePositiveInt(current.min_delay_seconds, 1),
        Math.max(safePositiveInt(current.min_delay_seconds, 1), safePositiveInt(current.max_delay_seconds, safePositiveInt(current.min_delay_seconds, 1))),
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
  const safeDelay = Math.max(1, Math.floor(Number(delaySec) || 1));
  const targetIso = scheduledFor ?? new Date(Date.now() + safeDelay * 1000).toISOString();

  await admin.from("group_interactions")
    .update({ next_action_at: targetIso, updated_at: new Date().toISOString() })
    .eq("id", interactionId);

  const remainingMs = new Date(targetIso).getTime() - Date.now();
  if (remainingMs > 0 && remainingMs <= MAX_INLINE_TICK_DELAY_MS) {
    dispatchTick(interactionId, targetIso).catch((err) => {
      console.error("[group-interaction] scheduleNextTick dispatch failed:", err);
    });
  }
}

async function handleTick(admin: any, interactionId: string, scheduledFor?: string | null, providedUserId?: string) {
  try {
    const { data: config, error: cfgErr } = await admin
      .from("group_interactions").select("*").eq("id", interactionId).single();
    if (cfgErr || !config || !["running", "active"].includes(config.status)) return jsonOk({ ok: true, skipped: true, reason: "not_running" });

    if (scheduledFor) {
      const remainingMs = new Date(scheduledFor).getTime() - Date.now();
      if (Number.isFinite(remainingMs) && remainingMs > 0) {
        if (remainingMs > MAX_INLINE_TICK_DELAY_MS) {
          await scheduleNextTick(admin, interactionId, Math.ceil(remainingMs / 1000), scheduledFor);
          return jsonOk({ ok: true, skipped: true, reason: "waiting_for_schedule" });
        }
        await new Promise((resolve) => setTimeout(resolve, remainingMs));
      }
    }

    const userId = providedUserId || config.user_id;

    const groupIds: string[] = config.group_ids || [];
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

    // Content types config
    const contentTypes = config.content_types || { text: true };
    const contentWeights = config.content_weights || { text: 50 };

    const warmupTexts = await getUserWarmupMessages(admin, userId);

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
    const dailyLimitTotal = safeLimit(config.daily_limit_total);
    const dailyLimitPerGroup = safeLimit(config.daily_limit_per_group);
    const cycleMin = safePositiveInt(config.messages_per_cycle_min, 1);
    const cycleMax = Math.max(cycleMin, safePositiveInt(config.messages_per_cycle_max, cycleMin));
    const { count: todayTotal } = await admin.from("group_interaction_logs")
      .select("*", { count: "exact", head: true })
      .eq("interaction_id", interactionId)
      .gte("sent_at", todayStart.toISOString());
    if ((todayTotal || 0) >= dailyLimitTotal) {
      console.log(`[group-interaction] Daily total limit reached for ${interactionId}`);
      await scheduleNextTick(admin, interactionId, 300);
      return jsonOk({ ok: true, skipped: true, reason: "daily_total_limit" });
    }

    const cycleSize = randomBetween(cycleMin, cycleMax);
    const toSend = Math.min(cycleSize, dailyLimitTotal - (todayTotal || 0));
    if (toSend <= 0) {
      await scheduleNextTick(admin, interactionId, 60);
      return jsonOk({ ok: true, skipped: true, reason: "empty_cycle" });
    }

    console.log(`[group-interaction] Execution plan: cycleSize=${cycleSize}, toSend=${toSend}, delay=${config.min_delay_seconds}-${config.max_delay_seconds}s`);

    const eligibleGroups: { jid: string; name: string }[] = [];
    for (const group of resolvedGroups) {
      const { count: groupToday } = await admin.from("group_interaction_logs")
        .select("*", { count: "exact", head: true })
        .eq("interaction_id", interactionId).eq("group_id", group.jid)
        .gte("sent_at", todayStart.toISOString());

      if ((groupToday || 0) < dailyLimitPerGroup) {
        eligibleGroups.push(group);
      }
    }

    if (eligibleGroups.length === 0) {
      await scheduleNextTick(admin, interactionId, 300);
      return jsonOk({ ok: true, skipped: true, reason: "daily_group_limit" });
    }

    const lastSentByGroup: Record<string, string> = {};
    const group = pickRandom(eligibleGroups);
    const groupJid = group.jid;
    const groupName = group.name;
    const chosenType = pickContentType(contentTypes, contentWeights);
    const category = getCategoryForIndex((todayTotal || 0) % Math.max(toSend, 1), Math.max(toSend, 1));

    let messageText = "";
    let fileUrl: string | null = null;
    let sendEndpoint = "send/text";
    let sendBody: any = {};

    if (chosenType === "text" || !mediaByType[chosenType]?.length) {
      const availableTexts = warmupTexts.filter((text) => text !== lastSentByGroup[groupJid]);
      if (availableTexts.length > 0) {
        messageText = pickRandom(availableTexts);
      } else if (warmupTexts.length > 0) {
        messageText = pickRandom(warmupTexts);
      } else {
        const cats = FALLBACK_MESSAGES[category] || FALLBACK_MESSAGES.continuacao;
        messageText = pickRandom(cats);
      }
      sendEndpoint = "send/text";
      sendBody = { number: groupJid, text: messageText };
    } else {
      const candidates = mediaByType[chosenType].filter((m) => m.file_url !== lastSentByGroup[groupJid]);
      const picked = candidates.length ? pickRandom(candidates) : pickRandom(mediaByType[chosenType]);
      fileUrl = picked.file_url;
      messageText = picked.content || picked.file_name || chosenType;

      if (chosenType === "image") {
        sendEndpoint = "send/image";
        sendBody = { number: groupJid, image: fileUrl, caption: messageText || "" };
      } else if (chosenType === "video") {
        sendEndpoint = "send/video";
        sendBody = { number: groupJid, video: fileUrl, caption: messageText || "" };
      } else if (chosenType === "sticker") {
        sendEndpoint = "send/sticker";
        sendBody = { number: groupJid, sticker: fileUrl };
      } else if (chosenType === "audio") {
        sendEndpoint = "send/document";
        sendBody = { number: groupJid, document: fileUrl, fileName: picked.file_name || "audio.ogg" };
      } else {
        sendEndpoint = "send/document";
        sendBody = { number: groupJid, document: fileUrl, fileName: picked.file_name || "arquivo" };
      }
    }

    let sentOk = false;
    let sendError: string | null = null;
    const appliedDelay = randomBetween(safePositiveInt(config.min_delay_seconds, 1), Math.max(safePositiveInt(config.min_delay_seconds, 1), safePositiveInt(config.max_delay_seconds, safePositiveInt(config.min_delay_seconds, 1))));

    try {
      const resp = await fetch(`${baseUrl}/${sendEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: device.uazapi_token },
        body: JSON.stringify(sendBody),
      });

      const responseText = await resp.text();
      sentOk = resp.ok;
      sendError = resp.ok ? null : `HTTP ${resp.status} - ${responseText.substring(0, 180)}`;
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
      lastSentByGroup[groupJid] = fileUrl || messageText;
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
