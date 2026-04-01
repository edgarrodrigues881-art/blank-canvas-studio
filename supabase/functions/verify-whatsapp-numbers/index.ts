import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMEOUT_MS = 15_000;

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

async function checkSingleNumber(
  baseUrl: string,
  token: string,
  phone: string,
): Promise<VerifyResult> {
  const now = new Date().toISOString();
  const headers: Record<string, string> = {
    token,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // Try UAZAPI endpoints — /check/exist is the confirmed working endpoint
  const endpoints = [
    { url: `${baseUrl}/check/exist`, body: { number: phone } },
    { url: `${baseUrl}/chat/checkPhone`, body: { Phone: phone } },
    { url: `${baseUrl}/contact/checkNumber`, body: { phoneNumber: phone } },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(ep.url, {
        method: "POST",
        headers,
        body: JSON.stringify(ep.body),
      });

      if (res.status === 404 || res.status === 405) continue;

      const text = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* ignore */ }

      if (!res.ok) {
        // If auth error, no point trying other endpoints
        if (res.status === 401) {
          return { phone, status: "error", detail: "Token inválido", checked_at: now };
        }
        continue;
      }

      if (!parsed) continue;

      // Parse various response formats
      const exists =
        parsed?.Exists === true ||
        parsed?.exists === true ||
        parsed?.IsOnWhatsApp === true ||
        parsed?.isOnWhatsApp === true ||
        parsed?.onWhatsApp === true ||
        parsed?.numberExists === true ||
        parsed?.result === true ||
        parsed?.status === "valid" ||
        parsed?.jid?.includes("@s.whatsapp.net");

      const notExists =
        parsed?.Exists === false ||
        parsed?.exists === false ||
        parsed?.IsOnWhatsApp === false ||
        parsed?.isOnWhatsApp === false ||
        parsed?.onWhatsApp === false ||
        parsed?.numberExists === false ||
        parsed?.result === false ||
        parsed?.status === "invalid";

      if (exists) {
        return { phone, status: "success", detail: "Tem WhatsApp", checked_at: now };
      }
      if (notExists) {
        return { phone, status: "no_whatsapp", detail: "Sem WhatsApp", checked_at: now };
      }

      // Ambiguous response — try to infer
      if (parsed?.JID || parsed?.jid) {
        return { phone, status: "success", detail: "Tem WhatsApp", checked_at: now };
      }

      return { phone, status: "error", detail: "Resposta ambígua da API", checked_at: now };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return { phone, status: "error", detail: "Timeout na consulta", checked_at: now };
      }
      continue;
    }
  }

  return { phone, status: "error", detail: "Nenhum endpoint disponível", checked_at: now };
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
    const { device_id, phones } = body;

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
