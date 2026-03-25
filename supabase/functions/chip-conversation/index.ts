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

/** Clean phone number to digits only (e.g. "+55 62 8240-1096" → "556282401096") */
function cleanNumber(num: string): string {
  return num.replace(/[^0-9]/g, "");
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
  // Always clean the number before sending
  const cleanNum = cleanNumber(number);
  console.log(`[SEND] To: ${cleanNum} via ${baseUrl} | msg: "${text.substring(0, 50)}"`);

  const endpoints = [
    { path: "/send/text", body: { number: cleanNum, text } },
    { path: "/chat/send-text", body: { number: cleanNum, to: cleanNum, body: text, text } },
    { path: "/message/sendText", body: { chatId: cleanNum, text } },
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
      console.log(`[SEND] ${ep.path} → ${res.status}: ${raw.substring(0, 200)}`);
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
      console.error(`[SEND] Error ${ep.path}:`, lastErr);
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

  const msgs = data.map((m: any) => m.content).filter((c: string) => c && c.trim().length > 0);
  console.log(`Found ${msgs.length} user messages in warmup_messages`);
  return msgs.length > 0 ? msgs : FALLBACK_MESSAGES;
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

    console.log(`[chip-conversation] action=${action} conv=${conversation_id}`);

    // For tick action, validate via anon key in Authorization header
    if (action === "tick") {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
      const authHeader = req.headers.get("authorization") ?? "";
      const bearerToken = authHeader.replace("Bearer ", "");
      if (!anonKey || bearerToken !== anonKey) {
        console.error("[tick] Unauthorized - anon key mismatch");
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

  // Fire first tick immediately — don't use setTimeout, call directly via fetch
  console.log("[start] Firing immediate tick for", conversationId);
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
  console.log("[tick] Starting for conversation:", conversationId);

  const { data: conv, error } = await admin.from("chip_conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (error || !conv) {
    console.error("[tick] Conversation not found:", error);
    return json({ error: "Conversa não encontrada" }, 404);
  }
  if (conv.status !== "running") {
    console.log("[tick] Not running, status:", conv.status);
    return json({ ok: true, skipped: true, reason: "not running" });
  }

  // Check time window (supports dual windows: "08:00,13:00" / "12:00,19:00")
  const nowBrt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const currentHour = nowBrt.getHours();
  const currentMinute = nowBrt.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  console.log(`[tick] BRT time: ${currentHour}:${currentMinute} (${currentTime} min)`);

  const startParts = String(conv.start_hour || "08:00").split(",").map((s: string) => s.trim());
  const endParts = String(conv.end_hour || "18:00").split(",").map((s: string) => s.trim());

  let insideWindow = false;
  for (let i = 0; i < startParts.length; i++) {
    const [sH, sM] = startParts[i].split(":").map(Number);
    const [eH, eM] = (endParts[i] || endParts[0]).split(":").map(Number);
    const startTime = sH * 60 + (sM || 0);
    const endTime = eH * 60 + (eM || 0);
    console.log(`[tick] Window ${i}: ${startParts[i]}-${endParts[i] || endParts[0]} (${startTime}-${endTime})`);
    if (currentTime >= startTime && currentTime < endTime) {
      insideWindow = true;
      break;
    }
  }

  if (!insideWindow) {
    console.log("[tick] Outside time window, scheduling retry");
    scheduleNextTick(conversationId, randInt(60, 120));
    return json({ ok: true, skipped: true, reason: "outside_hours" });
  }

  // Check active days
  const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const today = dayMap[nowBrt.getDay()];
  const activeDays = conv.active_days as string[];
  if (!activeDays.includes(today)) {
    console.log("[tick] Inactive day:", today);
    scheduleNextTick(conversationId, randInt(300, 600));
    return json({ ok: true, skipped: true, reason: "inactive_day" });
  }

  // ── Fetch user messages from warmup_messages table ──
  const userMessages = await getUserMessages(admin, conv.user_id);
  if (userMessages.length === 0) {
    await admin.from("chip_conversations")
      .update({ status: "paused", last_error: "Nenhuma mensagem cadastrada." })
      .eq("id", conversationId);
    return json({ error: "No messages available" }, 400);
  }

  // Get devices with their tokens
  const deviceIds = conv.device_ids as string[];
  const { data: devices, error: devErr } = await admin.from("devices")
    .select("id, name, number, uazapi_base_url, uazapi_token")
    .in("id", deviceIds);

  console.log(`[tick] Devices found: ${devices?.length || 0}, error: ${devErr?.message || 'none'}`);

  if (!devices || devices.length < 2) {
    await admin.from("chip_conversations")
      .update({ status: "paused", last_error: "Dispositivos insuficientes ou sem configuração" })
      .eq("id", conversationId);
    return json({ error: "Insufficient devices" }, 400);
  }

  // Filter devices that have API credentials
  const activeDevices = devices.filter((d: any) => d.uazapi_base_url && d.uazapi_token && d.number);
  console.log(`[tick] Active devices (with API): ${activeDevices.length}`);
  for (const d of activeDevices) {
    console.log(`  - ${d.name}: number=${d.number} url=${d.uazapi_base_url?.substring(0, 40)}`);
  }

  if (activeDevices.length < 2) {
    await admin.from("chip_conversations")
      .update({ status: "paused", last_error: "Pelo menos 2 dispositivos precisam ter API configurada e número vinculado" })
      .eq("id", conversationId);
    return json({ error: "Need at least 2 configured devices" }, 400);
  }

  // With 2 devices, just pick A and B
  const shuffled = [...activeDevices].sort(() => Math.random() - 0.5);
  const deviceA = shuffled[0];
  const deviceB = shuffled[1];

  // Send a batch of alternating messages: A→B, B→A, A→B, B→A...
  const messagesThisCycle = randInt(
    conv.messages_per_cycle_min || 4,
    Math.min(conv.messages_per_cycle_max || 10, 12) // cap to avoid timeout
  );
  console.log(`[tick] Will send ${messagesThisCycle} messages between ${deviceA.name} ↔ ${deviceB.name}`);

  let totalSent = 0;
  let lastError: string | null = null;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < messagesThisCycle; i++) {
    // Alternate sender/receiver each message
    const sender = i % 2 === 0 ? deviceA : deviceB;
    const receiver = i % 2 === 0 ? deviceB : deviceA;

    // Short delay between messages (2-8 seconds to stay under timeout)
    if (i > 0) {
      const delay = randInt(2, 8) * 1000;
      console.log(`[tick] Waiting ${delay}ms before message ${i + 1}`);
      await new Promise(r => setTimeout(r, delay));
    }

    // Re-check status every few messages
    if (i > 0 && i % 4 === 0) {
      const { data: freshConv } = await admin.from("chip_conversations")
        .select("status")
        .eq("id", conversationId)
        .single();
      if (!freshConv || freshConv.status !== "running") {
        console.log("[tick] Interrupted by user");
        return json({ ok: true, interrupted: true, messages_sent: totalSent });
      }
    }

    const messageText = pickRandom(userMessages);

    // Send message
    const result = await sendTextMessage(
      sender.uazapi_base_url,
      sender.uazapi_token,
      receiver.number,
      messageText
    );

    // Log with sent_at included
    const logResult = await admin.from("chip_conversation_logs").insert({
      conversation_id: conversationId,
      user_id: conv.user_id,
      sender_device_id: sender.id,
      receiver_device_id: receiver.id,
      sender_name: sender.name,
      receiver_name: receiver.name,
      message_content: messageText,
      message_category: "general",
      status: result.ok ? "sent" : "failed",
      error_message: result.ok ? null : (result.error || "Unknown error"),
      sent_at: new Date().toISOString(),
    });

    if (logResult.error) {
      console.error("[tick] Log insert error:", logResult.error.message);
    }

    if (result.ok) {
      totalSent++;
      console.log(`[tick] ✅ ${sender.name} → ${receiver.name}: "${messageText.substring(0, 30)}"`);
    } else {
      lastError = result.error || "Unknown";
      console.error(`[tick] ❌ ${sender.name} → ${receiver.name}: ${lastError}`);
    }
  }

  // Update total
  await admin.from("chip_conversations")
    .update({
      total_messages_sent: (conv.total_messages_sent || 0) + totalSent,
      last_error: lastError,
    })
    .eq("id", conversationId);

  // Schedule next tick with delay based on user config
  const nextDelay = randInt(conv.min_delay_seconds || 30, conv.max_delay_seconds || 90);
  console.log(`[tick] Done! Sent ${totalSent}/${messagesThisCycle}. Next tick in ${nextDelay}s`);
  scheduleNextTick(conversationId, nextDelay);

  return json({ ok: true, messages_sent: totalSent });
}

// ══════════════════════════════════════════════════════════
// TICK SCHEDULING
// ══════════════════════════════════════════════════════════

/** Fire a tick immediately (no delay), used on start/resume */
function fireTickNow(conversationId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

  // Use setTimeout 0 to not block the current response
  setTimeout(async () => {
    try {
      console.log("[fireTickNow] Calling tick for", conversationId);
      const res = await fetch(`${supabaseUrl}/functions/v1/chip-conversation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ action: "tick", conversation_id: conversationId }),
      });
      const body = await res.text();
      console.log("[fireTickNow] Response:", res.status, body.substring(0, 200));
    } catch (e: any) {
      console.error("[fireTickNow] Failed:", e);
    }
  }, 100);
}

/** Schedule next tick with a delay in seconds */
function scheduleNextTick(conversationId: string, delaySec: number) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

  // Cap delay at 20s to stay within edge function lifetime
  const delayMs = Math.min(delaySec * 1000, 20000);
  console.log(`[scheduleNextTick] Next tick in ${delayMs}ms for ${conversationId}`);

  setTimeout(async () => {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/chip-conversation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ action: "tick", conversation_id: conversationId }),
      });
      console.log("[scheduleNextTick] Tick response:", res.status);
    } catch (e: any) {
      console.error("[scheduleNextTick] Failed:", e);
    }
  }, delayMs);
}
