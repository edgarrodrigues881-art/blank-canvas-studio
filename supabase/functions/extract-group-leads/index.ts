// ══════════════════════════════════════════════════════════
// Edge Function — Extrator de Leads de Grupos WhatsApp
// ══════════════════════════════════════════════════════════

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
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

interface GroupInfo {
  jid: string;
  name: string;
  participants_count: number;
}

interface Participant {
  phone: string;
  name: string;
  group_jid: string;
  group_name: string;
  is_admin: boolean;
}

// ── List groups from UAZAPI ──
async function listGroups(baseUrl: string, token: string): Promise<GroupInfo[]> {
  const endpoints = [
    `${baseUrl}/group/fetchAllGroups?getParticipants=false`,
    `${baseUrl}/group/fetchAllGroups`,
    `${baseUrl}/group/list?GetParticipants=false&count=500`,
    `${baseUrl}/group/listAll`,
    `${baseUrl}/chats?type=group`,
  ];

  const headers: Record<string, string> = { token, Accept: "application/json", "Cache-Control": "no-cache" };
  const dedup = new Map<string, GroupInfo>();

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(ep, { method: "GET", headers });
      if (!res.ok) continue;
      const raw = await res.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { continue; }
      if (!parsed) continue;

      const candidates = [parsed, parsed?.groups, parsed?.data, parsed?.data?.groups, parsed?.chats, parsed?.data?.chats];
      const rows: any[] = [];
      for (const c of candidates) {
        if (Array.isArray(c)) rows.push(...c);
      }

      for (const g of rows) {
        const jid = g?.JID || g?.jid || g?.id || g?.groupJid || g?.chatId || null;
        const name = g?.subject || g?.name || g?.Name || g?.title || "Grupo";
        if (!jid || !String(jid).includes("@g.us")) continue;
        const pCount = g?.size || g?.participants?.length || g?.memberCount || g?.Size || 0;
        if (!dedup.has(jid)) dedup.set(jid, { jid, name, participants_count: pCount });
      }

      if (dedup.size > 0) return Array.from(dedup.values());
    } catch { continue; }
  }
  return [];
}

// ── Extract participants from a single group ──
async function extractParticipants(baseUrl: string, token: string, groupJid: string, groupName: string): Promise<Participant[]> {
  const endpoints = [
    { url: `${baseUrl}/group/participants?groupJid=${encodeURIComponent(groupJid)}`, method: "GET" as const },
    { url: `${baseUrl}/group/fetchAllGroups`, method: "GET" as const },
    { url: `${baseUrl}/group/inviteInfo`, method: "POST" as const, body: { groupJid } },
  ];

  const headers: Record<string, string> = { token, Accept: "application/json" };
  const participants: Participant[] = [];

  for (const ep of endpoints) {
    try {
      const opts: RequestInit = { method: ep.method, headers: { ...headers } };
      if (ep.method === "POST") {
        (opts.headers as any)["Content-Type"] = "application/json";
        opts.body = JSON.stringify(ep.body || {});
      }
      const res = await fetchWithTimeout(ep.url, opts);
      if (!res.ok) continue;
      const raw = await res.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { continue; }
      if (!parsed) continue;

      // Try to find participants array
      let pList: any[] = [];

      // Direct array of participants
      if (Array.isArray(parsed)) {
        pList = parsed;
      } else if (Array.isArray(parsed?.participants)) {
        pList = parsed.participants;
      } else if (Array.isArray(parsed?.data)) {
        pList = parsed.data;
      } else if (Array.isArray(parsed?.data?.participants)) {
        pList = parsed.data.participants;
      }

      // If this is fetchAllGroups, find specific group
      if (pList.length === 0 && !Array.isArray(parsed)) {
        const candidates = [parsed, parsed?.groups, parsed?.data];
        for (const c of candidates) {
          if (!Array.isArray(c)) continue;
          const group = c.find((g: any) => {
            const gJid = g?.JID || g?.jid || g?.id || g?.groupJid || "";
            return gJid === groupJid;
          });
          if (group?.participants) {
            pList = group.participants;
            break;
          }
        }
      }

      for (const p of pList) {
        const phone = p?.id || p?.phone || p?.number || p?.jid || p?.ID || "";
        const cleanPhone = String(phone).replace(/@.*$/, "").replace(/[^0-9]/g, "");
        if (!cleanPhone || cleanPhone.length < 8) continue;

        const name = p?.name || p?.pushName || p?.notify || p?.Name || "";
        const isAdmin = p?.admin === "admin" || p?.admin === "superadmin" || p?.isAdmin === true || p?.isSuperAdmin === true || p?.role === "admin" || p?.role === "superadmin";

        participants.push({
          phone: cleanPhone,
          name: String(name || ""),
          group_jid: groupJid,
          group_name: groupName,
          is_admin: isAdmin,
        });
      }

      if (participants.length > 0) return participants;
    } catch { continue; }
  }
  return participants;
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

    // Auth: verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { action, device_id, group_jids, filters } = body;

    // Get device credentials
    const { data: device, error: devErr } = await adminClient
      .from("devices")
      .select("id, name, uazapi_base_url, uazapi_token, user_id, status")
      .eq("id", device_id)
      .single();

    if (devErr || !device) {
      return new Response(JSON.stringify({ error: "Device not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify ownership
    if (device.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not your device" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!device.uazapi_base_url || !device.uazapi_token) {
      return new Response(JSON.stringify({ error: "Device has no API credentials" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
    const token = device.uazapi_token;

    // ── ACTION: list_groups ──
    if (action === "list_groups") {
      const groups = await listGroups(baseUrl, token);
      return new Response(JSON.stringify({ groups }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: extract_participants ──
    if (action === "extract_participants") {
      if (!Array.isArray(group_jids) || group_jids.length === 0) {
        return new Response(JSON.stringify({ error: "No groups selected" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const allParticipants: Participant[] = [];

      // Process groups sequentially to avoid API overload
      for (const gInfo of group_jids) {
        const jid = typeof gInfo === "string" ? gInfo : gInfo.jid;
        const name = typeof gInfo === "string" ? jid : (gInfo.name || jid);
        try {
          const participants = await extractParticipants(baseUrl, token, jid, name);
          allParticipants.push(...participants);
        } catch { /* skip failed group */ }
      }

      // Apply filters
      let filtered = allParticipants;

      if (filters?.brazil_only) {
        filtered = filtered.filter(p => p.phone.startsWith("55"));
      }

      if (filters?.participant_type === "admin") {
        filtered = filtered.filter(p => p.is_admin);
      } else if (filters?.participant_type === "member") {
        filtered = filtered.filter(p => !p.is_admin);
      }

      // Deduplicate by phone number (keep first occurrence)
      const seen = new Map<string, Participant>();
      for (const p of filtered) {
        if (!seen.has(p.phone)) {
          seen.set(p.phone, p);
        }
      }

      const deduplicated = Array.from(seen.values());

      return new Response(JSON.stringify({
        total: deduplicated.length,
        total_before_dedup: filtered.length,
        participants: deduplicated,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
