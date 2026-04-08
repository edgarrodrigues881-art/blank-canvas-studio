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

// Try to find a real phone number from any field in a participant object
function tryExtractPhone(p: any): string | null {
  // Check all possible phone fields EXCEPT the primary jid/id (which might be @lid)
  const candidates = [
    p?.PhoneNumber, p?.phoneNumber, p?.phone, p?.number,
    p?.Phone, p?.Number, p?.wid, p?.wa_id, p?.waId,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const s = String(c).replace(/@.*$/, "").replace(/[^0-9]/g, "");
    if (s.length >= 8 && s.length <= 15) return s;
  }
  // Try to extract from name if it looks like a phone (e.g. "+55 11 99999-9999" or "5511999999999")
  const nameStr = String(p?.DisplayName || p?.displayName || p?.name || p?.pushName || p?.notify || p?.Name || "");
  const digitsFromName = nameStr.replace(/[^0-9]/g, "");
  if (digitsFromName.length >= 10 && digitsFromName.length <= 15) return digitsFromName;
  return null;
}

function parseParticipants(rawParticipants: any[], groupJid: string, groupName: string): ParseResult {
  const valid: Participant[] = [];
  const lids: Participant[] = [];
  for (const p of rawParticipants) {
    const primaryId = p?.id || p?.jid || p?.JID || "";
    const primaryStr = String(primaryId);

    const name = p?.DisplayName || p?.displayName || p?.name || p?.pushName || p?.notify || p?.Name || "";
    const isAdmin = p?.IsAdmin === true || p?.IsSuperAdmin === true ||
                    p?.isAdmin === true || p?.isSuperAdmin === true ||
                    p?.admin === "admin" || p?.admin === "superadmin";

    const isLid = primaryStr.includes("@lid") || primaryStr.includes("@newsletter");

    if (isLid) {
      // Try to recover a real phone number from other fields
      const recoveredPhone = tryExtractPhone(p);
      if (recoveredPhone) {
        // We found a real phone! Add to valid list instead
        valid.push({ phone: recoveredPhone, name: String(name || ""), group_jid: groupJid, group_name: groupName, is_admin: isAdmin });
      } else {
        const lidId = primaryStr.replace(/@.*$/, "");
        lids.push({ phone: lidId, name: String(name || ""), group_jid: groupJid, group_name: groupName, is_admin: isAdmin });
      }
      continue;
    }

    // Normal participant — try primary id first, then other fields
    const phoneRaw = p?.PhoneNumber || p?.phoneNumber || p?.phone || p?.number || primaryStr;
    const cleanPhone = String(phoneRaw).replace(/@.*$/, "").replace(/[^0-9]/g, "");
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

    const adminClient = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action, device_id, group_jids, filters } = body;

    if (!device_id || typeof device_id !== "string") {
      return new Response(JSON.stringify({ error: "device_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
    const deviceToken = device.uazapi_token;

    // ── ACTION: list_groups (lightweight — no participants) ──
    if (action === "list_groups") {
      const rawGroups = await fetchGroupsList(baseUrl, deviceToken);
      const groups = rawGroups.map((g: any) => {
        const jid = g?.JID || g?.jid || g?.id || g?.groupJid || "";
        const name = g?.Name || g?.subject || g?.name || g?.title || "Grupo";
        const participants = g?.Participants || g?.participants || [];
        const pCount = participants.length || g?.size || g?.memberCount || g?.Size || 0;
        const isCommunity = g?.IsCommunity === true || g?.isCommunity === true ||
          g?.is_community === true ||
          g?.IsParent === true || g?.isParent === true ||
          g?.groupType === "COMMUNITY" || g?.type === "community";
        return { jid, name, participants_count: pCount, is_community: isCommunity };
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
      const matchedGroups = await fetchGroupsWithParticipants(baseUrl, deviceToken, selectedJids);
      console.log(`[extractor] Matched ${matchedGroups.length} groups with participant data`);

      const allParticipants: Participant[] = [];
      const allLids: Participant[] = [];

      for (const g of matchedGroups) {
        const jid = g?.JID || g?.jid || g?.id || "";
        const gName = nameMap.get(jid) || g?.Name || g?.subject || g?.name || jid;
        const rawPs = g?.Participants || g?.participants || [];
        const { valid, lids } = parseParticipants(rawPs, jid, gName);
        allParticipants.push(...valid);
        allLids.push(...lids);
        console.log(`[extractor] "${gName}": ${valid.length} valid, ${lids.length} LID`);
      }

      // Apply filters to valid participants
      let filtered = allParticipants;

      if (filters?.brazil_only) {
        filtered = filtered.filter(p => p.phone.startsWith("55"));
      }

      if (filters?.participant_type === "admin") {
        filtered = filtered.filter(p => p.is_admin);
      } else if (filters?.participant_type === "member") {
        filtered = filtered.filter(p => !p.is_admin);
      }

      // Deduplicate valid
      const seen = new Map<string, Participant>();
      for (const p of filtered) {
        if (!seen.has(p.phone)) seen.set(p.phone, p);
      }
      const deduplicated = Array.from(seen.values());

      // Deduplicate LIDs
      const seenLid = new Map<string, Participant>();
      for (const p of allLids) {
        if (!seenLid.has(p.phone)) seenLid.set(p.phone, p);
      }
      const deduplicatedLids = Array.from(seenLid.values());

      console.log(`[extractor] Final: ${deduplicated.length} valid, ${deduplicatedLids.length} LIDs`);

      return new Response(JSON.stringify({
        total: deduplicated.length,
        total_before_dedup: filtered.length,
        lid_total: deduplicatedLids.length,
        participants: deduplicated,
        lid_participants: deduplicatedLids,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(`[extractor] Fatal: ${err?.message}`);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
