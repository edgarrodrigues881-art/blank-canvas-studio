// ════════════════════════════════════════════════════════════
// Mass Inject Watchdog — runs every 30s via pg_cron
// Detects stalled campaigns and recovers stuck contacts/workers
// ════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Thresholds
const NO_PROGRESS_THRESHOLD_MS = 60_000;            // 60s without any contact update
const STUCK_PROCESSING_THRESHOLD_MS = 180_000;      // 3min stuck in 'processing' (legacy)
const IDLE_WORKER_THRESHOLD_MS = 90_000;            // worker hasn't claimed in 90s but queue exists
const HARD_FAIL_PROCESSING_MS = 120_000;            // 2min: HARD FAIL — terminal failure
const MAX_CONTACT_ATTEMPTS = 3;                     // matches worker — terminal cap

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: cron secret OR service role
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("INTERNAL_TICK_SECRET");
  const authHeader = req.headers.get("Authorization") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  const ok =
    (expectedSecret && cronSecret === expectedSecret) ||
    authHeader === `Bearer ${serviceRoleKey}` ||
    (anonKey && authHeader === `Bearer ${anonKey}`);

  if (!ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  const summary = {
    triggered_at: new Date().toISOString(),
    campaigns_inspected: 0,
    stalled_detected: 0,
    contacts_recovered: 0,
    contacts_hard_failed: 0,
    contacts_capped_failed: 0,
    workers_restarted: 0,
    actions: [] as Array<Record<string, unknown>>,
  };

  try {
    // ── Find active campaigns ──
    const { data: campaigns, error: campErr } = await sb
      .from("mass_inject_campaigns")
      .select("id, status, device_ids, updated_at, started_at")
      .in("status", ["queued", "running", "processing"]);

    if (campErr) throw campErr;
    summary.campaigns_inspected = campaigns?.length || 0;

    const now = Date.now();

    for (const campaign of campaigns || []) {
      const campaignId = campaign.id as string;
      const deviceIds: string[] = Array.isArray(campaign.device_ids) ? campaign.device_ids : [];

      // ── 1. Recover contacts stuck in 'processing' (>3min) ──
      const stuckCutoff = new Date(now - STUCK_PROCESSING_THRESHOLD_MS).toISOString();
      const { data: stuckContacts } = await sb
        .from("mass_inject_contacts")
        .select("id, assigned_device_id, processed_at, attempt_count")
        .eq("campaign_id", campaignId)
        .eq("status", "processing")
        .lt("processed_at", stuckCutoff);

      if (stuckContacts && stuckContacts.length > 0) {
        const ids = stuckContacts.map((c: any) => c.id);
        // Reset to retrying so claim function can pick them up again
        await sb
          .from("mass_inject_contacts")
          .update({
            status: "retrying",
            error_message: "watchdog: recovered from stuck processing",
            next_retry_at: new Date().toISOString(),
          })
          .in("id", ids);

        summary.contacts_recovered += stuckContacts.length;
        summary.actions.push({
          type: "contacts_recovered",
          campaign_id: campaignId,
          count: stuckContacts.length,
          message: `watchdog triggered: contacts recovered (${stuckContacts.length} stuck >3min)`,
        });
        console.log(
          `[watchdog] contacts recovered: campaign=${campaignId} count=${stuckContacts.length}`,
        );
      }

      // ── 2. Detect no-progress stall (no contact updates in 60s) ──
      const { data: lastUpdate } = await sb
        .from("mass_inject_contacts")
        .select("processed_at")
        .eq("campaign_id", campaignId)
        .not("processed_at", "is", null)
        .order("processed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastTs = lastUpdate?.processed_at
        ? new Date(lastUpdate.processed_at as string).getTime()
        : campaign.started_at
        ? new Date(campaign.started_at as string).getTime()
        : 0;

      const noProgressMs = now - lastTs;

      // Pending queue check
      const { count: pendingCount } = await sb
        .from("mass_inject_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .in("status", [
          "pending",
          "retrying",
          "rate_limited",
          "api_temporary",
          "connection_unconfirmed",
          "session_dropped",
          "permission_unconfirmed",
          "unknown_failure",
          "timeout",
        ]);

      const hasQueue = (pendingCount || 0) > 0;
      const isStalled = hasQueue && noProgressMs > NO_PROGRESS_THRESHOLD_MS;

      if (isStalled) {
        summary.stalled_detected += 1;
        console.log(
          `[watchdog] triggered: campaign=${campaignId} no_progress=${Math.round(
            noProgressMs / 1000,
          )}s pending=${pendingCount}`,
        );

        // ── 3. Restart worker via mass-group-inject edge function (idempotent: protected by advisory lock) ──
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/mass-group-inject`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              action: "recover-stalled",
              campaignId,
            }),
          });
          const body = await res.text();
          summary.workers_restarted += 1;
          summary.actions.push({
            type: "worker_restarted",
            campaign_id: campaignId,
            no_progress_seconds: Math.round(noProgressMs / 1000),
            pending: pendingCount,
            response_status: res.status,
            message: `watchdog triggered: worker restarted (no progress ${Math.round(
              noProgressMs / 1000,
            )}s)`,
          });
          console.log(
            `[watchdog] worker restarted: campaign=${campaignId} status=${res.status} body=${body.substring(0, 120)}`,
          );
        } catch (err: any) {
          console.error(`[watchdog] failed to restart worker for ${campaignId}:`, err.message);
          summary.actions.push({
            type: "worker_restart_failed",
            campaign_id: campaignId,
            error: err.message,
          });
        }

        continue; // already restarted; skip idle-instance loop
      }

      // ── 4. Per-instance idle detection: device has assigned queue but no recent activity ──
      if (deviceIds.length > 0 && hasQueue) {
        for (const deviceId of deviceIds) {
          const { count: deviceQueueCount } = await sb
            .from("mass_inject_contacts")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaignId)
            .eq("assigned_device_id", deviceId)
            .in("status", [
              "pending",
              "retrying",
              "rate_limited",
              "api_temporary",
              "unknown_failure",
              "timeout",
            ]);

          if (!deviceQueueCount || deviceQueueCount === 0) continue;

          const { data: deviceLast } = await sb
            .from("mass_inject_contacts")
            .select("processed_at")
            .eq("campaign_id", campaignId)
            .eq("assigned_device_id", deviceId)
            .not("processed_at", "is", null)
            .order("processed_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const deviceLastTs = deviceLast?.processed_at
            ? new Date(deviceLast.processed_at as string).getTime()
            : 0;
          const deviceIdleMs = now - deviceLastTs;

          if (deviceLastTs > 0 && deviceIdleMs > IDLE_WORKER_THRESHOLD_MS) {
            // Force a worker nudge — same recover-stalled action, idempotent on VPS side
            try {
              const res = await fetch(`${supabaseUrl}/functions/v1/mass-group-inject`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({
                  action: "recover-stalled",
                  campaignId,
                  deviceId,
                }),
              });
              await res.text();
              summary.workers_restarted += 1;
              summary.actions.push({
                type: "idle_worker_restarted",
                campaign_id: campaignId,
                device_id: deviceId,
                idle_seconds: Math.round(deviceIdleMs / 1000),
                queue_size: deviceQueueCount,
                message: `watchdog triggered: worker restarted (device idle ${Math.round(
                  deviceIdleMs / 1000,
                )}s with ${deviceQueueCount} pending)`,
              });
              console.log(
                `[watchdog] worker restarted (idle device): campaign=${campaignId} device=${deviceId} idle=${Math.round(
                  deviceIdleMs / 1000,
                )}s queue=${deviceQueueCount}`,
              );
            } catch (err: any) {
              console.error(`[watchdog] failed idle restart ${deviceId}:`, err.message);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[watchdog] fatal:", err);
    return new Response(JSON.stringify({ error: err.message, summary }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
