import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function stripTrailingNoise(value: string): string {
  return value.trim().replace(/[),.;:!?\]}">']+$/g, "");
}

function extractInviteCode(link: string): string | null {
  try {
    const cleaned = stripTrailingNoise(link)
      .replace(/^https?:\/\//i, "")
      .replace(/^chat\.whatsapp\.com\//i, "");
    const code = cleaned.split(/[/?#\s]/)[0]?.trim();
    return code && /^[A-Za-z0-9_-]{10,}$/.test(code) ? code : null;
  } catch { return null; }
}

function normalizeGroupLink(link: string): string {
  const matched = String(link || "").match(/((?:https?:\/\/)?chat\.whatsapp\.com\/[^\s]+)/i)?.[1] ?? String(link || "");
  const inviteCode = extractInviteCode(matched);
  return inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : stripTrailingNoise(matched.replace(/^http:\/\//i, "https://"));
}

async function tryJoin(
  baseUrl: string, token: string, inviteCode: string, groupLink: string
): Promise<{ ok: boolean; status: number; body: any; raw: string }> {
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
      return { ok: res.ok, status: res.status, body, raw };
    } catch (err) {
      console.error("tryJoin error:", err);
      continue;
    }
  }
  return { ok: false, status: 500, body: { message: "All endpoints failed" }, raw: "" };
}

function interpretResult(status: number, body: any): { joinStatus: string; error?: string } {
  const payload = JSON.stringify(body || {}).toLowerCase();
  if (payload.includes("already") || payload.includes("já")) return { joinStatus: "already_member" };
  if (["approval", "pending", "request sent", "solicita", "aguardando", "private", "privado"].some((term) => payload.includes(term))) {
    return { joinStatus: "pending_approval", error: "Solicitação enviada para aprovação" };
  }
  if (status >= 200 && status < 300) {
    return { joinStatus: "success" };
  }
  if (status === 404) return { joinStatus: "error", error: "Convite inválido ou expirado" };
  if (status === 409) return { joinStatus: "already_member" };
  if (status === 429) return { joinStatus: "error", error: "Rate limited" };
  return { joinStatus: "error", error: `Erro ${status}: ${(body?.message || body?.msg || "").substring(0, 200)}` };
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function updateCampaignCounters(supabase: any, campaignId: string, markDone = false) {
  const { data: allItems } = await supabase
    .from("group_join_queue")
    .select("status")
    .eq("campaign_id", campaignId);

  const successCount = (allItems || []).filter((i: any) => i.status === "success").length;
  const alreadyCount = (allItems || []).filter((i: any) => i.status === "already_member").length;
  const errorCount = (allItems || []).filter((i: any) => i.status === "error" || i.status === "skipped").length;
  const pendingCount = (allItems || []).filter((i: any) => i.status === "pending").length;
  const pendingApprovalCount = (allItems || []).filter((i: any) => i.status === "pending_approval").length;

  const shouldFinish = markDone || pendingCount === 0;

  await supabase
    .from("group_join_campaigns")
    .update({
      success_count: successCount + alreadyCount + pendingApprovalCount,
      already_member_count: alreadyCount,
      error_count: errorCount,
      ...(shouldFinish ? { status: "done", completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", campaignId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const tickSecret = Deno.env.get("INTERNAL_TICK_SECRET");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.replace(/^Bearer\s+/i, "").trim() || "";
    const isInternalCall = (body.secret === tickSecret && !!tickSecret) || bearerToken === serviceKey;

    let userId: string | null = null;
    let campaignId: string | null = body.campaign_id || null;

    if (!isInternalCall) {
      if (authHeader) {
        try {
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
          const anonClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: { user }, error } = await anonClient.auth.getUser();
          if (!error && user) userId = user.id;
        } catch {}
      }
      if (!userId && campaignId) {
        const { data: camp } = await supabase
          .from("group_join_campaigns")
          .select("user_id")
          .eq("id", campaignId)
          .maybeSingle();
        if (camp?.user_id) userId = camp.user_id;
      }
      if (!userId && !campaignId) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let campaignsQuery = supabase
      .from("group_join_campaigns")
      .select("*")
      .eq("status", "running")
      .order("created_at", { ascending: true })
      .limit(5);

    if (userId && !isInternalCall) campaignsQuery = campaignsQuery.eq("user_id", userId);
    if (campaignId) campaignsQuery = campaignsQuery.eq("id", campaignId);

    const { data: campaigns } = await campaignsQuery;
    if (!campaigns?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "No running campaigns" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalProcessed = 0;
    const MAX_EXECUTION_MS = 50000;
    const startTime = Date.now();

    for (const campaign of campaigns) {
      if (Date.now() - startTime > MAX_EXECUTION_MS) break;

      const { data: freshCampaign } = await supabase
        .from("group_join_campaigns")
        .select("status")
        .eq("id", campaign.id)
        .single();

      if (freshCampaign?.status !== "running") continue;

      const { data: pendingItems } = await supabase
        .from("group_join_queue")
        .select("*")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(10);

      if (!pendingItems?.length) {
        await updateCampaignCounters(supabase, campaign.id, true);
        continue;
      }

      const deviceIds = [...new Set(pendingItems.map((i: any) => i.device_id))];
      const { data: devices } = await supabase
        .from("devices")
        .select("id, name, number, status, uazapi_token, uazapi_base_url")
        .in("id", deviceIds);

      const deviceMap = new Map((devices || []).map((d: any) => [d.id, d]));
      let itemsProcessedThisCampaign = 0;
      let shouldBreakForPause = false;

      for (const item of pendingItems) {
        if (Date.now() - startTime > MAX_EXECUTION_MS) break;

        // Re-check campaign status every 3 items
        if (itemsProcessedThisCampaign > 0 && itemsProcessedThisCampaign % 3 === 0) {
          const { data: check } = await supabase
            .from("group_join_campaigns")
            .select("status")
            .eq("id", campaign.id)
            .single();
          if (check?.status !== "running") break;
        }

        const device = deviceMap.get(item.device_id);
        let status = "error";
        let errorMsg: string | null = null;
        let responseStatus: number | null = null;

        if (!device) {
          errorMsg = "Dispositivo não encontrado";
        } else if (!device.uazapi_token || !device.uazapi_base_url) {
          errorMsg = "Token/URL não configurado";
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
              if (attempt < 2 && (joinRes.status === 429 || joinRes.status >= 500)) {
                await new Promise(r => setTimeout(r, 3000));
              }
            }

            try {
              await supabase.from("group_join_logs").insert({
                user_id: campaign.user_id,
                device_id: item.device_id,
                device_name: device.name || item.device_name,
                group_name: item.group_name,
                group_link: normalizedLink,
                invite_code: inviteCode,
                endpoint_called: "group/join",
                response_status: responseStatus || 0,
                result: status,
                error_message: errorMsg,
                attempt: 1,
                duration_ms: 0,
              });
            } catch (e: any) { console.error("log error:", e); }
          }
        }

        // Update queue item
        await supabase
          .from("group_join_queue")
          .update({
            group_link: normalizeGroupLink(item.group_link),
            status,
            error_message: errorMsg,
            response_status: responseStatus,
            attempt: (item.attempt || 0) + 1,
            processed_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        totalProcessed++;
        itemsProcessedThisCampaign++;

        // Update counters after each item for real-time sync
        if (itemsProcessedThisCampaign % 2 === 0) {
          await updateCampaignCounters(supabase, campaign.id);
        }

        // Pause every N groups — break and self-invoke after delay
        const pauseEvery = campaign.pause_every || 5;
        const pauseDurationSec = campaign.pause_duration || 180;
        if (itemsProcessedThisCampaign > 0 && itemsProcessedThisCampaign % pauseEvery === 0) {
          console.log(`[process-group-join] pause ${pauseDurationSec}s after ${itemsProcessedThisCampaign} items`);
          // Wait up to 40s within this invocation, then self-invoke with remaining delay
          const waitHere = Math.min(pauseDurationSec, 40);
          await new Promise(r => setTimeout(r, waitHere * 1000));
          
          if (pauseDurationSec > 40) {
            // Need to break and schedule continuation after remaining pause
            shouldBreakForPause = true;
            break;
          }
        } else {
          // Random delay between items
          const delay = randomDelay(campaign.min_delay || 10, campaign.max_delay || 30);
          await new Promise(r => setTimeout(r, delay * 1000));
        }
      }

      // Update counters at end of batch
      await updateCampaignCounters(supabase, campaign.id);
    }

    // Self-invoke for continuation if there are still running campaigns
    const { data: remaining } = await supabase
      .from("group_join_campaigns")
      .select("id")
      .eq("status", "running")
      .limit(3);

    if (remaining?.length) {
      const fnUrl = `${supabaseUrl}/functions/v1/process-group-join-campaign`;
      for (const row of remaining) {
        fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ campaign_id: row.id, secret: tickSecret }),
        }).catch(() => {});
      }
    }

    return new Response(JSON.stringify({ processed: totalProcessed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-group-join-campaign error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
