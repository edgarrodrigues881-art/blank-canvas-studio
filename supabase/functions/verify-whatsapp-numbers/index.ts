import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMEOUT_MS = 25_000;

async function fetchWithTimeout(url: string, opts: RequestInit, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface VerifyResult {
  phone: string;
  status: "success" | "no_whatsapp" | "error";
  detail: string;
  checked_at: string;
}

// ═══════════════════════════════════════════════════════════
// UAZAPI v2 — POST /chat/check { numbers: [phone] }
// Response: [{ query, isInWhatsapp: bool, jid, lid, verifiedName }]
// ═══════════════════════════════════════════════════════════
async function checkSingleNumber(
  baseUrl: string,
  token: string,
  phone: string,
): Promise<VerifyResult> {
  const now = new Date().toISOString();
  const url = `${baseUrl}/chat/check`;
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ numbers: [phone] }),
    });

    const text = await res.text();
    console.log(`[verify] POST /chat/check ${phone} => ${res.status} | ${text.substring(0, 300)}`);

    if (res.status === 401 || res.status === 403) {
      return { phone, status: "error", detail: "Token da instância inválido", checked_at: now };
    }

    if (!res.ok) {
      return { phone, status: "error", detail: `API retornou HTTP ${res.status}`, checked_at: now };
    }

    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }

    // Response format: [{ query, isInWhatsapp: bool, jid, lid, verifiedName }]
    const item = Array.isArray(parsed) ? parsed[0] : parsed;

    if (item?.isInWhatsapp === true) {
      return { phone, status: "success", detail: "Tem WhatsApp", checked_at: now };
    }
    if (item?.isInWhatsapp === false) {
      return { phone, status: "no_whatsapp", detail: "Sem WhatsApp", checked_at: now };
    }

    // Fallback: check for jid presence
    if (item?.jid && String(item.jid).includes("@s.whatsapp.net")) {
      return { phone, status: "success", detail: "Tem WhatsApp", checked_at: now };
    }

    return { phone, status: "error", detail: "Resposta inesperada da API", checked_at: now };
  } catch (err: any) {
    console.error(`[verify] ${phone} error: ${err?.message || err}`);
    if (err?.name === "AbortError") {
      return { phone, status: "error", detail: "Timeout na consulta", checked_at: now };
    }
    return { phone, status: "error", detail: "Erro de conexão com a API", checked_at: now };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { device_id, phones: rawPhones } = body;
    const phones = Array.isArray(rawPhones)
      ? Array.from(
          new Set(
            rawPhones
              .map((value: unknown) => String(value ?? "").replace(/\D/g, ""))
              .filter((value: string) => value.length >= 8),
          ),
        )
      : [];

    if (!device_id || !Array.isArray(phones) || phones.length === 0) {
      return new Response(JSON.stringify({ error: "device_id e phones são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (phones.length > 5000) {
      return new Response(JSON.stringify({ error: "Máximo de 5000 números por lote" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: device, error: devErr } = await adminClient
      .from("devices")
      .select("id, name, uazapi_base_url, uazapi_token, user_id, status")
      .eq("id", device_id)
      .single();

    if (devErr || !device) {
      return new Response(JSON.stringify({ error: "Dispositivo não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (device.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Dispositivo não pertence a você" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!device.uazapi_base_url || !device.uazapi_token) {
      return new Response(JSON.stringify({ error: "Dispositivo sem credenciais API" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
    const token = device.uazapi_token;

    // Process in sequential batches to avoid overload
    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_MS = 800;
    const results: VerifyResult[] = [];

    for (let i = 0; i < phones.length; i += BATCH_SIZE) {
      const batch = phones.slice(i, i + BATCH_SIZE);
      // Process batch sequentially (one at a time per number)
      for (const phone of batch) {
        const result = await checkSingleNumber(baseUrl, token, phone);
        results.push(result);
      }
      // Delay between batches
      if (i + BATCH_SIZE < phones.length) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_MS));
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(`[verify-whatsapp] Fatal: ${err?.message}`);
    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
