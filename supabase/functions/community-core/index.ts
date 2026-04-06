/**
 * community-core — Gateway Leve (v5)
 * 
 * Todo processamento pesado (tick, pareamento, sessões) foi migrado para a VPS.
 * Esta Edge Function mantém apenas:
 *   - Ações de configuração do frontend (set_community_mode, update_community_config)
 *   - Consultas leves (check_eligibility, community_stats)
 *   - daily_reset (sinaliza para a VPS via DB)
 * 
 * O tick roda na VPS a cada ~120s via communityTick()
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CONNECTED_STATUSES = ["Ready", "Connected", "authenticated", "open", "active"];

const INTENSITY_PRESETS: Record<string, {
  daily_limit: number; peers_min: number; peers_max: number; msgs_per_peer: number;
  cooldown_min: number; cooldown_max: number;
}> = {
  low: { daily_limit: 300, peers_min: 2, peers_max: 4, msgs_per_peer: 80, cooldown_min: 30, cooldown_max: 60 },
  medium: { daily_limit: 500, peers_min: 3, peers_max: 6, msgs_per_peer: 120, cooldown_min: 15, cooldown_max: 45 },
  high: { daily_limit: 700, peers_min: 5, peers_max: 10, msgs_per_peer: 120, cooldown_min: 10, cooldown_max: 30 },
};

function getCommunityStartDay(chipState: string): number {
  if (chipState === "unstable") return 9;
  if (chipState === "recovered") return 7;
  return 6;
}

function getPairsTarget(communityDay: number): { min: number; max: number } {
  if (communityDay <= 1) return { min: 1, max: 3 };
  if (communityDay === 2) return { min: 2, max: 5 };
  if (communityDay === 3) return { min: 4, max: 7 };
  if (communityDay <= 6) return { min: 5, max: 8 };
  return { min: 6, max: 10 };
}

function getBrtHourMinute(): string {
  const brt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${String(brt.getHours()).padStart(2, "0")}:${String(brt.getMinutes()).padStart(2, "0")}`;
}
function getBrtDayOfWeek(): string {
  const brt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][brt.getDay()];
}
function isWithinWindow(startHour: string, endHour: string, activeDays: string[]): boolean {
  const now = getBrtHourMinute();
  const day = getBrtDayOfWeek();
  if (!activeDays.includes(day)) return false;
  return now >= startHour && now <= endHour;
}

// ══════════════════════════════════════════════════════════
// CHECK ELIGIBILITY (individual — lightweight query)
// ══════════════════════════════════════════════════════════
async function checkEligibility(db: any, deviceId: string) {
  const { data: mbr } = await db.from("warmup_community_membership")
    .select("*").eq("device_id", deviceId).maybeSingle();
  if (!mbr) return { eligible: false, reason: "no_membership" };
  if (mbr.community_mode === "disabled") return { eligible: false, reason: "mode_disabled" };

  const { data: dev } = await db.from("devices")
    .select("id, status, number, uazapi_token, uazapi_base_url").eq("id", deviceId).maybeSingle();
  if (!dev || !CONNECTED_STATUSES.includes(dev.status)) return { eligible: false, reason: "device_disconnected" };
  if (!dev.uazapi_token || !dev.uazapi_base_url || !dev.number) return { eligible: false, reason: "device_not_configured" };

  if (mbr.cooldown_until && new Date(mbr.cooldown_until) > new Date()) return { eligible: false, reason: "cooldown_active", cooldown_until: mbr.cooldown_until };
  if (mbr.daily_limit > 0 && mbr.messages_today >= mbr.daily_limit) return { eligible: false, reason: "daily_limit_reached" };

  const { count } = await db.from("community_sessions")
    .select("id", { count: "exact", head: true })
    .or(`device_a.eq.${deviceId},device_b.eq.${deviceId}`).eq("status", "active");
  if ((count || 0) > 0) return { eligible: false, reason: "session_active" };

  const activeDays = Array.isArray(mbr.active_days) ? mbr.active_days : ["mon", "tue", "wed", "thu", "fri"];
  if (!isWithinWindow(mbr.start_hour || "08:00", mbr.end_hour || "19:00", activeDays)) return { eligible: false, reason: "outside_window" };

  if (mbr.community_mode === "warmup_managed") {
    const { data: cycle } = await db.from("warmup_cycles")
      .select("id, chip_state, day_index, is_running").eq("device_id", deviceId).eq("is_running", true).maybeSingle();
    if (!cycle) return { eligible: false, reason: "no_active_cycle" };
    if ((cycle.day_index || 1) < getCommunityStartDay(cycle.chip_state || "new")) return { eligible: false, reason: "warmup_day_too_early" };
    if (mbr.community_day < 1) return { eligible: false, reason: "community_day_not_started" };
    const target = getPairsTarget(mbr.community_day);
    if ((mbr.pairs_today || 0) >= target.max) return { eligible: false, reason: "pairs_limit_reached" };
  }

  if (mbr.community_mode === "community_only") {
    const pairsMax = mbr.daily_pairs_max || 6;
    if ((mbr.pairs_today || 0) >= pairsMax) return { eligible: false, reason: "pairs_limit_reached" };
  }

  return {
    eligible: true, community_mode: mbr.community_mode, community_day: mbr.community_day,
    messages_today: mbr.messages_today, pairs_today: mbr.pairs_today, daily_limit: mbr.daily_limit,
    config_type: mbr.config_type, daily_pairs_max: mbr.daily_pairs_max,
    target_messages_per_pair: mbr.target_messages_per_pair,
  };
}

// ══════════════════════════════════════════════════════════
// COMMUNITY STATS (admin overview — lightweight query)
// ══════════════════════════════════════════════════════════
async function getCommunityStats(db: any) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const [
    { data: allMemberships },
    { count: activeSessions },
    { data: todaySessions },
    { data: recentAudit },
    { data: topDevices },
  ] = await Promise.all([
    db.from("warmup_community_membership").select("device_id, user_id, community_mode, is_eligible, is_enabled, pairs_today, messages_today, last_error, last_pair_reject_reason, cooldown_until").eq("is_enabled", true).neq("community_mode", "disabled"),
    db.from("community_sessions").select("id", { count: "exact", head: true }).eq("status", "active"),
    db.from("community_sessions").select("id, status, end_reason, messages_total, target_messages, device_a, device_b, community_mode, started_at, completed_at").gte("started_at", todayStart.toISOString()).order("started_at", { ascending: false }),
    db.from("community_audit_logs").select("id, device_id, event_type, level, message, reason, created_at").order("created_at", { ascending: false }).limit(50),
    db.from("warmup_community_membership").select("device_id, messages_today, pairs_today, last_error").eq("is_enabled", true).neq("community_mode", "disabled").order("messages_today", { ascending: false }).limit(10),
  ]);

  const members = allMemberships || [];
  const eligibleCount = members.filter((m: any) => m.is_eligible).length;
  const blockedCount = members.filter((m: any) => !m.is_eligible).length;

  const blockReasons: Record<string, number> = {};
  for (const m of members) {
    if (!m.is_eligible && m.last_pair_reject_reason) {
      blockReasons[m.last_pair_reject_reason] = (blockReasons[m.last_pair_reject_reason] || 0) + 1;
    }
  }

  const sessions = todaySessions || [];
  const completedToday = sessions.filter((s: any) => s.status === "completed" && s.end_reason === "target_reached").length;
  const failedToday = sessions.filter((s: any) => s.status === "completed" && s.end_reason !== "target_reached").length;

  const sessionsByHour: Record<number, number> = {};
  for (const s of sessions) {
    const h = new Date(s.started_at).getHours();
    sessionsByHour[h] = (sessionsByHour[h] || 0) + 1;
  }

  const errorDevices = members.filter((m: any) => m.last_error).map((m: any) => ({
    device_id: m.device_id, error: m.last_error,
  }));

  return {
    total_members: members.length,
    eligible_now: eligibleCount,
    blocked_now: blockedCount,
    block_reasons: blockReasons,
    active_sessions: activeSessions || 0,
    sessions_today: sessions.length,
    completed_today: completedToday,
    failed_today: failedToday,
    sessions_by_hour: sessionsByHour,
    top_devices: topDevices || [],
    error_devices: errorDevices.slice(0, 10),
    recent_audit: recentAudit || [],
  };
}

// ══════════════════════════════════════════════════════════
// HANDLER
// ══════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const internalSecret = req.headers.get("x-internal-secret");

  const isAnonKey = bearerToken === anonKey;
  const isInternal = !!(internalSecret && internalSecret === Deno.env.get("INTERNAL_TICK_SECRET"));

  let userAuth: any = null;
  if (!isAnonKey && !isInternal && bearerToken) {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await db.auth.getUser(bearerToken);
    userAuth = user;
  }

  if (!isAnonKey && !isInternal && !userAuth) return json({ error: "Unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  try {
    switch (body.action) {
      // ── HEAVY ACTIONS → Delegated to VPS ──
      case "tick":
        return json({ delegated: true, message: "Tick processing is handled by VPS community worker every ~120s" });

      case "process_device":
        return json({ delegated: true, message: "Device processing is handled by VPS community worker" });

      case "daily_reset": {
        // Perform daily reset directly (lightweight DB updates)
        const now = new Date().toISOString();
        await db.from("warmup_community_membership")
          .update({ messages_today: 0, pairs_today: 0, cooldown_until: null, last_daily_reset_at: now, last_error: null, last_pair_reject_reason: null })
          .neq("community_mode", "disabled").eq("is_enabled", true);

        const { data: managed } = await db.from("warmup_community_membership")
          .select("id, community_day").eq("community_mode", "warmup_managed").eq("is_enabled", true);

        if (managed?.length) {
          for (const m of managed) {
            await db.from("warmup_community_membership")
              .update({ community_day: (m.community_day || 0) + 1 }).eq("id", m.id);
          }
        }

        return json({ ok: true, reset_at: now, managed_count: managed?.length || 0 });
      }

      // ── LIGHTWEIGHT QUERIES (stay in Edge) ──
      case "check_eligibility":
        if (!body.device_id) return json({ error: "device_id required" }, 400);
        return json(await checkEligibility(db, body.device_id));

      case "community_stats":
        return json(await getCommunityStats(db));

      // ── CONFIG ACTIONS (stay in Edge — frontend-facing) ──
      case "set_community_mode": {
        if (!body.device_id || !body.mode) return json({ error: "device_id and mode required" }, 400);
        const validModes = ["disabled", "warmup_managed", "community_only"];
        if (!validModes.includes(body.mode)) return json({ error: "Invalid mode" }, 400);

        const updateData: any = { community_mode: body.mode, is_enabled: body.mode !== "disabled" };
        if (body.mode === "community_only") {
          const preset = INTENSITY_PRESETS[body.intensity || "medium"];
          updateData.intensity = body.intensity || "medium";
          updateData.daily_limit = preset.daily_limit;
          updateData.daily_pairs_min = preset.peers_min;
          updateData.daily_pairs_max = preset.peers_max;
          updateData.target_messages_per_pair = preset.msgs_per_peer;
          updateData.cooldown_min_minutes = preset.cooldown_min;
          updateData.cooldown_max_minutes = preset.cooldown_max;
          updateData.config_type = "preset";
          updateData.start_hour = body.start_hour || "08:00";
          updateData.end_hour = body.end_hour || "20:00";
          updateData.active_days = body.active_days || ["mon", "tue", "wed", "thu", "fri"];
        }

        const { error } = await db.from("warmup_community_membership")
          .update(updateData).eq("device_id", body.device_id);
        if (error) {
          const userId = userAuth?.id || body.user_id;
          if (!userId) return json({ error: "user_id required for new membership" }, 400);
          const { error: upsertErr } = await db.from("warmup_community_membership")
            .upsert({ device_id: body.device_id, user_id: userId, ...updateData }, { onConflict: "device_id" });
          if (upsertErr) return json({ error: upsertErr.message }, 500);
        }

        try {
          await db.from("community_audit_logs").insert({
            device_id: body.device_id, user_id: userAuth?.id,
            event_type: "mode_changed", level: "info",
            message: `Modo alterado para ${body.mode}`,
            community_mode: body.mode,
            meta: { intensity: body.intensity },
          });
        } catch { /* audit log failure is non-critical */ }

        return json({ ok: true, mode: body.mode });
      }

      case "update_community_config": {
        if (!body.device_id) return json({ error: "device_id required" }, 400);
        const allowed = [
          "intensity", "config_type", "daily_limit", "daily_pairs_min", "daily_pairs_max",
          "target_messages_per_pair", "cooldown_min_minutes", "cooldown_max_minutes",
          "start_hour", "end_hour", "active_days", "partner_repeat_policy",
          "cross_user_preference", "own_accounts_allowed",
          "custom_min_delay_seconds", "custom_max_delay_seconds",
          "custom_pause_after_min", "custom_pause_after_max",
          "custom_pause_duration_min", "custom_pause_duration_max",
        ];
        const upd: any = {};
        for (const key of allowed) {
          if (body[key] !== undefined) upd[key] = body[key];
        }

        if (upd.config_type === "preset" && upd.intensity) {
          const p = INTENSITY_PRESETS[upd.intensity];
          if (p) {
            upd.daily_limit = p.daily_limit;
            upd.daily_pairs_min = p.peers_min;
            upd.daily_pairs_max = p.peers_max;
            upd.target_messages_per_pair = p.msgs_per_peer;
            upd.cooldown_min_minutes = p.cooldown_min;
            upd.cooldown_max_minutes = p.cooldown_max;
          }
        }

        const { error } = await db.from("warmup_community_membership")
          .update(upd).eq("device_id", body.device_id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, updated: Object.keys(upd) });
      }

      default:
        return json({ delegated: true, message: "Community tick is handled by VPS. Use specific actions: check_eligibility, community_stats, set_community_mode, update_community_config, daily_reset" });
    }
  } catch (err: any) {
    console.error("[community-core] Error:", err.message);
    return json({ error: err.message }, 500);
  }
});
