import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Usuário inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { planName, instances, price } = await req.json();

    if (!planName || !price) {
      return new Response(
        JSON.stringify({ error: "planName e price são obrigatórios" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Creating checkout for:", { planName, instances, price, userId: user.id });

    // Convert Brazilian price string "397,00" → cents integer 39700
    const priceInCents = Math.round(
      parseFloat(price.replace(/\./g, "").replace(",", ".")) * 100
    );

    console.log("Price in cents:", priceInCents);

    // Determine the origin for success/cancel URLs
    const origin =
      req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "https://app.dgcontingencia.com";
    
    console.log("Origin:", origin);

    // Create Stripe Checkout Session via API
    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("payment_method_types[0]", "card");
    params.append("line_items[0][price_data][currency]", "brl");
    params.append(
      "line_items[0][price_data][product_data][name]",
      `DG Contingência – ${planName} (${instances ?? ""} Instâncias)`
    );
    params.append(
      "line_items[0][price_data][unit_amount]",
      String(priceInCents)
    );
    params.append(
      "line_items[0][price_data][recurring][interval]",
      "month"
    );
    params.append("line_items[0][quantity]", "1");
    params.append("customer_email", user.email ?? "");
    params.append("client_reference_id", user.id);
    params.append(
      "metadata[user_id]",
      user.id
    );
    params.append("metadata[plan_name]", planName);
    params.append("metadata[instances]", String(instances ?? ""));
    params.append(
      "success_url",
      `${origin}/dashboard/my-plan?checkout=success`
    );
    params.append(
      "cancel_url",
      `${origin}/dashboard/my-plan?checkout=cancel`
    );

    const stripeRes = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error("Stripe error:", JSON.stringify(session));
      return new Response(
        JSON.stringify({
          error: session.error?.message ?? "Erro ao criar sessão de checkout",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Checkout error:", err);
    return new Response(
      JSON.stringify({ error: err.message ?? "Erro interno" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
