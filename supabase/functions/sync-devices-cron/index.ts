/**
 * sync-devices-cron — Stub leve
 * 
 * O polling de status de instâncias agora roda na VPS via sync-devices-worker.
 * Esta Edge Function é mantida apenas como fallback/trigger manual.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  return new Response(JSON.stringify({
    ok: true,
    message: "Device sync is now handled by VPS worker",
    users: 0,
    devices: 0,
    statusChanges: 0,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
