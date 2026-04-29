import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const code = String(body?.code || "").trim();
    if (!code) return json({ valid: false, reason: "empty" });

    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin: any = createClient(url, svc);

    const { data, error } = await admin.rpc("validate_affiliate_coupon", { _code: code });
    if (error) return json({ valid: false, reason: "error", message: error.message });
    return json(data);
  } catch (e: any) {
    return json({ valid: false, reason: "error", message: e?.message }, 200);
  }
});
