import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ───── Message Bank ───── */
const MESSAGE_BANK: Record<string, string[]> = {
  abertura: [
    "Bom dia pessoal! 🌞",
    "Opa, tudo certo por aqui?",
    "E aí galera, como estão? 👋",
    "Bom dia, alguém aí?",
    "Boa tarde pessoal! Como tá o dia?",
    "Boa noite galera 🌙",
    "Fala pessoal, tudo tranquilo?",
    "Oi gente, beleza?",
    "Salve galera!",
    "Opa, passando pra dar um oi 👋",
  ],
  continuacao: [
    "Alguém mais tá trabalhando agora?",
    "Hoje tá corrido hein",
    "Que calor tá fazendo aqui 🥵",
    "Alguém tem novidade pra contar?",
    "Tô precisando de uma motivação hoje rs",
    "O dia tá rendendo pelo menos?",
    "Que semana puxada",
    "Alguém já almoçou?",
    "Tô no corre aqui mas passando pra dar um oi",
    "Como tá o movimento aí?",
    "Achei uma dica boa sobre produtividade",
    "Alguém viu alguma coisa interessante hoje?",
    "Quem mais tá no celular agora? 😅",
    "Bora manter o grupo ativo!",
    "Tá tudo certo por aí?",
  ],
  pergunta: [
    "Como vocês estão organizando a semana?",
    "Alguém tem dica de app bom?",
    "O que vocês acham sobre isso?",
    "Alguém sabe de novidades?",
    "Vocês costumam trabalhar à noite também?",
    "Qual a opinião de vocês?",
    "Alguém já testou isso?",
    "Como vocês fazem pra se organizar?",
    "Alguém aí usa agenda digital?",
    "Qual ferramenta vocês mais usam?",
  ],
  resposta_curta: [
    "Com certeza!",
    "Verdade",
    "Concordo total",
    "Faz sentido isso",
    "Boa!",
    "Exatamente",
    "Tô ligado",
    "Valeu pela dica 👍",
    "Show!",
    "Boa observação",
    "Isso mesmo",
    "É por aí",
    "Demais!",
    "Top 🔥",
  ],
  engajamento: [
    "Pessoal, bora interagir mais no grupo!",
    "Quem concorda dá um 👍",
    "Deixa sua opinião aí!",
    "Quem mais tá por aqui?",
    "Vamos movimentar esse grupo 🚀",
    "Participa aí galera!",
    "Alguém tem algo pra compartilhar?",
    "Bora trocar umas ideias!",
    "O grupo tá quieto, bora animar!",
    "Quem tá online? 🖐",
  ],
  encerramento: [
    "Bom, vou indo pessoal! Até mais 👋",
    "Galera, tô saindo. Até amanhã!",
    "Vou nessa, boa noite pra quem fica!",
    "Até mais pessoal!",
    "Tô saindo, qualquer coisa manda mensagem",
    "Falou galera, até a próxima!",
    "Vou resolver umas coisas aqui. Até!",
    "Boa noite a todos! 🌙",
    "Até amanhã pessoal, descansem!",
    "Vou ficar offline agora. Até! ✌️",
  ],
};

const CATEGORIES_ORDER = ["abertura", "continuacao", "pergunta", "resposta_curta", "engajamento", "continuacao", "encerramento"];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMessage(category: string): string {
  const msgs = MESSAGE_BANK[category] || MESSAGE_BANK.continuacao;
  return pickRandom(msgs);
}

function getCategoryForIndex(i: number, total: number): string {
  if (i === 0) return "abertura";
  if (i === total - 1) return "encerramento";
  const mid = CATEGORIES_ORDER.slice(1, -1);
  return pickRandom(mid);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action, interactionId } = body;

    if (action === "start") {
      // Update status to running
      const { error } = await admin
        .from("group_interactions")
        .update({ status: "running", started_at: new Date().toISOString(), last_error: null })
        .eq("id", interactionId)
        .eq("user_id", user.id);

      if (error) throw error;

      // Start tick processing in background
      EdgeRuntime.waitUntil(processInteraction(admin, interactionId, user.id));

      return new Response(JSON.stringify({ ok: true, status: "running" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "pause") {
      const { error } = await admin
        .from("group_interactions")
        .update({ status: "paused" })
        .eq("id", interactionId)
        .eq("user_id", user.id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, status: "paused" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "stop") {
      const { error } = await admin
        .from("group_interactions")
        .update({ status: "idle", completed_at: new Date().toISOString() })
        .eq("id", interactionId)
        .eq("user_id", user.id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, status: "idle" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "tick") {
      // Process one tick
      await processInteraction(admin, interactionId, user.id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("group-interaction error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function processInteraction(admin: any, interactionId: string, userId: string) {
  try {
    // Fetch config
    const { data: config, error: cfgErr } = await admin
      .from("group_interactions")
      .select("*")
      .eq("id", interactionId)
      .single();

    if (cfgErr || !config) return;
    if (config.status !== "running") return;

    const groupIds: string[] = config.group_ids || [];
    if (groupIds.length === 0) return;

    // Check time window
    const now = new Date();
    const brNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const currentHour = `${String(brNow.getHours()).padStart(2, "0")}:${String(brNow.getMinutes()).padStart(2, "0")}`;
    
    if (currentHour < config.start_hour || currentHour > config.end_hour) {
      return; // Outside operating window
    }

    // Check day of week
    const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const currentDay = dayMap[brNow.getDay()];
    const activeDays: string[] = config.active_days || [];
    if (!activeDays.includes(currentDay)) return;

    // Check duration limit
    if (config.started_at) {
      const startedAt = new Date(config.started_at);
      const maxDurationMs = (config.duration_hours * 60 + config.duration_minutes) * 60 * 1000;
      if (now.getTime() - startedAt.getTime() > maxDurationMs) {
        await admin.from("group_interactions").update({
          status: "completed",
          completed_at: new Date().toISOString(),
        }).eq("id", interactionId);
        return;
      }
    }

    // Get device for sending
    let device = null;
    if (config.device_id) {
      const { data: d } = await admin
        .from("devices")
        .select("id, name, uazapi_token, uazapi_base_url, status")
        .eq("id", config.device_id)
        .single();
      device = d;
    }

    if (!device || !device.uazapi_token || !device.uazapi_base_url) {
      await admin.from("group_interactions").update({
        last_error: "Nenhum dispositivo válido configurado",
      }).eq("id", interactionId);
      return;
    }

    // Count today's messages
    const todayStart = new Date(brNow);
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayTotal } = await admin
      .from("group_interaction_logs")
      .select("*", { count: "exact", head: true })
      .eq("interaction_id", interactionId)
      .gte("sent_at", todayStart.toISOString());

    if ((todayTotal || 0) >= config.daily_limit_total) {
      return; // Daily limit reached
    }

    // Determine how many messages to send in this cycle
    const cycleSize = randomBetween(config.messages_per_cycle_min, config.messages_per_cycle_max);
    const remainingToday = config.daily_limit_total - (todayTotal || 0);
    const toSend = Math.min(cycleSize, remainingToday);

    // Shuffle groups for this cycle
    const shuffledGroups = [...groupIds].sort(() => Math.random() - 0.5);
    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");

    let messagesSent = 0;
    let consecutiveMessages = 0;
    const pauseAfter = randomBetween(config.pause_after_messages_min, config.pause_after_messages_max);

    for (let i = 0; i < toSend; i++) {
      // Re-check status
      const { data: current } = await admin
        .from("group_interactions")
        .select("status")
        .eq("id", interactionId)
        .single();

      if (!current || current.status !== "running") break;

      // Check per-group daily limit
      const groupId = shuffledGroups[i % shuffledGroups.length];
      const { count: groupToday } = await admin
        .from("group_interaction_logs")
        .select("*", { count: "exact", head: true })
        .eq("interaction_id", interactionId)
        .eq("group_id", groupId)
        .gte("sent_at", todayStart.toISOString());

      if ((groupToday || 0) >= config.daily_limit_per_group) continue;

      const category = getCategoryForIndex(i, toSend);
      const messageText = generateMessage(category);

      // Send message via uazapi
      try {
        const resp = await fetch(`${baseUrl}/send/text`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: device.uazapi_token,
          },
          body: JSON.stringify({ number: groupId, text: messageText }),
        });

        const logStatus = resp.ok ? "sent" : "failed";
        const errorMsg = resp.ok ? null : `HTTP ${resp.status}`;

        await admin.from("group_interaction_logs").insert({
          interaction_id: interactionId,
          user_id: userId,
          group_id: groupId,
          message_content: messageText,
          message_category: category,
          device_id: device.id,
          status: logStatus,
          error_message: errorMsg,
          pause_applied_seconds: 0,
        });

        if (resp.ok) {
          messagesSent++;
          consecutiveMessages++;

          // Update total
          await admin.from("group_interactions").update({
            total_messages_sent: config.total_messages_sent + messagesSent,
            updated_at: new Date().toISOString(),
          }).eq("id", interactionId);
        }
      } catch (sendErr: any) {
        await admin.from("group_interaction_logs").insert({
          interaction_id: interactionId,
          user_id: userId,
          group_id: groupId,
          message_content: messageText,
          message_category: category,
          device_id: device.id,
          status: "failed",
          error_message: sendErr.message,
        });
      }

      // Apply delay
      const delay = randomBetween(config.min_delay_seconds, config.max_delay_seconds);
      await new Promise((r) => setTimeout(r, delay * 1000));

      // Apply longer pause after block of messages
      if (consecutiveMessages >= pauseAfter) {
        const bigPause = randomBetween(config.pause_duration_min, config.pause_duration_max);
        await new Promise((r) => setTimeout(r, bigPause * 1000));
        consecutiveMessages = 0;
      }
    }
  } catch (err: any) {
    console.error("processInteraction error:", err);
    await admin.from("group_interactions").update({
      last_error: err.message,
    }).eq("id", interactionId).catch(() => {});
  }
}
