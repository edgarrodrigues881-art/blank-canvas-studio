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
// UAZAPI v2 — POST /chat/check { numbers: [phone1, phone2, ...] }
// Response: [{ query, isInWhatsapp: bool, jid, lid, verifiedName }]
// ═══════════════════════════════════════════════════════════
async function checkBatchNumbers(
  baseUrl: string,
  token: string,
  phones: string[],
): Promise<VerifyResult[]> {
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
      body: JSON.stringify({ numbers: phones }),
    });

    const text = await res.text();
    console.log(`[verify] POST /chat/check [${phones.length} numbers] => ${res.status} | ${text.substring(0, 400)}`);

    if (res.status === 401 || res.status === 403) {
      return phones.map(phone => ({ phone, status: "error", detail: "Token da instância inválido", checked_at: now }));
    }

    if (!res.ok) {
      return phones.map(phone => ({ phone, status: "error", detail: `API retornou HTTP ${res.status}`, checked_at: now }));
    }

    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }

    // Response can be an array of results or a single object
    const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];

    // Build a map from query phone to result for fast lookup
    const resultMap = new Map<string, any>();
    for (const item of items) {
      const query = String(item?.query || item?.phone || item?.number || "").replace(/\D/g, "");
      if (query) resultMap.set(query, item);
    }

    // Map back to our input phones preserving order
    return phones.map(phone => {
      const item = resultMap.get(phone) || items.find((it: any) => {
        const q = String(it?.query || it?.phone || it?.number || "").replace(/\D/g, "");
        return q === phone;
      });

      if (!item) {
        return { phone, status: "error" as const, detail: "Sem resposta da API para este número", checked_at: now };
      }

      if (item.isInWhatsapp === true) {
        return { phone, status: "success" as const, detail: "Tem WhatsApp", checked_at: now };
      }
      if (item.isInWhatsapp === false) {
        return { phone, status: "no_whatsapp" as const, detail: "Sem WhatsApp", checked_at: now };
      }

      // Fallback: check for jid presence
      if (item.jid && String(item.jid).includes("@s.whatsapp.net")) {
        return { phone, status: "success" as const, detail: "Tem WhatsApp", checked_at: now };
      }

      return { phone, status: "error" as const, detail: "Resposta inesperada da API", checked_at: now };
    });
  } catch (err: any) {
    console.error(`[verify] batch error: ${err?.message || err}`);
    const detail = err?.name === "AbortError" ? "Timeout na consulta" : "Erro de conexão com a API";
    return phones.map(phone => ({ phone, status: "error" as const, detail, checked_at: now }));
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

    const adminClient = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { device_id, phones: rawPhones } = body;

    if (!device_id || typeof device_id !== "string") {
      return new Response(JSON.stringify({ error: "device_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phones = Array.isArray(rawPhones)
      ? Array.from(
          new Set(
            rawPhones
              .map((value: unknown) => String(value ?? "").replace(/\D/g, ""))
              .filter((value: string) => value.length >= 8),
          ),
        )
      : [];

    if (phones.length === 0) {
      return new Response(JSON.stringify({ error: "Lista de números vazia" }), {
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
    const devToken = device.uazapi_token;

    // Process in batches of 5 numbers sent together to the API
    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_MS = 800;
    const results: VerifyResult[] = [];

    for (let i = 0; i < phones.length; i += BATCH_SIZE) {
      const batch = phones.slice(i, i + BATCH_SIZE);
      const batchResults = await checkBatchNumbers(baseUrl, devToken, batch);
      results.push(...batchResults);

      // Delay between batches to avoid rate limiting
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
