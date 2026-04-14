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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return json({ error: "Não autenticado" }, 401);

    const body = await req.json();
    const { action } = body; // "analyze" | "get_insights" | "export_prompt"

    if (action === "get_insights") {
      const { data } = await admin
        .from("ai_learning_insights")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ insights: data });
    }

    if (action === "export_prompt") {
      const { data } = await admin
        .from("ai_learning_insights")
        .select("evolved_prompt, insights_summary, confidence_score, total_conversations_analyzed")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ prompt: data?.evolved_prompt || null, summary: data?.insights_summary, confidence: data?.confidence_score, conversations: data?.total_conversations_analyzed });
    }

    if (action !== "analyze") return json({ error: "invalid_action" }, 400);

    // --- ANALYZE: Fetch conversations with outcomes ---

    // Get user's AI settings for context
    const { data: settings } = await admin
      .from("ai_settings")
      .select("business_name, business_type, business_description, ai_instructions, tone")
      .eq("user_id", user.id)
      .single();

    // Fetch lead memories to understand outcomes
    const { data: leads } = await admin
      .from("ai_lead_memory")
      .select("*")
      .eq("user_id", user.id)
      .order("last_interaction_at", { ascending: false })
      .limit(100);

    if (!leads || leads.length < 3) {
      return json({ error: "minimum_data", message: "Mínimo de 3 conversas necessárias para análise." }, 400);
    }

    // Fetch sample conversations from leads with most interactions (successful patterns)
    const hotLeads = leads.filter((l: any) => l.stage === "hot").slice(0, 10);
    const coldLeads = leads.filter((l: any) => l.stage === "cold" && l.interaction_count >= 2).slice(0, 10);
    const warmLeads = leads.filter((l: any) => l.stage === "warm").slice(0, 10);

    // Fetch conversation samples for analysis
    const sampleConversations: any[] = [];
    const targetLeads = [...hotLeads.slice(0, 5), ...coldLeads.slice(0, 5), ...warmLeads.slice(0, 3)];

    for (const lead of targetLeads) {
      const { data: convos } = await admin
        .from("conversations")
        .select("id")
        .eq("user_id", user.id)
        .like("remote_jid", `%${lead.remote_jid.replace(/@.*/, "").slice(-8)}%`)
        .limit(1)
        .maybeSingle();

      if (convos) {
        const { data: msgs } = await admin
          .from("conversation_messages")
          .select("direction, content, is_ai_response")
          .eq("conversation_id", convos.id)
          .order("created_at", { ascending: true })
          .limit(20);

        if (msgs && msgs.length >= 2) {
          sampleConversations.push({
            outcome: lead.stage,
            interest: lead.interest,
            interaction_count: lead.interaction_count,
            messages: msgs.filter((m: any) => m.content?.trim()).map((m: any) =>
              `${m.direction === "received" ? "Cliente" : (m.is_ai_response ? "IA" : "Atendente")}: ${m.content}`
            ).join("\n"),
          });
        }
      }
    }

    // Build analysis prompt
    const analysisPrompt = `Você é um analista de vendas especialista em otimização de scripts de atendimento via WhatsApp.

CONTEXTO DO NEGÓCIO:
${settings?.business_name ? `Empresa: ${settings.business_name}` : ""}
${settings?.business_type ? `Tipo: ${settings.business_type}` : ""}
${settings?.business_description ? `Descrição: ${settings.business_description}` : ""}

PROMPT ATUAL DA IA:
${settings?.ai_instructions || "Sem instruções específicas."}

DADOS AGREGADOS:
- Total de leads analisados: ${leads.length}
- Leads quentes (convertidos): ${hotLeads.length}
- Leads mornos: ${warmLeads.length}
- Leads frios (não convertidos): ${coldLeads.length}

AMOSTRAS DE CONVERSAS (${sampleConversations.length} conversas):
${sampleConversations.map((c, i) => `
--- CONVERSA ${i + 1} (Resultado: ${c.outcome === "hot" ? "✅ CONVERTIDO" : c.outcome === "warm" ? "⚠️ EM PROGRESSO" : "❌ PERDIDO"}, Interações: ${c.interaction_count}) ---
${c.messages}
`).join("\n")}

ANÁLISE SOLICITADA:
Com base nos dados acima, analise e retorne SOMENTE um JSON válido com:
{
  "successful_patterns": ["padrão 1 que funciona bem", "padrão 2", ...],
  "failure_patterns": ["padrão 1 que faz perder vendas", "padrão 2", ...],
  "objection_handlers": ["técnica 1 para lidar com objeções", ...],
  "best_openers": ["melhor forma de iniciar conversa 1", ...],
  "closing_techniques": ["técnica de fechamento 1", ...],
  "insights_summary": "Resumo executivo dos insights em 3-5 frases",
  "evolved_prompt": "O PROMPT COMPLETO OTIMIZADO que a IA deve usar, incorporando todos os aprendizados. Deve ser detalhado, prático e incluir: tom ideal, estratégias que funcionam, como lidar com objeções específicas encontradas, melhores abordagens de abertura e fechamento. Mínimo 500 caracteres.",
  "confidence_score": 0-100
}

REGRAS:
- Baseie-se APENAS nos dados reais das conversas
- O evolved_prompt deve ser significativamente melhor que o atual
- Identifique EXATAMENTE onde os leads frios foram perdidos
- O prompt evoluído deve incorporar as técnicas que funcionaram nos leads quentes
- Seja específico, não genérico`;

    // Determine AI provider
    let aiUrl: string;
    let aiHeaders: Record<string, string>;
    let aiModel: string;

    const { data: fullSettings } = await admin
      .from("ai_settings")
      .select("api_key, ai_provider, ai_model")
      .eq("user_id", user.id)
      .single();

    if (fullSettings?.api_key) {
      const providerMap: Record<string, { url: string; model: string }> = {
        gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: fullSettings.ai_model || "gemini-2.5-flash" },
        deepseek: { url: "https://api.deepseek.com/v1/chat/completions", model: fullSettings.ai_model || "deepseek-chat" },
        groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: fullSettings.ai_model || "llama-3.3-70b-versatile" },
        openai: { url: "https://api.openai.com/v1/chat/completions", model: fullSettings.ai_model || "gpt-4o-mini" },
      };
      const prov = providerMap[fullSettings.ai_provider] || providerMap.openai;
      aiUrl = prov.url;
      aiModel = prov.model;
      aiHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${fullSettings.api_key}` };
    } else if (lovableKey) {
      aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      aiModel = "google/gemini-3-flash-preview";
      aiHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` };
    } else {
      return json({ error: "no_ai_configured" }, 400);
    }

    const aiRes = await fetch(aiUrl, {
      method: "POST",
      headers: aiHeaders,
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: analysisPrompt },
          { role: "user", content: "Analise as conversas e gere os insights agora." },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error("AI analysis error:", aiRes.status, err);
      if (aiRes.status === 429) return json({ error: "rate_limited" }, 429);
      if (aiRes.status === 402) return json({ error: "credits_exhausted" }, 402);
      return json({ error: "ai_error" }, 500);
    }

    const aiData = await aiRes.json();
    const reply = aiData.choices?.[0]?.message?.content?.trim() || "";

    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return json({ error: "invalid_ai_response", raw: reply.substring(0, 200) }, 500);

    let insights;
    try {
      insights = JSON.parse(jsonMatch[0]);
    } catch {
      return json({ error: "json_parse_error" }, 500);
    }

    // Upsert insights
    const { data: existing } = await admin
      .from("ai_learning_insights")
      .select("id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const insightRow = {
      user_id: user.id,
      total_conversations_analyzed: leads.length,
      successful_patterns: insights.successful_patterns || [],
      failure_patterns: insights.failure_patterns || [],
      objection_handlers: insights.objection_handlers || [],
      best_openers: insights.best_openers || [],
      closing_techniques: insights.closing_techniques || [],
      evolved_prompt: insights.evolved_prompt || null,
      confidence_score: insights.confidence_score || 0,
      insights_summary: insights.insights_summary || null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await admin.from("ai_learning_insights").update(insightRow).eq("id", existing.id);
    } else {
      await admin.from("ai_learning_insights").insert(insightRow);
    }

    return json({ success: true, insights: insightRow });
  } catch (err: any) {
    console.error("ai-learning-engine error:", err);
    return json({ error: err.message || "Erro interno" }, 500);
  }
});
