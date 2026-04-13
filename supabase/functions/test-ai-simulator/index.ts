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

    const toneMap: Record<string, string> = {
      friendly: "amigável",
      professional: "profissional",
      direct: "direto",
    };

    const systemPrompt = [
      `Você é um assistente virtual de atendimento${settings?.business_name ? ` da empresa "${settings.business_name}"` : ""}.`,
      `Tom: ${toneMap[settings?.tone] || "profissional"}.`,
      settings?.business_type ? `Tipo: ${settings.business_type}.` : "",
      settings?.business_description ? `Sobre: ${settings.business_description}.` : "",
      settings?.business_hours ? `Horário: ${settings.business_hours}.` : "",
      settings?.ai_instructions ? `Instruções: ${settings.ai_instructions.replace(/FLOW_STEPS:.*?END_FLOW_STEPS/s, "").trim()}` : "",
      `IMPORTANTE: Ao final da resposta, inclua: <!--SIM_META:{"intent":"curious|interested|ready_to_buy|objection","flow_step":"saudacao|diagnostico|apresentacao|objecao|fechamento"}-->`,
      `- "intent": intenção detectada na mensagem do cliente`,
      `- "flow_step": etapa do fluxo de conversão que você usou`,
      `Responda de forma natural e curta.`,
    ].filter(Boolean).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: (settings?.creativity || 50) / 100,
        max_tokens: 300,
      }),
    });

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
    let reply = data.choices?.[0]?.message?.content?.trim() || "Sem resposta";

    let meta: Record<string, string> = {};
    const metaMatch = reply.match(/<!--SIM_META:(.*?)-->/s);
    if (metaMatch) {
      try { meta = JSON.parse(metaMatch[1]); } catch {}
      reply = reply.replace(/<!--SIM_META:.*?-->/s, "").trim();
    }

    return new Response(JSON.stringify({ reply, meta }), {
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
