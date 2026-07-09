// process-group-dispatch — Server-side worker for group carousel/buttons campaigns.
// Runs in background via EdgeRuntime.waitUntil so pause/cancel honors DB state
// even if the user closes the browser tab.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STOP_STATUSES = new Set(["paused", "cancelled", "canceled", "failed", "completed"]);
const ACTIVE_STATUSES = ["pending", "processing", "running", "scheduled"];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function getCampaignStatus(sb: any, campaignId: string): Promise<string | null> {
  const { data, error } = await sb
    .from("campaigns")
    .select("status")
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !data) return null;
  return data.status as string;
}

// Sleep that wakes every 1s to check campaign status.
// Returns "stop" if campaign was paused/cancelled/deleted during wait.
async function waitWithCheck(sb: any, campaignId: string, ms: number): Promise<"continue" | "stop"> {
  const step = 1000;
  let elapsed = 0;
  while (elapsed < ms) {
    const slice = Math.min(step, ms - elapsed);
    await new Promise((r) => setTimeout(r, slice));
    elapsed += slice;
    const status = await getCampaignStatus(sb, campaignId);
    if (status === null) return "stop"; // deleted
    if (STOP_STATUSES.has(status)) return "stop";
  }
  return "continue";
}

async function processCampaign(campaignId: string, authHeader: string | null) {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: campaign, error: campErr } = await sb
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (campErr || !campaign) {
    console.error("[process-group-dispatch] Campaign not found:", campaignId);
    return;
  }

  if (STOP_STATUSES.has(campaign.status)) {
    console.log(`[process-group-dispatch] Campaign ${campaignId} already in terminal state: ${campaign.status}`);
    return;
  }

  const { data: targets, error: targetsErr } = await sb
    .from("campaign_contacts")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (targetsErr || !targets || targets.length === 0) {
    console.log(`[process-group-dispatch] No pending targets for ${campaignId}`);
    await sb
      .from("campaigns")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", campaignId)
      .in("status", ACTIVE_STATUSES);
    return;
  }

  const minDelay = campaign.min_delay_seconds || 5;
  const maxDelay = campaign.max_delay_seconds || 15;
  const pauseEveryMin = campaign.pause_every_min || 0;
  const pauseEveryMax = campaign.pause_every_max || 0;
  const pauseDurationMin = campaign.pause_duration_min || 0;
  const pauseDurationMax = campaign.pause_duration_max || 0;

  const pauseEvery = pauseEveryMin > 0 ? rand(pauseEveryMin, pauseEveryMax) : 0;

  const dispatchType: "buttons" | "carousel" | "text" =
    campaign.message_type === "carousel" ? "carousel"
      : campaign.message_type === "buttons" ? "buttons"
        : "text";

  const activeButtons = Array.isArray(campaign.buttons)
    ? campaign.buttons.filter((b: any) => (b?.text || "").trim())
    : [];
  const cards = Array.isArray(campaign.carousel_cards) ? campaign.carousel_cards : [];
  const mediaUrl = (campaign.media_url || "").trim();
  const baseText = (campaign.message_content || "").trim();

  let ok = 0;
  let fail = 0;
  let sinceLastPause = 0;

  for (let i = 0; i < targets.length; i++) {
    // Check status BEFORE every send
    const status = await getCampaignStatus(sb, campaignId);
    if (status === null || STOP_STATUSES.has(status)) {
      console.log(`[process-group-dispatch] Stopping ${campaignId} (status=${status})`);
      break;
    }

    const target = targets[i];
    const gid = target.phone;

    // Inter-message delay
    if (i > 0) {
      const result = await waitWithCheck(sb, campaignId, rand(minDelay, maxDelay) * 1000);
      if (result === "stop") break;
    }

    // Block pause
    sinceLastPause++;
    if (pauseEvery > 0 && sinceLastPause >= pauseEvery && i < targets.length - 1) {
      const p = rand(pauseDurationMin, pauseDurationMax) * 1000;
      console.log(`[process-group-dispatch] Block pause ${p}ms for ${campaignId}`);
      const result = await waitWithCheck(sb, campaignId, p);
      if (result === "stop") break;
      sinceLastPause = 0;
    }

    // Resolve deviceId: per-target overrides campaign default; supports multi-device (device_ids[])
    const deviceId: string | null =
      target.device_id ||
      campaign.device_id ||
      (Array.isArray(campaign.device_ids) && campaign.device_ids.length > 0 ? campaign.device_ids[0] : null);

    if (!deviceId) {
      fail++;
      const msg = "Nenhum dispositivo definido para este grupo.";
      console.error(`[process-group-dispatch] ${msg} target=${target.id}`);
      await sb.from("campaign_contacts")
        .update({ status: "failed", error_message: msg })
        .eq("id", target.id);
      continue;
    }

    // Build send body
    const mentionAll = campaign.mention_all === true;
    let body: Record<string, any>;
    if (dispatchType === "buttons" && activeButtons.length > 0) {
      body = {
        deviceId,
        groupJid: gid,
        content: baseText,
        type: "buttons",
        buttons: activeButtons,
        mentionAll,
        ...(mediaUrl ? { mediaUrl } : {}),
      };
    } else if (dispatchType === "carousel") {
      body = cards.length > 0
        ? { deviceId, groupJid: gid, headerText: baseText || undefined, cards, mentionAll }
        : { deviceId, groupJid: gid, content: baseText, type: "text", mentionAll };
    } else {
      if (mediaUrl) {
        body = {
          deviceId,
          groupJid: gid,
          content: mediaUrl,
          caption: baseText || undefined,
          type: "image",
          mentionAll,
        };
      } else {
        body = { deviceId, groupJid: gid, content: baseText, type: "text", mentionAll };
      }
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/group-carousel-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader || `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      ok++;
      const sentAt = new Date().toISOString();
      const resolvedName = data?.groupName;
      const updateFields: Record<string, any> = {
        status: "sent",
        sent_at: sentAt,
        error_message: null,
      };
      if (resolvedName && resolvedName !== gid && !String(resolvedName).includes("@g.us")) {
        updateFields.name = resolvedName;
      }
      await sb.from("campaign_contacts").update(updateFields).eq("id", target.id);
    } catch (err: any) {
      fail++;
      const errorMessage = err?.message || "Falha ao enviar.";
      console.error(`[process-group-dispatch] Send failed for ${gid}: ${errorMessage}`);
      await sb.from("campaign_contacts")
        .update({ status: "failed", error_message: errorMessage })
        .eq("id", target.id);
    }

    // Update aggregate counters
    await sb.from("campaigns")
      .update({
        sent_count: (campaign.sent_count || 0) + ok,
        failed_count: (campaign.failed_count || 0) + fail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId)
      .in("status", ACTIVE_STATUSES); // don't override paused/cancelled
  }

  // Final status — only finalize if not in a terminal state
  const finalStatus = await getCampaignStatus(sb, campaignId);
  if (finalStatus && !STOP_STATUSES.has(finalStatus)) {
    const { count: pendingLeft } = await sb
      .from("campaign_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "pending");

    if (!pendingLeft || pendingLeft === 0) {
      await sb.from("campaigns")
        .update({
          status: fail > 0 && ok === 0 ? "failed" : "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", campaignId)
        .in("status", ACTIVE_STATUSES);
    }
  }

  console.log(`[process-group-dispatch] Done ${campaignId}: ok=${ok} fail=${fail}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { campaignId } = await req.json();
    if (!campaignId || typeof campaignId !== "string") {
      return new Response(JSON.stringify({ error: "campaignId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");

    // Mark as processing immediately (only if still in a pre-run state)
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    await sb.from("campaigns")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .in("status", ["pending", "scheduled", "running"]);

    // Fire-and-forget background processing
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processCampaign(campaignId, authHeader).catch((e) => {
      console.error("[process-group-dispatch] Background error:", e);
    }));

    return new Response(JSON.stringify({ ok: true, campaignId }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[process-group-dispatch] Handler error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
