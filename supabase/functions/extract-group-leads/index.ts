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
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface GroupInfo {
  jid: string;
  name: string;
  participants_count: number;
  participants?: any[];
}

interface Participant {
  phone: string;
  name: string;
  group_jid: string;
  group_name: string;
  is_admin: boolean;
}

// ── Fetch all groups WITH participants from UAZAPI ──
async function fetchGroupsWithParticipants(baseUrl: string, token: string): Promise<GroupInfo[]> {
  const endpoints = [
    `${baseUrl}/group/list?GetParticipants=true&count=500`,
    `${baseUrl}/group/fetchAllGroups`,
    `${baseUrl}/group/fetchAllGroups?getParticipants=true`,
    `${baseUrl}/group/listAll`,
    `${baseUrl}/chats?type=group`,
  ];

  const headers: Record<string, string> = { token, Accept: "application/json", "Cache-Control": "no-cache" };
  const dedup = new Map<string, GroupInfo>();

  for (const ep of endpoints) {
    try {
      console.log(`[extractor] Trying endpoint: ${ep}`);
      const res = await fetchWithTimeout(ep, { method: "GET", headers });
      if (!res.ok) {
        console.log(`[extractor] ${ep} returned ${res.status}`);
        continue;
      }
      const raw = await res.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { continue; }
      if (!parsed) continue;

      // Find the groups array
      const candidates = [parsed, parsed?.groups, parsed?.data, parsed?.data?.groups, parsed?.chats, parsed?.data?.chats];
      const rows: any[] = [];
      for (const c of candidates) {
        if (Array.isArray(c)) { rows.push(...c); break; }
      }

      console.log(`[extractor] Found ${rows.length} groups from ${ep}`);

      for (const g of rows) {
        const jid = g?.JID || g?.jid || g?.id || g?.groupJid || g?.chatId || null;
        const name = g?.Name || g?.subject || g?.name || g?.title || "Grupo";
        if (!jid || !String(jid).includes("@g.us")) continue;

        // Get participants array
        const participants = g?.Participants || g?.participants || [];
        const pCount = participants.length || g?.size || g?.memberCount || g?.Size || 0;

        if (!dedup.has(jid)) {
          dedup.set(jid, { jid, name, participants_count: pCount, participants });
        }
      }

      if (dedup.size > 0) {
        console.log(`[extractor] Success: ${dedup.size} groups with participants`);
        return Array.from(dedup.values());
      }
    } catch (err: any) {
      console.log(`[extractor] Error on ${ep}: ${err?.message}`);
      continue;
    }
  }
  return [];
}

// ── Extract participants from cached group data ──
function parseParticipants(rawParticipants: any[], groupJid: string, groupName: string): Participant[] {
  const results: Participant[] = [];
  for (const p of rawParticipants) {
    // PhoneNumber format: "5511913292286@s.whatsapp.net" or plain number
    const phoneRaw = p?.PhoneNumber || p?.phoneNumber || p?.phone || p?.number || p?.id || p?.jid || p?.JID || "";
    const cleanPhone = String(phoneRaw).replace(/@.*$/, "").replace(/[^0-9]/g, "");
    if (!cleanPhone || cleanPhone.length < 8) continue;

    const name = p?.DisplayName || p?.displayName || p?.name || p?.pushName || p?.notify || p?.Name || "";
    const isAdmin = p?.IsAdmin === true || p?.IsSuperAdmin === true ||
                    p?.isAdmin === true || p?.isSuperAdmin === true ||
                    p?.admin === "admin" || p?.admin === "superadmin" ||
                    p?.role === "admin" || p?.role === "superadmin";

    results.push({
      phone: cleanPhone,
      name: String(name || ""),
      group_jid: groupJid,
      group_name: groupName,
      is_admin: isAdmin,
    });
  }
  return results;
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { action, device_id, group_jids, filters } = body;

    const { data: device, error: devErr } = await adminClient
      .from("devices")
      .select("id, name, uazapi_base_url, uazapi_token, user_id, status")
      .eq("id", device_id)
      .single();

    if (devErr || !device) {
      return new Response(JSON.stringify({ error: "Device not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (device.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not your device" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!device.uazapi_base_url || !device.uazapi_token) {
      return new Response(JSON.stringify({ error: "Device has no API credentials" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
    const token = device.uazapi_token;

    // ── ACTION: list_groups ──
    // Returns groups WITH participant counts (fetched with participants to get accurate count)
    if (action === "list_groups") {
      const groups = await fetchGroupsWithParticipants(baseUrl, token);
      // Strip participants from response to keep it light
      const summary = groups.map(g => ({
        jid: g.jid,
        name: g.name,
        participants_count: g.participants_count,
      }));
      return new Response(JSON.stringify({ groups: summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: extract_participants ──
    if (action === "extract_participants") {
      if (!Array.isArray(group_jids) || group_jids.length === 0) {
        return new Response(JSON.stringify({ error: "No groups selected" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const selectedJids = new Set(group_jids.map((g: any) => typeof g === "string" ? g : g.jid));
      const selectedNames = new Map<string, string>();
      for (const g of group_jids) {
        if (typeof g === "object") selectedNames.set(g.jid, g.name || g.jid);
      }

      console.log(`[extractor] Extracting from ${selectedJids.size} groups`);

      // Fetch all groups with full participant data
      const allGroups = await fetchGroupsWithParticipants(baseUrl, token);

      const allParticipants: Participant[] = [];

      for (const group of allGroups) {
        if (!selectedJids.has(group.jid)) continue;
        const gName = selectedNames.get(group.jid) || group.name;
        const participants = parseParticipants(group.participants || [], group.jid, gName);
        console.log(`[extractor] Group "${gName}": ${participants.length} participants`);
        allParticipants.push(...participants);
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

      // Deduplicate by phone number
      const seen = new Map<string, Participant>();
      for (const p of filtered) {
        if (!seen.has(p.phone)) {
          seen.set(p.phone, p);
        }
      }

      const deduplicated = Array.from(seen.values());
      console.log(`[extractor] Result: ${deduplicated.length} unique leads (${filtered.length} before dedup)`);

      return new Response(JSON.stringify({
        total: deduplicated.length,
        total_before_dedup: filtered.length,
        participants: deduplicated,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(`[extractor] Fatal error: ${err?.message}`);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
