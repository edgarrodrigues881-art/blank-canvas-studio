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

function isDisguisedLidNumber(value: string): boolean {
  return onlyDigits(value).length >= 14;
}

function detectType(input: string): ResolvedType | null {
  const value = String(input || "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes(LID_SUFFIX)) return "lid";
  if (value.includes(PRIVATE_JID_SUFFIX)) return "jid";
  // Aceita qualquer string que contenha pelo menos um dígito — será normalizada para apenas dígitos.
  if (/\d/.test(value)) return "number";
  return null;
}

/**
 * Extrai o número do JID exatamente como retornado pelo WhatsApp.
 * NÃO adiciona, remove ou formata dígitos — preserva o valor bruto.
 */
function jidToNumber(jid: string): string | null {
  if (!jid) return null;
  const local = String(jid).split("@")[0] || "";
  // Apenas remove caracteres não-dígito que porventura existam (ex.: ":" em device-jid)
  // sem alterar o número em si (sem prefixos, sem 9º dígito, sem máscara).
  const cleaned = local.replace(/\D/g, "");
  return cleaned || null;
}

function numberToJid(num: string): string | null {
  // Mantém o número exatamente como veio (somente filtra não-dígitos).
  const digits = String(num || "").replace(/\D/g, "");
  if (!digits) return null;
  return `${digits}${PRIVATE_JID_SUFFIX}`;
}

type LidPhoneMap = Map<string, string>;

function collectLidPhoneMappings(value: any, map: LidPhoneMap) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectLidPhoneMappings(item, map));
    return;
  }
  if (typeof value !== "object") return;

  const lids = new Set<string>();
  const phones = new Set<string>();
  const phoneKeys = new Set(["phone", "number", "telefone", "phonenumber", "pn", "wa_id", "waid", "wid", "wa_chatid", "jid", "remotejid", "phonejid", "user", "participant"]);

  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") continue;
    const k = key.toLowerCase();
    const digits = onlyDigits(raw);
    if (raw.includes(LID_SUFFIX) || (k.includes("lid") && digits.length >= 8)) lids.add(digits);
    if (!raw.includes(LID_SUFFIX) && (raw.includes(PRIVATE_JID_SUFFIX) || phoneKeys.has(k))) {
      if (digits.length >= 8 && digits.length <= 15) phones.add(digits);
    }
  }

  for (const lid of lids) {
    for (const phone of phones) {
      if (lid && phone && lid !== phone) map.set(lid, phone);
    }
  }

  Object.values(value).forEach((item) => collectLidPhoneMappings(item, map));
}

async function fetchUazapiJson(baseUrl: string, token: string, path: string, init?: RequestInit): Promise<any | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: { token, Accept: "application/json", "Content-Type": "application/json", ...(init?.headers || {}) },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) return null;
    try { return JSON.parse(text); } catch { return text; }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildLidPhoneMap(baseUrl: string, token: string): Promise<LidPhoneMap> {
  const map: LidPhoneMap = new Map();
  // Faz paginação ampla em /chat/find (até 5000 chats) + lista contatos + grupos com participantes.
  // Quanto mais chats varrermos, maior a chance de encontrar o pareamento LID→telefone que o
  // Whatsapp já entregou para a instância em algum momento.
  const chatPages = await Promise.all(
    [0, 1000, 2000, 3000, 4000].map((offset) =>
      fetchUazapiJson(baseUrl, token, "/chat/find", {
        method: "POST",
        body: JSON.stringify({ operator: "AND", limit: 1000, offset, sort: "-wa_lastMsgTimestamp" }),
      }),
    ),
  );
  const otherPayloads = await Promise.all([
    fetchUazapiJson(baseUrl, token, "/contacts/list", { method: "POST", body: JSON.stringify({ limit: 5000, offset: 0, contactScope: "all" }) }),
    fetchUazapiJson(baseUrl, token, "/contacts", { method: "GET" }),
    fetchUazapiJson(baseUrl, token, "/group/list?GetParticipants=true&count=500", { method: "GET" }),
    fetchUazapiJson(baseUrl, token, "/group/fetchAllGroups", { method: "GET" }),
  ]);
  [...chatPages, ...otherPayloads].forEach((payload) => collectLidPhoneMappings(payload, map));
  return map;
}

/**
 * Resolve LID via Uazapi using official/current endpoints first, then legacy fallbacks.
 * Some UAZAPI installations do not expose POST /chat/info for LID lookup; /chat/find
 * can resolve known chats by wa_chatlid and returns phone/wa_chatid when available.
 */
async function resolveLidViaUazapi(
  baseUrl: string,
  token: string,
  lid: string,
): Promise<{ jid: string | null; raw?: any; error?: string }> {
  const base = baseUrl.replace(/\/+$/, "");
  const normalizedLid = lid.includes("@") ? lid : `${onlyDigits(lid)}${LID_SUFFIX}`;
  const lidDigits = onlyDigits(normalizedLid);

  const request = async (path: string, body: Record<string, unknown>) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let payload: any = null;
      try { payload = JSON.parse(text); } catch { payload = text; }
      return { ok: res.ok, status: res.status, payload };
    } finally {
      clearTimeout(timeout);
    }
  };

  const collectJids = (value: any, out: string[] = []): string[] => {
    if (typeof value === "string") {
      if (value.includes(PRIVATE_JID_SUFFIX)) out.push(value);
      return out;
    }
    if (Array.isArray(value)) value.forEach((item) => collectJids(item, out));
    else if (value && typeof value === "object") Object.values(value).forEach((item) => collectJids(item, out));
    return out;
  };

  const collectPhoneFieldJids = (value: any, out: string[] = []): string[] => {
    if (Array.isArray(value)) {
      value.forEach((item) => collectPhoneFieldJids(item, out));
      return out;
    }
    if (!value || typeof value !== "object") return out;
    for (const [key, raw] of Object.entries(value)) {
      const k = key.toLowerCase();
      if (["phone", "number", "telefone", "wa_chatid", "jid", "remotejid", "phonejid"].includes(k) && typeof raw === "string") {
        if (raw.includes(PRIVATE_JID_SUFFIX)) out.push(raw);
        else {
          const digits = onlyDigits(raw);
          if (digits && digits !== lidDigits) {
            const jid = numberToJid(digits);
            if (jid) out.push(jid);
          }
        }
      }
      collectPhoneFieldJids(raw, out);
    }
    return out;
  };

  try {
    const attempts = [
      { path: "/chat/find", body: { operator: "OR", limit: 5, wa_chatlid: normalizedLid, wa_chatid: normalizedLid, wa_fastid: lidDigits } },
      { path: "/chat/check", body: { numbers: [normalizedLid] } },
      { path: "/chat/info", body: { chatId: normalizedLid } },
      { path: "/chat/info", body: { number: normalizedLid } },
    ];

    const diagnostics: string[] = [];
    for (const attempt of attempts) {
      const { ok, status, payload } = await request(attempt.path, attempt.body);
      if (!ok) {
        diagnostics.push(`${attempt.path}: HTTP ${status}`);
        continue;
      }
      const found = [...collectJids(payload), ...collectPhoneFieldJids(payload)]
        .find((candidate) => candidate.includes(PRIVATE_JID_SUFFIX) && onlyDigits(candidate) !== lidDigits);
      if (found) return { jid: found, raw: payload };
      diagnostics.push(`${attempt.path}: telefone não retornado`);
    }

    return { jid: null, error: diagnostics.join("; ") || "JID not found in response" };
  } catch (e) {
    return { jid: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function resolveContact(
  input: string,
  baseUrl: string,
  token: string,
  lidPhoneMap?: LidPhoneMap,
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
      const digits = onlyDigits(original);
      if (!digits) {
        return { original, type, jid: null, number: null, valid: false, error: "Número inválido" };
      }

      // 🔍 LID disfarçado de número: telefones reais têm no máximo ~13 dígitos
      // (BR: 12-13, EUA: 11, internacional típico: 8-15 segundo E.164).
      // Strings com 14+ dígitos quase sempre são LIDs colados sem o sufixo @lid.
      // Tentamos resolver via UAZAPI; se vier JID real, retornamos o número de telefone.
      if (isDisguisedLidNumber(original) && baseUrl && token) {
        const mappedPhone = lidPhoneMap?.get(digits);
        if (mappedPhone) {
          const mappedJid = numberToJid(mappedPhone);
          return { original, type: "lid", jid: mappedJid, number: mappedPhone, valid: !!mappedJid };
        }
        const { jid: resolvedJid } = await resolveLidViaUazapi(baseUrl, token, `${digits}${LID_SUFFIX}`);
        if (resolvedJid && resolvedJid.includes(PRIVATE_JID_SUFFIX)) {
          return {
            original,
            type: "lid",
            jid: resolvedJid,
            number: jidToNumber(resolvedJid),
            valid: true,
          };
        }
        // Se não deu para descobrir o telefone real, mantém o @lid como destino válido.
        // O WhatsApp aceita envio para @lid; só não podemos fingir que isso é telefone.
        return {
          original,
          type: "lid",
          jid: `${digits}${LID_SUFFIX}`,
          number: null,
          valid: true,
          error: "Telefone real não retornado pela instância; usando @lid para disparo",
        };
      }

      const jid = numberToJid(digits);
      if (!jid) {
        return { original, type, jid: null, number: null, valid: false, error: "Número inválido" };
      }
      return { original, type, jid, number: jidToNumber(jid), valid: true };
    }

    // type === "lid" → consulta Uazapi
    const lidDigits = onlyDigits(original);
    const mappedPhone = lidPhoneMap?.get(lidDigits);
    if (mappedPhone) {
      const mappedJid = numberToJid(mappedPhone);
      return { original, type: "lid", jid: mappedJid, number: mappedPhone, valid: !!mappedJid };
    }
    const { jid, error } = await resolveLidViaUazapi(baseUrl, token, original);
    if (!jid) {
      const fallbackLid = `${lidDigits}${LID_SUFFIX}`;
      return {
        original,
        type: "lid",
        jid: fallbackLid,
        number: null,
        valid: true,
        error: error || "Telefone real não retornado pela instância; usando @lid para disparo",
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

    // LID disfarçado de número: precisa de UAZAPI também
    const looksLikeLidNumber = (i: string) => {
      const t = detectType(i);
      if (t === "lid") return true;
      if (t === "number" && isDisguisedLidNumber(i)) return true;
      return false;
    };
    const needsUazapi = inputs.some(looksLikeLidNumber);
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
        if (type === "number" && isDisguisedLidNumber(input)) {
          return {
            original: input,
            type: "lid",
            jid: null,
            number: null,
            valid: false,
            error: "Nenhuma instância conectada disponível para resolver LID",
          };
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

    const lidPhoneMap = needsUazapi && baseUrl && token ? await buildLidPhoneMap(baseUrl, token) : undefined;

    // Processa em paralelo (limitado)
    const concurrency = 5;
    const results: ResolvedContact[] = new Array(inputs.length);
    let cursor = 0;
    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= inputs.length) break;
        results[idx] = await resolveContact(inputs[idx], baseUrl, token, lidPhoneMap);
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
