import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMEOUT_MS = 8_000;
const BETWEEN_GROUPS_DELAY_MS = 350;
const RATE_LIMIT_RETRY_DELAY_MS = 900;

interface InviteDiagnostics {
  requested_url?: string;
  http_status?: number;
  error_stage?: string;
  provider_message?: string;
  processing_time_ms?: number;
}

interface InviteFetchResult {
  ok: boolean;
  link: string | null;
  error?: string;
  diagnostics?: InviteDiagnostics;
}

async function fetchWithTimeout(url: string, opts: RequestInit, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractProviderMessage(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";

  try {
    const parsed = JSON.parse(text);
    const candidates = [
      parsed?.error,
      parsed?.message,
      parsed?.details,
      parsed?.data?.error,
      parsed?.data?.message,
      parsed?.data?.details,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {
    // ignore JSON parse failures
  }

  return text.replace(/\s+/g, " ").slice(0, 220);
}

function translateInviteError(status: number, providerMessage: string) {
  const msg = providerMessage.toLowerCase();

  if (
    msg.includes("you don't have the permission") ||
    msg.includes("permission to get the group's invite link")
  ) {
    return "Sem permissão: essa instância não é admin deste grupo, então a UAZAPI não libera o link de convite.";
  }

  if (status === 429 || msg.includes("rate-overlimit") || msg.includes("too many requests")) {
    return "Limite temporário da UAZAPI atingido. Tente novamente com poucos grupos por vez.";
  }

  if (status === 404 || msg.includes("not found")) {
    return "A sua versão da UAZAPI não expõe esse endpoint de link de convite.";
  }

  if (status >= 500) {
    return providerMessage
      ? `Erro interno da UAZAPI: ${providerMessage}`
      : "Erro interno da UAZAPI ao consultar o link de convite.";
  }

  return providerMessage || `Erro da UAZAPI (status ${status}).`;
}

async function fetchGroupsList(baseUrl: string, token: string): Promise<any[]> {
  const headers = { token, Accept: "application/json", "Content-Type": "application/json" };
  const endpoints = [
    `${baseUrl}/group/list?GetParticipants=false&count=500`,
    `${baseUrl}/group/list?GetParticipants=false&page=1&count=500`,
    `${baseUrl}/group/fetchAllGroups?getParticipants=false`,
    `${baseUrl}/group/listAll`,
    `${baseUrl}/chats?type=group&count=500`,
  ];

  const allGroups: any[] = [];
  const seenJids = new Set<string>();

  for (const endpoint of endpoints) {
    try {
      const res = await fetchWithTimeout(endpoint, { method: "GET", headers });
      if (!res.ok) continue;
      const data = await res.json();
      const arr = Array.isArray(data?.groups || data?.data || data) ? (data?.groups || data?.data || data) : [];
      for (const g of arr) {
        const jid = g.JID || g.jid || g.id || g.groupJid || g.chatId || "";
        if (jid && jid.includes("@g.us") && !seenJids.has(jid)) {
          seenJids.add(jid);
          allGroups.push({
            jid,
            name: g.Subject || g.subject || g.Name || g.name || g.groupName || g.title || "",
            participants_count: g.ParticipantCount || g.Participants?.length || g.participants?.length || g.participantsCount || g.size || 0,
          });
        }
      }
      if (allGroups.length > 0) break;
    } catch {
      continue;
    }
  }

  return allGroups;
}

function parseInviteLinkFromRaw(raw: string): string | null {
  const text = String(raw || "");
  const fullLinkMatch = text.match(/https?:\/\/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/i);
  if (fullLinkMatch?.[1]) {
    return `https://chat.whatsapp.com/${fullLinkMatch[1]}`;
  }

  try {
    const parsed = JSON.parse(text);
    const code = findInviteCode(parsed);
    if (code) return `https://chat.whatsapp.com/${code}`;
  } catch {
    // ignore JSON parse failures
  }

  return null;
}

async function fetchInviteCode(baseUrl: string, token: string, groupJid: string): Promise<InviteFetchResult> {
  const startedAt = Date.now();
  const headers: Record<string, string> = { token, Accept: "application/json", "Content-Type": "application/json" };
  const encodedJid = encodeURIComponent(groupJid);

  const attempts = [
    { label: "GET /group/invitelink/{jid}", url: `${baseUrl}/group/invitelink/${groupJid}` },
    { label: "GET /group/invitelink/{encodedJid}", url: `${baseUrl}/group/invitelink/${encodedJid}` },
  ];

  for (const attempt of attempts) {
    try {
      let res = await fetchWithTimeout(attempt.url, { method: "GET", headers }, 6_000);
      let raw = await res.text();
      let providerMessage = extractProviderMessage(raw);
      console.log(`[invite] ${attempt.label} => ${res.status} ${raw.substring(0, 300)}`);

      if (!res.ok && (res.status === 429 || providerMessage.toLowerCase().includes("rate-overlimit"))) {
        await sleep(RATE_LIMIT_RETRY_DELAY_MS);
        res = await fetchWithTimeout(attempt.url, { method: "GET", headers }, 6_000);
        raw = await res.text();
        providerMessage = extractProviderMessage(raw);
        console.log(`[invite] ${attempt.label} retry => ${res.status} ${raw.substring(0, 300)}`);
      }

      const link = parseInviteLinkFromRaw(raw);
      if (res.ok && link) {
        return {
          ok: true,
          link,
          diagnostics: {
            requested_url: attempt.url,
            http_status: res.status,
            processing_time_ms: Date.now() - startedAt,
          },
        };
      }

      if (!res.ok) {
        const error = translateInviteError(res.status, providerMessage);

        if (res.status === 404) {
          continue;
        }

        return {
          ok: false,
          link: null,
          error,
          diagnostics: {
            requested_url: attempt.url,
            http_status: res.status,
            error_stage: "uazapi_response",
            provider_message: providerMessage || undefined,
            processing_time_ms: Date.now() - startedAt,
          },
        };
      }
    } catch (err: any) {
      console.log(`[invite] ${attempt.label} err: ${err?.message}`);
    }
  }

  try {
    const infoRes = await fetchWithTimeout(`${baseUrl}/group/info`, {
      method: "POST",
      headers,
      body: JSON.stringify({ groupjid: groupJid }),
    }, 6_000);

    const infoRaw = await infoRes.text();
    const infoLink = parseInviteLinkFromRaw(infoRaw);
    if (infoRes.ok && infoLink) {
      return {
        ok: true,
        link: infoLink,
        diagnostics: {
          requested_url: `${baseUrl}/group/info`,
          http_status: infoRes.status,
          processing_time_ms: Date.now() - startedAt,
        },
      };
    }

    if (infoRes.ok) {
      const providerMessage = extractProviderMessage(infoRaw);
      console.log(`[invite] /group/info fallback (${infoRaw.length} chars)`);
      try {
        const parsed = JSON.parse(infoRaw);
        console.log(`[invite] /group/info keys: ${Object.keys(parsed || {}).join(", ")}`);
      } catch {
        // ignore JSON parse failures
      }

      return {
        ok: false,
        link: null,
        error: "A UAZAPI reconheceu o grupo, mas não retornou o link de convite para ele.",
        diagnostics: {
          requested_url: `${baseUrl}/group/info`,
          http_status: infoRes.status,
          error_stage: "missing_invite_data",
          provider_message: providerMessage || undefined,
          processing_time_ms: Date.now() - startedAt,
        },
      };
    }
  } catch (err: any) {
    console.log(`[invite] /group/info fallback err: ${err?.message}`);
  }

  return {
    ok: false,
    link: null,
    error: "Não foi possível consultar o link de convite na UAZAPI.",
    diagnostics: {
      error_stage: "request_failed",
      processing_time_ms: Date.now() - startedAt,
    },
  };
}

function findInviteCode(obj: any, depth = 0): string | null {
  if (!obj || depth > 3) return null;
  if (typeof obj === "string") {
    const clean = obj.replace(/^https?:\/\/chat\.whatsapp\.com\//i, "").split(/[/?#\s]/)[0].trim();
    if (/^[A-Za-z0-9_-]{10,}$/.test(clean)) return clean;
    return null;
  }
  if (typeof obj !== "object") return null;

  const keys = ["inviteCode", "invite", "inviteLink", "inviteUrl", "code", "link", "url", "invite_code", "invite_link"];
  for (const key of keys) {
    if (obj[key]) {
      const result = findInviteCode(obj[key], depth + 1);
      if (result) return result;
    }
  }

  const nested = ["data", "group", "result", "response"];
  for (const key of nested) {
    if (obj[key] && typeof obj[key] === "object") {
      const result = findInviteCode(obj[key], depth + 1);
      if (result) return result;
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { action, device_id, group_jids } = body;

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: device } = await serviceClient
      .from("devices")
      .select("uazapi_token, uazapi_base_url, name, number")
      .eq("id", device_id)
      .eq("user_id", user.id)
      .single();

    if (!device?.uazapi_token || !device?.uazapi_base_url) {
      return new Response(JSON.stringify({ error: "Dispositivo não configurado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
    const token = device.uazapi_token;

    if (action === "list_groups") {
      const groups = await fetchGroupsList(baseUrl, token);
      return new Response(JSON.stringify({ groups }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "extract_links") {
      if (!Array.isArray(group_jids) || group_jids.length === 0) {
        return new Response(JSON.stringify({ error: "Selecione pelo menos um grupo" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[extract-invite-links] Extracting ${group_jids.length} groups for device ${device_id}`);

      const results: Array<{
        jid: string;
        name: string;
        link: string | null;
        error?: string;
        diagnostics?: InviteDiagnostics;
      }> = [];

      for (const [index, item] of group_jids.entries()) {
        const jid = typeof item === "string" ? item : item?.jid;
        const name = typeof item === "string" ? "" : item?.name || "";

        try {
          const result = await fetchInviteCode(baseUrl, token, jid);
          console.log(`[extract-invite-links] ${name || jid}: ${result.link || result.error || "NO LINK"}`);
          results.push({
            jid,
            name,
            link: result.link,
            error: result.error,
            diagnostics: result.diagnostics,
          });
        } catch (err: any) {
          console.error(`[extract-invite-links] Error for ${jid}: ${err?.message}`);
          results.push({ jid, name, link: null, error: err?.message || "Erro" });
        }

        if (index < group_jids.length - 1) {
          await sleep(BETWEEN_GROUPS_DELAY_MS);
        }
      }

      const okCount = results.filter((r) => r.link).length;
      console.log(`[extract-invite-links] Done: ${okCount}/${results.length} links extracted`);

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[extract-invite-links] Error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});