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
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { user_id, conversation_id, action } = body;
    // action: "classify" | "suggest" | "auto_pipeline"

    if (!user_id) return json({ error: "user_id required" }, 400);

    // 1. Load user's AI settings
    const { data: settings } = await admin
      .from("ai_settings")
      .select("*")
      .eq("user_id", user_id)
      .single();

    // Determine which AI to use: user's own key or Lovable AI
    let aiUrl: string;
    let aiHeaders: Record<string, string>;
    let aiModel: string;

    if (settings?.api_key) {
      const providerMap: Record<string, { url: string; model: string }> = {
        gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: settings.ai_model || "gemini-2.5-flash" },
        deepseek: { url: "https://api.deepseek.com/v1/chat/completions", model: settings.ai_model || "deepseek-chat" },
        groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: settings.ai_model || "llama-3.3-70b-versatile" },
        openai: { url: "https://api.openai.com/v1/chat/completions", model: settings.ai_model || "gpt-4o-mini" },
      };
      const prov = providerMap[settings.ai_provider] || providerMap.openai;
      aiUrl = prov.url;
      aiModel = prov.model;
      aiHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.api_key}`,
      };
    } else if (lovableKey) {
      aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      aiModel = "google/gemini-3-flash-preview";
      aiHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      };
    } else {
      return json({ error: "no_ai_configured" }, 400);
    }

    // 2. Load CRM context for this conversation/lead
    let conversationData: any = null;
    let serviceContact: any = null;
    let leadMemory: any = null;
    let recentMessages: any[] = [];

    if (conversation_id) {
      const { data: conv } = await admin
        .from("conversations")
        .select("*")
        .eq("id", conversation_id)
        .single();
      conversationData = conv;

      if (conv?.remote_jid) {
        const digits = conv.remote_jid.replace(/\D/g, "").slice(-8);
        // Fetch lead memory
        const { data: mem } = await admin
          .from("ai_lead_memory")
          .select("*")
          .eq("user_id", user_id)
          .like("remote_jid", `%${digits}%`)
          .limit(1)
          .maybeSingle();
        leadMemory = mem;

        // Fetch service contact
        const { data: sc } = await admin
          .from("service_contacts")
          .select("*")
          .eq("user_id", user_id)
          .like("phone", `%${digits}%`)
          .limit(1)
          .maybeSingle();
        serviceContact = sc;
      }

      // Fetch recent messages
      const { data: msgs } = await admin
        .from("conversation_messages")
        .select("direction, content")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: false })
        .limit(15);
      recentMessages = (msgs || []).reverse();
    }

    // 3. Build context string
    const crmContext = [
      serviceContact?.name ? `Nome do lead: ${serviceContact.name}` : "",
      serviceContact?.company ? `Empresa: ${serviceContact.company}` : "",
      serviceContact?.origin ? `Origem: ${serviceContact.origin}` : "",
      serviceContact?.lead_temperature ? `Temperatura atual: ${serviceContact.lead_temperature}` : "",
      serviceContact?.pipeline_stage ? `Etapa do pipeline: ${serviceContact.pipeline_stage}` : "",
      serviceContact?.tags?.length ? `Tags: ${serviceContact.tags.join(", ")}` : "",
      serviceContact?.notes ? `Notas do operador: ${serviceContact.notes}` : "",
      leadMemory?.interest ? `Interesse detectado pela IA: ${leadMemory.interest}` : "",
      leadMemory?.product_cited ? `Produto mencionado: ${leadMemory.product_cited}` : "",
      leadMemory?.stage ? `Estágio IA: ${leadMemory.stage}` : "",
      leadMemory?.interaction_count ? `Interações: ${leadMemory.interaction_count}` : "",
    ].filter(Boolean).join("\n");

    const messagesContext = recentMessages
      .filter((m: any) => m.content?.trim())
      .map((m: any) => `${m.direction === "received" ? "Cliente" : "Atendente"}: ${m.content}`)
      .join("\n");

    // 4. Handle actions
    if (action === "classify") {
      const systemPrompt = `Você é um analista de CRM especialista em qualificação de leads.
Analise o contexto do lead e o histórico de conversas abaixo e retorne SOMENTE um JSON válido com:
{
  "temperature": "frio" | "morno" | "quente" | "cliente" | "perdido",
  "interest": "descrição curta do interesse detectado ou null",
  "intent": "curious" | "interested" | "ready_to_buy" | "objection" | "none",
  "suggested_pipeline_stage": "novo" | "respondeu" | "interessado" | "negociacao" | "fechado" | "perdido",
  "confidence": 0-100,
  "reasoning": "breve justificativa"
}

CONTEXTO DO CRM:
${crmContext || "Sem dados prévios."}

HISTÓRICO:
${messagesContext || "Sem mensagens."}`;

      const aiRes = await fetch(aiUrl, {
        method: "POST",
        headers: aiHeaders,
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Classifique este lead agora." },
          ],
          temperature: 0.3,
          max_tokens: 300,
        }),
      });

      if (!aiRes.ok) {
        const err = await aiRes.text();
        console.error("AI classify error:", aiRes.status, err);
        return json({ error: "ai_error", status: aiRes.status }, 500);
      }

      const aiData = await aiRes.json();
      let reply = aiData.choices?.[0]?.message?.content?.trim() || "";

      // Extract JSON from response
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return json({ error: "invalid_ai_response", raw: reply }, 500);

      let classification;
      try {
        classification = JSON.parse(jsonMatch[0]);
      } catch {
        return json({ error: "json_parse_error", raw: reply }, 500);
      }

      // Auto-apply classification
      if (serviceContact && classification.temperature) {
        await admin.from("service_contacts").update({
          lead_temperature: classification.temperature,
          pipeline_stage: classification.suggested_pipeline_stage || serviceContact.pipeline_stage,
        } as any).eq("id", serviceContact.id);
      }

      if (leadMemory && classification.interest) {
        await admin.from("ai_lead_memory").update({
          interest: classification.interest,
          stage: classification.temperature === "quente" ? "hot" : classification.temperature === "morno" ? "warm" : "cold",
        }).eq("id", leadMemory.id);
      }

      // Also update conversation
      if (conversation_id && classification.temperature) {
        await admin.from("conversations").update({
          lead_temperature: classification.temperature,
          pipeline_stage: classification.suggested_pipeline_stage,
        } as any).eq("id", conversation_id);
      }

      return json({ classification, applied: true });
    }

    if (action === "suggest") {
      const businessContext = [
        settings?.business_name ? `Empresa: ${settings.business_name}` : "",
        settings?.business_type ? `Tipo: ${settings.business_type}` : "",
        settings?.business_description ? `Descrição: ${settings.business_description}` : "",
        settings?.business_hours ? `Horário: ${settings.business_hours}` : "",
        settings?.ai_instructions ? `Instruções: ${settings.ai_instructions.replace(/FLOW_STEPS:.*?END_FLOW_STEPS/s, "").trim()}` : "",
      ].filter(Boolean).join("\n");

      const systemPrompt = `Você é um assistente de vendas que sugere respostas para atendentes.
Com base no contexto do CRM e no histórico de conversa, sugira 3 respostas possíveis que o atendente pode enviar.
As respostas devem ser naturais, variadas e alinhadas com a etapa do funil.

Retorne SOMENTE um JSON válido:
{
  "suggestions": [
    { "text": "mensagem sugerida 1", "tone": "amigável" | "profissional" | "urgente", "goal": "objetivo da mensagem" },
    { "text": "mensagem sugerida 2", "tone": "...", "goal": "..." },
    { "text": "mensagem sugerida 3", "tone": "...", "goal": "..." }
  ],
  "detected_intent": "curious" | "interested" | "ready_to_buy" | "objection" | "none",
  "recommended_action": "descrição da ação recomendada"
}

DADOS DO NEGÓCIO:
${businessContext || "Não configurado."}

CONTEXTO DO LEAD:
${crmContext || "Sem dados prévios."}

HISTÓRICO:
${messagesContext || "Sem mensagens."}`;

      const aiRes = await fetch(aiUrl, {
        method: "POST",
        headers: aiHeaders,
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Sugira 3 respostas." },
          ],
          temperature: 0.7,
          max_tokens: 600,
        }),
      });

      if (!aiRes.ok) {
        const err = await aiRes.text();
        console.error("AI suggest error:", aiRes.status, err);
        return json({ error: "ai_error", status: aiRes.status }, 500);
      }

      const aiData = await aiRes.json();
      let reply = aiData.choices?.[0]?.message?.content?.trim() || "";

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return json({ error: "invalid_ai_response", raw: reply }, 500);

      try {
        const suggestions = JSON.parse(jsonMatch[0]);
        return json(suggestions);
      } catch {
        return json({ error: "json_parse_error", raw: reply }, 500);
      }
    }

    if (action === "auto_pipeline") {
      // Batch classify all leads without pipeline assignment
      const { data: unclassified } = await admin
        .from("service_contacts")
        .select("id, phone")
        .eq("user_id", user_id)
        .is("pipeline_stage", null)
        .limit(20);

      if (!unclassified?.length) return json({ processed: 0 });

      let processed = 0;
      for (const contact of unclassified) {
        const digits = contact.phone.replace(/\D/g, "").slice(-8);
        const { data: mem } = await admin
          .from("ai_lead_memory")
          .select("stage, interest, interaction_count")
          .eq("user_id", user_id)
          .like("remote_jid", `%${digits}%`)
          .limit(1)
          .maybeSingle();

        if (mem) {
          const stageMap: Record<string, string> = { hot: "interessado", warm: "respondeu", cold: "novo" };
          const stage = stageMap[mem.stage] || "novo";
          await admin.from("service_contacts").update({
            pipeline_stage: stage,
            lead_temperature: mem.stage === "hot" ? "quente" : mem.stage === "warm" ? "morno" : "frio",
          } as any).eq("id", contact.id);
          processed++;
        }
      }

      return json({ processed });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (err: any) {
    console.error("crm-ai-classify error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
