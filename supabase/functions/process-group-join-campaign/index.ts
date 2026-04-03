// ══════════════════════════════════════════════════════════
// process-group-join-campaign — Lightweight trigger only
// Heavy processing is done by VPS group-join-worker.
// This function just sets campaign status to "running"
// so the VPS tick picks it up.
// ══════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const campaignId: string | null = body.campaign_id || null;

    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaign_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Authenticate caller
    const authHeader = req.headers.get("Authorization") || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isServiceCall = bearerToken === serviceKey;

    if (!isServiceCall) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser(bearerToken);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify campaign belongs to user
      const { data: camp } = await supabase
        .from("group_join_campaigns")
        .select("id")
        .eq("id", campaignId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!camp) {
        return new Response(JSON.stringify({ error: "Campanha não encontrada" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Just ensure status is running — VPS tick handles the rest
    await supabase
      .from("group_join_campaigns")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", campaignId)
      .in("status", ["draft", "paused", "running"]);

    return new Response(JSON.stringify({ ok: true, message: "Campaign queued for VPS processing" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-group-join-campaign error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
