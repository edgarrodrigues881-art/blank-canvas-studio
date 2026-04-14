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

/** Map provider to API endpoint */
function getProviderConfig(provider: string, apiKey: string, model: string) {
  switch (provider) {
    case "gemini":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        model: model || "gemini-2.5-flash",
      };
    case "deepseek":
      return {
        url: "https://api.deepseek.com/v1/chat/completions",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        model: model || "deepseek-chat",
      };
    case "groq":
      return {
        url: "https://api.groq.com/openai/v1/chat/completions",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        model: model || "llama-3.3-70b-versatile",
      };
    case "openai":
    default:
      return {
        url: "https://api.openai.com/v1/chat/completions",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        model: model || "gpt-4o-mini",
      };
  }
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

    // 2. Check if sender is a device in the system (warmup/internal number)
    if (remote_jid) {
      const senderDigits = remote_jid.replace(/@.*/, "").replace(/\D/g, "");
      if (senderDigits.length >= 8) {
        const last8 = senderDigits.slice(-8);
        // Check with and without 9th digit variants
        const { data: matchedDevice } = await admin
          .from("devices")
          .select("id")
          .or(`number.like.%${last8}%`)
          .limit(1)
          .maybeSingle();

        if (matchedDevice) {
          console.log(`Skipping AI: sender ${senderDigits} is a registered device (warmup/internal)`);
          return json({ skipped: "internal_device" });
        }
      }
    }

    // 3. Check if a human is actively attending
    const { data: conv } = await admin
      .from("conversations")
      .select("assigned_to, attending_status")
      .eq("id", conversation_id)
      .single();

    if (conv?.assigned_to) {
      console.log("Human is assigned, AI will not respond");
      return json({ skipped: "human_assigned" });
    }

    // 3. Check pause words
    const pauseWords = (settings.pause_words || "")
      .split(",")
      .map((w: string) => w.trim().toLowerCase())
      .filter(Boolean);

    const msgLower = (message_content || "").toLowerCase();
    if (pauseWords.some((w: string) => msgLower.includes(w))) {
      console.log("Pause word detected, skipping AI");
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

    // 5. Load/update lead memory
    const leadMemory = await loadOrCreateLeadMemory(admin, user_id, remote_jid, contact_name, message_content);

    // 5b. Load CRM context (service_contacts + pipeline)
    let crmContext = "";
    const phoneDigits = (remote_jid || "").replace(/\D/g, "").slice(-8);
    if (phoneDigits) {
      const { data: sc } = await admin
        .from("service_contacts")
        .select("name, company, origin, lead_temperature, pipeline_stage, tags, notes")
        .eq("user_id", user_id)
        .like("phone", `%${phoneDigits}%`)
        .limit(1)
        .maybeSingle();
      if (sc) {
        const parts = [
          sc.company ? `Empresa do cliente: ${sc.company}` : "",
          sc.origin ? `Origem: ${sc.origin}` : "",
          sc.lead_temperature ? `Temperatura no CRM: ${sc.lead_temperature}` : "",
          sc.pipeline_stage ? `Pipeline: ${sc.pipeline_stage}` : "",
          sc.tags?.length ? `Tags: ${sc.tags.join(", ")}` : "",
          sc.notes ? `Notas do operador: ${sc.notes}` : "",
        ].filter(Boolean);
        if (parts.length) crmContext = `\nCONTEXTO DO CRM:\n${parts.join("\n")}`;
      }
    }

    // 6. Build conversation history for context
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

    // 7. Build system prompt
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

    const flowSteps = settings.ai_instructions?.match(/FLOW_STEPS:(.*?)END_FLOW_STEPS/s)?.[1] || "";

    const systemParts = [
      `Você é um assistente virtual de atendimento ao cliente.`,
      toneMap[settings.tone] || toneMap.professional,
      lengthMap[settings.response_style] || lengthMap.medium,
      settings.business_name ? `Você atende pela empresa "${settings.business_name}".` : "",
      settings.business_type ? `Tipo de negócio: ${settings.business_type}.` : "",
      settings.business_hours ? `Horário de atendimento: ${settings.business_hours}.` : "",
      settings.business_description ? `Descrição: ${settings.business_description}.` : "",
      settings.ai_instructions ? `Instruções adicionais: ${settings.ai_instructions.replace(/FLOW_STEPS:.*?END_FLOW_STEPS/s, "").trim()}` : "",
      leadMemory.contact_name ? `O nome do cliente é "${leadMemory.contact_name}". Use o nome dele quando apropriado para personalizar.` : (contact_name ? `O nome do cliente é "${contact_name}".` : ""),
      leadMemory.interest ? `O cliente demonstrou interesse em: "${leadMemory.interest}". Referencie isso naturalmente.` : "",
      leadMemory.product_cited ? `O cliente mencionou o produto/serviço: "${leadMemory.product_cited}".` : "",
      leadMemory.stage === "hot" ? `Este é um lead QUENTE (${leadMemory.interaction_count} interações). Seja mais direto e conduza para conversão.` : "",
      leadMemory.stage === "warm" ? `Este é um lead MORNO (${leadMemory.interaction_count} interações). Aprofunde o interesse e apresente benefícios.` : "",
      leadMemory.stage === "cold" ? `Este é um lead FRIO (primeiro contato ou poucas interações). Seja acolhedor e descubra a necessidade.` : "",
      crmContext,
      `DETECÇÃO DE INTENÇÃO:`,
      `Antes de responder, analise a mensagem do cliente e classifique a intenção:`,
      `- "curious": Está apenas explorando, sem compromisso.`,
      `- "interested": Demonstra interesse real. Faz perguntas específicas.`,
      `- "ready_to_buy": Quer comprar/agendar/fechar agora.`,
      `- "objection": Tem dúvida, preocupação ou barreira.`,
      ``,
      `FLUXO DE CONVERSÃO INTELIGENTE:`,
      `Com base na intenção detectada, escolha a etapa adequada:`,
      `- curious → "saudacao" ou "diagnostico"`,
      `- interested → "diagnostico" ou "apresentacao"`,
      `- ready_to_buy → "fechamento"`,
      `- objection → "objecao"`,
      ``,
      flowSteps ? `MENSAGENS-BASE POR ETAPA:\n${flowSteps}` : "",
      ``,
      `DETECÇÃO DE AGENDAMENTO:`,
      `Se o cliente concordar com uma data/hora para reunião, retorno ou follow-up, extraia os dados.`,
      `Inclua no final da resposta: <!--SCHEDULE:{"date":"YYYY-MM-DD","time":"HH:mm","type":"reuniao|followup|retorno","summary":"descrição curta"}-->`,
      `- "date": data combinada no formato YYYY-MM-DD. Se o cliente disser "amanhã", calcule a data real.`,
      `- "time": horário combinado no formato HH:mm (24h). Se não especificar, use 09:00.`,
      `- "type": reuniao (encontro/call), followup (acompanhamento), retorno (ligar de volta).`,
      `- "summary": breve descrição do compromisso.`,
      `- A data de hoje é: ${new Date().toISOString().split("T")[0]}.`,
      `- Só inclua <!--SCHEDULE:--> se o cliente CONFIRMAR uma data específica. Não agende por suposição.`,
      `- Após agendar, confirme a data/hora na sua resposta ao cliente de forma natural.`,
      ``,
      `REGRAS IMPORTANTES:`,
      `- Responda de forma natural como um atendente humano`,
      `- Evite respostas longas demais`,
      `- Se não souber a resposta, peça mais contexto`,
      `- Nunca invente informações sobre produtos, preços ou disponibilidade`,
      `- Ao final da resposta, inclua: <!--LEAD_UPDATE:{"interest":"...","stage":"cold|warm|hot","intent":"curious|interested|ready_to_buy|objection","flow_step":"saudacao|diagnostico|apresentacao|objecao|fechamento","product_cited":"..."}-->`,
      settings.require_human_for_sale ? `- Para vendas, sugira que um atendente humano pode ajudar melhor` : "",
      settings.block_sensitive ? `- Nunca compartilhe dados sensíveis como CPF, senhas ou dados bancários` : "",
    ].filter(Boolean).join("\n");

    // 8. Call AI provider
    const provider = settings.ai_provider || "openai";
    const providerConfig = getProviderConfig(provider, settings.api_key, settings.ai_model);

    const messages = [
      { role: "system", content: systemParts },
      ...conversationHistory,
      { role: "user", content: message_content },
    ];

    const temperature = (settings.creativity || 50) / 100;

    const aiRes = await fetch(providerConfig.url, {
      method: "POST",
      headers: providerConfig.headers,
      body: JSON.stringify({
        model: providerConfig.model,
        messages,
        temperature,
        max_tokens: settings.max_response_length === "short" ? 150 : settings.max_response_length === "detailed" ? 800 : 400,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error(`${provider} API error:`, aiRes.status, errText);
      return json({ error: `${provider} API error`, status: aiRes.status }, 500);
    }

    const aiData = await aiRes.json();
    let aiReply = aiData.choices?.[0]?.message?.content?.trim() || "";

    if (!aiReply) {
      return json({ skipped: "empty_ai_response" });
    }

    // 9. Extract and apply lead memory update
    const leadUpdateMatch = aiReply.match(/<!--LEAD_UPDATE:(.*?)-->/s);
    if (leadUpdateMatch) {
      try {
        const update = JSON.parse(leadUpdateMatch[1]);
        const updateData: Record<string, unknown> = {
          interest: update.interest || leadMemory.interest,
          stage: update.stage || leadMemory.stage,
          contact_name: leadMemory.contact_name || contact_name || null,
          product_cited: update.product_cited || leadMemory.product_cited || null,
          last_message_preview: (message_content || "").substring(0, 200),
        };
        if (update.intent || update.flow_step) {
          const notesObj = (() => { try { return JSON.parse(leadMemory.notes || "{}"); } catch { return {}; } })();
          if (update.intent) notesObj.last_intent = update.intent;
          if (update.flow_step) notesObj.last_flow_step = update.flow_step;
          updateData.notes = JSON.stringify(notesObj);
        }
        await admin.from("ai_lead_memory").update(updateData).eq("id", leadMemory.id);

        // 9b. Auto-update CRM pipeline based on AI classification
        if (phoneDigits && (update.stage || update.intent)) {
          const tempMap: Record<string, string> = { hot: "quente", warm: "morno", cold: "frio" };
          const pipelineMap: Record<string, string> = {
            curious: "novo",
            interested: "interessado",
            ready_to_buy: "negociacao",
            objection: "respondeu",
          };
          const crmUpdate: Record<string, unknown> = {};
          if (update.stage && tempMap[update.stage]) crmUpdate.lead_temperature = tempMap[update.stage];
          if (update.intent && pipelineMap[update.intent]) crmUpdate.pipeline_stage = pipelineMap[update.intent];
          if (Object.keys(crmUpdate).length > 0) {
            await admin.from("service_contacts").update(crmUpdate).eq("user_id", user_id).like("phone", `%${phoneDigits}%`);
            await admin.from("conversations").update(crmUpdate as any).eq("id", conversation_id);
          }
        }
      } catch (e) {
        console.error("Failed to parse lead update:", e);
      }
      aiReply = aiReply.replace(/<!--LEAD_UPDATE:.*?-->/s, "").trim();
    }

    // 9c. Extract and apply scheduling
    const scheduleMatch = aiReply.match(/<!--SCHEDULE:(.*?)-->/s);
    if (scheduleMatch) {
      try {
        const sched = JSON.parse(scheduleMatch[1]);
        if (sched.date && sched.time) {
          const scheduledAt = new Date(`${sched.date}T${sched.time}:00-03:00`); // BRT
          const contactPhone = (remote_jid || "").replace(/@.*/, "").replace(/\D/g, "");
          const schedType = sched.type || "reuniao";

          // Find lead_id from service_contacts
          let leadId: string | null = null;
          if (phoneDigits) {
            const { data: sc } = await admin
              .from("service_contacts")
              .select("id")
              .eq("user_id", user_id)
              .like("phone", `%${phoneDigits}%`)
              .limit(1)
              .maybeSingle();
            leadId = sc?.id || null;
          }

          // Create the main schedule entry
          await admin.from("scheduled_messages").insert({
            user_id,
            contact_name: leadMemory.contact_name || contact_name || contactPhone,
            contact_phone: contactPhone,
            message_content: sched.summary || `Agendamento: ${schedType}`,
            scheduled_at: scheduledAt.toISOString(),
            schedule_type: schedType,
            lead_id: leadId,
            device_id: device_id || null,
            status: "pending",
          });

          // Create a reminder for 1 hour before
          const reminderAt = new Date(scheduledAt.getTime() - 60 * 60 * 1000);
          if (reminderAt > new Date()) {
            const typeLabel = schedType === "reuniao" ? "reunião" : schedType === "retorno" ? "retorno" : "follow-up";
            const reminderMsg = `Lembrete: você tem ${typeLabel === "reunião" ? "uma" : "um"} ${typeLabel} agendad${typeLabel === "reunião" ? "a" : "o"} para hoje às ${sched.time}. Nos vemos em breve! 😊`;
            await admin.from("scheduled_messages").insert({
              user_id,
              contact_name: leadMemory.contact_name || contact_name || contactPhone,
              contact_phone: contactPhone,
              message_content: reminderMsg,
              scheduled_at: reminderAt.toISOString(),
              schedule_type: schedType,
              lead_id: leadId,
              device_id: device_id || null,
              status: "pending",
            });
          }

          // Update pipeline to "negociacao" or "fechado" when scheduling
          if (phoneDigits) {
            await admin.from("service_contacts").update({
              pipeline_stage: "negociacao",
              lead_temperature: "quente",
            }).eq("user_id", user_id).like("phone", `%${phoneDigits}%`);
            await admin.from("conversations").update({
              pipeline_stage: "negociacao",
              lead_temperature: "quente",
            } as any).eq("id", conversation_id);
          }

          console.log(`Schedule created: ${schedType} at ${scheduledAt.toISOString()} for ${contactPhone}`);
        }
      } catch (e) {
        console.error("Failed to parse schedule:", e);
      }
      aiReply = aiReply.replace(/<!--SCHEDULE:.*?-->/s, "").trim();
    }

    // 10. Apply delay (simulate typing)
    if (settings.simulate_typing) {
      const minDelay = (settings.min_delay_seconds || 1) * 1000;
      const maxDelay = (settings.max_delay_seconds || 3) * 1000;
      const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      await new Promise((r) => setTimeout(r, delay));
    }

    // 11. Split long messages if enabled
    if (settings.split_long_messages && aiReply.length > 300) {
      const parts = splitMessage(aiReply);
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
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

// --- Lead Memory ---

async function loadOrCreateLeadMemory(
  admin: any,
  userId: string,
  remoteJid: string,
  contactName: string | null,
  messageContent: string,
) {
  const { data: existing } = await admin
    .from("ai_lead_memory")
    .select("*")
    .eq("user_id", userId)
    .eq("remote_jid", remoteJid)
    .maybeSingle();

  if (existing) {
    await admin.from("ai_lead_memory").update({
      interaction_count: (existing.interaction_count || 0) + 1,
      last_interaction_at: new Date().toISOString(),
      contact_name: existing.contact_name || contactName || null,
      last_message_preview: (messageContent || "").substring(0, 200),
    }).eq("id", existing.id);

    return { ...existing, interaction_count: (existing.interaction_count || 0) + 1 };
  }

  const { data: newLead } = await admin.from("ai_lead_memory").insert({
    user_id: userId,
    remote_jid: remoteJid,
    contact_name: contactName || null,
    stage: "cold",
    interaction_count: 1,
    last_interaction_at: new Date().toISOString(),
  }).select("*").single();

  return newLead || { id: null, contact_name: contactName, interest: null, stage: "cold", interaction_count: 1 };
}

// --- Helpers ---

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

  await admin.from("conversations").update({
    last_message: content.substring(0, 500),
    last_message_at: new Date().toISOString(),
  }).eq("id", conversationId);
}
