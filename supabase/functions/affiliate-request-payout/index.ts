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
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") || "";

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);

    const body = await req.json();
    const amount = Number(body?.amount);
    const pix_key = String(body?.pix_key || "").trim();
    const pix_key_type = body?.pix_key_type ? String(body.pix_key_type) : null;

    if (!amount || amount <= 0) return json({ error: "Valor inválido" }, 400);
    if (!pix_key) return json({ error: "Informe a chave Pix" }, 400);

    const admin: any = createClient(url, svc);

    // Calcula saldo disponível: somatório de comissões PAGAS - somatório de saques aprovados/pagos
    const { data: paid } = await admin
      .from("affiliate_payments")
      .select("commission_amount")
      .eq("affiliate_user_id", user.id)
      .eq("status", "paid");
    const totalEarned = (paid || []).reduce((s: number, r: any) => s + Number(r.commission_amount || 0), 0);

    const { data: payouts } = await admin
      .from("affiliate_payouts")
      .select("amount,status")
      .eq("affiliate_user_id", user.id)
      .in("status", ["requested", "approved", "paid"]);
    const reserved = (payouts || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    const available = totalEarned - reserved;
    if (amount > available) {
      return json({ error: `Saldo insuficiente. Disponível: R$ ${available.toFixed(2)}` }, 400);
    }

    const { data, error } = await admin
      .from("affiliate_payouts")
      .insert({ affiliate_user_id: user.id, amount, pix_key, pix_key_type, status: "requested" })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);

    return json({ success: true, payout: data });
  } catch (e: any) {
    return json({ error: e?.message || "Erro" }, 500);
  }
});
