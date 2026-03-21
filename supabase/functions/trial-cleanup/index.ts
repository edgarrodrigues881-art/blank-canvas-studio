import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: require INTERNAL_TICK_SECRET
  const secret = req.headers.get("x-internal-secret");
  const expectedSecret = Deno.env.get("INTERNAL_TICK_SECRET");
  if (!expectedSecret || secret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
  const ADMIN_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";

  try {
    // 1. Find users with expired Trial subscriptions that still have devices
    const { data: expiredTrials } = await admin
      .from("subscriptions")
      .select("user_id, plan_name, expires_at")
      .eq("plan_name", "Trial")
      .lt("expires_at", new Date().toISOString());

    if (!expiredTrials || expiredTrials.length === 0) {
      console.log("[trial-cleanup] No expired trials found.");
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = [...new Set(expiredTrials.map((s) => s.user_id))];
    console.log(`[trial-cleanup] Found ${userIds.length} user(s) with expired Trial`);

    let totalDevicesDeleted = 0;
    let totalTokensDeleted = 0;
    let totalProviderDeleted = 0;

    for (const userId of userIds) {
      // Check if user now has a non-Trial active subscription (upgraded)
      const { data: activeSub } = await admin
        .from("subscriptions")
        .select("id, plan_name, expires_at")
        .eq("user_id", userId)
        .neq("plan_name", "Trial")
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (activeSub) {
        console.log(`[trial-cleanup] User ${userId} has active plan "${activeSub.plan_name}", skipping`);
        continue;
      }

      // Check if already cleaned (no devices)
      const { data: devices } = await admin
        .from("devices")
        .select("id, uazapi_token, uazapi_base_url, name, login_type")
        .eq("user_id", userId);

      if (!devices || devices.length === 0) {
        console.log(`[trial-cleanup] User ${userId} has no devices, skipping`);
        continue;
      }

      console.log(`[trial-cleanup] Cleaning ${devices.length} device(s) for user ${userId}`);

      // Delete each device's instance from UAZAPI provider
      for (const device of devices) {
        const token = device.uazapi_token;
        const base = (device.uazapi_base_url || BASE_URL || "").replace(/\/+$/, "");

        if (base && token) {
          try {
            // Disconnect
            await fetch(`${base}/instance/disconnect`, {
              method: "POST",
              headers: { token, Accept: "application/json", "Content-Type": "application/json" },
            }).catch(() => {});

            // Delete via instance token
            let deleted = false;
            for (const ep of ["/instance", "/instance/delete"]) {
              try {
                const res = await fetch(`${base}${ep}`, {
                  method: "DELETE",
                  headers: { token, Accept: "application/json", "Content-Type": "application/json" },
                });
                if (res.ok || res.status === 404) { deleted = true; break; }
              } catch { /* next */ }
            }

            // Fallback: admin token
            if (!deleted && ADMIN_TOKEN) {
              for (const ah of [{ admintoken: ADMIN_TOKEN }, { token: ADMIN_TOKEN }]) {
                try {
                  const res = await fetch(`${base}/instance/delete`, {
                    method: "POST",
                    headers: { ...ah, Accept: "application/json", "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                  });
                  if (res.ok || res.status === 404) { deleted = true; break; }
                } catch { /* next */ }
              }
            }

            if (deleted) totalProviderDeleted++;
            console.log(`[trial-cleanup] Device "${device.name}" provider delete: ${deleted}`);
          } catch (e) {
            console.warn(`[trial-cleanup] Provider error for device ${device.id}:`, e);
          }
        }

        // Clean warmup data
        const did = device.id;
        await admin.from("warmup_jobs").delete().eq("device_id", did);
        await admin.from("warmup_audit_logs").delete().eq("device_id", did);
        await admin.from("warmup_logs").delete().eq("device_id", did);
        await admin.from("warmup_instance_groups").delete().eq("device_id", did);
        await admin.from("warmup_community_membership").delete().eq("device_id", did);
        await admin.from("warmup_sessions").delete().eq("device_id", did);
        await admin.from("warmup_cycles").delete().eq("device_id", did);
        await admin.from("warmup_folder_devices").delete().eq("device_id", did);
      }

      // Mark all tokens as deleted
      const { count: tokenCount } = await admin
        .from("user_api_tokens")
        .update({ status: "deleted", device_id: null, assigned_at: null })
        .eq("user_id", userId)
        .neq("status", "deleted")
        .select("id", { count: "exact", head: true });

      totalTokensDeleted += tokenCount ?? 0;

      // Clear monitor token from profile
      await admin.from("profiles").update({
        whatsapp_monitor_token: null,
        notificacao_liberada: false,
      }).eq("id", userId);

      // Delete report_wa_configs
      await admin.from("report_wa_configs").delete().eq("user_id", userId);

      // Delete all devices
      const deviceIds = devices.map((d) => d.id);
      await admin.from("devices").delete().in("id", deviceIds);
      totalDevicesDeleted += deviceIds.length;

      // Log
      await admin.from("admin_logs").insert({
        admin_id: userId,
        target_user_id: userId,
        action: "trial-cleanup",
        details: `Trial expirado: ${devices.length} instância(s) + ${tokenCount ?? 0} token(s) removidos | ${totalProviderDeleted} deletados do provedor`,
      });

      // Notify user
      await admin.from("notifications").insert({
        user_id: userId,
        title: "⏰ Trial expirado",
        message: `Seu período de teste encerrou. ${devices.length} instância(s) foram removidas. Contrate um plano para continuar usando o sistema.`,
        type: "warning",
      });

      console.log(`[trial-cleanup] User ${userId} cleaned: ${devices.length} devices, ${tokenCount ?? 0} tokens`);
    }

    const summary = {
      success: true,
      users_checked: userIds.length,
      devices_deleted: totalDevicesDeleted,
      tokens_deleted: totalTokensDeleted,
      provider_deleted: totalProviderDeleted,
    };

    console.log("[trial-cleanup] Summary:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[trial-cleanup] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
