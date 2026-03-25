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

import { createClient } from "npm:@supabase/supabase-js@2";

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

// ══════════════════════════════════════════════════════════
// FALLBACK MESSAGE BANKS (used only if user has no warmup_messages)
// ══════════════════════════════════════════════════════════

const FALLBACK_MESSAGES = [
  "Opa, tudo certo?", "Bom dia, como você tá?", "E aí, tranquilo?",
  "Fala, tudo bem?", "Tudo certo por aqui", "Tô bem sim, e você?",
  "Correria de sempre haha", "De boa, graças a Deus",
  "Hoje tá puxado hein", "Já almoçou?", "Como foi seu dia?",
  "Depois falamos", "Vou resolver umas coisas aqui", "Te chamo mais tarde",
  "E aí, beleza?", "Aqui tá suave", "Tudo joia, valeu por perguntar",
  "Tá chovendo aí?", "Esse calor tá demais né", "Tô precisando de férias",
];

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
    } catch (e: any) {
      lastErr = `${ep.path}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { ok: false, error: lastErr };
}

// ══════════════════════════════════════════════════════════
// FETCH USER MESSAGES FROM DATABASE
// ══════════════════════════════════════════════════════════

async function getUserMessages(admin: any, userId: string): Promise<string[]> {
  const { data, error } = await admin.from("warmup_messages")
    .select("content")
    .eq("user_id", userId);

  if (error || !data || data.length === 0) {
    console.log("No warmup_messages found for user, using fallback");
    return FALLBACK_MESSAGES;
  }

  return data.map((m: any) => m.content).filter((c: string) => c && c.trim().length > 0);
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

    // For tick action, validate via anon key in Authorization header
    if (action === "tick") {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
      const authHeader = req.headers.get("authorization") ?? "";
      const bearerToken = authHeader.replace("Bearer ", "");
      if (!anonKey || bearerToken !== anonKey) {
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
      case "delete":
        return await handleDelete(admin, user.id, conversation_id);
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
  } catch (e: any) {
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

async function handleDelete(admin: any, userId: string, conversationId: string) {
  await admin.from("chip_conversation_logs")
    .delete()
    .eq("conversation_id", conversationId);

  const { error } = await admin.from("chip_conversations")
    .delete()
    .eq("id", conversationId)
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

  // Fire first tick IMMEDIATELY (not delayed)
  fireTickNow(conversationId);

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

  // Fire tick immediately on resume too
  fireTickNow(conversationId);
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

  // Check time window (supports dual windows: "08:00,13:00" / "12:00,19:00")
  const nowBrt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const currentHour = nowBrt.getHours();
  const currentMinute = nowBrt.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const startParts = String(conv.start_hour || "08:00").split(",").map((s: string) => s.trim());
  const endParts = String(conv.end_hour || "18:00").split(",").map((s: string) => s.trim());

  let insideWindow = false;
  for (let i = 0; i < startParts.length; i++) {
    const [sH, sM] = startParts[i].split(":").map(Number);
    const [eH, eM] = (endParts[i] || endParts[0]).split(":").map(Number);
    const startTime = sH * 60 + sM;
    const endTime = eH * 60 + eM;
    if (currentTime >= startTime && currentTime < endTime) {
      insideWindow = true;
      break;
    }
  }

  if (!insideWindow) {
    // Still schedule next tick so it checks again later
    scheduleNextTick(conversationId, randInt(60, 120));
    return json({ ok: true, skipped: true, reason: "outside_hours" });
  }

  // Check active days
  const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const today = dayMap[nowBrt.getDay()];
  const activeDays = conv.active_days as string[];
  if (!activeDays.includes(today)) {
    return json({ ok: true, skipped: true, reason: "inactive_day" });
  }

  // ── Fetch user messages from warmup_messages table ──
  const userMessages = await getUserMessages(admin, conv.user_id);
  if (userMessages.length === 0) {
    await admin.from("chip_conversations")
      .update({ status: "paused", last_error: "Nenhuma mensagem cadastrada. Adicione mensagens no banco de mensagens." })
      .eq("id", conversationId);
    return json({ error: "No messages available" }, 400);
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
  const messagesThisCycle = randInt(6, 16);
  
  // Create conversation pairs — rotate who starts
  const pairs = generateConversationPairs(activeDevices);
  
  let totalSent = 0;
  let lastError = null;

  for (const pair of pairs) {
    if (totalSent >= messagesThisCycle) break;

    // Generate a mini-conversation between this pair
    const conversationLength = randInt(3, Math.min(8, messagesThisCycle - totalSent));

    let msgIndex = 0;
    for (let i = 0; i < conversationLength; i++) {
      if (totalSent >= messagesThisCycle) break;

      // Alternate sender/receiver
      const sender = msgIndex % 2 === 0 ? pair.a : pair.b;
      const receiver = msgIndex % 2 === 0 ? pair.b : pair.a;

      // Pick a random message from the user's bank
      const messageText = pickRandom(userMessages);

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
        messageText
      );

      // Log
      await admin.from("chip_conversation_logs").insert({
        conversation_id: conversationId,
        user_id: conv.user_id,
        sender_device_id: sender.id,
        receiver_device_id: receiver.id,
        sender_name: sender.name,
        receiver_name: receiver.name,
        message_content: messageText,
        message_category: "general",
        status: result.ok ? "sent" : "failed",
        error_message: result.ok ? null : result.error,
      });

      if (result.ok) {
        totalSent++;
      } else {
        lastError = result.error;
      }

      msgIndex++;

      // Small natural pause between messages in same conversation
      if (msgIndex > 0 && msgIndex % randInt(4, 8) === 0) {
        await new Promise(r => setTimeout(r, randInt(3000, 8000)));
      }
    }

    // Inter-conversation pause (capped to avoid timeout)
    const interPause = randInt(10, 30) * 1000;
    await new Promise(r => setTimeout(r, Math.min(interPause, 15000)));
  }

  // Update total
  await admin.from("chip_conversations")
    .update({
      total_messages_sent: (conv.total_messages_sent || 0) + totalSent,
      last_error: lastError,
    })
    .eq("id", conversationId);

  // Schedule next tick with moderate delay
  scheduleNextTick(conversationId, randInt(60, 180));

  return json({ ok: true, messages_sent: totalSent });
}

function generateConversationPairs(devices: any[]): Array<{ a: any; b: any }> {
  const pairs: Array<{ a: any; b: any }> = [];
  const shuffled = [...devices].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < shuffled.length - 1; i += 2) {
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

// ══════════════════════════════════════════════════════════
// TICK SCHEDULING
// ══════════════════════════════════════════════════════════

/** Fire a tick immediately (no delay), used on start/resume */
function fireTickNow(conversationId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

  // Fire without waiting (setTimeout 0 to not block response)
  setTimeout(async () => {
    try {
      await fetch(`${supabaseUrl}/functions/v1/chip-conversation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ action: "tick", conversation_id: conversationId }),
      });
    } catch (e: any) {
      console.error("Failed to fire immediate tick:", e);
    }
  }, 500);
}

/** Schedule next tick with a delay in seconds */
function scheduleNextTick(conversationId: string, delaySec: number) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

  const delayMs = Math.min(delaySec * 1000, 25000); // Cap at 25s (edge function timeout)

  setTimeout(async () => {
    try {
      await fetch(`${supabaseUrl}/functions/v1/chip-conversation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ action: "tick", conversation_id: conversationId }),
      });
    } catch (e: any) {
      console.error("Failed to schedule next tick:", e);
    }
  }, delayMs);
}
