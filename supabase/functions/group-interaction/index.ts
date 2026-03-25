import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getCategoryForIndex(i: number, total: number): string {
  if (i === 0) return "abertura";
  if (i === total - 1) return "encerramento";
  return pickRandom(["continuacao", "pergunta", "resposta_curta", "engajamento", "continuacao"]);
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

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, interactionId } = body;

    if (action === "start") {
      const { error } = await admin.from("group_interactions")
        .update({ status: "running", started_at: new Date().toISOString(), last_error: null })
        .eq("id", interactionId).eq("user_id", user.id);
      if (error) throw error;
      EdgeRuntime.waitUntil(processInteraction(admin, interactionId, user.id));
      return jsonOk({ ok: true, status: "running" });
    }

    if (action === "pause") {
      const { error } = await admin.from("group_interactions")
        .update({ status: "paused" }).eq("id", interactionId).eq("user_id", user.id);
      if (error) throw error;
      return jsonOk({ ok: true, status: "paused" });
    }

    if (action === "stop") {
      const { error } = await admin.from("group_interactions")
        .update({ status: "idle", completed_at: new Date().toISOString() })
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
  try {
    const { data: config, error: cfgErr } = await admin
      .from("group_interactions").select("*").eq("id", interactionId).single();
    if (cfgErr || !config || config.status !== "running") return;

    const groupIds: string[] = config.group_ids || [];
    if (groupIds.length === 0) return;

    // Time window check
    const now = new Date();
    const brNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const currentHour = `${String(brNow.getHours()).padStart(2, "0")}:${String(brNow.getMinutes()).padStart(2, "0")}`;
    if (currentHour < config.start_hour || currentHour > config.end_hour) return;

    // Day check
    const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const activeDays: string[] = config.active_days || [];
    if (!activeDays.includes(dayMap[brNow.getDay()])) return;

    // Duration check
    if (config.started_at) {
      const maxMs = (config.duration_hours * 60 + config.duration_minutes) * 60 * 1000;
      if (maxMs > 0 && now.getTime() - new Date(config.started_at).getTime() > maxMs) {
        await admin.from("group_interactions").update({
          status: "completed", completed_at: new Date().toISOString(),
        }).eq("id", interactionId);
        return;
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
      }).eq("id", interactionId);
      return;
    }

    // Content types config
    const contentTypes = config.content_types || { text: true };
    const contentWeights = config.content_weights || { text: 50 };

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
    if ((todayTotal || 0) >= config.daily_limit_total) return;

    const cycleSize = randomBetween(config.messages_per_cycle_min, config.messages_per_cycle_max);
    const toSend = Math.min(cycleSize, config.daily_limit_total - (todayTotal || 0));
    const shuffledGroups = [...groupIds].sort(() => Math.random() - 0.5);
    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");

    let messagesSent = 0;
    let consecutive = 0;
    const pauseAfter = randomBetween(config.pause_after_messages_min, config.pause_after_messages_max);
    const lastSentByGroup: Record<string, string> = {};

    for (let i = 0; i < toSend; i++) {
      // Re-check status
      const { data: current } = await admin.from("group_interactions")
        .select("status").eq("id", interactionId).single();
      if (!current || current.status !== "running") break;

      const groupId = shuffledGroups[i % shuffledGroups.length];

      // Per-group limit
      const { count: groupToday } = await admin.from("group_interaction_logs")
        .select("*", { count: "exact", head: true })
        .eq("interaction_id", interactionId).eq("group_id", groupId)
        .gte("sent_at", todayStart.toISOString());
      if ((groupToday || 0) >= config.daily_limit_per_group) continue;

      // Pick content type
      const chosenType = pickContentType(contentTypes, contentWeights);
      const category = getCategoryForIndex(i, toSend);

      let messageText = "";
      let fileUrl: string | null = null;
      let sendEndpoint = "send/text";
      let sendBody: any = {};

      if (chosenType === "text" || !mediaByType[chosenType]?.length) {
        // Use user texts or fallback
        const userTexts = mediaByType["text"]?.filter((m) => m.content !== lastSentByGroup[groupId]);
        if (userTexts?.length) {
          const picked = pickRandom(userTexts);
          messageText = picked.content;
        } else {
          const cats = FALLBACK_MESSAGES[category] || FALLBACK_MESSAGES.continuacao;
          messageText = pickRandom(cats);
        }
        sendEndpoint = "send/text";
        sendBody = { number: groupId, text: messageText };
      } else {
        // Media content
        const candidates = mediaByType[chosenType].filter((m) => m.file_url !== lastSentByGroup[groupId]);
        const picked = candidates.length ? pickRandom(candidates) : pickRandom(mediaByType[chosenType]);
        fileUrl = picked.file_url;
        messageText = picked.content || picked.file_name || chosenType;

        if (chosenType === "image") {
          sendEndpoint = "send/image";
          sendBody = { number: groupId, image: fileUrl, caption: "" };
        } else if (chosenType === "video") {
          sendEndpoint = "send/video";
          sendBody = { number: groupId, video: fileUrl, caption: "" };
        } else if (chosenType === "sticker") {
          sendEndpoint = "send/sticker";
          sendBody = { number: groupId, sticker: fileUrl };
        } else {
          sendEndpoint = "send/document";
          sendBody = { number: groupId, document: fileUrl, fileName: picked.file_name || "arquivo" };
        }
      }

      try {
        const resp = await fetch(`${baseUrl}/${sendEndpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: device.uazapi_token },
          body: JSON.stringify(sendBody),
        });

        const logStatus = resp.ok ? "sent" : "failed";
        const errorMsg = resp.ok ? null : `HTTP ${resp.status}`;

        await admin.from("group_interaction_logs").insert({
          interaction_id: interactionId, user_id: userId, group_id: groupId,
          message_content: messageText, message_category: `${chosenType}:${category}`,
          device_id: device.id, status: logStatus, error_message: errorMsg,
          pause_applied_seconds: 0, sent_at: new Date().toISOString(),
        });

        if (resp.ok) {
          messagesSent++;
          consecutive++;
          lastSentByGroup[groupId] = fileUrl || messageText;

          await admin.from("group_interactions").update({
            total_messages_sent: config.total_messages_sent + messagesSent,
            last_group_used: groupId, last_content_sent: messageText,
            last_sent_at: new Date().toISOString(), today_count: (todayTotal || 0) + messagesSent,
            updated_at: new Date().toISOString(),
          }).eq("id", interactionId);
        }
      } catch (sendErr: any) {
        await admin.from("group_interaction_logs").insert({
          interaction_id: interactionId, user_id: userId, group_id: groupId,
          message_content: messageText, message_category: `${chosenType}:${category}`,
          device_id: device.id, status: "failed", error_message: sendErr.message,
          sent_at: new Date().toISOString(),
        });
      }

      // Delay
      const delay = randomBetween(config.min_delay_seconds, config.max_delay_seconds);
      await new Promise((r) => setTimeout(r, delay * 1000));

      // Pause after block
      if (consecutive >= pauseAfter) {
        const bigPause = randomBetween(config.pause_duration_min, config.pause_duration_max);
        await new Promise((r) => setTimeout(r, bigPause * 1000));
        consecutive = 0;
      }
    }
  } catch (err: any) {
    console.error("processInteraction error:", err);
    await admin.from("group_interactions").update({
      last_error: err.message,
    }).eq("id", interactionId).catch(() => {});
  }
}
