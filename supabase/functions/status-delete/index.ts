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

async function deleteOnUazapi(baseUrl: string, token: string, messageId: string) {
  // UAZAPI builds vary — try multiple endpoints/payloads
  const attempts: { path: string; body: Record<string, unknown> }[] = [
    { path: "/message/delete", body: { id: messageId, forEveryone: true } },
    { path: "/message/delete", body: { messageId, forEveryone: true } },
    { path: "/message/revoke", body: { id: messageId } },
    { path: "/send/delete", body: { id: messageId } },
  ];
  let lastErr = "";
  for (const a of attempts) {
    try {
      const res = await fetch(`${baseUrl}${a.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", token },
        body: JSON.stringify(a.body),
      });
      const raw = await res.text();
      let parsed: any = {};
      try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
      const explicitFailure = Boolean(parsed?.error || parsed?.status === "error" || parsed?.code === 404);
      if (res.ok && !explicitFailure) return { ok: true, parsed };
      lastErr = `${res.status} @ ${a.path}: ${(typeof parsed?.message === "string" && parsed.message) || (typeof parsed?.error === "string" && parsed.error) || raw.substring(0, 200)}`;
      if (res.status === 401 || res.status === 403) break;
    } catch (e: any) {
      lastErr = `${a.path}: ${e?.message || String(e)}`;
    }
  }
  return { ok: false, error: lastErr || "Falha ao apagar" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const fallbackBaseUrl = Deno.env.get("UAZAPI_BASE_URL") || "";
    const fallbackToken = Deno.env.get("UAZAPI_TOKEN") || "";

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return json({ error: "Não autenticado" }, 401);

    const { post_id } = await req.json();
    if (!post_id) return json({ error: "post_id obrigatório" }, 400);

    const admin: any = createClient(supabaseUrl, serviceKey);

    const { data: post } = await admin
      .from("status_posts")
      .select("id, user_id, results, device_ids")
      .eq("id", post_id)
      .single();

    if (!post || post.user_id !== user.id) return json({ error: "Status não encontrado" }, 404);

    const results: any[] = Array.isArray(post.results) ? post.results : [];
    const successResults = results.filter((r) => r?.success && r?.message_id);

    if (successResults.length === 0) {
      return json({ error: "Não há identificador de mensagem salvo. Apenas status publicados após esta atualização podem ser apagados via API." }, 400);
    }

    const deviceIds = [...new Set(successResults.map((r) => r.device_id))];
    const { data: devices } = await admin
      .from("devices")
      .select("id, uazapi_token, uazapi_base_url")
      .eq("user_id", user.id)
      .in("id", deviceIds);

    const devMap = new Map<string, any>();
    (devices || []).forEach((d: any) => devMap.set(d.id, d));

    const updated: any[] = [...results];
    let deleted = 0;
    let failed = 0;

    for (let i = 0; i < updated.length; i++) {
      const r = updated[i];
      if (!r?.success || !r?.message_id || r?.deleted) continue;
      const dev = devMap.get(r.device_id);
      if (!dev) { failed++; updated[i] = { ...r, delete_error: "Instância não encontrada" }; continue; }
      const baseUrl = String(dev.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
      const token = String(dev.uazapi_token || fallbackToken || "").trim();
      if (!baseUrl || !token) { failed++; updated[i] = { ...r, delete_error: "API não configurada" }; continue; }

      const out = await deleteOnUazapi(baseUrl, token, r.message_id);
      if (out.ok) {
        deleted++;
        updated[i] = { ...r, deleted: true, deleted_at: new Date().toISOString() };
      } else {
        failed++;
        updated[i] = { ...r, delete_error: out.error };
      }
    }

    await admin
      .from("status_posts")
      .update({ results: updated, updated_at: new Date().toISOString() })
      .eq("id", post.id);

    return json({ success: true, deleted, failed });
  } catch (err: any) {
    console.error("[status-delete] error", err);
    return json({ error: err?.message || "Erro interno" }, 500);
  }
});
