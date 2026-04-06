/**
 * process-scheduled-messages — Stub leve
 * 
 * O processamento agora roda na VPS via scheduled-messages-worker.
 * Esta Edge Function é mantida apenas como fallback/trigger manual.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  return new Response(JSON.stringify({ 
    ok: true, 
    message: "Scheduled messages are now processed by VPS worker",
    processed: 0,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
