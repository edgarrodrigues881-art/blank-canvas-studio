import { createClient } from "npm:@supabase/supabase-js@2";
import {
  extractInviteCode,
  fetchDeviceGroups,
  resolveGroupFromInvite,
  resolveGroupJid,
} from "./group-resolution.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_JID_RE = /@g\.us$/i;

type GroupSelection = {
  selectionKey: string;
  groupId: string | null;
  groupIds: string[];
  inviteCode: string | null;
  link: string | null;
  name: string;
  joinedJid: string | null;
};

function randomBetween(min: number, max: number): number {
  const safeMin = Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0;
  const safeMax = Number.isFinite(max) ? Math.max(safeMin, Math.floor(max)) : safeMin;
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function safeNonNegativeInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : fallback;
}

function dedupeStrings(values: unknown[]): string[] {
  return Array.from(new Set(
    values
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  ));
}

function canonicalInviteLink(value: unknown): string | null {
  const inviteCode = extractInviteCode(String(value ?? ""));
  return inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : null;
}

function pickPreferredWarmupGroupRow(rows: any[], userId: string): any | null {
  return rows.find((row) => row?.user_id === userId)
    || rows.find((row) => !row?.user_id && row?.is_custom === false)
    || rows[0]
    || null;
}

async function loadInteractionSelections(admin: any, userId: string, deviceId: string, identifiers: unknown[]): Promise<GroupSelection[]> {
  const selectionKeys = dedupeStrings(Array.isArray(identifiers) ? identifiers : []);
  const selections = new Map<string, GroupSelection>(
    selectionKeys.map((selectionKey) => {
      const directGroupId = UUID_RE.test(selectionKey) ? selectionKey : null;
      const joinedJid = GROUP_JID_RE.test(selectionKey) ? selectionKey : null;
      const inviteCode = joinedJid ? null : extractInviteCode(selectionKey);

      return [
        selectionKey,
        {
          selectionKey,
          groupId: directGroupId,
          groupIds: directGroupId ? [directGroupId] : [],
          inviteCode,
          link: inviteCode
            ? `https://chat.whatsapp.com/${inviteCode}`
            : !directGroupId && !joinedJid
                ? selectionKey
                : null,
          name: "",
          joinedJid,
        },
      ];
    }),
  );

  if (selections.size === 0) return [];

  const uuidIds = selectionKeys.filter((value) => UUID_RE.test(value));
  const inviteLinks = selectionKeys.filter((value) => !UUID_RE.test(value) && !GROUP_JID_RE.test(value));

  if (uuidIds.length > 0) {
    const { data, error } = await admin
      .from("warmup_groups")
      .select("id, name, link, is_custom, user_id")
      .in("id", uuidIds)
      .or(`user_id.eq.${userId},and(is_custom.eq.false,user_id.is.null)`);

    if (error) throw error;

    for (const row of data || []) {
      const key = String(row?.id || "").trim();
      const selection = selections.get(key);
      if (!selection) continue;
      selection.groupIds = dedupeStrings([...selection.groupIds, key]);
      selection.groupId = key || selection.groupId;
      selection.link = String(row?.link || "").trim() || selection.link;
      selection.inviteCode = selection.inviteCode || extractInviteCode(row?.link);
      selection.name = String(row?.name || "").trim() || selection.name;
    }
  }

  if (inviteLinks.length > 0) {
    const canonicalInviteLinks = dedupeStrings(inviteLinks.map((value) => canonicalInviteLink(value) || value));
    const { data, error } = await admin
      .from("warmup_groups")
      .select("id, name, link, is_custom, user_id")
      .in("link", canonicalInviteLinks)
      .or(`user_id.eq.${userId},and(is_custom.eq.false,user_id.is.null)`);

    if (error) throw error;

    const rowsByInviteCode = new Map<string, any[]>();
    for (const row of data || []) {
      const inviteCode = extractInviteCode(row?.link);
      if (!inviteCode) continue;
      const current = rowsByInviteCode.get(inviteCode) ?? [];
      current.push(row);
      rowsByInviteCode.set(inviteCode, current);
    }

    for (const inviteLink of inviteLinks) {
      const selection = selections.get(inviteLink);
      if (!selection) continue;
      const inviteCode = selection.inviteCode || extractInviteCode(inviteLink);
      const rows = inviteCode ? rowsByInviteCode.get(inviteCode) ?? [] : [];
      const picked = pickPreferredWarmupGroupRow(rows, userId);
      if (!picked) continue;
      selection.groupIds = dedupeStrings([
        ...selection.groupIds,
        ...rows.map((row) => String(row?.id || "").trim()),
      ]);
      selection.groupId = String(picked?.id || "").trim() || selection.groupId;
      selection.link = String(picked?.link || "").trim() || selection.link;
      selection.name = String(picked?.name || "").trim() || selection.name;
      selection.inviteCode = inviteCode || selection.inviteCode;
    }
  }

  const { data: joinedRows, error: joinedError } = await admin
    .from("warmup_instance_groups")
    .select("group_id, group_jid, group_name, invite_link")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .not("group_jid", "is", null);

  if (joinedError) throw joinedError;

  const joinedByGroupId = new Map<string, any[]>();
  const joinedByInviteCode = new Map<string, any[]>();
  const joinedByJid = new Map<string, any>();

  for (const row of joinedRows || []) {
    const groupId = String(row?.group_id || "").trim();
    if (groupId) {
      const current = joinedByGroupId.get(groupId) ?? [];
      current.push(row);
      joinedByGroupId.set(groupId, current);
    }

    const inviteCode = extractInviteCode(row?.invite_link);
    if (inviteCode) {
      const current = joinedByInviteCode.get(inviteCode) ?? [];
      current.push(row);
      joinedByInviteCode.set(inviteCode, current);
    }

    const joinedJid = String(row?.group_jid || "").trim();
    if (joinedJid) joinedByJid.set(joinedJid, row);
  }

  for (const selection of selections.values()) {
    let joinedRow: any | null = null;

    for (const candidateGroupId of selection.groupIds) {
      const match = (joinedByGroupId.get(candidateGroupId) ?? [])[0];
      if (match) {
        joinedRow = match;
        break;
      }
    }

    if (!joinedRow && selection.inviteCode) {
      joinedRow = (joinedByInviteCode.get(selection.inviteCode) ?? [])[0] ?? null;
    }

    if (!joinedRow && selection.joinedJid) {
      joinedRow = joinedByJid.get(selection.joinedJid) ?? null;
    }

    if (!joinedRow) continue;

    const joinedGroupId = String(joinedRow?.group_id || "").trim();
    if (joinedGroupId) {
      selection.groupIds = dedupeStrings([...selection.groupIds, joinedGroupId]);
      selection.groupId = joinedGroupId;
    }

    selection.joinedJid = String(joinedRow?.group_jid || "").trim() || selection.joinedJid;
    selection.name = selection.name || String(joinedRow?.group_name || "").trim();
    selection.link = selection.link || String(joinedRow?.invite_link || "").trim() || null;
    selection.inviteCode = selection.inviteCode || extractInviteCode(joinedRow?.invite_link);
  }

  return Array.from(selections.values());
}

function resolveSelectionFromDeviceGroups(selection: GroupSelection, deviceGroups: Map<string, { jid: string; name: string }>) {
  const aliases = dedupeStrings([selection.name]);
  const candidates = dedupeStrings([
    selection.joinedJid,
    selection.link,
    selection.selectionKey,
    selection.inviteCode ? `https://chat.whatsapp.com/${selection.inviteCode}` : null,
  ]);

  for (const candidate of candidates) {
    const resolved = resolveGroupJid(candidate, deviceGroups, aliases);
    if (resolved) return resolved;
  }

  return aliases.length > 0 ? resolveGroupJid(aliases[0], deviceGroups, aliases) : null;
}

async function persistResolvedSelection(
  admin: any,
  userId: string,
  deviceId: string,
  selection: GroupSelection,
  resolved: { jid: string; name: string },
) {
  if (!selection.groupId && selection.groupIds.length === 0) return;

  const nowIso = new Date().toISOString();
  const inviteLink = canonicalInviteLink(selection.link) || canonicalInviteLink(selection.selectionKey);
  const groupName = String(selection.name || resolved.name || "").trim() || null;
  const payload = {
    group_name: groupName,
    invite_link: inviteLink,
    group_jid: resolved.jid,
    join_status: "joined",
    joined_at: nowIso,
    last_error: null,
    updated_at: nowIso,
  };

  let updatedCount = 0;
  for (const groupId of dedupeStrings(selection.groupIds.length > 0 ? selection.groupIds : [selection.groupId])) {
    const { data, error } = await admin
      .from("warmup_instance_groups")
      .update(payload)
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .eq("group_id", groupId)
      .select("id");

    if (error) throw error;
    updatedCount += data?.length ?? 0;
  }

  if (updatedCount === 0 && inviteLink) {
    const { data, error } = await admin
      .from("warmup_instance_groups")
      .update(payload)
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .eq("invite_link", inviteLink)
      .select("id");

    if (error) throw error;
    updatedCount += data?.length ?? 0;
  }

  if (updatedCount === 0 && selection.groupId) {
    const { error } = await admin.from("warmup_instance_groups").insert({
      user_id: userId,
      device_id: deviceId,
      group_id: selection.groupId,
      group_name: groupName,
      invite_link: inviteLink,
      group_jid: resolved.jid,
      join_status: "joined",
      joined_at: nowIso,
      last_error: null,
    });

    if (error) throw error;
  }
}

async function reconcileInteractionGroups(admin: any, userId: string, interaction: any, device: any) {
  const selections = await loadInteractionSelections(admin, userId, interaction.device_id, interaction.group_ids || []);
  const baseUrl = String(device?.uazapi_base_url || "").replace(/\/+$/, "");
  const token = String(device?.uazapi_token || "");

  if (selections.length === 0 || !baseUrl || !token) {
    const resolvedCount = selections.filter((selection) => !!selection.joinedJid).length;
    return {
      total: selections.length,
      resolvedCount,
      autoJoinedCount: 0,
      missingCount: Math.max(0, selections.length - resolvedCount),
    };
  }

  let deviceGroups: Map<string, { jid: string; name: string }> | null = null;
  const getDeviceGroups = async (forceRefresh = false) => {
    if (forceRefresh || !deviceGroups) {
      deviceGroups = await fetchDeviceGroups(baseUrl, token);
    }
    return deviceGroups;
  };

  let resolvedCount = 0;
  let autoJoinedCount = 0;

  for (const selection of selections) {
    let resolved = selection.joinedJid
      ? { jid: selection.joinedJid, name: selection.name || "" }
      : null;

    if (!resolved) {
      resolved = resolveSelectionFromDeviceGroups(selection, await getDeviceGroups());
    }

    if (!resolved && (selection.link || selection.inviteCode)) {
      const inviteTarget = selection.link || `https://chat.whatsapp.com/${selection.inviteCode}`;
      resolved = await resolveGroupFromInvite(baseUrl, token, inviteTarget);
      if (!resolved) {
        resolved = resolveSelectionFromDeviceGroups(selection, await getDeviceGroups(true));
      }
      if (resolved) autoJoinedCount += 1;
    }

    if (!resolved) continue;

    selection.joinedJid = resolved.jid;
    if (resolved.name && !selection.name) selection.name = resolved.name;
    await persistResolvedSelection(admin, userId, interaction.device_id, selection, resolved);
    resolvedCount += 1;
  }

  return {
    total: selections.length,
    resolvedCount,
    autoJoinedCount,
    missingCount: Math.max(0, selections.length - resolvedCount),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action, interactionId } = body;

    console.log(`[group-interaction] action=${action} id=${interactionId}`);

    // Tick is handled by VPS worker — noop if called directly
    if (action === "tick") {
      return jsonRes({ ok: true, message: "tick handled by VPS worker" });
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) return jsonRes({ error: "Não autorizado" }, 401);

    if (action === "start" || action === "resume") {
      const { data: current } = await admin.from("group_interactions")
        .select("status, started_at, min_delay_seconds, max_delay_seconds, next_action_at, device_id, group_ids")
        .eq("id", interactionId).eq("user_id", user.id).single();

      if (!current) return jsonRes({ error: "Automação não encontrada" }, 404);

      let groupSync = {
        total: 0,
        resolvedCount: 0,
        autoJoinedCount: 0,
        missingCount: 0,
      };

      // On resume (was previously running/paused), skip heavy reconciliation
      // if we already have joined JIDs — just do a quick count check
      const isResume = action === "resume" || current.status === "paused" || current.status === "running";

      if (current.device_id) {
        if (isResume) {
          // Quick check: count how many groups already have JIDs registered
          const groupIds: string[] = Array.isArray(current.group_ids) ? current.group_ids : [];
          const { data: joinedRows } = await admin
            .from("warmup_instance_groups")
            .select("group_jid")
            .eq("user_id", user.id)
            .eq("device_id", current.device_id)
            .eq("join_status", "joined")
            .not("group_jid", "is", null)
            .limit(groupIds.length || 50);

          const resolvedCount = joinedRows?.length || 0;
          groupSync = {
            total: groupIds.length,
            resolvedCount,
            autoJoinedCount: 0,
            missingCount: Math.max(0, groupIds.length - resolvedCount),
          };

          // Only do full reconciliation if no groups are resolved at all
          if (resolvedCount === 0 && groupIds.length > 0) {
            const { data: device } = await admin.from("devices")
              .select("id, uazapi_token, uazapi_base_url")
              .eq("id", current.device_id)
              .eq("user_id", user.id)
              .maybeSingle();
            if (device) {
              groupSync = await reconcileInteractionGroups(admin, user.id, current, device);
            }
          }
        } else {
          // First start: do full reconciliation
          const { data: device, error: deviceError } = await admin.from("devices")
            .select("id, uazapi_token, uazapi_base_url")
            .eq("id", current.device_id)
            .eq("user_id", user.id)
            .maybeSingle();

          if (deviceError) throw deviceError;
          if (device) {
            groupSync = await reconcileInteractionGroups(admin, user.id, current, device);
          }
        }
      }

      const configuredGroups = Array.isArray(current.group_ids) ? current.group_ids.length : 0;
      if (configuredGroups > 0 && groupSync.resolvedCount === 0) {
        return jsonRes({
          error: "Não foi possível confirmar ou entrar em nenhum dos grupos selecionados com essa instância.",
          groupSync,
        }, 409);
      }

      // On resume, use a short 3-5s delay so the first message goes out fast
      // On first start, use the configured delay range
      const initialDelayMs = isResume
        ? randomBetween(3_000, 5_000)
        : (() => {
            const randomDelayMs = randomBetween(
              safeNonNegativeInt(current.min_delay_seconds, 0) * 1000,
              Math.max(safeNonNegativeInt(current.min_delay_seconds, 0), safeNonNegativeInt(current.max_delay_seconds, 0)) * 1000,
            );
            return groupSync.autoJoinedCount > 0
              ? Math.max(randomDelayMs, 15_000)
              : randomDelayMs;
          })();

      const { error } = await admin.from("group_interactions")
        .update({
          status: "running",
          started_at: current.started_at || new Date().toISOString(),
          completed_at: null,
          last_error: null,
          next_action_at: new Date(Date.now() + initialDelayMs).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", interactionId).eq("user_id", user.id);

      if (error) throw error;
      return jsonRes({ ok: true, status: "running", groupSync });
    }

    if (action === "pause") {
      const { error } = await admin.from("group_interactions")
        .update({ status: "paused", next_action_at: null, updated_at: new Date().toISOString() })
        .eq("id", interactionId).eq("user_id", user.id);
      if (error) throw error;
      return jsonRes({ ok: true, status: "paused" });
    }

    if (action === "stop") {
      const { error } = await admin.from("group_interactions")
        .update({ status: "idle", completed_at: new Date().toISOString(), next_action_at: null, updated_at: new Date().toISOString() })
        .eq("id", interactionId).eq("user_id", user.id);
      if (error) throw error;
      return jsonRes({ ok: true, status: "idle" });
    }

    return jsonRes({ error: "Ação inválida" }, 400);
  } catch (err: any) {
    console.error("group-interaction error:", err);
    return jsonRes({ error: err.message }, 500);
  }
});
