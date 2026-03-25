import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth: require x-cron-secret, service role JWT, or anon key (from pg_cron) ──
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("INTERNAL_TICK_SECRET");
  const authHeader = req.headers.get("Authorization") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  const isValidCron = expectedSecret && cronSecret === expectedSecret;
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  const isAnonKey = anonKey && authHeader === `Bearer ${anonKey}`;

  // Fallback: accept any Bearer token that looks like a valid Supabase JWT for this project
  let isValidJwt = false;
  if (!isValidCron && !isServiceRole && !isAnonKey && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.replace("Bearer ", "");
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.iss === "supabase" && payload.ref === "amizwispkprvyrnwypws") {
        isValidJwt = true;
      }
    } catch { /* ignore */ }
  }

  if (!isValidCron && !isServiceRole && !isAnonKey && !isValidJwt) {
    console.error("Auth failed. anonKey set:", !!anonKey, "authHeader prefix:", authHeader.substring(0, 30));
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    // ── Cleanup stale device locks (older than 120s without heartbeat) ──
    const { data: cleanedCount } = await serviceClient.rpc("cleanup_stale_locks", { _stale_seconds: 120 });
    if (cleanedCount && cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} stale device locks`);
    }

    // ── WATCHDOG: Detect and restart stuck campaigns ──
    const staleThresholdMs = 60_000;
    const { data: stuckCampaigns } = await serviceClient
      .from("campaigns")
      .select("id, user_id, device_id, device_ids, updated_at, sent_count, failed_count")
      .eq("status", "running")
      .lt("updated_at", new Date(Date.now() - staleThresholdMs).toISOString());

    const restarted: string[] = [];

    for (const stuck of stuckCampaigns || []) {
      const ids: string[] = Array.isArray(stuck.device_ids) && stuck.device_ids.length > 0
        ? stuck.device_ids : stuck.device_id ? [stuck.device_id] : [];

      let workerAlive = false;
      for (const deviceId of ids) {
        const { data: lock } = await serviceClient
          .from("campaign_device_locks")
          .select("heartbeat_at")
          .eq("device_id", deviceId)
          .eq("campaign_id", stuck.id)
          .single();
        if (lock && new Date(lock.heartbeat_at).getTime() > Date.now() - staleThresholdMs) {
          workerAlive = true;
          break;
        }
      }

      if (workerAlive) {
        console.log(`Campaign ${stuck.id} has active worker, skipping restart`);
        continue;
      }

      // Worker is dead — reset processing contacts back to pending
      const { count: processingCount } = await serviceClient
        .from("campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", stuck.id)
        .eq("status", "processing");

      if (processingCount && processingCount > 0) {
        await serviceClient
          .from("campaign_contacts")
          .update({ status: "pending" })
          .eq("campaign_id", stuck.id)
          .eq("status", "processing");
        console.log(`Reset ${processingCount} stuck processing contacts for campaign ${stuck.id}`);
      }

      // Release stale locks for this campaign
      for (const deviceId of ids) {
        await serviceClient.rpc("release_device_lock", { _device_id: deviceId, _campaign_id: stuck.id });
      }

      // Check if there are still pending contacts
      const { count: pendingCount } = await serviceClient
        .from("campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", stuck.id)
        .eq("status", "pending");

      if (!pendingCount || pendingCount === 0) {
        await serviceClient.from("campaigns").update({
          status: "completed",
          completed_at: new Date().toISOString(),
        }).eq("id", stuck.id);
        console.log(`Campaign ${stuck.id} had no pending contacts, marked as completed`);
        continue;
      }

      // Restart the campaign
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/process-campaign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            action: "continue",
            campaignId: stuck.id,
            deviceId: stuck.device_id || undefined,
          }),
        });
        await res.text();
        restarted.push(stuck.id);
        console.log(`🔄 Watchdog restarted stuck campaign ${stuck.id} (${pendingCount} pending): ${res.status}`);
      } catch (err) {
        console.error(`Failed to restart campaign ${stuck.id}:`, err.message);
      }
    }

    // ── Find scheduled campaigns ready to trigger ──
    const { data: campaigns, error } = await serviceClient
      .from("campaigns")
      .select("id, user_id, device_id, device_ids, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    if (error) throw error;

    const results: any[] = [];
    const skipped: string[] = [];

    for (const campaign of campaigns || []) {
      // ── GUARD 1: Check if campaign is STILL "scheduled" (atomic) ──
      const { data: freshCampaign } = await serviceClient
        .from("campaigns")
        .select("id, status, started_at")
        .eq("id", campaign.id)
        .single();

      if (!freshCampaign || freshCampaign.status !== "scheduled") {
        console.log(`⏭️ Campaign ${campaign.id} no longer scheduled (status=${freshCampaign?.status}), skipping`);
        skipped.push(campaign.id);
        continue;
      }

      // ── GUARD 2: Check if any device lock already exists for this campaign ──
      const deviceIds: string[] = Array.isArray(campaign.device_ids) && campaign.device_ids.length > 0
        ? campaign.device_ids : campaign.device_id ? [campaign.device_id] : [];

      let alreadyLocked = false;
      for (const did of deviceIds) {
        const { data: existingLock } = await serviceClient
          .from("campaign_device_locks")
          .select("id")
          .eq("campaign_id", campaign.id)
          .eq("device_id", did)
          .maybeSingle();
        if (existingLock) {
          alreadyLocked = true;
          break;
        }
      }

      if (alreadyLocked) {
        console.log(`⏭️ Campaign ${campaign.id} already has an active worker (lock found), skipping`);
        skipped.push(campaign.id);
        continue;
      }

      // ── GUARD 3: Atomically transition status scheduled → running ──
      const { data: updated, error: updateErr } = await serviceClient
        .from("campaigns")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id)
        .eq("status", "scheduled") // only if still scheduled (optimistic lock)
        .select("id");

      if (updateErr || !updated || updated.length === 0) {
        console.log(`⏭️ Campaign ${campaign.id} was claimed by another worker, skipping`);
        skipped.push(campaign.id);
        continue;
      }

      // ── Trigger process-campaign ──
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/process-campaign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            action: "continue", // already set to "running" above
            campaignId: campaign.id,
            deviceId: campaign.device_id || undefined,
          }),
        });
        const text = await res.text();
        results.push({ campaignId: campaign.id, status: res.status, response: text });
        console.log(`✅ Triggered scheduled campaign ${campaign.id}: ${res.status}`);
      } catch (err) {
        console.error(`Failed to trigger campaign ${campaign.id}:`, err.message);
        // Revert status so watchdog or next tick can retry
        await serviceClient.from("campaigns").update({
          status: "scheduled",
          started_at: null,
        }).eq("id", campaign.id).eq("status", "running");
        results.push({ campaignId: campaign.id, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        triggered: results.length,
        skipped: skipped.length,
        results,
        staleLocksCleaned: cleanedCount || 0,
        watchdogRestarted: restarted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Run scheduled campaigns error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
