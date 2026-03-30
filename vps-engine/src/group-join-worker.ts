// ══════════════════════════════════════════════════════════
// VPS Engine — Group Join Campaign Worker
// Continuous loop processor for group entry campaigns
// Replaces Edge Function self-invocation
// ══════════════════════════════════════════════════════════

import { getDb } from "./db";
import { createLogger } from "./lib/logger";

const log = createLogger("group-join");

export let lastGroupJoinTickAt: Date | null = null;

export function getGroupJoinStatus() {
  return { lastTick: lastGroupJoinTickAt };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

function stripTrailingNoise(value: string): string {
  return value.trim().replace(/[),.;:!?\]}">']+$/g, "");
}

function extractInviteCode(link: string): string | null {
  try {
    const cleaned = stripTrailingNoise(link).replace(/^https?:\/\//i, "").replace(/^chat\.whatsapp\.com\//i, "");
    const code = cleaned.split(/[/?#\s]/)[0]?.trim();
    return code && /^[A-Za-z0-9_-]{10,}$/.test(code) ? code : null;
  } catch { return null; }
}

function normalizeGroupLink(link: string): string {
  const matched = String(link || "").match(/((?:https?:\/\/)?chat\.whatsapp\.com\/[^\s]+)/i)?.[1] ?? String(link || "");
  const inviteCode = extractInviteCode(matched);
  return inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : stripTrailingNoise(matched.replace(/^http:\/\//i, "https://"));
}

async function tryJoin(baseUrl: string, token: string, inviteCode: string, groupLink: string): Promise<{ ok: boolean; status: number; body: any }> {
  const headers = { token, Accept: "application/json", "Content-Type": "application/json" };
  const cleanLink = normalizeGroupLink(groupLink);
  const cleanCode = extractInviteCode(cleanLink) || inviteCode;

  const endpoints = [
    { method: "POST", url: `${baseUrl}/group/join`, body: JSON.stringify({ invitecode: cleanCode }) },
    { method: "POST", url: `${baseUrl}/group/join`, body: JSON.stringify({ inviteCode: cleanCode }) },
    { method: "POST", url: `${baseUrl}/group/join`, body: JSON.stringify({ invitecode: cleanLink }) },
    { method: "PUT", url: `${baseUrl}/group/acceptInviteGroup`, body: JSON.stringify({ inviteCode }) },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, { method: ep.method, headers, body: ep.body });
      const raw = await res.text();
      let body: any;
      try { body = JSON.parse(raw); } catch { body = { raw }; }
      if (res.status === 405) continue;
      if (res.status === 500 && (body?.error === "error joining group" || body?.error === "internal server error")) continue;
      return { ok: res.ok, status: res.status, body };
    } catch { continue; }
  }
  return { ok: false, status: 500, body: { message: "All endpoints failed" } };
}

function interpretResult(status: number, body: any): { joinStatus: string; error?: string } {
  const payload = JSON.stringify(body || {}).toLowerCase();
  if (payload.includes("already") || payload.includes("já")) return { joinStatus: "already_member" };
  if (["approval", "pending", "request sent", "solicita", "aguardando"].some(t => payload.includes(t))) return { joinStatus: "pending_approval", error: "Solicitação enviada para aprovação" };
  if (status >= 200 && status < 300) return { joinStatus: "success" };
  if (status === 404) return { joinStatus: "error", error: "Convite inválido ou expirado" };
  if (status === 409) return { joinStatus: "already_member" };
  if (status === 429) return { joinStatus: "error", error: "Rate limited" };
  return { joinStatus: "error", error: `Erro ${status}: ${(body?.message || body?.msg || "").substring(0, 200)}` };
}

async function updateCampaignCounters(sb: any, campaignId: string, markDone = false) {
  const { data: allItems } = await sb.from("group_join_queue").select("status").eq("campaign_id", campaignId);
  const items = allItems || [];
  const successCount = items.filter((i: any) => i.status === "success").length;
  const alreadyCount = items.filter((i: any) => i.status === "already_member").length;
  const errorCount = items.filter((i: any) => i.status === "error" || i.status === "skipped").length;
  const pendingCount = items.filter((i: any) => i.status === "pending").length;
  const pendingApprovalCount = items.filter((i: any) => i.status === "pending_approval").length;

  await sb.from("group_join_campaigns").update({
    success_count: successCount + alreadyCount + pendingApprovalCount,
    already_member_count: alreadyCount,
    error_count: errorCount,
    ...(markDone || pendingCount === 0 ? { status: "done", completed_at: new Date().toISOString() } : {}),
  }).eq("id", campaignId);
}

async function processOneCampaign(sb: any, campaign: any, isRunningRef: { value: boolean }) {
  log.info(`Processing group-join campaign ${campaign.id.slice(0, 8)}: "${campaign.name}"`);

  while (isRunningRef.value) {
    // Re-check status
    const { data: fresh } = await sb.from("group_join_campaigns").select("status").eq("id", campaign.id).single();
    if (fresh?.status !== "running") break;

    // Get pending items
    const { data: pendingItems } = await sb.from("group_join_queue")
      .select("*").eq("campaign_id", campaign.id).eq("status", "pending")
      .order("created_at", { ascending: true }).limit(10);

    if (!pendingItems?.length) {
      await updateCampaignCounters(sb, campaign.id, true);
      break;
    }

    const deviceIds = [...new Set(pendingItems.map((i: any) => i.device_id))];
    const { data: devices } = await sb.from("devices").select("id, name, number, status, uazapi_token, uazapi_base_url").in("id", deviceIds);
    const deviceMap = new Map((devices || []).map((d: any) => [d.id, d]));

    let processed = 0;

    for (const item of pendingItems) {
      if (!isRunningRef.value) break;

      // Re-check campaign status every 3 items
      if (processed > 0 && processed % 3 === 0) {
        const { data: check } = await sb.from("group_join_campaigns").select("status").eq("id", campaign.id).single();
        if (check?.status !== "running") break;
      }

      const device = deviceMap.get(item.device_id);
      let status = "error";
      let errorMsg: string | null = null;
      let responseStatus: number | null = null;

      if (!device || !device.uazapi_token || !device.uazapi_base_url) {
        errorMsg = device ? "Token/URL não configurado" : "Dispositivo não encontrado";
      } else if (!["Connected", "authenticated", "Ready", "ready"].includes(device.status)) {
        errorMsg = "Instância desconectada";
      } else {
        const normalizedLink = normalizeGroupLink(item.group_link);
        const inviteCode = extractInviteCode(normalizedLink);
        if (!inviteCode) {
          errorMsg = "Link inválido";
        } else {
          const baseUrl = (device.uazapi_base_url || "").replace(/\/+$/, "");

          for (let attempt = 1; attempt <= 2; attempt++) {
            const joinRes = await tryJoin(baseUrl, device.uazapi_token, inviteCode, normalizedLink);
            const interpreted = interpretResult(joinRes.status, joinRes.body);
            status = interpreted.joinStatus;
            errorMsg = interpreted.error || null;
            responseStatus = joinRes.status;

            if (["success", "already_member", "pending_approval"].includes(status) || joinRes.status === 404 || joinRes.status === 409) break;
            if (attempt < 2 && (joinRes.status === 429 || joinRes.status >= 500)) await sleep(3000);
          }

          // Log
          await sb.from("group_join_logs").insert({
            user_id: campaign.user_id, device_id: item.device_id, device_name: device.name || item.device_name,
            group_name: item.group_name, group_link: normalizedLink, invite_code: inviteCode,
            endpoint_called: "group/join", response_status: responseStatus || 0,
            result: status, error_message: errorMsg, attempt: 1, duration_ms: 0,
          }).catch(() => {});
        }
      }

      await sb.from("group_join_queue").update({
        group_link: normalizeGroupLink(item.group_link),
        status, error_message: errorMsg, response_status: responseStatus,
        attempt: (item.attempt || 0) + 1, processed_at: new Date().toISOString(),
      }).eq("id", item.id);

      processed++;

      // Update counters periodically
      if (processed % 3 === 0) await updateCampaignCounters(sb, campaign.id);

      // Delay
      const delay = randomBetween(campaign.min_delay || 10, campaign.max_delay || 30);
      await sleep(delay * 1000);
    }

    await updateCampaignCounters(sb, campaign.id);
  }

  log.info(`Group-join campaign ${campaign.id.slice(0, 8)} finished`);
}

// ══════════════════════════════════════════════════════════
// TICK: finds running campaigns and processes them
// ══════════════════════════════════════════════════════════
export async function groupJoinTick(isRunningRef: { value: boolean }) {
  const db = getDb();

  const { data: campaigns } = await db.from("group_join_campaigns")
    .select("*").eq("status", "running")
    .order("created_at", { ascending: true }).limit(5);

  if (!campaigns?.length) return;

  for (const campaign of campaigns) {
    if (!isRunningRef.value) break;

    const { count } = await db.from("group_join_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id).eq("status", "pending");

    if (Number(count || 0) === 0) {
      await updateCampaignCounters(db, campaign.id, true);
      continue;
    }

    try {
      await processOneCampaign(db, campaign, isRunningRef);
    } catch (err: any) {
      log.error(`Group-join campaign ${campaign.id.slice(0, 8)} error: ${err.message}`);
    }
  }

  lastGroupJoinTickAt = new Date();
}
