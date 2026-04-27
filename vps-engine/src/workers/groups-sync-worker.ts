// ══════════════════════════════════════════════════════════
// VPS Engine — Groups Sync Worker (Phase 3)
// Sincroniza a lista de grupos de cada instância online com a
// tabela `device_groups_cache`. O frontend lê desse cache
// (instantâneo) em vez de chamar a UAZAPI ao vivo, eliminando
// timeouts da Edge Function `mass-group-inject` action=list-groups.
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";
import { config as appConfig } from "../core/config";

const log = createLogger("groups-sync");

export let lastGroupsSyncTickAt: Date | null = null;

const CONNECTED_STATUSES = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"];
const SYNC_TTL_MS = 5 * 60 * 1000; // re-sync each device every 5 min
const HTTP_TIMEOUT_MS = 30_000;
const MAX_DEVICES_PER_TICK = 8; // limite por tick para não sobrecarregar UAZAPI

interface GroupItem {
  jid: string;
  name: string;
  participants: number;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = HTTP_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function buildHeaders(token: string, withJson = false): Record<string, string> {
  const h: Record<string, string> = { token, Accept: "application/json" };
  if (withJson) h["Content-Type"] = "application/json";
  return h;
}

async function fetchGroupsForDevice(baseUrl: string, token: string): Promise<GroupItem[]> {
  const all: GroupItem[] = [];
  const seen = new Set<string>();

  const addGroups = (items: any[]) => {
    for (const g of items || []) {
      const jid = g.id || g.jid || g.JID || g.groupId || g.chatId || "";
      if (!jid || seen.has(jid)) continue;
      seen.add(jid);
      all.push({
        jid,
        name: g.subject || g.name || g.Subject || g.Name || g.groupName || "Sem nome",
        participants: g.ParticipantCount || g.participants?.length || g.Participants?.length || g.size || 0,
      });
    }
  };

  // Paginate /group/list
  for (let page = 0; page < 10; page++) {
    try {
      const res = await fetchWithTimeout(
        `${baseUrl}/group/list?GetParticipants=false&page=${page}&count=500`,
        { headers: buildHeaders(token) }
      );
      if (!res.ok) break;
      const data = await res.json().catch(() => null);
      const groups = Array.isArray(data) ? data : data?.groups || data?.data || [];
      if (!Array.isArray(groups) || groups.length === 0) break;
      addGroups(groups);
      if (groups.length < 500) break;
    } catch { break; }
  }

  // Fallback endpoints if empty
  if (all.length === 0) {
    for (const ep of ["/group/listAll", "/group/fetchAllGroups", "/chat/list?type=group&count=500"]) {
      try {
        const isPost = ep === "/group/fetchAllGroups";
        const res = await fetchWithTimeout(`${baseUrl}${ep}`, {
          method: isPost ? "POST" : "GET",
          headers: isPost ? buildHeaders(token, true) : buildHeaders(token),
          ...(isPost ? { body: "{}" } : {}),
        });
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        const groups = Array.isArray(data) ? data : data?.groups || data?.data || data?.chats || [];
        addGroups(Array.isArray(groups) ? groups : []);
        if (all.length > 0) break;
      } catch { /* next */ }
    }
  }

  return all;
}

async function syncDeviceGroups(device: { id: string; user_id: string; uazapi_base_url: string; uazapi_token: string }): Promise<{ inserted: number; updated: number; removed: number }> {
  const db = getDb();
  const baseUrl = (device.uazapi_base_url || appConfig.defaultUazapiBaseUrl || "").replace(/\/+$/, "");
  const token = device.uazapi_token || appConfig.defaultUazapiToken || "";
  if (!baseUrl || !token) return { inserted: 0, updated: 0, removed: 0 };

  const groups = await fetchGroupsForDevice(baseUrl, token);

  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;

  if (groups.length > 0) {
    // Upsert em lote
    const rows = groups.map((g) => ({
      device_id: device.id,
      user_id: device.user_id,
      jid: g.jid,
      name: g.name,
      participants_count: g.participants,
      last_synced_at: now,
      updated_at: now,
    }));

    const { error: upsertErr, count } = await db
      .from("device_groups_cache")
      .upsert(rows, { onConflict: "device_id,jid", count: "exact" });

    if (upsertErr) {
      log.warn(`Upsert failed for device ${device.id.slice(0, 8)}: ${upsertErr.message}`);
    } else {
      updated = count ?? rows.length;
    }
  }

  // Remove grupos que não existem mais (saiu do grupo, deletou etc.)
  const { count: removed } = await db
    .from("device_groups_cache")
    .delete({ count: "exact" })
    .eq("device_id", device.id)
    .lt("last_synced_at", new Date(Date.now() - 60_000).toISOString()); // tolerância de 1min

  return { inserted, updated, removed: removed ?? 0 };
}

export async function groupsSyncTick(): Promise<void> {
  const db = getDb();

  // Pega instâncias conectadas que precisam de re-sync
  // Prioriza as que nunca foram sincronizadas ou expiraram (>5min)
  const { data: devices, error } = await db
    .from("devices")
    .select("id, user_id, uazapi_base_url, uazapi_token, status, login_type")
    .in("status", CONNECTED_STATUSES)
    .neq("login_type", "report_wa")
    .limit(50);

  if (error) {
    log.error(`Failed to load devices: ${error.message}`);
    lastGroupsSyncTickAt = new Date();
    return;
  }
  if (!devices || devices.length === 0) {
    lastGroupsSyncTickAt = new Date();
    return;
  }

  // Para cada device, verifica último sync no cache (ordena por mais antigo)
  const deviceIds = devices.map((d: any) => d.id);
  const { data: lastSyncs } = await db
    .from("device_groups_cache")
    .select("device_id, last_synced_at")
    .in("device_id", deviceIds)
    .order("last_synced_at", { ascending: false });

  const lastSyncMap = new Map<string, string>();
  for (const row of lastSyncs || []) {
    if (!lastSyncMap.has(row.device_id)) lastSyncMap.set(row.device_id, row.last_synced_at);
  }

  const now = Date.now();
  const candidates = devices
    .map((d: any) => ({
      device: d,
      lastSyncMs: lastSyncMap.get(d.id) ? new Date(lastSyncMap.get(d.id)!).getTime() : 0,
    }))
    .filter((c) => now - c.lastSyncMs >= SYNC_TTL_MS)
    .sort((a, b) => a.lastSyncMs - b.lastSyncMs)
    .slice(0, MAX_DEVICES_PER_TICK);

  if (candidates.length === 0) {
    lastGroupsSyncTickAt = new Date();
    return;
  }

  let totalUpdated = 0;
  let totalRemoved = 0;
  let succeeded = 0;
  let failed = 0;

  for (const c of candidates) {
    try {
      const r = await syncDeviceGroups(c.device);
      totalUpdated += r.updated;
      totalRemoved += r.removed;
      succeeded++;
    } catch (e: any) {
      failed++;
      log.warn(`Sync failed for device ${c.device.id.slice(0, 8)}: ${e?.message || e}`);
    }
  }

  if (succeeded > 0 || failed > 0) {
    log.info(`Synced ${succeeded}/${candidates.length} devices: ${totalUpdated} groups upserted, ${totalRemoved} removed${failed > 0 ? `, ${failed} failed` : ""}`);
  }
  lastGroupsSyncTickAt = new Date();
}
