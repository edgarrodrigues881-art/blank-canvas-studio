import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, settings } = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load full AI settings from DB (same as ai-autoreply uses)
    const { data: userSettings } = await adminClient
      .from("ai_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!userSettings?.api_key) {
      return new Response(JSON.stringify({ error: "Configure sua própria chave de API em Configurações da IA antes de testar." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Merge DB settings with any UI overrides passed from the simulator
    const merged = { ...userSettings, ...settings };

    // Load Knowledge Base docs (same as ai-autoreply)
    let kbContext = "";
    {
      const { data: kbDocs } = await adminClient
        .from("ai_knowledge_base")
        .select("title, doc_type, content")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(20);
      if (kbDocs && kbDocs.length > 0) {
        const kbParts = kbDocs
          .filter((d: any) => d.content?.trim())
          .map((d: any) => `[${d.title}]: ${d.content.substring(0, 2000)}`);
        if (kbParts.length > 0) {
          kbContext = `\nBASE DE CONHECIMENTO DA EMPRESA:\n${kbParts.join("\n\n")}`;
        }
      }
    }

    // Load Learning Insights (same as ai-autoreply)
    let learningContext = "";
    {
      const { data: insight } = await adminClient
        .from("ai_learning_insights")
        .select("evolved_prompt, confidence_score")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (insight?.evolved_prompt && (insight.confidence_score || 0) >= 30) {
        learningContext = `\nAPRENDIZADOS DA IA (baseado em análise de conversas reais):\n${insight.evolved_prompt}`;
      }
    }

    // Parse AI mode and flow steps from ai_instructions (same as ai-autoreply)
    const aiMode = merged.ai_instructions?.match(/^AI_MODE:(\w+)/m)?.[1] || "atendimento";
    const flowSteps = merged.ai_instructions?.match(/FLOW_STEPS:(.*?)END_FLOW_STEPS/s)?.[1] || "";
    const cleanInstructions = (merged.ai_instructions || "")
      .replace(/^AI_MODE:\w+\n?/m, "")
      .replace(/FLOW_STEPS:.*?END_FLOW_STEPS/s, "")
      .trim();

    // Mode-specific persona (same as ai-autoreply)
    const modePersonaMap: Record<string, string> = {
      vendas: `Você é um assistente de VENDAS altamente treinado${merged.business_name ? ` da empresa "${merged.business_name}"` : ""}. Seu objetivo é converter leads em clientes. Identifique a necessidade, apresente a solução com foco em benefícios, contorne objeções e conduza para o fechamento. Use gatilhos de escassez e urgência quando apropriado.`,
      atendimento: `Você é um assistente de ATENDIMENTO${merged.business_name ? ` da empresa "${merged.business_name}"` : ""}. Seu objetivo é acolher o cliente, entender sua necessidade com perguntas precisas, fornecer as informações corretas e garantir uma experiência positiva.`,
      suporte: `Você é um assistente de SUPORTE TÉCNICO${merged.business_name ? ` da empresa "${merged.business_name}"` : ""}. Seu objetivo é diagnosticar e resolver problemas com eficiência. Faça perguntas técnicas objetivas e guie o cliente passo a passo.`,
      agendamento: `Você é um assistente de AGENDAMENTO${merged.business_name ? ` da empresa "${merged.business_name}"` : ""}. Seu objetivo é agendar horários e reuniões. Confirme disponibilidade, colete dados necessários e confirme com data e hora específicas.`,
    };

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

    const systemPrompt = [
      modePersonaMap[aiMode] || modePersonaMap.atendimento,
      toneMap[merged.tone] || toneMap.professional,
      lengthMap[merged.response_style] || lengthMap.medium,
      merged.business_type ? `Tipo de negócio: ${merged.business_type}.` : "",
      merged.business_description ? `Sobre a empresa: ${merged.business_description}.` : "",
      merged.business_hours ? `Horário de atendimento: ${merged.business_hours}.` : "",
      cleanInstructions ? `Instruções adicionais: ${cleanInstructions}` : "",
      kbContext,
      learningContext,
      flowSteps ? `\nFLUXO DE CONVERSAÇÃO — mensagens-base por etapa:\n${flowSteps}` : "",
      `\nDETECÇÃO DE INTENÇÃO — classifique a mensagem do cliente:`,
      `- "curious": explorando sem compromisso`,
      `- "interested": interesse real, faz perguntas específicas`,
      `- "ready_to_buy": quer fechar/agendar agora`,
      `- "objection": dúvida, preocupação ou barreira`,
      `\nEtapa do fluxo conforme intenção:`,
      `- curious → saudacao ou diagnostico`,
      `- interested → diagnostico ou apresentacao`,
      `- ready_to_buy → fechamento`,
      `- objection → objecao`,
      `\nREGRAS IMPORTANTES:`,
      `- Responda como humano real no WhatsApp: curto, direto, sem formalidade excessiva`,
      `- NUNCA mande textos longos. Máximo 2-3 frases por mensagem`,
      `- Use o nome do cliente sempre que souber`,
      `- Nunca invente informações sobre produtos ou preços`,
      `- Use a Base de Conhecimento para responder com precisão`,
      `\nAo final da resposta inclua obrigatoriamente: <!--SIM_META:{"intent":"curious|interested|ready_to_buy|objection","flow_step":"saudacao|diagnostico|apresentacao|objecao|fechamento","mode":"${aiMode}"}-->`,
    ].filter(Boolean).join("\n");

    type ProviderConfig = { url: string; model: string; headers: Record<string, string>; isAnthropic: boolean };
    const providerMap: Record<string, ProviderConfig> = {
      openai:    { url: "https://api.openai.com/v1/chat/completions",                                    model: userSettings.ai_model || "gpt-4o-mini",           headers: { Authorization: `Bearer ${userSettings.api_key}`, "Content-Type": "application/json" }, isAnthropic: false },
      gemini:    { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",      model: userSettings.ai_model || "gemini-2.5-flash",       headers: { Authorization: `Bearer ${userSettings.api_key}`, "Content-Type": "application/json" }, isAnthropic: false },
      deepseek:  { url: "https://api.deepseek.com/v1/chat/completions",                                  model: userSettings.ai_model || "deepseek-chat",          headers: { Authorization: `Bearer ${userSettings.api_key}`, "Content-Type": "application/json" }, isAnthropic: false },
      groq:      { url: "https://api.groq.com/openai/v1/chat/completions",                               model: userSettings.ai_model || "llama-3.3-70b-versatile",headers: { Authorization: `Bearer ${userSettings.api_key}`, "Content-Type": "application/json" }, isAnthropic: false },
      mistral:   { url: "https://api.mistral.ai/v1/chat/completions",                                    model: userSettings.ai_model || "mistral-small-latest",   headers: { Authorization: `Bearer ${userSettings.api_key}`, "Content-Type": "application/json" }, isAnthropic: false },
      xai:       { url: "https://api.x.ai/v1/chat/completions",                                          model: userSettings.ai_model || "grok-3-mini",            headers: { Authorization: `Bearer ${userSettings.api_key}`, "Content-Type": "application/json" }, isAnthropic: false },
      anthropic: { url: "https://api.anthropic.com/v1/messages",                                         model: userSettings.ai_model || "claude-sonnet-4-6",      headers: { "x-api-key": userSettings.api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, isAnthropic: true },
    };
    const prov = providerMap[userSettings.ai_provider] || providerMap.openai;
    const maxTokens = merged.max_response_length === "short" ? 150 : merged.max_response_length === "detailed" ? 800 : 400;
    const temperature = (merged.creativity || 50) / 100;

    const body = prov.isAnthropic
      ? JSON.stringify({ model: prov.model, max_tokens: maxTokens, system: systemPrompt, messages: messages.filter((m: any) => m.role !== "system") })
      : JSON.stringify({ model: prov.model, messages: [{ role: "system", content: systemPrompt }, ...messages], temperature, max_tokens: maxTokens });

    const res = await fetch(prov.url, { method: "POST", headers: prov.headers, body });

    if (!res.ok) {
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido, tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await res.text();
      console.error("AI gateway error:", res.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    let reply = (prov.isAnthropic
      ? data.content?.[0]?.text
      : data.choices?.[0]?.message?.content
    )?.trim() || "Sem resposta";

    let meta: Record<string, string> = {};
    const metaMatch = reply.match(/<!--SIM_META:(.*?)-->/s);
    if (metaMatch) {
      try { meta = JSON.parse(metaMatch[1]); } catch {}
      reply = reply.replace(/<!--SIM_META:.*?-->/s, "").trim();
    }

    return new Response(JSON.stringify({ reply, meta, mode: aiMode, hasKb: !!kbContext, hasLearning: !!learningContext }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("test-ai-simulator error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
