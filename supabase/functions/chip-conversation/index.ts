/**
 * chip-conversation — Conversa automática entre chips
 * 
 * Actions:
 *   - start: Inicia conversas automáticas entre chips selecionados
 *   - pause: Pausa a execução
 *   - resume: Retoma a execução
 *   - stop: Encerra a conversa
 *   - tick: Processa o próximo ciclo de mensagens (chamado por cron ou self-invoke)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ══════════════════════════════════════════════════════════
// MESSAGE BANKS — Categorized for natural conversation flow
// ══════════════════════════════════════════════════════════

const ABERTURA = [
  "Opa, tudo certo?", "Bom dia, como você tá?", "E aí, tranquilo?",
  "Fala, tudo bem?", "Oi, sumiu hein", "E aí, beleza?",
  "Fala parceiro, suave?", "Opa, como tá?", "Ei, tudo na paz?",
  "Bom dia, como vai?", "Boa tarde, tudo certo?", "E aí mano, como tá?",
  "Fala aí, tudo joia?", "Oi, como andam as coisas?", "Salve, tudo bem?",
  "Eae, tranquilo por aí?", "Oi oi, sumiu hein!", "Fala, quanto tempo!",
  "E aí, como foi o dia?", "Opa, deu pra descansar?",
  "Bom dia, dormiu bem?", "Boa noite, tudo tranquilo?",
  "Fala, como tá a correria?", "E aí, novidades?",
  "Oi, tava pensando em você agora", "Fala, tô precisando de um papo",
];

const RESPOSTA = [
  "Tudo certo por aqui", "Tô bem sim, e você?", "Correria de sempre haha",
  "Indo, e você?", "De boa, graças a Deus", "Tudo tranquilo sim",
  "Aqui tá suave", "Na paz, sem reclamar", "Tudo joia, valeu por perguntar",
  "Tô bem, trabalhando bastante", "Aqui tá de boa, e aí?",
  "Tudo nos conformes", "Bem demais, obrigado", "Na correria mas tudo certo",
  "Tô sobrevivendo kkk", "Aqui tá tranquilo, graças a Deus",
  "Normal, dia a dia né", "Tudo certinho sim", "Seguindo o fluxo",
  "Tô bem, e por aí como tá?", "Suave demais", "Nada demais, tudo normal",
  "Aqui tá tudo em ordem", "Bem, só cansado um pouco",
];

const CONTINUACAO = [
  "Hoje tá puxado hein", "Já almoçou?", "Como foi seu dia?",
  "Tá trabalhando agora?", "O que fez de bom hoje?",
  "Tá com algum plano pro final de semana?", "Vi umas notícias loucas hoje",
  "Esse calor tá demais né", "Tá chovendo aí?",
  "Aqui tá um frio danado hoje", "Já tomou café?",
  "Tô pensando em pedir uma comida", "Que horas são aí?",
  "Você viu aquele jogo ontem?", "Tô precisando de férias",
  "Essa semana tá passando devagar", "Já resolveu aquilo que falou?",
  "Como tá o trânsito aí?", "Tô pensando em mudar de emprego",
  "Preciso organizar umas coisas aqui", "Hoje acordei cedo demais",
  "Tô tentando criar uma rotina melhor", "Esses dias tão voando né",
  "Preciso marcar um médico mas tenho preguiça", "Tá assistindo alguma série?",
  "Aqui o wifi tá uma porcaria hoje", "Faz tempo que não saio pra comer fora",
  "Tô querendo aprender algo novo", "Meu celular tá travando demais",
  "Preciso trocar de operadora", "Você usa qual banco digital?",
  "Tô pensando em começar a academia", "Aqui chegou uma encomenda",
  "O café de hoje tá diferente, botei canela", "Esse mês tá passando rápido",
];

const ENCERRAMENTO = [
  "Depois falamos", "Vou resolver umas coisas aqui",
  "Te chamo mais tarde", "Fechou, até daqui a pouco",
  "Bom, vou voltar pro trabalho", "A gente se fala depois",
  "Preciso ir agora, até mais", "Vou nessa, falamos depois",
  "Bom papo, vou continuar aqui", "Até mais, qualquer coisa chama",
  "Vou almoçar, depois volto", "Tô saindo agora, falamos depois",
  "Bom, preciso resolver umas paradas", "Até logo, boa tarde pra você",
  "Vou descansar um pouco, até", "Falou, boa noite!",
  "Beleza, depois a gente conversa mais", "Vou nessa, abraço!",
];

const EMOJIS = ["🙂", "😂", "😅", "👍", "🙏", "😎", "🤝", "😊", "💯", "👏", "✌️", "😁", "🤗", "👌", "💪", "😃", "🤙", "👋", "😆", "🤣"];

function maybeEmoji(msg: string): string {
  if (Math.random() < 0.55) return msg;
  return `${msg} ${pickRandom(EMOJIS)}`;
}

function generateConversationMessage(category: "abertura" | "resposta" | "continuacao" | "encerramento"): string {
  switch (category) {
    case "abertura": return maybeEmoji(pickRandom(ABERTURA));
    case "resposta": return maybeEmoji(pickRandom(RESPOSTA));
    case "continuacao": return maybeEmoji(pickRandom(CONTINUACAO));
    case "encerramento": return maybeEmoji(pickRandom(ENCERRAMENTO));
  }
}

// ══════════════════════════════════════════════════════════
// UAZAPI COMMUNICATION
// ══════════════════════════════════════════════════════════

async function sendTextMessage(baseUrl: string, token: string, number: string, text: string) {
  const endpoints = [
    { path: "/send/text", body: { number, text } },
    { path: "/chat/send-text", body: { number, to: number, body: text, text } },
    { path: "/message/sendText", body: { chatId: number, text } },
  ];

  let lastErr = "";
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(ep.body),
      });
      const raw = await res.text();
      if (res.ok) {
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          if (parsed?.error || parsed?.code === 404 || parsed?.status === "error") {
            lastErr = `${ep.path}: ${raw.substring(0, 200)}`;
            continue;
          }
          return { ok: true, data: parsed };
        } catch {
          return { ok: true, data: { raw } };
        }
      }
      if (res.status === 405) { lastErr = `405 @ ${ep.path}`; continue; }
      lastErr = `${res.status} @ ${ep.path}: ${raw.substring(0, 200)}`;
    } catch (e) {
      lastErr = `${ep.path}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { ok: false, error: lastErr };
}

// ══════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action, conversation_id } = body;

    // For tick action, validate internal secret
    if (action === "tick") {
      const secret = req.headers.get("x-internal-secret");
      const expectedSecret = Deno.env.get("INTERNAL_TICK_SECRET");
      if (!expectedSecret || secret !== expectedSecret) {
        return json({ error: "Unauthorized" }, 401);
      }
      return await handleTick(admin, conversation_id);
    }

    // For user actions, validate auth
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "Não autorizado" }, 401);

    switch (action) {
      case "create":
        return await handleCreate(admin, user.id, body);
      case "update":
        return await handleUpdate(admin, user.id, body);
      case "start":
        return await handleStart(admin, user.id, conversation_id);
      case "pause":
        return await handlePause(admin, user.id, conversation_id);
      case "resume":
        return await handleResume(admin, user.id, conversation_id);
      case "stop":
        return await handleStop(admin, user.id, conversation_id);
      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    console.error("chip-conversation error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════
// ACTION HANDLERS
// ══════════════════════════════════════════════════════════

async function handleCreate(admin: any, userId: string, body: any) {
  const { data, error } = await admin.from("chip_conversations").insert({
    user_id: userId,
    name: body.name || "Conversa automática",
    device_ids: body.device_ids || [],
    min_delay_seconds: body.min_delay_seconds ?? 15,
    max_delay_seconds: body.max_delay_seconds ?? 60,
    pause_after_messages_min: body.pause_after_messages_min ?? 4,
    pause_after_messages_max: body.pause_after_messages_max ?? 8,
    pause_duration_min: body.pause_duration_min ?? 120,
    pause_duration_max: body.pause_duration_max ?? 300,
    duration_hours: body.duration_hours ?? 1,
    duration_minutes: body.duration_minutes ?? 0,
    start_hour: body.start_hour ?? "08:00",
    end_hour: body.end_hour ?? "18:00",
    messages_per_cycle_min: body.messages_per_cycle_min ?? 10,
    messages_per_cycle_max: body.messages_per_cycle_max ?? 30,
    active_days: body.active_days ?? ["mon", "tue", "wed", "thu", "fri"],
  }).select().single();

  if (error) throw new Error(error.message);
  return json({ ok: true, conversation: data });
}

async function handleUpdate(admin: any, userId: string, body: any) {
  const { conversation_id, ...updates } = body;
  delete updates.action;
  delete updates.user_id;
  delete updates.id;
  delete updates.status;

  const { error } = await admin.from("chip_conversations")
    .update(updates)
    .eq("id", conversation_id)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return json({ ok: true });
}

async function handleStart(admin: any, userId: string, conversationId: string) {
  const { data: conv, error } = await admin.from("chip_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (error || !conv) return json({ error: "Conversa não encontrada" }, 404);
  if (conv.status === "running") return json({ error: "Já está em execução" }, 400);

  const deviceIds = conv.device_ids as string[];
  if (!deviceIds || deviceIds.length < 2) {
    return json({ error: "Selecione pelo menos 2 chips para conversar" }, 400);
  }

  await admin.from("chip_conversations")
    .update({ status: "running", started_at: new Date().toISOString(), completed_at: null, last_error: null })
    .eq("id", conversationId);

  // Schedule first tick immediately
  scheduleNextTick(admin, conversationId);

  return json({ ok: true, status: "running" });
}

async function handlePause(admin: any, userId: string, conversationId: string) {
  await admin.from("chip_conversations")
    .update({ status: "paused" })
    .eq("id", conversationId)
    .eq("user_id", userId);

  return json({ ok: true, status: "paused" });
}

async function handleResume(admin: any, userId: string, conversationId: string) {
  await admin.from("chip_conversations")
    .update({ status: "running", last_error: null })
    .eq("id", conversationId)
    .eq("user_id", userId);

  scheduleNextTick(admin, conversationId);
  return json({ ok: true, status: "running" });
}

async function handleStop(admin: any, userId: string, conversationId: string) {
  await admin.from("chip_conversations")
    .update({ status: "idle", completed_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId);

  return json({ ok: true, status: "idle" });
}

// ══════════════════════════════════════════════════════════
// TICK PROCESSOR — Sends a batch of messages in a conversation
// ══════════════════════════════════════════════════════════

async function handleTick(admin: any, conversationId: string) {
  const { data: conv, error } = await admin.from("chip_conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (error || !conv) return json({ error: "Conversa não encontrada" }, 404);
  if (conv.status !== "running") return json({ ok: true, skipped: true, reason: "not running" });

  // Check time window
  const nowBrt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const currentHour = nowBrt.getHours();
  const currentMinute = nowBrt.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const [startH, startM] = (conv.start_hour as string).split(":").map(Number);
  const [endH, endM] = (conv.end_hour as string).split(":").map(Number);
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;

  if (currentTime < startTime || currentTime >= endTime) {
    // Outside operating window, schedule for next day
    return json({ ok: true, skipped: true, reason: "outside_hours" });
  }

  // Check active days
  const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const today = dayMap[nowBrt.getDay()];
  const activeDays = conv.active_days as string[];
  if (!activeDays.includes(today)) {
    return json({ ok: true, skipped: true, reason: "inactive_day" });
  }

  // Check duration limit
  if (conv.started_at) {
    const startedAt = new Date(conv.started_at).getTime();
    const durationMs = ((conv.duration_hours * 60) + conv.duration_minutes) * 60 * 1000;
    if (Date.now() - startedAt >= durationMs) {
      await admin.from("chip_conversations")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", conversationId);
      return json({ ok: true, completed: true, reason: "duration_reached" });
    }
  }

  // Get devices with their tokens
  const deviceIds = conv.device_ids as string[];
  const { data: devices } = await admin.from("devices")
    .select("id, name, number, uazapi_base_url, uazapi_token")
    .in("id", deviceIds);

  if (!devices || devices.length < 2) {
    await admin.from("chip_conversations")
      .update({ status: "paused", last_error: "Dispositivos insuficientes ou sem configuração" })
      .eq("id", conversationId);
    return json({ error: "Insufficient devices" }, 400);
  }

  // Filter devices that have API credentials
  const activeDevices = devices.filter((d: any) => d.uazapi_base_url && d.uazapi_token && d.number);
  if (activeDevices.length < 2) {
    await admin.from("chip_conversations")
      .update({ status: "paused", last_error: "Pelo menos 2 dispositivos precisam ter API configurada e número vinculado" })
      .eq("id", conversationId);
    return json({ error: "Need at least 2 configured devices" }, 400);
  }

  // Determine how many messages in this cycle
  const messagesThisCycle = randInt(conv.messages_per_cycle_min, conv.messages_per_cycle_max);
  
  // Create conversation pairs — rotate who starts
  const pairs = generateConversationPairs(activeDevices);
  
  let totalSent = 0;
  let lastError = null;

  for (const pair of pairs) {
    if (totalSent >= messagesThisCycle) break;

    // Generate a mini-conversation between this pair
    const conversationLength = randInt(4, Math.min(10, messagesThisCycle - totalSent));
    const messages = generateConversationFlow(conversationLength);

    let msgIndex = 0;
    for (const msg of messages) {
      if (totalSent >= messagesThisCycle) break;

      // Alternate sender/receiver
      const sender = msgIndex % 2 === 0 ? pair.a : pair.b;
      const receiver = msgIndex % 2 === 0 ? pair.b : pair.a;

      // Wait delay before sending
      const delay = randInt(conv.min_delay_seconds, conv.max_delay_seconds) * 1000;
      await new Promise(r => setTimeout(r, delay));

      // Re-check status (user might have paused)
      const { data: freshConv } = await admin.from("chip_conversations")
        .select("status")
        .eq("id", conversationId)
        .single();
      
      if (!freshConv || freshConv.status !== "running") {
        return json({ ok: true, interrupted: true, messages_sent: totalSent });
      }

      // Send message
      const result = await sendTextMessage(
        sender.uazapi_base_url,
        sender.uazapi_token,
        receiver.number,
        msg.text
      );

      // Log
      await admin.from("chip_conversation_logs").insert({
        conversation_id: conversationId,
        user_id: conv.user_id,
        sender_device_id: sender.id,
        receiver_device_id: receiver.id,
        sender_name: sender.name,
        receiver_name: receiver.name,
        message_content: msg.text,
        message_category: msg.category,
        status: result.ok ? "sent" : "failed",
        error_message: result.ok ? null : result.error,
      });

      if (result.ok) {
        totalSent++;
      } else {
        lastError = result.error;
      }

      msgIndex++;

      // Bigger pause after N messages
      if (msgIndex > 0 && msgIndex % randInt(conv.pause_after_messages_min, conv.pause_after_messages_max) === 0) {
        const bigPause = randInt(conv.pause_duration_min, conv.pause_duration_max) * 1000;
        await new Promise(r => setTimeout(r, Math.min(bigPause, 30000))); // cap at 30s in edge function
      }
    }

    // Inter-conversation pause
    const interPause = randInt(30, 90) * 1000;
    await new Promise(r => setTimeout(r, Math.min(interPause, 20000)));
  }

  // Update total
  await admin.from("chip_conversations")
    .update({
      total_messages_sent: (conv.total_messages_sent || 0) + totalSent,
      last_error: lastError,
    })
    .eq("id", conversationId);

  // Schedule next tick
  scheduleNextTick(admin, conversationId);

  return json({ ok: true, messages_sent: totalSent });
}

function generateConversationPairs(devices: any[]): Array<{ a: any; b: any }> {
  const pairs: Array<{ a: any; b: any }> = [];
  const shuffled = [...devices].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    // Randomly decide who starts
    if (Math.random() < 0.5) {
      pairs.push({ a: shuffled[i], b: shuffled[i + 1] });
    } else {
      pairs.push({ a: shuffled[i + 1], b: shuffled[i] });
    }
  }
  
  // If odd number, last device pairs with a random one
  if (shuffled.length % 2 !== 0) {
    const lastDevice = shuffled[shuffled.length - 1];
    const partner = shuffled[randInt(0, shuffled.length - 2)];
    pairs.push({ a: lastDevice, b: partner });
  }
  
  return pairs;
}

function generateConversationFlow(length: number): Array<{ text: string; category: string }> {
  const messages: Array<{ text: string; category: string }> = [];
  
  for (let i = 0; i < length; i++) {
    let category: "abertura" | "resposta" | "continuacao" | "encerramento";
    
    if (i === 0) {
      category = "abertura";
    } else if (i === 1) {
      category = "resposta";
    } else if (i === length - 1) {
      category = "encerramento";
    } else {
      // Mix of continuação and resposta
      category = Math.random() < 0.6 ? "continuacao" : "resposta";
    }
    
    messages.push({
      text: generateConversationMessage(category),
      category,
    });
  }
  
  return messages;
}

async function scheduleNextTick(admin: any, conversationId: string) {
  // Self-invoke after a random delay (2-5 minutes)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  
  const delayMs = randInt(120, 300) * 1000;
  
  // Use setTimeout to not block the response
  setTimeout(async () => {
    try {
      await fetch(`${supabaseUrl}/functions/v1/chip-conversation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
          "x-internal-secret": Deno.env.get("INTERNAL_TICK_SECRET") || "",
        },
        body: JSON.stringify({ action: "tick", conversation_id: conversationId }),
      });
    } catch (e) {
      console.error("Failed to schedule next tick:", e);
    }
  }, Math.min(delayMs, 25000)); // Edge function timeout safety
}
