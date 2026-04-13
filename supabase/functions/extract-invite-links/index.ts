import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string, opts: RequestInit, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

async function fetchInviteCode(baseUrl: string, token: string, groupJid: string): Promise<string | null> {
  const headers: Record<string, string> = { token, Accept: "application/json", "Content-Type": "application/json" };
  const encodedJid = encodeURIComponent(groupJid);

  // Official/public UAZAPI reference uses GET /group/invitelink/{groupJid}
  const attempts: Array<{ method: string; url: string; body?: string; label: string }> = [
    { method: "GET", label: "GET /group/invitelink/{jid}", url: `${baseUrl}/group/invitelink/${groupJid}` },
    { method: "GET", label: "GET /group/invitelink/{encodedJid}", url: `${baseUrl}/group/invitelink/${encodedJid}` },
    // Legacy / compatibility fallbacks
    { method: "GET", label: "GET /group/inviteLink/{jid}", url: `${baseUrl}/group/inviteLink/${encodedJid}` },
    { method: "GET", label: "GET /group/inviteCode/{jid}", url: `${baseUrl}/group/inviteCode/${encodedJid}` },
    { method: "GET", label: "GET /group/getInviteCode/{jid}", url: `${baseUrl}/group/getInviteCode/${encodedJid}` },
    { method: "GET", label: "GET /group/inviteCode?groupJid", url: `${baseUrl}/group/inviteCode?groupJid=${encodedJid}` },
    { method: "PUT", label: "PUT /group/inviteLink", url: `${baseUrl}/group/inviteLink`, body: JSON.stringify({ groupJid: groupJid }) },
    { method: "PUT", label: "PUT /group/inviteCode", url: `${baseUrl}/group/inviteCode`, body: JSON.stringify({ groupJid: groupJid }) },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetchWithTimeout(attempt.url, {
        method: attempt.method,
        headers,
        ...(attempt.body ? { body: attempt.body } : {}),
      }, 6_000);

      const raw = await res.text();
      const snippet = raw.substring(0, 300);
      console.log(`[invite] ${attempt.label} => ${res.status} ${snippet}`);

      if (!res.ok) continue;
      if (!raw || raw.length < 5) continue;

      const linkMatch = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/);
      if (linkMatch?.[1]) return `https://chat.whatsapp.com/${linkMatch[1]}`;

      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { continue; }
      const code = findInviteCode(parsed);
      if (code) return `https://chat.whatsapp.com/${code}`;
    } catch (err: any) {
      console.log(`[invite] ${attempt.label} err: ${err?.message}`);
      continue;
    }
  }

  // Fallback: inspect group/info to confirm whether this UAZAPI build exposes invite data at all
  const infoAttempts = [
    { method: "POST", url: `${baseUrl}/group/info`, body: JSON.stringify({ groupJid: groupJid }) },
    { method: "POST", url: `${baseUrl}/group/info`, body: JSON.stringify({ groupjid: groupJid }) },
  ];

  for (const attempt of infoAttempts) {
    try {
      const res = await fetchWithTimeout(attempt.url, { method: attempt.method, headers, body: attempt.body }, 6_000);
      if (!res.ok) continue;
      const raw = await res.text();
      console.log(`[invite] /group/info fallback (${raw.length} chars)`);

      const linkMatch = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/);
      if (linkMatch?.[1]) return `https://chat.whatsapp.com/${linkMatch[1]}`;

      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { continue; }
      const code = findInviteCode(parsed);
      if (code) return `https://chat.whatsapp.com/${code}`;

      console.log(`[invite] /group/info keys: ${Object.keys(parsed || {}).join(", ")}`);
    } catch {
      continue;
    }
  }

  return null;
}

function findInviteCode(obj: any, depth = 0): string | null {
  if (!obj || depth > 3) return null;
  if (typeof obj === "string") {
    const clean = obj.replace(/^https?:\/\/chat\.whatsapp\.com\//i, "").split(/[/?#\s]/)[0].trim();
    if (/^[A-Za-z0-9_-]{10,}$/.test(clean)) return clean;
    return null;
  }
  if (typeof obj !== "object") return null;

  // Check known keys first
  const keys = ["inviteCode", "invite", "inviteLink", "inviteUrl", "code", "link", "url", "invite_code", "invite_link"];
  for (const key of keys) {
    if (obj[key]) {
      const result = findInviteCode(obj[key], depth + 1);
      if (result) return result;
    }
  }

  // Check nested objects (data, group, etc.)
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

      const results: Array<{ jid: string; name: string; link: string | null; error?: string }> = [];

      for (const item of group_jids) {
        const jid = typeof item === "string" ? item : item?.jid;
        const name = typeof item === "string" ? "" : item?.name || "";
        try {
          const link = await fetchInviteCode(baseUrl, token, jid);
          console.log(`[extract-invite-links] ${name || jid}: ${link || "NO LINK"}`);
          results.push({ jid, name, link });
        } catch (err: any) {
          console.error(`[extract-invite-links] Error for ${jid}: ${err?.message}`);
          results.push({ jid, name, link: null, error: err?.message || "Erro" });
        }
      }

      const okCount = results.filter(r => r.link).length;
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
