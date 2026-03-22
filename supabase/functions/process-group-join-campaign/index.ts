import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractInviteCode(link: string): string | null {
  try {
    const cleaned = link.trim().replace(/^https?:\/\//, "").replace(/^chat\.whatsapp\.com\//, "");
    const code = cleaned.split("?")[0].split("/")[0].trim();
    return code && code.length >= 10 ? code : null;
  } catch { return null; }
}

async function tryJoin(
  baseUrl: string, token: string, inviteCode: string, groupLink: string
): Promise<{ ok: boolean; status: number; body: any; raw: string }> {
  const headers = { token, Accept: "application/json", "Content-Type": "application/json" };
  const cleanLink = groupLink.split("?")[0];

  const endpoints = [
    { method: "POST", url: `${baseUrl}/group/join`, body: JSON.stringify({ invitecode: inviteCode }) },
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
  if (status >= 200 && status < 300) {
    const msg = (body?.message || body?.msg || "").toLowerCase();
    if (msg.includes("already") || msg.includes("já")) return { joinStatus: "already_member" };
    if (msg.includes("pending") || msg.includes("approval")) return { joinStatus: "pending_approval", error: "Aguardando aprovação" };
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Can be triggered by cron (with secret) or by authenticated user
    const body = await req.json().catch(() => ({}));
    const tickSecret = Deno.env.get("INTERNAL_TICK_SECRET");
    const isInternalCall = body.secret === tickSecret && !!tickSecret;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let userId: string | null = null;
    let campaignId: string | null = body.campaign_id || null;

    if (!isInternalCall) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        try {
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
          const anonClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: { user }, error } = await anonClient.auth.getUser();
          if (!error && user) {
            userId = user.id;
            console.log(`[process-group-join] authenticated user=${user.id.substring(0, 8)}`);
          } else {
            console.warn(`[process-group-join] auth failed: ${error?.message || "no user"}`);
          }
        } catch (e) {
          console.warn(`[process-group-join] auth error: ${e.message}`);
        }
      }

      // Fallback: if we have a campaign_id, get user_id from the campaign itself
      if (!userId && campaignId) {
        const { data: camp } = await supabase
          .from("group_join_campaigns")
          .select("user_id")
          .eq("id", campaignId)
          .maybeSingle();
        if (camp?.user_id) {
          userId = camp.user_id;
          console.log(`[process-group-join] resolved user from campaign: ${userId.substring(0, 8)}`);
        }
      }

      if (!userId && !campaignId) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Find running campaigns to process
    let campaignsQuery = supabase
      .from("group_join_campaigns")
      .select("*")
      .eq("status", "running")
      .order("created_at", { ascending: true })
      .limit(5);

    if (userId && !isInternalCall) {
      campaignsQuery = campaignsQuery.eq("user_id", userId);
    }
    if (campaignId) {
      campaignsQuery = campaignsQuery.eq("id", campaignId);
    }

    const { data: campaigns, error: campErr } = await campaignsQuery;
    console.log(`[process-group-join] found ${campaigns?.length || 0} campaigns, error=${campErr?.message || "none"}`);
    if (!campaigns?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "No running campaigns" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalProcessed = 0;
    const MAX_EXECUTION_MS = 50000; // 50s safety limit
    const startTime = Date.now();

    for (const campaign of campaigns) {
      if (Date.now() - startTime > MAX_EXECUTION_MS) break;

      // Check if campaign was cancelled/paused by user
      const { data: freshCampaign } = await supabase
        .from("group_join_campaigns")
        .select("status")
        .eq("id", campaign.id)
        .single();

      if (freshCampaign?.status !== "running") continue;

      // Get pending items for this campaign
      const { data: pendingItems } = await supabase
        .from("group_join_queue")
        .select("*")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(10);

      if (!pendingItems?.length) {
        // No more pending items — mark campaign as done
        const { data: allItems } = await supabase
          .from("group_join_queue")
          .select("status")
          .eq("campaign_id", campaign.id);

        const successCount = (allItems || []).filter((i: any) => i.status === "success").length;
        const alreadyCount = (allItems || []).filter((i: any) => i.status === "already_member").length;
        const errorCount = (allItems || []).filter((i: any) => i.status === "error").length;

        await supabase
          .from("group_join_campaigns")
          .update({
            status: "done",
            success_count: successCount,
            already_member_count: alreadyCount,
            error_count: errorCount,
            completed_at: new Date().toISOString(),
          })
          .eq("id", campaign.id);
        continue;
      }

      // Fetch devices for this campaign
      const deviceIds = [...new Set(pendingItems.map((i: any) => i.device_id))];
      const { data: devices } = await supabase
        .from("devices")
        .select("id, name, number, status, uazapi_token, uazapi_base_url")
        .in("id", deviceIds);

      const deviceMap = new Map((devices || []).map((d: any) => [d.id, d]));

      for (const item of pendingItems) {
        if (Date.now() - startTime > MAX_EXECUTION_MS) break;

        // Re-check campaign status
        if (totalProcessed > 0 && totalProcessed % 3 === 0) {
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
          const inviteCode = extractInviteCode(item.group_link);
          if (!inviteCode) {
            errorMsg = "Link inválido";
          } else {
            const baseUrl = (device.uazapi_base_url || "").replace(/\/+$/, "");
            let finalStatus = "error";
            let finalError: string | undefined;
            let finalResponseStatus: number | undefined;

            for (let attempt = 1; attempt <= 2; attempt++) {
              const joinRes = await tryJoin(baseUrl, device.uazapi_token, inviteCode, item.group_link);
              const interpreted = interpretResult(joinRes.status, joinRes.body);
              finalStatus = interpreted.joinStatus;
              finalError = interpreted.error;
              finalResponseStatus = joinRes.status;

              if (["success", "already_member", "pending_approval"].includes(finalStatus) || joinRes.status === 404 || joinRes.status === 409) break;
              if (attempt < 2 && (joinRes.status === 429 || joinRes.status >= 500)) {
                await new Promise(r => setTimeout(r, 3000));
              }
            }

            status = finalStatus;
            errorMsg = finalError || null;
            responseStatus = finalResponseStatus || null;

            // Log result
            try {
              await supabase.from("group_join_logs").insert({
                user_id: campaign.user_id,
                device_id: item.device_id,
                device_name: device.name || item.device_name,
                group_name: item.group_name,
                group_link: item.group_link,
                invite_code: inviteCode,
                endpoint_called: "group/join",
                response_status: responseStatus || 0,
                result: status,
                error_message: errorMsg,
                attempt: 1,
                duration_ms: 0,
              });
            } catch (e) { console.error("log error:", e); }
          }
        }

        // Update queue item
        await supabase
          .from("group_join_queue")
          .update({
            status,
            error_message: errorMsg,
            response_status: responseStatus,
            attempt: (item.attempt || 0) + 1,
            processed_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        totalProcessed++;

        // Pause every N groups
        const pauseEvery = campaign.pause_every || 5;
        const pauseDurationSec = campaign.pause_duration || 180;
        if (totalProcessed > 0 && totalProcessed % pauseEvery === 0) {
          console.log(`[process-group-join] pause for ${pauseDurationSec}s after ${totalProcessed} items`);
          // Cap the pause at 50s to stay within execution limit; self-invoke will continue
          const effectivePause = Math.min(pauseDurationSec, 45) * 1000;
          await new Promise(r => setTimeout(r, effectivePause));
        } else {
          // Random delay between items
          const delay = randomDelay(campaign.min_delay || 10, campaign.max_delay || 30);
          await new Promise(r => setTimeout(r, delay * 1000));
        }
      }

      // Update campaign counters
      const { data: allItems } = await supabase
        .from("group_join_queue")
        .select("status")
        .eq("campaign_id", campaign.id);

      const successCount = (allItems || []).filter((i: any) => i.status === "success").length;
      const alreadyCount = (allItems || []).filter((i: any) => i.status === "already_member").length;
      const errorCount = (allItems || []).filter((i: any) => i.status === "error").length;
      const pendingCount = (allItems || []).filter((i: any) => i.status === "pending").length;

      await supabase
        .from("group_join_campaigns")
        .update({
          success_count: successCount,
          already_member_count: alreadyCount,
          error_count: errorCount,
          ...(pendingCount === 0 ? { status: "done", completed_at: new Date().toISOString() } : {}),
        })
        .eq("id", campaign.id);
    }

    // If there are still running campaigns with pending items, self-invoke for continuation
    const { data: remaining } = await supabase
      .from("group_join_campaigns")
      .select("id")
      .eq("status", "running")
      .limit(1);

    if (remaining?.length) {
      // Fire-and-forget self-call to continue processing
      try {
        const fnUrl = `${supabaseUrl}/functions/v1/process-group-join-campaign`;
        fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ secret: tickSecret }),
        }).catch(() => {});
      } catch {}
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
