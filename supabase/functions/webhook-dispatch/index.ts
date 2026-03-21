import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

async function dispatchToMake(payload: Record<string, unknown>) {
  const makeUrl = Deno.env.get("MAKE_WEBHOOK_URL");
  if (!makeUrl) {
    console.log("[webhook-dispatch] MAKE_WEBHOOK_URL not set");
    return { sent: false, reason: "no_url" };
  }
  try {
    const res = await fetch(makeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(`[webhook-dispatch] ${payload.event} -> ${res.status}`);
    return { sent: true, status: res.status };
  } catch (e) {
    console.error("[webhook-dispatch] Error:", e.message);
    return { sent: false, error: e.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth: require WEBHOOK_SECRET ──
    const secret = req.headers.get("x-webhook-secret") || "";
    const expectedSecret = Deno.env.get("WEBHOOK_SECRET") || "";
    if (!expectedSecret || secret !== expectedSecret) {
      console.log("[webhook-dispatch] Invalid or missing secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { event, client_id, instance_id, data: eventData } = body;

    console.log("[webhook-dispatch] Dispatching:", event, "client:", client_id);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get client info
    let clientEmail = null;
    let plan = null;
    try {
      const { data: authUser } = await adminClient.auth.admin.getUserById(client_id);
      clientEmail = authUser?.user?.email || null;
      const { data: sub } = await adminClient.from("subscriptions").select("plan_name").eq("user_id", client_id).maybeSingle();
      plan = sub?.plan_name || null;
    } catch (e) {
      console.log("Could not fetch client info:", e.message);
    }

    // Get instance info if provided
    let instance = null;
    let token = null;
    if (instance_id) {
      const { data: device } = await adminClient.from("devices").select("id, name, instance_type, status, created_at, user_id").eq("id", instance_id).maybeSingle();
      if (device) {
        instance = {
          id: device.id,
          name: device.name,
          type: device.instance_type || "principal",
          status: device.status === "Ready" ? "conectada" : device.status === "Disconnected" ? "desconectada" : device.status,
          created_at: device.created_at,
        };
      }

      const { data: tok } = await adminClient.from("user_api_tokens")
        .select("token, status, healthy").eq("device_id", instance_id).limit(1).maybeSingle();
      if (tok) {
        token = { value: tok.token, status: tok.status === "in_use" ? "em_uso" : tok.status, health: tok.healthy ? "valido" : "invalido" };
      }
    }

    const payload = {
      event,
      client_id,
      client_email: clientEmail,
      plan,
      instance,
      token,
      ...eventData,
      timestamp: new Date().toISOString(),
    };

    const result = await dispatchToMake(payload);

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[webhook-dispatch] ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
