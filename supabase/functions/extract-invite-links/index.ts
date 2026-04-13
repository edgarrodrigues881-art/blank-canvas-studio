import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMEOUT_MS = 8_000;
const BETWEEN_GROUPS_DELAY_MS = 1_500;
const RATE_LIMIT_MAX_RETRIES = 4;
const RATE_LIMIT_BASE_DELAY_MS = 3_000;
const RATE_LIMIT_MAX_DELAY_MS = 15_000;
const RATE_LIMIT_JITTER_MS = 600;

/* ─── Types ────────────────────────────────────────────── */

interface InviteDiagnostics {
  requested_url?: string;
  http_status?: number;
  error_stage?: string;
  provider_message?: string;
  processing_time_ms?: number;
  rate_limited?: boolean;
  retry_after_ms?: number;
}

interface InviteFetchResult {
  ok: boolean;
  link: string | null;
  error?: string;
  diagnostics?: InviteDiagnostics;
}

interface GroupListItem {
  jid: string;
  name: string;
  participants_count: number;
  cached_invite_link?: string;
}

/* ─── Helpers ──────────────────────────────────────────── */

// Known false-positive strings that look like invite codes but aren't
const INVITE_CODE_BLACKLIST = new Set([
  "DefaultMembershipApprovalMode",
  "defaultmembershipapprovalmode",
  "MembershipApprovalMode",
  "membershipapprovalmode",
]);

function isValidInviteCode(code: string): boolean {
  if (!code || code.length < 10) return false;
  if (INVITE_CODE_BLACKLIST.has(code)) return false;
  // Real invite codes are typically 22-24 chars of base64url; reject if it looks like a camelCase field name
  if (/^[a-z]+[A-Z]/.test(code) && code.length > 30) return false;
  // Reject if it's all lowercase letters (likely a field name, not a code)
  if (/^[a-z]+$/.test(code) && code.length > 20) return false;
  return true;
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

function isRateLimit(status: number, msg: string) {
  const lower = msg.toLowerCase();
  return status === 429 || lower.includes("rate-overlimit") || lower.includes("too many requests");
}

function extractProviderMessage(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    for (const c of [parsed?.error, parsed?.message, parsed?.details, parsed?.data?.error, parsed?.data?.message, parsed?.data?.details]) {
      if (typeof c === "string" && c.trim()) return c.trim();
    }
  } catch { /* */ }
  return text.replace(/\s+/g, " ").slice(0, 250);
}

function getRetryDelay(attemptIndex: number): number {
  const delay = Math.min(RATE_LIMIT_MAX_DELAY_MS, RATE_LIMIT_BASE_DELAY_MS * (2 ** attemptIndex));
  return delay + Math.floor(Math.random() * RATE_LIMIT_JITTER_MS);
}

function normalizeGroupName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getGroupNameCacheKey(name: string | null | undefined): string {
  const normalized = normalizeGroupName(name);
  return normalized ? `name:${normalized}` : "";
}

function addInviteToCache(
  cache: Map<string, string>,
  jid: string | null | undefined,
  name: string | null | undefined,
  rawLink: string | null | undefined,
) {
  const normalizedLink = parseInviteLinkFromRaw(String(rawLink ?? ""));
  if (!normalizedLink) return;

  const safeJid = String(jid ?? "").trim();
  if (safeJid.includes("@g.us") && !cache.has(safeJid)) {
    cache.set(safeJid, normalizedLink);
  }

  const nameKey = getGroupNameCacheKey(name);
  if (nameKey && !cache.has(nameKey)) {
    cache.set(nameKey, normalizedLink);
  }
}

function getCachedInviteLink(
  cache: Map<string, string>,
  jid: string | null | undefined,
  name: string | null | undefined,
): string | undefined {
  const safeJid = String(jid ?? "").trim();
  if (safeJid && cache.has(safeJid)) return cache.get(safeJid);

  const nameKey = getGroupNameCacheKey(name);
  return nameKey ? cache.get(nameKey) : undefined;
}

/* ─── Invite code extraction from any JSON ─────────────── */

function findInviteCode(obj: any, depth = 0): string | null {
  if (!obj || depth > 4) return null;
  if (typeof obj === "string") {
    const clean = obj.replace(/^https?:\/\/chat\.whatsapp\.com\//i, "").split(/[/?#\s]/)[0].trim();
    if (!/^[A-Za-z0-9_-]{10,}$/.test(clean)) return null;
    return isValidInviteCode(clean) ? clean : null;
  }
  if (typeof obj !== "object") return null;

  // Check specific known keys first
  for (const key of ["inviteCode", "invite", "inviteLink", "inviteUrl", "InviteLink", "InviteCode",
    "invite_code", "invite_link", "code", "link", "url"]) {
    if (obj[key]) {
      const r = findInviteCode(obj[key], depth + 1);
      if (r) return r;
    }
  }

  // Walk nested objects
  for (const key of ["data", "group", "result", "response", "chat", "info"]) {
    if (obj[key] && typeof obj[key] === "object") {
      const r = findInviteCode(obj[key], depth + 1);
      if (r) return r;
    }
  }

  return null;
}

function parseInviteLinkFromRaw(raw: string): string | null {
  const text = String(raw || "");

  // Direct URL match
  const fullMatch = text.match(/https?:\/\/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/i);
  if (fullMatch?.[1] && isValidInviteCode(fullMatch[1])) return `https://chat.whatsapp.com/${fullMatch[1]}`;

  // JSON deep search
  try {
    const parsed = JSON.parse(text);
    const code = findInviteCode(parsed);
    if (code) return `https://chat.whatsapp.com/${code}`;
  } catch { /* */ }

  // Regex for bare invite code in the raw text
  const bareMatch = text.match(/"([A-Za-z0-9_-]{18,})"/);
  if (bareMatch?.[1] && !bareMatch[1].includes("@") && !bareMatch[1].includes(".") && isValidInviteCode(bareMatch[1])) {
    return `https://chat.whatsapp.com/${bareMatch[1]}`;
  }

  return null;
}

function extractInviteFromGroupObject(g: any): string | null {
  for (const key of ["inviteCode", "InviteCode", "invite", "inviteLink", "InviteLink",
    "invite_code", "invite_link", "inviteUrl", "InviteUrl"]) {
    const val = g?.[key];
    if (typeof val === "string" && val.trim()) {
      const code = findInviteCode(val);
      if (code) return `https://chat.whatsapp.com/${code}`;
    }
  }
  return null;
}

async function fetchStoredInviteCache(
  serviceClient: any,
  userId: string,
  groups: Array<{ jid?: string | null; name?: string | null }>,
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const groupJids = Array.from(new Set(groups
    .map((group) => String(group?.jid ?? "").trim())
    .filter((jid) => jid.includes("@g.us"))));
  const groupNames = Array.from(new Set(groups
    .map((group) => String(group?.name ?? "").trim())
    .filter(Boolean)));

  if (groupJids.length === 0 && groupNames.length === 0) return cache;

  const emptyResult = Promise.resolve({ data: [] as any[] });
  const [instanceByJid, instanceByName, warmupByName] = await Promise.all([
    groupJids.length > 0
      ? serviceClient
          .from("warmup_instance_groups")
          .select("group_jid, group_name, invite_link, updated_at")
          .eq("user_id", userId)
          .not("invite_link", "is", null)
          .in("group_jid", groupJids)
          .order("updated_at", { ascending: false })
      : emptyResult,
    groupNames.length > 0
      ? serviceClient
          .from("warmup_instance_groups")
          .select("group_jid, group_name, invite_link, updated_at")
          .eq("user_id", userId)
          .not("invite_link", "is", null)
          .in("group_name", groupNames)
          .order("updated_at", { ascending: false })
      : emptyResult,
    groupNames.length > 0
      ? serviceClient
          .from("warmup_groups")
          .select("name, link, user_id, updated_at")
          .not("link", "is", null)
          .in("name", groupNames)
          .or(`user_id.eq.${userId},user_id.is.null`)
          .order("updated_at", { ascending: false })
      : emptyResult,
  ]);

  for (const row of instanceByJid.data ?? []) {
    addInviteToCache(cache, row.group_jid, row.group_name, row.invite_link);
  }

  for (const row of instanceByName.data ?? []) {
    addInviteToCache(cache, row.group_jid, row.group_name, row.invite_link);
  }

  for (const row of warmupByName.data ?? []) {
    addInviteToCache(cache, null, row.name, row.link);
  }

  console.log(`[stored_invites] Found ${cache.size} historical invite cache entr${cache.size === 1 ? "y" : "ies"}`);
  return cache;
}

/* ─── Group listing (also captures pre-existing invite links) ── */

async function fetchGroupsList(baseUrl: string, token: string): Promise<{ groups: GroupListItem[]; inviteCache: Map<string, string> }> {
  const headers = { token, Accept: "application/json", "Content-Type": "application/json" };
  const endpoints = [
    `${baseUrl}/group/list?GetParticipants=false&count=500`,
    `${baseUrl}/group/list?GetParticipants=false&page=1&count=500`,
    `${baseUrl}/group/fetchAllGroups?getParticipants=false`,
    `${baseUrl}/group/fetchAllGroups`,
    `${baseUrl}/group/listAll`,
    `${baseUrl}/chats?type=group&count=500`,
    `${baseUrl}/chat/list?type=group&count=500`,
  ];

  const allGroups: GroupListItem[] = [];
  const seenJids = new Set<string>();
  const inviteCache = new Map<string, string>();

  for (const endpoint of endpoints) {
    try {
      const res = await fetchWithTimeout(endpoint, { method: "GET", headers });
      if (!res.ok) continue;
      const data = await res.json();

      const candidates = [data?.groups, data?.data?.groups, data?.data, data];
      const rows: any[] = [];
      for (const c of candidates) {
        if (Array.isArray(c)) { rows.push(...c); break; }
      }

      for (const g of rows) {
        const jid = g.JID || g.jid || g.id || g.groupJid || g.chatId || "";
        if (!jid || !jid.includes("@g.us") || seenJids.has(jid)) continue;
        seenJids.add(jid);

        const cachedLink = extractInviteFromGroupObject(g);
        if (cachedLink) inviteCache.set(jid, cachedLink);

        allGroups.push({
          jid,
          name: g.Subject || g.subject || g.Name || g.name || g.groupName || g.title || "",
          participants_count: g.ParticipantCount || g.Participants?.length || g.participants?.length || g.participantsCount || g.size || 0,
          cached_invite_link: cachedLink || undefined,
        });
      }

      if (allGroups.length > 0) {
        console.log(`[list_groups] Found ${allGroups.length} groups, ${inviteCache.size} pre-cached invite links from ${endpoint}`);
        break;
      }
    } catch { continue; }
  }

  return { groups: allGroups, inviteCache };
}

/* ─── Single-group invite extraction with many fallbacks ─────── */

async function fetchInviteCode(
  baseUrl: string,
  token: string,
  groupJid: string,
  cachedLink: string | undefined,
): Promise<InviteFetchResult> {
  const startedAt = Date.now();

  // 0) If we already have it from the listing phase, return immediately
  if (cachedLink) {
    console.log(`[invite] ${groupJid} => cached: ${cachedLink}`);
    return { ok: true, link: cachedLink, diagnostics: { error_stage: "cached", processing_time_ms: 0 } };
  }

  const headers: Record<string, string> = { token, Accept: "application/json", "Content-Type": "application/json" };
  const encodedJid = encodeURIComponent(groupJid);

  // Build the full list of attempts in order of priority
  const attempts: Array<{ label: string; method: string; url: string; body?: string }> = [
    // 1) Standard UAZAPI invite link endpoint
    { label: "GET /group/invitelink/{jid}", method: "GET", url: `${baseUrl}/group/invitelink/${groupJid}` },
    { label: "GET /group/invitelink/{enc}", method: "GET", url: `${baseUrl}/group/invitelink/${encodedJid}` },
    // 2) Alternative casing variants
    { label: "GET /group/inviteLink/{jid}", method: "GET", url: `${baseUrl}/group/inviteLink/${groupJid}` },
    { label: "GET /group/InviteLink/{jid}", method: "GET", url: `${baseUrl}/group/InviteLink/${groupJid}` },
    { label: "GET /group/inviteCode/{jid}", method: "GET", url: `${baseUrl}/group/inviteCode/${groupJid}` },
    { label: "GET /group/getInviteCode/{jid}", method: "GET", url: `${baseUrl}/group/getInviteCode/${groupJid}` },
    // 3) POST variants
    { label: "POST /group/invitelink", method: "POST", url: `${baseUrl}/group/invitelink`, body: JSON.stringify({ groupJid }) },
    { label: "POST /group/invitelink (jid)", method: "POST", url: `${baseUrl}/group/invitelink`, body: JSON.stringify({ jid: groupJid }) },
    { label: "POST /group/inviteCode", method: "POST", url: `${baseUrl}/group/inviteCode`, body: JSON.stringify({ groupJid }) },
    // 4) Group info endpoints (may contain invite link in the response)
    { label: "POST /group/info", method: "POST", url: `${baseUrl}/group/info`, body: JSON.stringify({ groupjid: groupJid }) },
    { label: "POST /group/info (jid)", method: "POST", url: `${baseUrl}/group/info`, body: JSON.stringify({ jid: groupJid }) },
    { label: "GET /group/{jid}", method: "GET", url: `${baseUrl}/group/${encodedJid}` },
    // 5) Chat-level endpoints
    { label: "GET /chat/{jid}", method: "GET", url: `${baseUrl}/chat/${encodedJid}` },
  ];

  let lastError = "";
  let lastStatus = 0;
  let hitPermissionDenied = false;

  for (const attempt of attempts) {
    // If we already got a permission denied on the main endpoint, skip other invite-specific endpoints
    // but still try info/chat endpoints which may embed the link
    if (hitPermissionDenied && (attempt.url.includes("/invitelink") || attempt.url.includes("/inviteCode") || attempt.url.includes("/inviteLink") || attempt.url.includes("/InviteLink") || attempt.url.includes("/getInviteCode"))) {
      continue;
    }

    for (let retry = 0; retry <= RATE_LIMIT_MAX_RETRIES; retry++) {
      try {
        const fetchOpts: RequestInit = { method: attempt.method, headers };
        if (attempt.body) fetchOpts.body = attempt.body;

        const res = await fetchWithTimeout(attempt.url, fetchOpts, 6_000);
        const raw = await res.text();
        const providerMsg = extractProviderMessage(raw);
        const suffix = retry > 0 ? ` retry${retry}` : "";
        console.log(`[invite] ${attempt.label}${suffix} => ${res.status} ${raw.substring(0, 200)}`);

        // Success?
        const link = parseInviteLinkFromRaw(raw);
        if (link) {
          return {
            ok: true, link,
            diagnostics: { requested_url: attempt.url, http_status: res.status, processing_time_ms: Date.now() - startedAt },
          };
        }

        if (!res.ok) {
          lastStatus = res.status;
          lastError = providerMsg;

          // Rate limit → retry with backoff
          if (isRateLimit(res.status, providerMsg)) {
            if (retry < RATE_LIMIT_MAX_RETRIES) {
              const delay = getRetryDelay(retry);
              console.log(`[invite] ${attempt.label} rate-limited; waiting ${delay}ms`);
              await sleep(delay);
              continue;
            }
            // Exhausted retries for this attempt, move to next
            break;
          }

          // Permission denied
          if (providerMsg.toLowerCase().includes("permission")) {
            hitPermissionDenied = true;
            break; // skip to next attempt (will be info/chat endpoints)
          }

          // 404/405 → skip to next attempt
          if (res.status === 404 || res.status === 405) break;

          // Other errors → skip to next attempt
          break;
        }

        // res.ok but no link found → move to next attempt
        break;
      } catch (err: any) {
        console.log(`[invite] ${attempt.label} err: ${err?.message}`);
        break;
      }
    }
  }

  // All attempts exhausted
  const elapsed = Date.now() - startedAt;
  const isRL = isRateLimit(lastStatus, lastError);

  if (isRL) {
    return {
      ok: false, link: null,
      error: "Limite temporário da UAZAPI. Será re-tentado automaticamente.",
      diagnostics: { error_stage: "rate_limited", http_status: lastStatus, provider_message: lastError, processing_time_ms: elapsed, rate_limited: true, retry_after_ms: RATE_LIMIT_BASE_DELAY_MS },
    };
  }

  if (hitPermissionDenied) {
    return {
      ok: false, link: null,
      error: "Só admins do grupo podem gerar o link. Peça o link a um admin ou entre no grupo por outra conta que seja admin.",
      diagnostics: { error_stage: "permission_denied", provider_message: lastError, processing_time_ms: elapsed },
    };
  }

  return {
    ok: false, link: null,
    error: lastError || "Não foi possível extrair o link de convite.",
    diagnostics: { error_stage: "all_attempts_failed", http_status: lastStatus, provider_message: lastError, processing_time_ms: elapsed },
  };
}

/* ─── Main handler ─────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      return new Response(JSON.stringify({ error: "Dispositivo não configurado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
    const token = device.uazapi_token;

    /* ── list_groups ─────────────────────────────────── */
    if (action === "list_groups") {
      const { groups, inviteCache } = await fetchGroupsList(baseUrl, token);
      const storedInviteCache = await fetchStoredInviteCache(serviceClient, user.id, groups);
      const mergedGroups = groups.map((group) => {
        const historicalLink = getCachedInviteLink(storedInviteCache, group.jid, group.name);
        return {
          ...group,
          cached_invite_link: group.cached_invite_link || historicalLink,
        };
      });
      const cachedCount = mergedGroups.filter((group) => group.cached_invite_link).length;
      console.log(`[list_groups] ${groups.length} groups, ${cachedCount} cached invite links (${storedInviteCache.size} from history)`);
      return new Response(JSON.stringify({ groups: mergedGroups }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    /* ── extract_links ───────────────────────────────── */
    if (action === "extract_links") {
      if (!Array.isArray(group_jids) || group_jids.length === 0) {
        return new Response(JSON.stringify({ error: "Selecione pelo menos um grupo" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log(`[extract] Starting ${group_jids.length} groups for device ${device_id}`);

      // Pre-fetch group list to get cached invite links
      const { inviteCache } = await fetchGroupsList(baseUrl, token);
      const selectedGroupsMeta = group_jids.map((item: any) => ({
        jid: typeof item === "string" ? item : item?.jid,
        name: typeof item === "string" ? "" : item?.name || "",
      }));
      const storedInviteCache = await fetchStoredInviteCache(serviceClient, user.id, selectedGroupsMeta);
      for (const [key, value] of storedInviteCache.entries()) {
        if (!inviteCache.has(key)) inviteCache.set(key, value);
      }
      console.log(`[extract] Pre-cached ${inviteCache.size} invite links from group listing + history`);

      const results: Array<{ jid: string; name: string; link: string | null; error?: string; diagnostics?: InviteDiagnostics }> = [];
      const failedQueue: Array<{ idx: number; jid: string; name: string; reason: string }> = [];

      for (const [index, item] of group_jids.entries()) {
        const jid = typeof item === "string" ? item : item?.jid;
        const name = typeof item === "string" ? "" : item?.name || "";
        const cached = getCachedInviteLink(inviteCache, jid, name);

        try {
          const result = await fetchInviteCode(baseUrl, token, jid, cached);
          console.log(`[extract] ${name || jid}: ${result.link || result.error || "NO LINK"}`);
          results.push({ jid, name, link: result.link, error: result.error, diagnostics: result.diagnostics });

          if (!result.ok) {
            failedQueue.push({ idx: results.length - 1, jid, name, reason: result.diagnostics?.error_stage || "unknown" });
          }
        } catch (err: any) {
          console.error(`[extract] Error ${jid}: ${err?.message}`);
          results.push({ jid, name, link: null, error: err?.message || "Erro" });
          failedQueue.push({ idx: results.length - 1, jid, name, reason: "exception" });
        }

        if (index < group_jids.length - 1) {
          const lastDiag = results[results.length - 1]?.diagnostics;
          const nextDelay = lastDiag?.rate_limited ? Math.max(RATE_LIMIT_BASE_DELAY_MS, lastDiag.retry_after_ms ?? RATE_LIMIT_BASE_DELAY_MS) : BETWEEN_GROUPS_DELAY_MS;
          await sleep(nextDelay);
        }
      }

      // Retry round for rate-limited and failed groups
      const retryable = failedQueue.filter((f) => f.reason === "rate_limited" || f.reason === "all_attempts_failed");
      if (retryable.length > 0) {
        const cooldown = Math.max(RATE_LIMIT_BASE_DELAY_MS * 2, 6_000);
        console.log(`[extract] Retrying ${retryable.length} failed group(s) after ${cooldown}ms cooldown`);
        await sleep(cooldown);

        for (const [qi, queued] of retryable.entries()) {
          const retryResult = await fetchInviteCode(baseUrl, token, queued.jid, undefined);
          console.log(`[extract] RETRY ${queued.name || queued.jid}: ${retryResult.link || retryResult.error || "NO LINK"}`);
          results[queued.idx] = { jid: queued.jid, name: queued.name, link: retryResult.link, error: retryResult.error, diagnostics: retryResult.diagnostics };

          if (qi < retryable.length - 1) await sleep(BETWEEN_GROUPS_DELAY_MS * 2);
        }
      }

      const okCount = results.filter((r) => r.link).length;
      console.log(`[extract] Done: ${okCount}/${results.length} links extracted`);

      return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[extract-invite-links] Error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});