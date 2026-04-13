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
  const headers = { token, Accept: "application/json", "Content-Type": "application/json" };

  const attempts = [
    { method: "GET", url: `${baseUrl}/group/inviteCode/${encodeURIComponent(groupJid)}` },
    { method: "POST", url: `${baseUrl}/group/inviteCode`, body: JSON.stringify({ groupjid: groupJid }) },
    { method: "POST", url: `${baseUrl}/group/inviteCode`, body: JSON.stringify({ groupJid }) },
    { method: "GET", url: `${baseUrl}/group/inviteLink/${encodeURIComponent(groupJid)}` },
    { method: "POST", url: `${baseUrl}/group/inviteLink`, body: JSON.stringify({ groupjid: groupJid }) },
    { method: "GET", url: `${baseUrl}/group/invite/${encodeURIComponent(groupJid)}` },
    { method: "POST", url: `${baseUrl}/group/getInviteCode`, body: JSON.stringify({ groupjid: groupJid }) },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetchWithTimeout(attempt.url, {
        method: attempt.method as string,
        headers,
        ...(attempt.body ? { body: attempt.body } : {}),
      }, 10_000);

      if (!res.ok) continue;

      const raw = await res.text();
      if (!raw) continue;

      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { continue; }

      // Extract invite code from various response shapes
      const code = parsed?.inviteCode || parsed?.invite || parsed?.inviteLink ||
        parsed?.code || parsed?.data?.inviteCode || parsed?.data?.invite ||
        parsed?.data?.inviteLink || parsed?.data?.code ||
        parsed?.group?.inviteCode || parsed?.group?.invite || null;

      if (typeof code === "string" && code.trim()) {
        const clean = code.trim()
          .replace(/^https?:\/\/chat\.whatsapp\.com\//i, "")
          .split(/[/?#\s]/)[0]
          .trim();
        if (clean && clean.length >= 10) {
          return `https://chat.whatsapp.com/${clean}`;
        }
      }
    } catch {
      continue;
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

      const results: Array<{ jid: string; name: string; link: string | null; error?: string }> = [];

      for (const item of group_jids) {
        const jid = typeof item === "string" ? item : item?.jid;
        const name = typeof item === "string" ? "" : item?.name || "";
        try {
          const link = await fetchInviteCode(baseUrl, token, jid);
          results.push({ jid, name, link });
        } catch (err: any) {
          results.push({ jid, name, link: null, error: err?.message || "Erro" });
        }
      }

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
