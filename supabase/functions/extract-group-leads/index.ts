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

interface Participant {
  phone: string;
  name: string;
  group_jid: string;
  group_name: string;
  is_admin: boolean;
}

// Check if a phone string is a valid number (not a LID)
function isValidPhone(raw: string): boolean {
  const clean = raw.replace(/@.*$/, "").replace(/[^0-9]/g, "");
  return clean.length >= 8 && !/^[0-9]{15,}$/.test(clean); // LIDs tend to be very long non-phone numbers
}

// ── Fetch all groups from UAZAPI (lightweight, no participants) ──
async function fetchGroupsList(baseUrl: string, token: string): Promise<any[]> {
  const endpoints = [
    `${baseUrl}/group/list?GetParticipants=false&count=500`,
    `${baseUrl}/group/fetchAllGroups?getParticipants=false`,
    `${baseUrl}/group/listAll`,
    `${baseUrl}/chats?type=group`,
  ];

  const headers: Record<string, string> = { token, Accept: "application/json", "Cache-Control": "no-cache" };

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(ep, { method: "GET", headers });
      if (!res.ok) continue;
      const raw = await res.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { continue; }
      if (!parsed) continue;

      const candidates = [parsed, parsed?.groups, parsed?.data, parsed?.data?.groups, parsed?.chats];
      for (const c of candidates) {
        if (Array.isArray(c) && c.length > 0) {
          console.log(`[extractor] Found ${c.length} groups from ${ep.split('?')[0]}`);
          return c;
        }
      }
    } catch { continue; }
  }
  return [];
}

// ── Fetch participants for specific groups ──
async function fetchGroupsWithParticipants(baseUrl: string, token: string, targetJids?: Set<string>): Promise<any[]> {
  const endpoints = [
    `${baseUrl}/group/list?GetParticipants=true&count=500`,
    `${baseUrl}/group/fetchAllGroups`,
  ];

  const headers: Record<string, string> = { token, Accept: "application/json", "Cache-Control": "no-cache" };

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(ep, { method: "GET", headers });
      if (!res.ok) continue;
      const raw = await res.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { continue; }
      if (!parsed) continue;

      const candidates = [parsed, parsed?.groups, parsed?.data];
      for (const c of candidates) {
        if (Array.isArray(c) && c.length > 0) {
          // If targetJids provided, only return matching groups
          if (targetJids) {
            return c.filter((g: any) => {
              const jid = g?.JID || g?.jid || g?.id || "";
              return targetJids.has(jid);
            });
          }
          return c;
        }
      }
    } catch { continue; }
  }
  return [];
}

interface ParseResult {
  valid: Participant[];
  lids: Participant[];
}

function parseParticipants(rawParticipants: any[], groupJid: string, groupName: string): ParseResult {
  const valid: Participant[] = [];
  const lids: Participant[] = [];
  for (const p of rawParticipants) {
    const phoneRaw = p?.PhoneNumber || p?.phoneNumber || p?.phone || p?.number || p?.id || p?.jid || p?.JID || "";
    const phoneStr = String(phoneRaw);

    const name = p?.DisplayName || p?.displayName || p?.name || p?.pushName || p?.notify || p?.Name || "";
    const isAdmin = p?.IsAdmin === true || p?.IsSuperAdmin === true ||
                    p?.isAdmin === true || p?.isSuperAdmin === true ||
                    p?.admin === "admin" || p?.admin === "superadmin";

    // LID entries → separate bucket
    if (phoneStr.includes("@lid") || phoneStr.includes("@newsletter")) {
      const lidId = phoneStr.replace(/@.*$/, "");
      lids.push({ phone: lidId, name: String(name || ""), group_jid: groupJid, group_name: groupName, is_admin: isAdmin });
      continue;
    }

    const cleanPhone = phoneStr.replace(/@.*$/, "").replace(/[^0-9]/g, "");
    if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 15) continue;

    valid.push({
      phone: cleanPhone,
      name: String(name || ""),
      group_jid: groupJid,
      group_name: groupName,
      is_admin: isAdmin,
    });
  }
  return { valid, lids };
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

    // ── ACTION: list_groups (lightweight — no participants) ──
    if (action === "list_groups") {
      const rawGroups = await fetchGroupsList(baseUrl, token);
      const groups = rawGroups.map((g: any) => {
        const jid = g?.JID || g?.jid || g?.id || g?.groupJid || "";
        const name = g?.Name || g?.subject || g?.name || g?.title || "Grupo";
        const participants = g?.Participants || g?.participants || [];
        const pCount = participants.length || g?.size || g?.memberCount || g?.Size || 0;
        return { jid, name, participants_count: pCount };
      }).filter((g: any) => g.jid.includes("@g.us"));

      return new Response(JSON.stringify({ groups }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: extract_participants (batch-aware) ──
    if (action === "extract_participants") {
      if (!Array.isArray(group_jids) || group_jids.length === 0) {
        return new Response(JSON.stringify({ error: "No groups selected" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const selectedJids = new Set<string>(group_jids.map((g: any) => typeof g === "string" ? g : g.jid));
      const nameMap = new Map<string, string>();
      for (const g of group_jids) {
        if (typeof g === "object") nameMap.set(g.jid, g.name || g.jid);
      }

      console.log(`[extractor] Extracting from ${selectedJids.size} groups`);

      // Fetch groups with participants (filtered to selected only)
      const matchedGroups = await fetchGroupsWithParticipants(baseUrl, token, selectedJids);
      console.log(`[extractor] Matched ${matchedGroups.length} groups with participant data`);

      const allParticipants: Participant[] = [];
      let lidSkipped = 0;

      for (const g of matchedGroups) {
        const jid = g?.JID || g?.jid || g?.id || "";
        const gName = nameMap.get(jid) || g?.Name || g?.subject || g?.name || jid;
        const rawPs = g?.Participants || g?.participants || [];
        const beforeCount = allParticipants.length;
        const parsed = parseParticipants(rawPs, jid, gName);
        allParticipants.push(...parsed);
        lidSkipped += rawPs.length - parsed.length;
        console.log(`[extractor] "${gName}": ${parsed.length} valid, ${rawPs.length - parsed.length} LID/invalid skipped`);
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

      // Deduplicate
      const seen = new Map<string, Participant>();
      for (const p of filtered) {
        if (!seen.has(p.phone)) seen.set(p.phone, p);
      }

      const deduplicated = Array.from(seen.values());
      console.log(`[extractor] Final: ${deduplicated.length} unique (${lidSkipped} LID skipped, ${filtered.length - deduplicated.length} dupes removed)`);

      return new Response(JSON.stringify({
        total: deduplicated.length,
        total_before_dedup: filtered.length,
        lid_skipped: lidSkipped,
        participants: deduplicated,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(`[extractor] Fatal: ${err?.message}`);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
