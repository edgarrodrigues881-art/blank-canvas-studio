import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ResolvedType = "lid" | "jid" | "number";

interface ResolvedContact {
  original: string;
  type: ResolvedType;
  jid: string | null;
  number: string | null;
  valid: boolean;
  error?: string;
}

const PRIVATE_JID_SUFFIX = "@s.whatsapp.net";
const LID_SUFFIX = "@lid";

function onlyDigits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function detectType(input: string): ResolvedType | null {
  const value = String(input || "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes(LID_SUFFIX)) return "lid";
  if (value.includes(PRIVATE_JID_SUFFIX)) return "jid";
  if (/^\d+$/.test(value)) return "number";
  return null;
}

function jidToNumber(jid: string): string | null {
  if (!jid) return null;
  const digits = onlyDigits(jid.split("@")[0]);
  return digits || null;
}

function numberToJid(num: string): string | null {
  const digits = onlyDigits(num);
  if (!digits) return null;
  return `${digits}${PRIVATE_JID_SUFFIX}`;
}

/**
 * Resolve LID via Uazapi POST /chat/info
 * Tries multiple response shapes for compatibility.
 */
async function resolveLidViaUazapi(
  baseUrl: string,
  token: string,
  lid: string,
): Promise<{ jid: string | null; raw?: any; error?: string }> {
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/chat/info`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chatId: lid }),
    });

    const text = await res.text();
    let payload: any = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }

    if (!res.ok) {
      return { jid: null, raw: payload, error: `HTTP ${res.status}` };
    }

    // Try common Uazapi response shapes
    const candidates = [
      payload?.jid,
      payload?.id,
      payload?.chat?.jid,
      payload?.chat?.id,
      payload?.data?.jid,
      payload?.data?.id,
      payload?.contact?.jid,
      payload?.user?.jid,
      payload?.wid,
      payload?.phoneJid,
    ].filter(Boolean) as string[];

    const found = candidates.find((c) => typeof c === "string" && c.includes(PRIVATE_JID_SUFFIX));
    if (found) return { jid: found, raw: payload };

    // Sometimes they return only the digits / number
    const numCandidates = [
      payload?.number,
      payload?.phone,
      payload?.contact?.number,
      payload?.user?.number,
    ].filter(Boolean) as string[];
    const num = numCandidates.find((n) => typeof n === "string" && /\d/.test(n));
    if (num) {
      const jid = numberToJid(num);
      if (jid) return { jid, raw: payload };
    }

    return { jid: null, raw: payload, error: "JID not found in response" };
  } catch (e) {
    return { jid: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function resolveContact(
  input: string,
  baseUrl: string,
  token: string,
): Promise<ResolvedContact> {
  const original = String(input || "").trim();
  try {
    const type = detectType(original);

    if (!type) {
      return {
        original,
        type: "number",
        jid: null,
        number: null,
        valid: false,
        error: "Formato não reconhecido",
      };
    }

    if (type === "jid") {
      const jid = original;
      return { original, type, jid, number: jidToNumber(jid), valid: true };
    }

    if (type === "number") {
      const jid = numberToJid(original);
      if (!jid) {
        return { original, type, jid: null, number: null, valid: false, error: "Número inválido" };
      }
      return { original, type, jid, number: jidToNumber(jid), valid: true };
    }

    // type === "lid" → consulta Uazapi
    const { jid, error } = await resolveLidViaUazapi(baseUrl, token, original);
    if (!jid) {
      return {
        original,
        type: "lid",
        jid: null,
        number: null,
        valid: false,
        error: error || "Falha ao resolver LID",
      };
    }
    return { original, type: "lid", jid, number: jidToNumber(jid), valid: true };
  } catch (e) {
    return {
      original,
      type: detectType(original) || "number",
      jid: null,
      number: null,
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const inputs: string[] = Array.isArray(body?.inputs)
      ? body.inputs
      : body?.input
        ? [body.input]
        : [];
    const explicitDeviceId: string | undefined = body?.device_id;

    if (inputs.length === 0) {
      return new Response(JSON.stringify({ error: "input ou inputs é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca uma instância conectada do usuário (necessária só para resolver LIDs).
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    let baseUrl = "";
    let token = "";

    let deviceQuery = serviceClient
      .from("devices")
      .select("id, uazapi_token, uazapi_base_url, status")
      .eq("user_id", userData.user.id)
      .not("uazapi_token", "is", null)
      .not("uazapi_base_url", "is", null)
      .limit(1);

    if (explicitDeviceId) {
      deviceQuery = serviceClient
        .from("devices")
        .select("id, uazapi_token, uazapi_base_url, status")
        .eq("user_id", userData.user.id)
        .eq("id", explicitDeviceId)
        .limit(1);
    }

    const { data: devices } = await deviceQuery;
    const device = devices?.[0];
    if (device?.uazapi_token && device?.uazapi_base_url) {
      baseUrl = String(device.uazapi_base_url).replace(/\/+$/, "");
      token = String(device.uazapi_token);
    }

    const needsUazapi = inputs.some((i) => detectType(i) === "lid");
    if (needsUazapi && (!baseUrl || !token)) {
      const results: ResolvedContact[] = inputs.map((input) => {
        const type = detectType(input);
        if (type === "lid") {
          return {
            original: input,
            type: "lid",
            jid: null,
            number: null,
            valid: false,
            error: "Nenhuma instância conectada disponível para resolver LID",
          };
        }
        // Resolve os outros normalmente
        if (type === "jid") {
          return { original: input, type, jid: input, number: jidToNumber(input), valid: true };
        }
        if (type === "number") {
          const jid = numberToJid(input);
          return { original: input, type, jid, number: jid ? jidToNumber(jid) : null, valid: !!jid };
        }
        return { original: input, type: "number", jid: null, number: null, valid: false, error: "Formato não reconhecido" };
      });
      return new Response(
        JSON.stringify({ results: results.length === 1 && body?.input ? undefined : results, result: body?.input ? results[0] : undefined }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Processa em paralelo (limitado)
    const concurrency = 5;
    const results: ResolvedContact[] = new Array(inputs.length);
    let cursor = 0;
    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= inputs.length) break;
        results[idx] = await resolveContact(inputs[idx], baseUrl, token);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));

    if (body?.input && !Array.isArray(body?.inputs)) {
      return new Response(JSON.stringify({ result: results[0] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
