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

type EndpointAttempt = {
  path: string;
  method: "POST" | "GET";
  body?: Record<string, unknown>;
  query?: Record<string, string>;
};

function parseJsonSafe(text: string): any | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeCandidateItems(parsed: any): any[] {
  const out: any[] = [];
  const add = (value: any) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) out.push(item);
      return;
    }
    out.push(value);
  };

  add(parsed);
  add(parsed?.data);
  add(parsed?.result);
  add(parsed?.results);
  add(parsed?.response);
  add(parsed?.numbers);
  add(parsed?.phones);
  add(parsed?.contacts);

  return out;
}

function inferWhatsAppStatus(parsed: any, rawText: string): "exists" | "not_exists" | "unknown" {
  if (parsed === true) return "exists";
  if (parsed === false) return "not_exists";

  const items = normalizeCandidateItems(parsed);
  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const status = String(item?.status || item?.state || "").toLowerCase();
    const jid = String(item?.jid || item?.JID || "");
    const errorMsg = String(item?.error || item?.message || "").toLowerCase();

    const exists =
      item?.Exists === true ||
      item?.exists === true ||
      item?.IsOnWhatsApp === true ||
      item?.isOnWhatsApp === true ||
      item?.onWhatsApp === true ||
      item?.numberExists === true ||
      item?.registered === true ||
      item?.valid === true ||
      item?.result === true ||
      item?.whatsapp === true ||
      status === "valid" ||
      status === "exists" ||
      status === "success" ||
      status === "on_whatsapp" ||
      jid.includes("@s.whatsapp.net");

    if (exists) return "exists";

    const notExists =
      item?.Exists === false ||
      item?.exists === false ||
      item?.IsOnWhatsApp === false ||
      item?.isOnWhatsApp === false ||
      item?.onWhatsApp === false ||
      item?.numberExists === false ||
      item?.registered === false ||
      item?.valid === false ||
      item?.result === false ||
      item?.whatsapp === false ||
      ["invalid", "not_exists", "not-found", "not_found", "not_registered", "no_whatsapp", "unavailable"].includes(status) ||
      /not on whatsapp|not registered|not exists|not found|n[aã]o.*whatsapp/.test(errorMsg);

    if (notExists) return "not_exists";
  }

  const lowerRaw = (rawText || "").toLowerCase();
  if (lowerRaw.includes("@s.whatsapp.net")) return "exists";
  if (/not on whatsapp|not registered|not exists|not found|n[aã]o.*whatsapp/.test(lowerRaw)) return "not_exists";

  return "unknown";
}

function buildAttemptUrl(baseUrl: string, attempt: EndpointAttempt): string {
  if (attempt.method !== "GET" || !attempt.query) return `${baseUrl}${attempt.path}`;
  const params = new URLSearchParams(attempt.query);
  return `${baseUrl}${attempt.path}?${params.toString()}`;
}

async function checkSingleNumber(
  baseUrl: string,
  token: string,
  phone: string,
): Promise<VerifyResult> {
  const now = new Date().toISOString();
  const headers: Record<string, string> = {
    token,
    admintoken: token,
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // Try known UAZAPI variants used by other stable flows in this project
  const endpoints: EndpointAttempt[] = [
    { path: "/check/exist", method: "POST", body: { number: phone } },
    { path: "/check/exist", method: "GET", query: { number: phone } },
    { path: "/misc/checkPhones", method: "POST", body: { phones: [phone] } },
    { path: "/misc/checkPhones", method: "GET", query: { phones: phone } },
    { path: "/chat/check", method: "POST", body: { phone } },
    { path: "/chat/check", method: "GET", query: { phone } },
    { path: "/misc/isOnWhatsapp", method: "POST", body: { phone } },
    { path: "/misc/isOnWhatsapp", method: "GET", query: { phone } },
    { path: "/chat/checkPhone", method: "POST", body: { Phone: phone } },
    { path: "/chat/checkPhone", method: "GET", query: { Phone: phone } },
    { path: "/contact/checkNumber", method: "POST", body: { phoneNumber: phone } },
    { path: "/contact/checkNumber", method: "GET", query: { phoneNumber: phone } },
  ];

  let authDeniedCount = 0;
  let lastDetail = "Nenhum endpoint disponível";

  for (const ep of endpoints) {
    const endpointLabel = `${ep.method} ${ep.path}`;
    const url = buildAttemptUrl(baseUrl, ep);
    try {
      const res = await fetchWithTimeout(url, {
        method: ep.method,
        headers,
        body: ep.method === "POST" ? JSON.stringify(ep.body ?? {}) : undefined,
      });

      const text = await res.text();
      const parsed = parseJsonSafe(text);

      if (res.status === 401 || res.status === 403) {
        authDeniedCount++;
        lastDetail = `${endpointLabel}: autenticação rejeitada`;
        continue;
      }

      if (res.status === 404 || res.status === 405) {
        lastDetail = `${endpointLabel}: endpoint indisponível`;
        continue;
      }

      if (!res.ok) {
        const statusFromError = inferWhatsAppStatus(parsed, text);
        if (statusFromError === "not_exists") {
          return { phone, status: "no_whatsapp", detail: "Sem WhatsApp", checked_at: now };
        }
        lastDetail = `${endpointLabel}: HTTP ${res.status}`;
        continue;
      }

      const inferred = inferWhatsAppStatus(parsed, text);
      if (inferred === "exists") {
        return { phone, status: "success", detail: "Tem WhatsApp", checked_at: now };
      }
      if (inferred === "not_exists") {
        return { phone, status: "no_whatsapp", detail: "Sem WhatsApp", checked_at: now };
      }

      lastDetail = `${endpointLabel}: resposta ambígua`;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        lastDetail = `${endpointLabel}: timeout`;
        continue;
      }
      lastDetail = `${endpointLabel}: erro de rede`;
      continue;
    }
  }

  if (authDeniedCount === endpoints.length) {
    return { phone, status: "error", detail: "Token da instância inválido ou sem permissão", checked_at: now };
  }

  return { phone, status: "error", detail: lastDetail, checked_at: now };
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
