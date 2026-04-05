import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const PLAN_CONFIG: Record<string, { max_instances: number; price: number; days: number }> = {
  Essencial: { max_instances: 5, price: 99, days: 30 },
  Start: { max_instances: 10, price: 187, days: 30 },
  Pro: { max_instances: 30, price: 397, days: 30 },
  Scale: { max_instances: 50, price: 597, days: 30 },
  Elite: { max_instances: 100, price: 1197, days: 30 },
};

const CREDIT_PACKS: Record<string, number> = {
  Starter: 300,
  Pro: 1000,
  Growth: 3000,
  Scale: 10000,
  Elite: 50000,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!STRIPE_SECRET_KEY) {
      console.error("[stripe-webhook] STRIPE_SECRET_KEY not configured");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500, headers: corsHeaders });
    }

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event: any;

    if (STRIPE_WEBHOOK_SECRET && signature) {
      const parts = signature.split(",").reduce((acc: Record<string, string>, part: string) => {
        const [key, value] = part.split("=");
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

      const timestamp = parts["t"];
      const sig = parts["v1"];

      if (!timestamp || !sig) {
        console.error("[stripe-webhook] Invalid signature format");
        return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400, headers: corsHeaders });
      }

      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - parseInt(timestamp)) > 300) {
        console.error("[stripe-webhook] Timestamp too old");
        return new Response(JSON.stringify({ error: "Timestamp expired" }), { status: 400, headers: corsHeaders });
      }

      const signedPayload = `${timestamp}.${body}`;
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const expectedSig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
      const expectedHex = Array.from(new Uint8Array(expectedSig)).map(b => b.toString(16).padStart(2, "0")).join("");

      if (expectedHex !== sig) {
        console.error("[stripe-webhook] Signature mismatch");
        return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400, headers: corsHeaders });
      }

      event = JSON.parse(body);
    } else {
      console.warn("[stripe-webhook] No STRIPE_WEBHOOK_SECRET — skipping signature verification");
      event = JSON.parse(body);
    }

    console.log("[stripe-webhook] Event type:", event.type, "id:", event.id);

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ─── CHECKOUT COMPLETED ───
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.user_id || session.client_reference_id;
      const checkoutType = session.metadata?.checkout_type || "subscription";

      if (!userId) {
        console.error("[stripe-webhook] Missing user_id in metadata");
        return new Response(JSON.stringify({ error: "Missing metadata" }), { status: 400, headers: corsHeaders });
      }

      // ═══ CREDIT PACK PURCHASE ═══
      if (checkoutType === "credits") {
        const packName = session.metadata?.pack_name;
        const creditsFromMeta = parseInt(session.metadata?.credits || "0");
        const credits = creditsFromMeta || CREDIT_PACKS[packName] || 0;

        if (credits <= 0) {
          console.error("[stripe-webhook] Invalid credit amount:", { packName, creditsFromMeta });
          return new Response(JSON.stringify({ error: "Invalid credit amount" }), { status: 400, headers: corsHeaders });
        }

        console.log("[stripe-webhook] Crediting user:", { userId, packName, credits });

        // Use the existing credit_prospeccao_balance function
        const { data: creditResult, error: creditError } = await adminClient
          .rpc("credit_prospeccao_balance", {
            p_user_id: userId,
            p_amount: credits,
            p_description: `Compra de créditos: pacote ${packName} (${credits.toLocaleString()} créditos) via Stripe`,
          });

        if (creditError) {
          console.error("[stripe-webhook] Error crediting balance:", creditError);
        } else {
          console.log("[stripe-webhook] Credits added:", creditResult);
        }

        // Record payment
        const amount = (session.amount_total || 0) / 100;
        await adminClient.from("payments").insert({
          user_id: userId,
          admin_id: userId,
          amount,
          discount: 0,
          fee: 0,
          method: "stripe",
          notes: `Créditos de prospecção: ${packName} (${credits.toLocaleString()} créditos) - Stripe: ${session.id}`,
          paid_at: new Date().toISOString(),
        });

        // Notification
        await adminClient.from("notifications").insert({
          user_id: userId,
          title: "Créditos adicionados! 🎉",
          message: `${credits.toLocaleString()} créditos de prospecção foram adicionados ao seu saldo. Pacote: ${packName}.`,
          type: "success",
        });

        // Admin log
        await adminClient.from("admin_logs").insert({
          admin_id: userId,
          target_user_id: userId,
          action: "stripe-credits-purchase",
          details: `Compra de ${credits.toLocaleString()} créditos (pacote ${packName}) via Stripe. Session: ${session.id}`,
        });

        console.log("[stripe-webhook] Credit pack activated for user:", userId);
        return new Response(JSON.stringify({ received: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ═══ SUBSCRIPTION PURCHASE (existing logic) ═══
      const planName = session.metadata?.plan_name;
      const instances = parseInt(session.metadata?.instances || "0");

      if (!planName) {
        console.error("[stripe-webhook] Missing plan_name in metadata");
        return new Response(JSON.stringify({ error: "Missing metadata" }), { status: 400, headers: corsHeaders });
      }

      const config = PLAN_CONFIG[planName];
      if (!config) {
        console.error("[stripe-webhook] Unknown plan:", planName);
        return new Response(JSON.stringify({ error: "Unknown plan" }), { status: 400, headers: corsHeaders });
      }

      const maxInstances = instances || config.max_instances;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + config.days * 86400000);

      console.log("[stripe-webhook] Activating plan:", { userId, planName, maxInstances });

      const { data: existing } = await adminClient
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        await adminClient.from("subscriptions").update({
          plan_name: planName,
          plan_price: config.price,
          max_instances: maxInstances,
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        }).eq("user_id", userId);
      } else {
        await adminClient.from("subscriptions").insert({
          user_id: userId,
          plan_name: planName,
          plan_price: config.price,
          max_instances: maxInstances,
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        });
      }

      await adminClient.from("subscription_cycles").insert({
        user_id: userId,
        subscription_id: existing?.id || null,
        plan_name: planName,
        status: "paid",
        cycle_start: now.toISOString(),
        cycle_end: expiresAt.toISOString(),
        cycle_amount: config.price,
        notes: `Pagamento automático via Stripe (${event.id})`,
      });

      await adminClient.from("payments").insert({
        user_id: userId,
        admin_id: userId,
        amount: config.price,
        discount: 0,
        fee: 0,
        method: "stripe",
        notes: `Stripe checkout: ${session.id}`,
        paid_at: now.toISOString(),
      });

      await adminClient.from("notifications").insert({
        user_id: userId,
        title: "Plano ativado! 🎉",
        message: `Seu plano ${planName} foi ativado com sucesso! Você tem ${maxInstances} instâncias disponíveis por ${config.days} dias.`,
        type: "success",
      });

      await adminClient.from("admin_logs").insert({
        admin_id: userId,
        target_user_id: userId,
        action: "stripe-checkout",
        details: `Plano ${planName} ativado automaticamente via Stripe. ${maxInstances} instâncias, expira em ${expiresAt.toLocaleDateString("pt-BR")}`,
      });

      console.log("[stripe-webhook] Plan activated for user:", userId);
    }

    // ─── INVOICE PAID (recurring subscription) ───
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      const customerEmail = invoice.customer_email;

      if (customerEmail) {
        const { data: authUsers } = await adminClient.auth.admin.listUsers();
        const matchedUser = authUsers?.users?.find((u: any) => u.email === customerEmail);

        if (matchedUser) {
          const { data: sub } = await adminClient
            .from("subscriptions")
            .select("id, plan_name, plan_price, max_instances, expires_at")
            .eq("user_id", matchedUser.id)
            .maybeSingle();

          if (sub) {
            const currentExpiry = sub.expires_at ? new Date(sub.expires_at) : new Date();
            const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
            const newExpiry = new Date(baseDate.getTime() + 30 * 86400000);

            await adminClient.from("subscriptions").update({
              expires_at: newExpiry.toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("user_id", matchedUser.id);

            const amount = (invoice.amount_paid || 0) / 100;
            await adminClient.from("payments").insert({
              user_id: matchedUser.id,
              admin_id: matchedUser.id,
              amount,
              discount: 0,
              fee: 0,
              method: "stripe",
              notes: `Renovação automática Stripe: ${invoice.id}`,
              paid_at: new Date().toISOString(),
            });

            await adminClient.from("notifications").insert({
              user_id: matchedUser.id,
              title: "Plano renovado! 🔄",
              message: `Seu plano ${sub.plan_name} foi renovado automaticamente. Nova validade: ${newExpiry.toLocaleDateString("pt-BR")}`,
              type: "success",
            });

            console.log("[stripe-webhook] Subscription renewed for user:", matchedUser.id);
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[stripe-webhook] Error:", err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
