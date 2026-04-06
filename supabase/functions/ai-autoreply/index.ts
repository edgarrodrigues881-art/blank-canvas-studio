import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const {
      user_id,
      conversation_id,
      device_id,
      remote_jid,
      contact_name,
      message_content,
      media_type,
    } = body;

    if (!user_id || !conversation_id) {
      return json({ error: "user_id and conversation_id required" }, 400);
    }

    // 1. Fetch AI settings for this user
    const { data: settings } = await admin
      .from("ai_settings")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (!settings || !settings.ia_active) {
      return json({ skipped: "ai_not_active" });
    }

    if (!settings.api_key) {
      return json({ skipped: "no_api_key" });
    }

    // 2. Check if a human is actively attending
    const { data: conv } = await admin
      .from("conversations")
      .select("assigned_to, attending_status")
      .eq("id", conversation_id)
      .single();

    if (conv?.assigned_to) {
      console.log("Human is assigned, AI will not respond");
      return json({ skipped: "human_assigned" });
    }

    // 3. Check pause words — if the incoming message contains a pause word, skip
    const pauseWords = (settings.pause_words || "")
      .split(",")
      .map((w: string) => w.trim().toLowerCase())
      .filter(Boolean);

    const msgLower = (message_content || "").toLowerCase();
    if (pauseWords.some((w: string) => msgLower.includes(w))) {
      console.log("Pause word detected, skipping AI");
      // Auto-transfer to human if configured
      if (settings.auto_transfer_human) {
        await admin
          .from("conversations")
          .update({ attending_status: "aguardando" })
          .eq("id", conversation_id);
      }
      return json({ skipped: "pause_word_detected" });
    }

    // 4. Handle media fallbacks
    if (media_type === "image" || media_type === "sticker") {
      const fallback = settings.fallback_image || "Não consigo ver imagens, pode descrever por texto?";
      await sendAiReply(admin, supabaseUrl, serviceKey, conversation_id, user_id, device_id, remote_jid, fallback, settings);
      return json({ sent: true, type: "fallback_image" });
    }

    if (media_type === "audio" || media_type === "ptt") {
      const fallback = settings.fallback_audio || "Não consigo ouvir áudios, pode escrever?";
      await sendAiReply(admin, supabaseUrl, serviceKey, conversation_id, user_id, device_id, remote_jid, fallback, settings);
      return json({ sent: true, type: "fallback_audio" });
    }

    if (media_type === "video") {
      await sendAiReply(admin, supabaseUrl, serviceKey, conversation_id, user_id, device_id, remote_jid, "Não consigo assistir vídeos, pode descrever?", settings);
      return json({ sent: true, type: "fallback_video" });
    }

    if (media_type === "document") {
      await sendAiReply(admin, supabaseUrl, serviceKey, conversation_id, user_id, device_id, remote_jid, "Não consigo abrir documentos, pode resumir o conteúdo?", settings);
      return json({ sent: true, type: "fallback_document" });
    }

    // 5. Build conversation history for context
    let conversationHistory: { role: string; content: string }[] = [];
    if (settings.conversation_memory) {
      const { data: history } = await admin
        .from("conversation_messages")
        .select("direction, content, responded_by")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true })
        .limit(20);

      if (history) {
        conversationHistory = history
          .filter((m: any) => m.content && m.content.trim())
          .map((m: any) => ({
            role: m.direction === "received" ? "user" : "assistant",
            content: m.content,
          }));
      }
    }

    // 6. Build system prompt
    const toneMap: Record<string, string> = {
      friendly: "Seja amigável, caloroso e use emojis com moderação.",
      professional: "Seja profissional, educado e objetivo.",
      direct: "Seja direto ao ponto, sem rodeios.",
    };

    const lengthMap: Record<string, string> = {
      short: "Responda de forma curta, máximo 2-3 frases.",
      medium: "Responda de forma equilibrada, 3-5 frases.",
      detailed: "Responda de forma detalhada quando necessário.",
    };

    const systemParts = [
      `Você é um assistente virtual de atendimento ao cliente.`,
      toneMap[settings.tone] || toneMap.professional,
      lengthMap[settings.response_style] || lengthMap.medium,
      settings.business_name ? `Você atende pela empresa "${settings.business_name}".` : "",
      settings.business_type ? `Tipo de negócio: ${settings.business_type}.` : "",
      settings.business_hours ? `Horário de atendimento: ${settings.business_hours}.` : "",
      settings.business_description ? `Descrição: ${settings.business_description}.` : "",
      settings.ai_instructions ? `Instruções adicionais: ${settings.ai_instructions}` : "",
      contact_name ? `O nome do cliente é "${contact_name}". Use o nome dele quando apropriado para personalizar.` : "",
      `REGRAS IMPORTANTES:`,
      `- Responda de forma natural como um atendente humano`,
      `- Evite respostas longas demais`,
      `- Se não souber a resposta, diga que vai verificar e retornar`,
      `- Nunca invente informações sobre produtos, preços ou disponibilidade`,
      settings.require_human_for_sale ? `- Para vendas ou negociações, sugira que um atendente humano pode ajudar melhor` : "",
      settings.block_sensitive ? `- Nunca compartilhe dados sensíveis como CPF, senhas ou dados bancários` : "",
    ].filter(Boolean).join("\n");

    // 7. Call OpenAI
    const messages = [
      { role: "system", content: systemParts },
      ...conversationHistory,
      { role: "user", content: message_content },
    ];

    const temperature = (settings.creativity || 50) / 100;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.ai_model || "gpt-4o-mini",
        messages,
        temperature,
        max_tokens: settings.max_response_length === "short" ? 150 : settings.max_response_length === "detailed" ? 800 : 400,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI error:", openaiRes.status, errText);
      return json({ error: "OpenAI API error", status: openaiRes.status }, 500);
    }

    const aiData = await openaiRes.json();
    let aiReply = aiData.choices?.[0]?.message?.content?.trim() || "";

    if (!aiReply) {
      return json({ skipped: "empty_ai_response" });
    }

    // 8. Apply delay (simulate typing)
    if (settings.simulate_typing) {
      const minDelay = (settings.min_delay_seconds || 1) * 1000;
      const maxDelay = (settings.max_delay_seconds || 3) * 1000;
      const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      await new Promise((r) => setTimeout(r, delay));
    }

    // 9. Split long messages if enabled
    if (settings.split_long_messages && aiReply.length > 300) {
      const parts = splitMessage(aiReply);
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          // Small delay between parts
          await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
        }
        await sendAiReply(admin, supabaseUrl, serviceKey, conversation_id, user_id, device_id, remote_jid, parts[i], settings);
      }
    } else {
      await sendAiReply(admin, supabaseUrl, serviceKey, conversation_id, user_id, device_id, remote_jid, aiReply, settings);
    }

    return json({ sent: true, type: "ai_response" });
  } catch (err: any) {
    console.error("ai-autoreply error:", err);
    return json({ error: err.message || "Erro interno" }, 500);
  }
});

function splitMessage(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length > 280 && current) {
      parts.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.length > 0 ? parts : [text];
}

async function sendAiReply(
  admin: any,
  supabaseUrl: string,
  serviceKey: string,
  conversationId: string,
  userId: string,
  deviceId: string,
  remoteJid: string,
  content: string,
  settings: any,
) {
  // Insert message in DB first
  const { data: msg } = await admin.from("conversation_messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    remote_jid: remoteJid,
    content,
    direction: "sent",
    status: "sending",
    responded_by: "ai",
    is_ai_response: true,
  }).select("id").single();

  // Send via chat-send edge function
  try {
    const sendRes = await fetch(`${supabaseUrl}/functions/v1/chat-send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        content,
        message_id: msg?.id,
      }),
    });

    const sendData = await sendRes.json();
    if (!sendData.sent && msg?.id) {
      await admin.from("conversation_messages").update({ status: "failed" }).eq("id", msg.id);
    }
  } catch (err) {
    console.error("Failed to send AI reply:", err);
    if (msg?.id) {
      await admin.from("conversation_messages").update({ status: "failed" }).eq("id", msg.id);
    }
  }

  // Update conversation
  await admin.from("conversations").update({
    last_message: content.substring(0, 500),
    last_message_at: new Date().toISOString(),
  }).eq("id", conversationId);
}
