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

async function fetchGroupImage(baseUrl: string, token: string, jid: string): Promise<string | null> {
  const attempts: { url: string; method: "POST" | "GET"; body?: any }[] = [
    { url: `${baseUrl}/chat/getProfilePicture`, method: "POST", body: { number: jid, preview: false } },
    { url: `${baseUrl}/chat/GetPicture`, method: "POST", body: { number: jid, preview: false } },
    { url: `${baseUrl}/group/info`, method: "POST", body: { groupjid: jid } },
  ];
  for (const a of attempts) {
    try {
      const res = await fetch(a.url, {
        method: a.method,
        headers: { "Content-Type": "application/json", Accept: "application/json", token },
        body: a.body ? JSON.stringify(a.body) : undefined,
      });
      if (!res.ok) continue;
      const raw = await res.text();
      let parsed: any = {};
      try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
      const url =
        parsed?.imgUrl || parsed?.imageUrl || parsed?.image || parsed?.url ||
        parsed?.profilePicUrl || parsed?.picture || parsed?.data?.imgUrl ||
        parsed?.group?.imgUrl || parsed?.info?.imgUrl || null;
      if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
    } catch { /* try next */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const deviceId = String(body?.device_id || "").trim();
    const force = !!body?.force;
    if (!deviceId) return json({ error: "device_id é obrigatório" }, 400);

    const { data: device } = await admin
      .from("devices")
      .select("id, user_id, uazapi_token, uazapi_base_url")
      .eq("id", deviceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!device) return json({ error: "Instância não encontrada" }, 404);

    const baseUrl = String(device.uazapi_base_url || "").replace(/\/+$/, "");
    const token = String(device.uazapi_token || "").trim();
    if (!baseUrl || !token) return json({ error: "Instância sem credenciais" }, 400);

    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    let q = admin
      .from("device_groups_cache")
      .select("id, jid, image_url, image_synced_at")
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .limit(200);
    if (!force) q = q.or(`image_url.is.null,image_synced_at.lt.${cutoff}`);

    const { data: groups } = await q;
    if (!groups || groups.length === 0) return json({ ok: true, updated: 0 });

    // Fire requests in small batches to avoid hammering UAZAPI
    let updated = 0;
    const batch = 5;
    for (let i = 0; i < groups.length; i += batch) {
      const slice = groups.slice(i, i + batch);
      const results = await Promise.all(
        slice.map(async (g: any) => ({ id: g.id, url: await fetchGroupImage(baseUrl, token, g.jid) }))
      );
      for (const r of results) {
        await admin
          .from("device_groups_cache")
          .update({ image_url: r.url, image_synced_at: new Date().toISOString() })
          .eq("id", r.id);
        if (r.url) updated++;
      }
    }
    return json({ ok: true, updated, total: groups.length });
  } catch (e: any) {
    console.error("[group-chat-fetch-images] fatal:", e);
    return json({ error: e?.message || "Erro interno" }, 500);
  }
});
