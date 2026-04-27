// ══════════════════════════════════════════════════════════
// VPS Engine — Trial Cleanup Worker
// Replaces trial-cleanup Edge Function (was hourly)
// Removes devices/data of users whose Trial subscription expired
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";
import { config as appConfig } from "../core/config";

const log = createLogger("trial-cleanup");

export let lastTrialCleanupTickAt: Date | null = null;

async function deleteOnProvider(baseUrl: string, token: string, adminToken: string): Promise<boolean> {
  // Disconnect (best-effort)
  try {
    await fetch(`${baseUrl}/instance/disconnect`, {
      method: "POST",
      headers: { token, Accept: "application/json", "Content-Type": "application/json" },
    });
  } catch { /* ignore */ }

  // Try delete via instance token
  for (const ep of ["/instance", "/instance/delete"]) {
    try {
      const res = await fetch(`${baseUrl}${ep}`, {
        method: "DELETE",
        headers: { token, Accept: "application/json", "Content-Type": "application/json" },
      });
      if (res.ok || res.status === 404) return true;
    } catch { /* next */ }
  }

  // Fallback: admin token
  if (adminToken) {
    const adminHeaders: Array<Record<string, string>> = [
      { admintoken: adminToken },
      { token: adminToken },
    ];
    for (const ah of adminHeaders) {
      try {
        const res = await fetch(`${baseUrl}/instance/delete`, {
          method: "POST",
          headers: { ...ah, Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.ok || res.status === 404) return true;
      } catch { /* next */ }
    }
  }

  return false;
}

export async function trialCleanupTick(): Promise<void> {
  const db = getDb();
  const adminToken = appConfig.defaultUazapiToken || "";
  const fallbackBase = appConfig.defaultUazapiBaseUrl || "";

  // Find expired Trial subscriptions
  const { data: expiredTrials } = await db
    .from("subscriptions")
    .select("user_id, plan_name, expires_at")
    .eq("plan_name", "Trial")
    .lt("expires_at", new Date().toISOString());

  if (!expiredTrials || expiredTrials.length === 0) {
    lastTrialCleanupTickAt = new Date();
    return;
  }

  const userIds = [...new Set(expiredTrials.map((s: any) => s.user_id))];
  let totalDevicesDeleted = 0;
  let totalTokensDeleted = 0;
  let totalProviderDeleted = 0;
  let usersProcessed = 0;

  for (const userId of userIds) {
    // Skip if user upgraded to a paid plan
    const { data: activeSub } = await db.from("subscriptions")
      .select("id, plan_name, expires_at")
      .eq("user_id", userId).neq("plan_name", "Trial")
      .gt("expires_at", new Date().toISOString())
      .limit(1).maybeSingle();
    if (activeSub) continue;

    const { data: devices } = await db.from("devices")
      .select("id, uazapi_token, uazapi_base_url, name, login_type")
      .eq("user_id", userId);
    if (!devices || devices.length === 0) continue;

    log.info(`Cleaning ${devices.length} device(s) for user ${userId.substring(0, 8)}`);

    for (const device of devices) {
      const baseUrl = (device.uazapi_base_url || fallbackBase || "").replace(/\/+$/, "");
      const token = device.uazapi_token;
      if (baseUrl && token) {
        if (await deleteOnProvider(baseUrl, token, adminToken)) totalProviderDeleted++;
      }

      const did = device.id;
      // Cascade-delete warmup data
      await db.from("warmup_jobs").delete().eq("device_id", did);
      await db.from("warmup_audit_logs").delete().eq("device_id", did);
      await db.from("warmup_logs").delete().eq("device_id", did);
      await db.from("warmup_instance_groups").delete().eq("device_id", did);
      await db.from("warmup_community_membership").delete().eq("device_id", did);
      await db.from("warmup_sessions").delete().eq("device_id", did);
      await db.from("warmup_cycles").delete().eq("device_id", did);
      await db.from("warmup_folder_devices").delete().eq("device_id", did);
    }

    // Mark all tokens as deleted
    const { count: tokenCount } = await db.from("user_api_tokens")
      .update({ status: "deleted", device_id: null, assigned_at: null })
      .eq("user_id", userId).neq("status", "deleted")
      .select("id", { count: "exact", head: true });
    totalTokensDeleted += tokenCount ?? 0;

    await db.from("profiles")
      .update({ whatsapp_monitor_token: null, notificacao_liberada: false })
      .eq("id", userId);

    await db.from("report_wa_configs").delete().eq("user_id", userId);

    const deviceIds = devices.map((d: any) => d.id);
    await db.from("devices").delete().in("id", deviceIds);
    totalDevicesDeleted += deviceIds.length;

    await db.from("admin_logs").insert({
      admin_id: userId, target_user_id: userId, action: "trial-cleanup",
      details: `[vps] Trial expirado: ${devices.length} instância(s) + ${tokenCount ?? 0} token(s) removidos | ${totalProviderDeleted} deletados do provedor`,
    });

    await db.from("notifications").insert({
      user_id: userId,
      title: "⏰ Trial expirado",
      message: `Seu período de teste encerrou. ${devices.length} instância(s) foram removidas. Contrate um plano para continuar usando o sistema.`,
      type: "warning",
    });

    usersProcessed++;
  }

  if (usersProcessed > 0) {
    log.info(`Cleaned ${usersProcessed} user(s): ${totalDevicesDeleted} devices, ${totalTokensDeleted} tokens, ${totalProviderDeleted} on provider`);
  }
  lastTrialCleanupTickAt = new Date();
}
