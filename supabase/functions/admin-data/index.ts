// Admin Data Edge Function — v2 with WA Report
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Não autorizado");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Try getClaims first (works with signing-keys), fall back to getUser
  const token = authHeader.replace("Bearer ", "");
  let userId: string | null = null;
  let userEmail: string | null = null;

  try {
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (!claimsError && claimsData?.claims?.sub) {
      userId = claimsData.claims.sub;
      userEmail = claimsData.claims.email as string || null;
    }
  } catch (_) {
    // getClaims not available, fall back
  }

  if (!userId) {
    const { data: { user: authUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !authUser) {
      console.error("[admin-data] Auth failed:", userError?.message);
      throw new Error("Não autorizado");
    }
    userId = authUser.id;
    userEmail = authUser.email || null;
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) throw new Error("Acesso negado: não é admin");

  return { user: { id: userId, email: userEmail }, adminClient };
}

async function logAction(adminClient: any, adminId: string, targetUserId: string | null, action: string, details: string) {
  await adminClient.from("admin_logs").insert({
    admin_id: adminId,
    target_user_id: targetUserId,
    action,
    details,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user, adminClient } = await verifyAdmin(req);
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "dashboard";
    console.log("[admin-data] action:", action, "user:", user.id);

    // ─── DASHBOARD ───
    if (action === "dashboard") {
      // Run all queries in parallel for speed
      const [
        authUsersRes,
        profilesRes,
        rolesRes,
        devicesRes,
        campaignsRes,
        contactsCountRes,
        subscriptionsRes,
        cyclesRes,
        paymentsRes,
        adminLogsRes,
        costsRes,
      ] = await Promise.all([
        adminClient.auth.admin.listUsers(),
        adminClient.from("profiles").select("id, full_name, company, phone, document, avatar_url, status, instance_override, client_type, notificacao_liberada, whatsapp_monitor_token, created_at, updated_at"),
        adminClient.from("user_roles").select("id, user_id, role"),
        adminClient.from("devices").select("id, user_id, name, number, status, instance_type, login_type, proxy_id, created_at"),
        adminClient.from("campaigns").select("id, user_id, name, status, total_contacts, sent_count, failed_count, created_at"),
        adminClient.from("contacts").select("id", { count: "exact", head: true }),
        adminClient.from("subscriptions").select("id, user_id, plan_name, plan_price, max_instances, started_at, expires_at"),
        adminClient.from("subscription_cycles").select("id, user_id, subscription_id, plan_name, status, cycle_start, cycle_end, cycle_amount, notes, created_at"),
        adminClient.from("payments").select("id, user_id, admin_id, amount, discount, fee, method, notes, paid_at, created_at"),
        adminClient.from("admin_logs").select("id, admin_id, action, details, target_user_id, created_at").order("created_at", { ascending: false }).limit(500),
        adminClient.from("admin_costs").select("id, admin_id, category, amount, description, cost_date, created_at"),
      ]);

      // Fetch admin-only profile data separately
      const { data: adminProfileData } = await adminClient.from("admin_profile_data").select("id, admin_notes, risk_flag");

      const authUsers = authUsersRes.data;
      const profiles = profilesRes.data;
      const roles = rolesRes.data;
      const devices = devicesRes.data;
      const campaigns = campaignsRes.data;
      const subscriptions = subscriptionsRes.data;
      const cycles = cyclesRes.data;
      const payments = paymentsRes.data;
      const adminLogs = adminLogsRes.data;
      const costs = costsRes.data;

      const users = authUsers?.users?.map((u: any) => {
        const profile = profiles?.find((p: any) => p.id === u.id);
        const adminData = adminProfileData?.find((a: any) => a.id === u.id);
        const userRoles = roles?.filter((r: any) => r.user_id === u.id).map((r: any) => r.role) || [];
        const userDevices = devices?.filter((d: any) => d.user_id === u.id) || [];
        const userCampaigns = campaigns?.filter((c: any) => c.user_id === u.id) || [];
        const sub = subscriptions?.find((s: any) => s.user_id === u.id);
        return {
          id: u.id,
          email: u.email,
          full_name: profile?.full_name || null,
          company: profile?.company || null,
          phone: profile?.phone || null,
          document: profile?.document || null,
          avatar_url: profile?.avatar_url || null,
          status: profile?.status || "active",
          risk_flag: adminData?.risk_flag || false,
          admin_notes: adminData?.admin_notes || null,
          roles: userRoles,
          devices_count: userDevices.length,
          devices_connected: userDevices.filter((d: any) => d.status === "Connected").length,
          campaigns_count: userCampaigns.length,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          plan_name: sub?.plan_name || null,
          plan_price: sub?.plan_price || 0,
          max_instances: sub?.max_instances || 0,
          instance_override: profile?.instance_override || 0,
          plan_expires_at: sub?.expires_at || null,
          plan_started_at: sub?.started_at || null,
        };
      }) || [];

      const devicesWithOwner = (devices || []).map((d: any) => {
        const profile = profiles?.find((p: any) => p.id === d.user_id);
        return { ...d, owner_name: profile?.full_name || "Desconhecido" };
      });

      const stats = {
        total_users: authUsers?.users?.length || 0,
        total_devices: devices?.length || 0,
        active_devices: devices?.filter((d: any) => d.status === "Connected").length || 0,
        total_campaigns: campaigns?.length || 0,
        total_contacts: contactsCountRes.count || 0,
        total_subscriptions: subscriptions?.length || 0,
      };

      return new Response(JSON.stringify({ users, devices: devicesWithOwner, stats, cycles: cycles || [], payments: payments || [], admin_logs: adminLogs || [], costs: costs || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CLIENT DETAIL ───
    if (action === "client-detail" && req.method === "POST") {
      const { target_user_id } = await req.json();
      
      // Run all queries in parallel
      const [authUserRes, profileRes, adminDataRes, subRes, devicesRes, campaignsRes, logsRes, paymentsRes, cyclesRes, apiTokensRes] = await Promise.all([
        adminClient.auth.admin.getUserById(target_user_id),
        adminClient.from("profiles").select("id, full_name, company, phone, document, avatar_url, status, instance_override, client_type, notificacao_liberada, whatsapp_monitor_token, created_at, updated_at").eq("id", target_user_id).maybeSingle(),
        adminClient.from("admin_profile_data").select("id, admin_notes, risk_flag").eq("id", target_user_id).maybeSingle(),
        adminClient.from("subscriptions").select("id, user_id, plan_name, plan_price, max_instances, started_at, expires_at").eq("user_id", target_user_id).maybeSingle(),
        adminClient.from("devices").select("id, user_id, name, number, status, instance_type, login_type, proxy_id, uazapi_token, uazapi_base_url, created_at, updated_at").eq("user_id", target_user_id).order("created_at", { ascending: false }),
        adminClient.from("campaigns").select("id, name, status, created_at, sent_count, total_contacts").eq("user_id", target_user_id).order("created_at", { ascending: false }).limit(20),
        adminClient.from("admin_logs").select("id, admin_id, action, details, target_user_id, created_at").eq("target_user_id", target_user_id).order("created_at", { ascending: false }).limit(50),
        adminClient.from("payments").select("id, user_id, admin_id, amount, discount, fee, method, notes, paid_at, created_at").eq("user_id", target_user_id).order("paid_at", { ascending: false }),
        adminClient.from("subscription_cycles").select("id, user_id, subscription_id, plan_name, status, cycle_start, cycle_end, cycle_amount, notes, created_at").eq("user_id", target_user_id).order("cycle_start", { ascending: false }),
        adminClient.from("user_api_tokens").select("id, user_id, device_id, token, status, healthy, label, assigned_at, last_checked_at, created_at").eq("user_id", target_user_id).order("created_at", { ascending: true }),
      ]);

      const authUser = authUserRes.data;
      const profile = profileRes.data;
      const adminData = adminDataRes.data;
      const sub = subRes.data;
      const devices = devicesRes.data;
      const campaigns = campaignsRes.data;
      const logs = logsRes.data;
      const payments = paymentsRes.data;
      const cycles = cyclesRes.data;
      const apiTokens = (apiTokensRes.data || []).filter((t: any) => t.status !== "deleted");

      // Enrich tokens with device name
      const enrichedTokens = apiTokens.map((t: any) => {
        const dev = (devices || []).find((d: any) => d.id === t.device_id);
        return { ...t, device_name: dev?.name || null };
      });

      // If profile has no monitor token but device report_wa does, use device token as fallback
      const reportDevice = (devices || []).find((d: any) => d.login_type === "report_wa");
      const effectiveProfile = profile ? { ...profile, admin_notes: adminData?.admin_notes || null, risk_flag: adminData?.risk_flag || false } : null;
      if (effectiveProfile && !effectiveProfile.whatsapp_monitor_token && reportDevice?.uazapi_token) {
        effectiveProfile.whatsapp_monitor_token = reportDevice.uazapi_token;
      }

      return new Response(JSON.stringify({
        user: authUser?.user || null,
        profile: effectiveProfile,
        subscription: sub,
        devices: devices || [],
        campaigns: campaigns || [],
        admin_logs: logs || [],
        payments: payments || [],
        cycles: cycles || [],
        api_tokens: enrichedTokens,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE CLIENT PROFILE ───
    if (action === "update-client" && req.method === "POST") {
      const { target_user_id, full_name, phone, document, company, status, risk_flag, admin_notes, instance_override } = await req.json();
      
      // Check if override changed for logging
      const { data: oldProfile } = await adminClient.from("profiles").select("instance_override").eq("id", target_user_id).maybeSingle();
      const oldOverride = oldProfile?.instance_override ?? 0;
      const newOverride = instance_override ?? 0;

      await adminClient.from("profiles").update({
        full_name, phone, document, company, status,
        instance_override: newOverride,
        updated_at: new Date().toISOString(),
      }).eq("id", target_user_id);

      // Update admin-only fields in separate table
      await adminClient.from("admin_profile_data").upsert({
        id: target_user_id,
        risk_flag: risk_flag ?? false,
        admin_notes: admin_notes ?? null,
        updated_at: new Date().toISOString(),
      });

      await logAction(adminClient, user.id, target_user_id, "update-client", `Dados atualizados`);

      if (oldOverride !== newOverride) {
        await logAction(adminClient, user.id, target_user_id, "instance-override",
          newOverride > 0
            ? `Override de instâncias: ${oldOverride} → ${newOverride} (+${newOverride} extras)`
            : `Override de instâncias removido (era +${oldOverride})`
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE SUBSCRIPTION ───
    if (action === "update-subscription" && req.method === "POST") {
      const { target_user_id, plan_name, plan_price, max_instances, expires_at, started_at } = await req.json();
      
      // Get old subscription for comparison
      const { data: existing } = await adminClient.from("subscriptions").select("id, max_instances, plan_name").eq("user_id", target_user_id).maybeSingle();
      const oldMaxInstances = existing?.max_instances || 0;
      
      if (existing) {
        await adminClient.from("subscriptions").update({
          plan_name, plan_price, max_instances, expires_at, started_at,
          updated_at: new Date().toISOString(),
        }).eq("user_id", target_user_id);
      } else {
        await adminClient.from("subscriptions").insert({
          user_id: target_user_id, plan_name, plan_price, max_instances, expires_at, started_at,
        });
      }

      await logAction(adminClient, user.id, target_user_id, "update-subscription", `Plano: ${plan_name}, Instâncias: ${max_instances}`);

      // ─── PLAN REMOVAL: reset all instances when downgraded to free/sem_plano ───
      const isPlanRemoved = !plan_name || ["free", "sem_plano", "sem plano"].includes((plan_name || "").toLowerCase().trim());
      if (isPlanRemoved) {
        const ADMIN_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");

        // Get all user devices (non-report)
        const { data: userDevices } = await adminClient.from("devices")
          .select("id, uazapi_token, uazapi_base_url")
          .eq("user_id", target_user_id)
          .neq("login_type", "report_wa");

        let disconnected = 0;
        for (const dev of (userDevices || [])) {
          // Try to disconnect from provider (non-blocking)
          try {
            const devUrl = (dev.uazapi_base_url || ADMIN_BASE_URL || "").replace(/\/+$/, "");
            if (devUrl && dev.uazapi_token) {
              await fetch(`${devUrl}/instance/disconnect`, {
                method: "POST",
                headers: { token: dev.uazapi_token, "Content-Type": "application/json" },
              });
            }
          } catch (e) {
            console.warn(`[plan-removal] Failed to disconnect device ${dev.id}:`, e.message);
          }

          // Mark device as Disconnected and clear session data
          await adminClient.from("devices").update({
            status: "Disconnected",
            number: "",
            profile_name: "",
            profile_picture: null,
          }).eq("id", dev.id);

          // Release token back to pool
          await adminClient.from("user_api_tokens").update({
            status: "available",
            device_id: null,
            assigned_at: null,
          }).eq("device_id", dev.id);

          // Pause any active warmup cycles
          await adminClient.from("warmup_cycles").update({
            is_running: false,
            phase: "paused",
            last_error: "Auto-pausado: plano removido",
          }).eq("device_id", dev.id).eq("is_running", true);

          // Cancel pending warmup jobs
          await adminClient.from("warmup_jobs").update({
            status: "cancelled",
          }).eq("device_id", dev.id).eq("status", "pending");

          disconnected++;
        }

        // Block all tokens
        await adminClient.from("user_api_tokens").update({ status: "blocked" })
          .eq("user_id", target_user_id).in("status", ["available", "reserved"]);

        // Pause any running campaigns
        await adminClient.from("campaigns").update({
          status: "paused",
          updated_at: new Date().toISOString(),
        }).eq("user_id", target_user_id).in("status", ["running", "queued"]);

        await logAction(adminClient, user.id, target_user_id, "plan-removal-reset",
          `Plano removido: ${disconnected} instância(s) desconectada(s), tokens bloqueados, campanhas pausadas`);

        return new Response(JSON.stringify({
          success: true,
          provision: { created: 0, blocked: 0, unblocked: 0, errors: [], reset: disconnected },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── AUTO-PROVISION / ADJUST TOKENS ───
      const ADMIN_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
      const ADMIN_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";

      // Get all tokens for this user
      const { data: allTokens } = await adminClient.from("user_api_tokens")
        .select("id, status, label")
        .eq("user_id", target_user_id)
        .order("created_at", { ascending: true });
      const totalTokens = allTokens?.length || 0;

      let provisionResult = { created: 0, blocked: 0, unblocked: 0, errors: [] as string[] };

      // DOWNGRADE: block excess tokens (only available ones, don't touch in_use)
      if (max_instances < totalTokens) {
        const availableTokens = (allTokens || []).filter((t: any) => t.status === "available");
        const excessCount = totalTokens - max_instances;
        const toBlock = availableTokens.slice(-excessCount); // block last ones
        for (const t of toBlock) {
          await adminClient.from("user_api_tokens").update({ status: "blocked" }).eq("id", t.id);
          provisionResult.blocked++;
        }
        await logAction(adminClient, user.id, target_user_id, "tokens-blocked",
          `${provisionResult.blocked} token(s) bloqueado(s) por downgrade (limite: ${max_instances})`);
      }

      // UPGRADE or SAME: unblock previously blocked tokens up to limit, then create missing
      if (max_instances >= totalTokens) {
        // First unblock any blocked tokens
        const { data: blockedTokens } = await adminClient.from("user_api_tokens")
          .select("id").eq("user_id", target_user_id).eq("status", "blocked");
        for (const t of (blockedTokens || [])) {
          await adminClient.from("user_api_tokens").update({ status: "available" }).eq("id", t.id);
          provisionResult.unblocked++;
        }
      }

      // Lazy provisioning: DON'T pre-generate tokens.
      // Tokens are generated on-demand when user creates instances.
      // Just log the plan change.
      console.log(`[save-plan] Lazy mode: no tokens pre-generated. Limit set to ${max_instances}. Existing tokens unblocked: ${provisionResult.unblocked}`);
      await logAction(adminClient, user.id, target_user_id, "plan-updated",
        `Plano atualizado: limite ${max_instances} instâncias. ${provisionResult.unblocked} tokens desbloqueados. Tokens serão gerados sob demanda.`);

      return new Response(JSON.stringify({
        success: true,
        provision: provisionResult,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RESET PASSWORD ───
    if (action === "reset-password" && req.method === "POST") {
      const { target_user_id, email } = await req.json();
      
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      // Use admin API to generate reset link
      const { data, error } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
      });

      if (error) throw error;

      await logAction(adminClient, user.id, target_user_id, "reset-password", `Reset de senha solicitado para ${email}`);

      return new Response(JSON.stringify({ success: true, message: "Link de redefinição gerado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── FORCE LOGOUT (invalidate sessions) ───
    if (action === "force-logout" && req.method === "POST") {
      const { target_user_id } = await req.json();
      
      // Sign out user from all sessions
      await adminClient.auth.admin.signOut(target_user_id);

      await logAction(adminClient, user.id, target_user_id, "force-logout", `Forçado logout do usuário`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SUSPEND/ACTIVATE CLIENT ───
    if (action === "toggle-status" && req.method === "POST") {
      const { target_user_id, new_status } = await req.json();
      
      await adminClient.from("profiles").update({ status: new_status, updated_at: new Date().toISOString() }).eq("id", target_user_id);

      // If suspending, also ban auth user
      if (new_status === "suspended" || new_status === "cancelled") {
        await adminClient.auth.admin.updateUserById(target_user_id, { ban_duration: "876600h" }); // ~100 years
      } else if (new_status === "active") {
        await adminClient.auth.admin.updateUserById(target_user_id, { ban_duration: "none" });
      }

      await logAction(adminClient, user.id, target_user_id, "toggle-status", `Status alterado para: ${new_status}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CONFIRM EMAIL ───
    if (action === "confirm-email" && req.method === "POST") {
      const { target_user_id } = await req.json();
      await adminClient.auth.admin.updateUserById(target_user_id, { email_confirm: true });
      await logAction(adminClient, user.id, target_user_id, "confirm-email", "E-mail confirmado manualmente pelo admin");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SET ROLE ───
    if (action === "set-role" && req.method === "POST") {
      const { target_user_id, role, remove } = await req.json();

      const PRIMARY_ADMIN_ID = "86d67880-af22-4c3f-a2c4-fa324a354737";
      if (target_user_id === PRIMARY_ADMIN_ID && remove) {
        return new Response(JSON.stringify({ error: "Não é possível remover o admin principal" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (remove) {
        await adminClient.from("user_roles").delete().eq("user_id", target_user_id).eq("role", role);
      } else {
        await adminClient.from("user_roles").upsert({ user_id: target_user_id, role }, { onConflict: "user_id,role" });
      }

      await logAction(adminClient, user.id, target_user_id, "set-role", `${remove ? "Removida" : "Adicionada"} role: ${role}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE CONNECTION PURPOSE ───
    if (action === "update-connection-purpose" && req.method === "POST") {
      const { id, device_id } = await req.json();

      const { data: existing, error: existingError } = await adminClient
        .from("admin_connection_purposes")
        .select("id, purpose, label")
        .eq("id", id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (!existing) {
        return new Response(JSON.stringify({ error: "Finalidade não encontrada" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (device_id) {
        const { data: device, error: deviceError } = await adminClient
          .from("devices")
          .select("id, user_id, name")
          .eq("id", device_id)
          .maybeSingle();

        if (deviceError) throw deviceError;
        if (!device) {
          return new Response(JSON.stringify({ error: "Dispositivo não encontrado" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (device.user_id !== user.id) {
          return new Response(JSON.stringify({ error: "Você só pode usar seus próprios dispositivos" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const payload = {
        device_id: device_id || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateError } = await adminClient
        .from("admin_connection_purposes")
        .update(payload)
        .eq("id", id)
        .select("id, purpose, label, device_id, updated_by, updated_at")
        .maybeSingle();

      if (updateError) throw updateError;

      await logAction(
        adminClient,
        user.id,
        user.id,
        "update-connection-purpose",
        `${existing.purpose}: ${device_id || "sem dispositivo"}`
      );

      return new Response(JSON.stringify({ success: true, purpose: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET ADMIN LOGS ───
    if (action === "admin-logs") {
      const { data: logs } = await adminClient
        .from("admin_logs")
        .select("id, admin_id, action, details, target_user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      return new Response(JSON.stringify({ logs: logs || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CREATE DEVICE FOR USER ───
    if (action === "create-device" && req.method === "POST") {
      const { target_user_id, name, login_type } = await req.json();

      const ADMIN_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");

      // Auto-assign next available AND healthy token from pool
      // First try healthy=true, then healthy=null (unchecked), skip healthy=false
      let availableToken: any = null;
      
      // Try healthy tokens first
      const { data: healthyToken } = await adminClient.from("user_api_tokens")
        .select("id, token, user_id, status, healthy, label")
        .eq("user_id", target_user_id)
        .eq("status", "available")
        .eq("healthy", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (healthyToken) {
        availableToken = healthyToken;
      } else {
        // Fallback to unchecked tokens (healthy IS NULL)
        const { data: uncheckedToken } = await adminClient.from("user_api_tokens")
          .select("id, token, user_id, status, healthy, label")
          .eq("user_id", target_user_id)
          .eq("status", "available")
          .is("healthy", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (uncheckedToken) {
          // Validate it before assigning
          try {
            const checkRes = await fetch(`${ADMIN_BASE_URL}/instance/status`, {
              method: "GET",
              headers: { "token": uncheckedToken.token, "Accept": "application/json" },
            });
            const isHealthy = checkRes.status !== 401;
            await adminClient.from("user_api_tokens").update({
              healthy: isHealthy,
              last_checked_at: new Date().toISOString(),
            }).eq("id", uncheckedToken.id);
            if (isHealthy) {
              availableToken = uncheckedToken;
            } else {
              console.log(`Token ${uncheckedToken.id} is invalid (401), skipping`);
            }
          } catch (_e) {
            // Network error, still assign it
            availableToken = uncheckedToken;
          }
        }
      }

      const instanceType = login_type === "notificacao" ? "notificacao" : "principal";

      const { data, error } = await adminClient.from("devices").insert({
        user_id: target_user_id,
        name,
        login_type: instanceType === "notificacao" ? "report_wa" : (login_type || "qr"),
        instance_type: instanceType,
        status: "Disconnected",
        uazapi_token: availableToken?.token || null,
        uazapi_base_url: availableToken ? ADMIN_BASE_URL : null,
      }).select("id, name, user_id, status, login_type, instance_type, created_at").single();

      if (error) throw error;

      // Mark token as in_use
      if (availableToken) {
        await adminClient.from("user_api_tokens").update({
          status: "in_use",
          device_id: data.id,
          assigned_at: new Date().toISOString(),
        }).eq("id", availableToken.id);
      }

      await logAction(adminClient, user.id, target_user_id, "create-device", `Instância criada: ${name}${availableToken ? " (token auto-atribuído)" : " (sem token disponível)"}`);

      // Dispatch webhook to Make
      const makeUrl = Deno.env.get("MAKE_WEBHOOK_URL");
      if (makeUrl) {
        try {
          const { data: authUser } = await adminClient.auth.admin.getUserById(target_user_id);
          const { data: sub } = await adminClient.from("subscriptions").select("plan_name").eq("user_id", target_user_id).maybeSingle();
          await fetch(makeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "instance.created",
              client_id: target_user_id,
              client_email: authUser?.user?.email || null,
              plan: sub?.plan_name || null,
              instance: { id: data.id, name: data.name, type: data.instance_type || "principal", status: "desconectada", created_at: data.created_at },
              token: availableToken ? { value: availableToken.token, status: "em_uso", health: "valido" } : null,
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (e) { console.log("Make webhook error:", e.message); }
      }

      return new Response(JSON.stringify({ success: true, device: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DELETE DEVICE ───
    if (action === "delete-device" && req.method === "POST") {
      const { target_user_id, device_id, device_name } = await req.json();
      
      // Release any assigned token
      await adminClient.from("user_api_tokens").update({
        status: "available", device_id: null, assigned_at: null,
      }).eq("device_id", device_id);

      await adminClient.from("devices").delete().eq("id", device_id);

      await logAction(adminClient, user.id, target_user_id, "delete-device", `Instância removida: ${device_name}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── BULK REASSIGN TOKENS (reconnect disconnected devices) ───
    if (action === "bulk-reassign-tokens" && req.method === "POST") {
      const { target_user_id } = await req.json();
      if (!target_user_id) throw new Error("target_user_id obrigatório");

      const ADMIN_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");

      // Get all disconnected devices WITHOUT tokens for this user (non-report_wa)
      const { data: disconnected } = await adminClient.from("devices")
        .select("id, name, proxy_id")
        .eq("user_id", target_user_id)
        .neq("login_type", "report_wa")
        .is("uazapi_token", null)
        .order("name", { ascending: true });

      if (!disconnected?.length) {
        return new Response(JSON.stringify({ success: true, reassigned: 0, message: "Nenhuma instância sem token encontrada" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get available or blocked tokens (not currently in_use with a device) for this user
      const { data: availableTokens } = await adminClient.from("user_api_tokens")
        .select("id, token")
        .eq("user_id", target_user_id)
        .in("status", ["available", "blocked"])
        .is("device_id", null)
        .order("created_at", { ascending: true })
        .limit(disconnected.length);

      if (!availableTokens?.length) {
        return new Response(JSON.stringify({ success: false, reassigned: 0, message: "Nenhum token disponível no pool" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const toReassign = Math.min(disconnected.length, availableTokens.length);
      let reassigned = 0;
      const errors: string[] = [];

      for (let i = 0; i < toReassign; i++) {
        const device = disconnected[i];
        const token = availableTokens[i];
        try {
          // Update device with token + base URL
          await adminClient.from("devices").update({
            uazapi_token: token.token,
            uazapi_base_url: ADMIN_BASE_URL || null,
          }).eq("id", device.id);

          // Mark token as in_use
          await adminClient.from("user_api_tokens").update({
            status: "in_use",
            device_id: device.id,
            assigned_at: new Date().toISOString(),
          }).eq("id", token.id);

          reassigned++;
        } catch (e) {
          errors.push(`${device.name}: ${(e as any).message}`);
        }
      }

      await logAction(adminClient, user.id, target_user_id, "bulk-reassign-tokens", `${reassigned}/${disconnected.length} instâncias reatribuídas com tokens`);

      return new Response(JSON.stringify({
        success: true,
        reassigned,
        total_disconnected: disconnected.length,
        tokens_available: availableTokens.length,
        errors: errors.length > 0 ? errors : undefined,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── BULK UNBLOCK TOKENS ───
    if (action === "bulk-unblock-tokens" && req.method === "POST") {
      const { target_user_id } = await req.json();
      if (!target_user_id) throw new Error("target_user_id obrigatório");

      const { data: blocked } = await adminClient.from("user_api_tokens")
        .select("id")
        .eq("user_id", target_user_id)
        .eq("status", "blocked");

      const count = blocked?.length || 0;
      if (count === 0) {
        return new Response(JSON.stringify({ success: true, unblocked: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ids = blocked!.map((t: any) => t.id);
      await adminClient.from("user_api_tokens")
        .update({ status: "available" })
        .in("id", ids);

      await logAction(adminClient, user.id, target_user_id, "bulk-unblock-tokens",
        `${count} token(s) desbloqueado(s) em massa`);

      return new Response(JSON.stringify({ success: true, unblocked: count }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }



    // ─── SET REPORT DEVICE CREDENTIALS (admin manually configures token+url for client's report_wa instance) ───
    if (action === "set-report-credentials" && req.method === "POST") {
      const { target_user_id, device_id, uazapi_token, uazapi_base_url } = await req.json();
      if (!device_id || !uazapi_token || !uazapi_base_url) {
        return new Response(JSON.stringify({ error: "device_id, uazapi_token e uazapi_base_url são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify the device belongs to the target user and is report_wa
      const { data: dev } = await adminClient.from("devices").select("id, login_type, user_id, name").eq("id", device_id).single();
      if (!dev || dev.user_id !== target_user_id || dev.login_type !== "report_wa") {
        return new Response(JSON.stringify({ error: "Dispositivo não encontrado ou não é instância de relatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("devices").update({
        uazapi_token: uazapi_token.trim(),
        uazapi_base_url: uazapi_base_url.trim().replace(/\/+$/, ""),
      }).eq("id", device_id);

      await logAction(adminClient, user.id, target_user_id, "set-report-credentials", `Credenciais de relatório configuradas para "${dev.name}"`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list-payments" && req.method === "POST") {
      const { target_user_id } = await req.json();
      const { data: payments } = await adminClient.from("payments").select("id, user_id, admin_id, amount, discount, fee, method, notes, paid_at, created_at").eq("user_id", target_user_id).order("paid_at", { ascending: false });
      return new Response(JSON.stringify({ payments: payments || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ADD PAYMENT ───
    if (action === "add-payment" && req.method === "POST") {
      const { target_user_id, amount, method, notes, paid_at, discount, fee } = await req.json();
      await adminClient.from("payments").insert({
        user_id: target_user_id,
        amount,
        method,
        notes,
        paid_at,
        discount: discount || 0,
        fee: fee || 0,
        admin_id: user.id,
      });
      await logAction(adminClient, user.id, target_user_id, "add-payment", `Pagamento: R$ ${amount} (desc: R$ ${discount || 0}, taxa: R$ ${fee || 0}) via ${method}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE PAYMENT ───
    if (action === "update-payment" && req.method === "POST") {
      const { payment_id, target_user_id, amount, method, notes, paid_at, discount, fee } = await req.json();
      await adminClient.from("payments").update({ amount, method, notes, paid_at, discount: discount || 0, fee: fee || 0 }).eq("id", payment_id);
      await logAction(adminClient, user.id, target_user_id, "update-payment", `Pagamento atualizado: R$ ${amount} (desc: R$ ${discount || 0}, taxa: R$ ${fee || 0}) via ${method}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DELETE PAYMENT ───
    if (action === "delete-payment" && req.method === "POST") {
      const { payment_id, target_user_id } = await req.json();
      await adminClient.from("payments").delete().eq("id", payment_id);
      await logAction(adminClient, user.id, target_user_id, "delete-payment", `Pagamento removido: ${payment_id}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST MESSAGES ───
    if (action === "list-messages" && req.method === "POST") {
      const { target_user_id } = await req.json();
      const { data: messages } = await adminClient.from("client_messages").select("id, user_id, admin_id, template_type, message_content, observation, sent_at, created_at").eq("user_id", target_user_id).order("sent_at", { ascending: false });
      return new Response(JSON.stringify({ messages: messages || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CREATE CYCLE (renew subscription) ───
    if (action === "create-cycle" && req.method === "POST") {
      const { target_user_id, plan_name, cycle_amount, cycle_start, cycle_end } = await req.json();

      // Get or create subscription
      const { data: existing } = await adminClient.from("subscriptions").select("id").eq("user_id", target_user_id).maybeSingle();
      
      let subId = existing?.id;
      if (!subId) {
        const { data: newSub } = await adminClient.from("subscriptions").insert({
          user_id: target_user_id, plan_name, plan_price: cycle_amount, max_instances: 10,
          started_at: cycle_start, expires_at: cycle_end,
        }).select("id").single();
        subId = newSub?.id;
      } else {
        // Update subscription expiry to the new cycle end
        await adminClient.from("subscriptions").update({
          expires_at: cycle_end, started_at: cycle_start, plan_name,
          updated_at: new Date().toISOString(),
        }).eq("user_id", target_user_id);
      }

      // Insert cycle
      await adminClient.from("subscription_cycles").insert({
        user_id: target_user_id,
        subscription_id: subId,
        plan_name,
        cycle_start,
        cycle_end,
        cycle_amount,
        status: "pending",
      });

      await logAction(adminClient, user.id, target_user_id, "create-cycle", `Novo ciclo: ${plan_name}, R$ ${cycle_amount}, ${cycle_start} → ${cycle_end}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── REVERT LAST CYCLE ───
    if (action === "revert-cycle" && req.method === "POST") {
      const { target_user_id } = await req.json();

      // Get most recent cycle
      const { data: cycles } = await adminClient.from("subscription_cycles")
        .select("id, user_id, subscription_id, plan_name, status, cycle_start, cycle_end, cycle_amount, notes, created_at").eq("user_id", target_user_id)
        .order("cycle_start", { ascending: false }).limit(2);

      if (!cycles || cycles.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhum ciclo para reverter" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const latest = cycles[0];
      await adminClient.from("subscription_cycles").delete().eq("id", latest.id);

      // If there's a previous cycle, restore subscription to it
      if (cycles.length > 1) {
        const prev = cycles[1];
        await adminClient.from("subscriptions").update({
          expires_at: prev.cycle_end, started_at: prev.cycle_start, plan_name: prev.plan_name,
          updated_at: new Date().toISOString(),
        }).eq("user_id", target_user_id);
      }

      await logAction(adminClient, user.id, target_user_id, "revert-cycle", `Ciclo revertido: ${latest.plan_name}, ${latest.cycle_start} → ${latest.cycle_end}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE CYCLE STATUS ───
    if (action === "update-cycle-status" && req.method === "POST") {
      const { cycle_id, status, target_user_id } = await req.json();
      await adminClient.from("subscription_cycles").update({ status }).eq("id", cycle_id);
      await logAction(adminClient, user.id, target_user_id, "update-cycle-status", `Ciclo ${cycle_id} → ${status}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SAVE MESSAGE ───
    if (action === "save-message" && req.method === "POST") {
      const { target_user_id, template_type, message_content, observation } = await req.json();
      await adminClient.from("client_messages").insert({
        user_id: target_user_id, admin_id: user.id, template_type, message_content, observation,
      });
      await logAction(adminClient, user.id, target_user_id, "send-message", `Mensagem: ${template_type}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DELETE MESSAGE ───
    if (action === "delete-message" && req.method === "POST") {
      const { message_id, target_user_id } = await req.json();
      await adminClient.from("client_messages").delete().eq("id", message_id);
      await logAction(adminClient, user.id, target_user_id, "delete-message", `Mensagem removida: ${message_id}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ADD COST ───
    if (action === "add-cost" && req.method === "POST") {
      const { category, amount, description, cost_date } = await req.json();
      await adminClient.from("admin_costs").insert({
        admin_id: user.id, category, amount, description, cost_date,
      });
      await logAction(adminClient, user.id, null, "add-cost", `Custo: ${category} R$ ${amount}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE COST ───
    if (action === "update-cost" && req.method === "POST") {
      const { cost_id, category, amount, description, cost_date } = await req.json();
      await adminClient.from("admin_costs").update({ category, amount, description, cost_date }).eq("id", cost_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DELETE COST ───
    if (action === "delete-cost" && req.method === "POST") {
      const { cost_id } = await req.json();
      await adminClient.from("admin_costs").delete().eq("id", cost_id);
      await logAction(adminClient, user.id, null, "delete-cost", `Custo removido: ${cost_id}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── REMOVE SUBSCRIPTION (sem plano) ───
    if (action === "remove-subscription" && req.method === "POST") {
      const { target_user_id } = await req.json();
      
      // Delete subscription
      await adminClient.from("subscriptions").delete().eq("user_id", target_user_id);
      
      // Block all tokens for this user
      await adminClient.from("user_api_tokens")
        .update({ status: "blocked" })
        .eq("user_id", target_user_id)
        .neq("status", "blocked");
      
      // Update profile instance_override to 0
      await adminClient.from("profiles")
        .update({ instance_override: 0 })
        .eq("id", target_user_id);
      
      // Delete all subscription cycles
      await adminClient.from("subscription_cycles")
        .delete()
        .eq("user_id", target_user_id);
      
      await logAction(adminClient, user.id, target_user_id, "remove-subscription", "Plano removido — cliente sem plano, tokens bloqueados, ciclos removidos");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ADD TOKENS (with auto-validation) ───
    if (action === "add-tokens" && req.method === "POST") {
      const { target_user_id, tokens: tokenList } = await req.json();
      const ADMIN_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
      
      const inserts = [];
      for (const t of (tokenList || [])) {
        const token = t.trim();
        if (!token) continue;
        
        // Validate token against API
        let healthy: boolean | null = null;
        try {
          const checkRes = await fetch(`${ADMIN_BASE_URL}/instance/status`, {
            method: "GET",
            headers: { "token": token, "Accept": "application/json" },
          });
          healthy = checkRes.status !== 401;
          console.log(`Token validation: ${token.substring(0, 8)}... -> ${checkRes.status} -> healthy=${healthy}`);
        } catch (e) {
          console.log(`Token validation failed for ${token.substring(0, 8)}...: ${e.message}`);
        }
        
        inserts.push({
          user_id: target_user_id,
          token,
          admin_id: user.id,
          status: "available",
          healthy,
          last_checked_at: healthy !== null ? new Date().toISOString() : null,
        });
      }
      
      if (inserts.length > 0) {
        const { error } = await adminClient.from("user_api_tokens").insert(inserts);
        if (error) throw error;
      }
      
      const healthyCount = inserts.filter(i => i.healthy === true).length;
      const invalidCount = inserts.filter(i => i.healthy === false).length;
      await logAction(adminClient, user.id, target_user_id, "add-tokens", `${inserts.length} token(s) adicionado(s) (${healthyCount} válidos, ${invalidCount} inválidos)`);
      return new Response(JSON.stringify({ success: true, total: inserts.length, healthy: healthyCount, invalid: invalidCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── VALIDATE TOKENS ───
    if (action === "validate-tokens" && req.method === "POST") {
      const { target_user_id } = await req.json();
      const ADMIN_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
      
      const { data: allTokens } = await adminClient.from("user_api_tokens")
        .select("id, token, status")
        .eq("user_id", target_user_id);
      
      let healthyCount = 0;
      let invalidCount = 0;
      
      for (const t of (allTokens || [])) {
        try {
          const checkRes = await fetch(`${ADMIN_BASE_URL}/instance/status`, {
            method: "GET",
            headers: { "token": t.token, "Accept": "application/json" },
          });
          const isHealthy = checkRes.status !== 401;
          await adminClient.from("user_api_tokens").update({
            healthy: isHealthy,
            last_checked_at: new Date().toISOString(),
          }).eq("id", t.id);
          if (isHealthy) healthyCount++;
          else invalidCount++;
          console.log(`Validate ${t.token.substring(0, 8)}... -> ${checkRes.status} -> ${isHealthy}`);
        } catch (e) {
          console.log(`Validate error for ${t.token.substring(0, 8)}...: ${e.message}`);
        }
      }
      
      await logAction(adminClient, user.id, target_user_id, "validate-tokens", `${allTokens?.length || 0} tokens validados (${healthyCount} válidos, ${invalidCount} inválidos)`);
      return new Response(JSON.stringify({ success: true, total: allTokens?.length || 0, healthy: healthyCount, invalid: invalidCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ─── AUTO-PROVISION TOKENS (create UAZAPI instances) ───
    if (action === "auto-provision-tokens" && req.method === "POST") {
      const { target_user_id, quantity, client_name } = await req.json();
      const ADMIN_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
      const ADMIN_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";

      if (!ADMIN_BASE_URL || !ADMIN_TOKEN) {
        return new Response(JSON.stringify({ error: "UAZAPI_BASE_URL ou UAZAPI_TOKEN não configurados" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check how many non-blocked tokens already exist for this user
      const { data: existingTokens } = await adminClient.from("user_api_tokens")
        .select("id, status")
        .eq("user_id", target_user_id)
        .neq("status", "blocked");
      const existingCount = existingTokens?.length || 0;

      // Also unblock any blocked tokens first (up to quantity)
      const { data: blockedTokens } = await adminClient.from("user_api_tokens")
        .select("id").eq("user_id", target_user_id).eq("status", "blocked");
      let unblockedCount = 0;
      for (const bt of (blockedTokens || [])) {
        if (existingCount + unblockedCount >= quantity) break;
        await adminClient.from("user_api_tokens").update({ status: "available" }).eq("id", bt.id);
        unblockedCount++;
      }

      const totalActive = existingCount + unblockedCount;
      const toCreate = Math.max(0, quantity - totalActive);

      if (toCreate === 0) {
        return new Response(JSON.stringify({ 
          success: true, created: 0, existing: totalActive, unblocked: unblockedCount,
          message: `Cliente já possui ${totalActive} token(s) — nenhum novo criado.`
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sanitizedName = (client_name || "cliente").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 20);
      const created: string[] = [];
      const errors: string[] = [];

      for (let i = 0; i < toCreate; i++) {
        const instanceName = `${sanitizedName}_${totalActive + i + 1}`;
        try {
          const res = await fetch(`${ADMIN_BASE_URL}/instance/init`, {
            method: "POST",
            headers: { "admintoken": ADMIN_TOKEN, "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ name: instanceName }),
          });

          const body = await res.json();
          console.log(`[auto-provision] instance ${instanceName}: status=${res.status}`, JSON.stringify(body));

          if (!res.ok) {
            errors.push(`${instanceName}: ${body?.message || body?.error || res.statusText}`);
            continue;
          }

          const token = body?.token || body?.data?.token || body?.instance?.token;
          if (!token) {
            errors.push(`${instanceName}: Resposta sem token`);
            continue;
          }

          // Idempotency: check if token already exists
          const { data: dup } = await adminClient.from("user_api_tokens")
            .select("id").eq("token", token).maybeSingle();
          if (dup) {
            console.log(`[auto-provision] Token duplicado: ${instanceName}`);
            continue;
          }

          await adminClient.from("user_api_tokens").insert({
            user_id: target_user_id, token, admin_id: user.id,
            status: "available", healthy: true, label: instanceName,
            last_checked_at: new Date().toISOString(),
          });

          created.push(instanceName);
        } catch (e) {
          errors.push(`${instanceName}: ${e.message}`);
        }
      }

      await logAction(adminClient, user.id, target_user_id, "auto-provision-tokens",
        `Provisionamento: ${created.length} criados, ${unblockedCount} desbloqueados, ${errors.length} erros (de ${toCreate} solicitados)`);

      return new Response(JSON.stringify({
        success: true,
        created: created.length,
        unblocked: unblockedCount,
        errors: errors.length,
        error_details: errors,
        existing: existingCount,
        total: totalActive + created.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PROVIDER_DELETE_TIMEOUT_MS = 2000;
    const PROVIDER_DELETE_BATCH_SIZE = 12;
    const PROVIDER_DISCONNECT_TIMEOUT_MS = 1500;

    // ─── Helper: delete instance from UAZAPI by token/name/id ───
    const deleteInstanceFromProvider = async (
      tokenValue?: string | null,
      label?: string | null,
      providerInstanceId?: string | null,
    ) => {
      const BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
      const ADMIN_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";
      if (!BASE_URL) return { deleted: false, reason: "no_config" };

      const trimmedToken = String(tokenValue || "").trim();
      const trimmedLabel = String(label || "").trim();
      const trimmedProviderId = String(providerInstanceId || "").trim();
      const attempted = [...new Set([trimmedToken, trimmedProviderId, trimmedLabel].filter(Boolean))];

      const tokenHeaderVariants = trimmedToken
        ? [
            { token: trimmedToken },
            { Authorization: `Bearer ${trimmedToken}` },
          ]
        : [];

      const adminHeaderVariants = ADMIN_TOKEN
        ? [
            { admintoken: ADMIN_TOKEN },
            { token: ADMIN_TOKEN },
            { Authorization: `Bearer ${ADMIN_TOKEN}` },
          ]
        : [];

      const adminPayloads = [
        ...(trimmedToken
          ? [
              { token: trimmedToken },
              { instanceToken: trimmedToken },
            ]
          : []),
        ...(trimmedLabel
          ? [
              { name: trimmedLabel },
              { instanceName: trimmedLabel },
            ]
          : []),
        ...(trimmedProviderId
          ? [
              { id: trimmedProviderId },
              { instanceId: trimmedProviderId },
            ]
          : []),
      ];

      const callProvider = async (
        endpoint: string,
        method: "DELETE" | "POST",
        headers: Record<string, string>,
        body?: Record<string, unknown>,
        timeoutMs = PROVIDER_DELETE_TIMEOUT_MS,
      ) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const requestHeaders: Record<string, string> = {
            ...headers,
            Accept: "application/json",
          };

          const init: RequestInit = {
            method,
            headers: requestHeaders,
            signal: controller.signal,
          };

          if (body !== undefined) {
            requestHeaders["Content-Type"] = "application/json";
            init.body = JSON.stringify(body);
          }

          const res = await fetch(`${BASE_URL}${endpoint}`, init);
          const text = await res.text().catch(() => "");
          return { ok: res.ok, status: res.status, text, endpoint, method, body };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            text: error instanceof Error ? error.message : String(error),
            endpoint,
            method,
            body,
          };
        } finally {
          clearTimeout(timeout);
        }
      };

      const runAttemptWave = async (
        attempts: Array<{
          endpoint: string;
          method: "DELETE" | "POST";
          headers: Record<string, string>;
          body?: Record<string, unknown>;
          mode: "instance-token" | "admin-route";
        }>,
      ) => {
        if (attempts.length === 0) return null;

        const deduped = Array.from(
          new Map(
            attempts.map((attempt) => [
              JSON.stringify([attempt.endpoint, attempt.method, attempt.headers, attempt.body || null]),
              attempt,
            ])
          ).values()
        );

        const results = await Promise.allSettled(
          deduped.map(async (attempt) => ({
            ...attempt,
            result: await callProvider(attempt.endpoint, attempt.method, attempt.headers, attempt.body),
          }))
        );

        for (const entry of results) {
          if (entry.status === "fulfilled" && entry.value.result.ok) {
            console.log(`[admin-data] UAZAPI delete success endpoint=${entry.value.endpoint} method=${entry.value.method} mode=${entry.value.mode}`);
            return {
              deleted: true,
              endpoint: entry.value.endpoint,
              method: entry.value.method,
              mode: entry.value.mode,
            };
          }
        }

        const debugResults = results.flatMap((entry) => {
          if (entry.status !== "fulfilled") return [];
          const { result, endpoint, method, mode } = entry.value;
          return [{ endpoint, method, mode, status: result.status, body: result.text.slice(0, 160) }];
        });

        for (const row of debugResults) {
          if (![0, 401, 403, 404, 405].includes(row.status)) {
            console.warn(`[admin-data] Delete attempt failed ${row.endpoint} ${row.method}: status=${row.status} body=${row.body}`);
          }
        }

        return { deleted: false, debugResults };
      };

      await Promise.allSettled(
        tokenHeaderVariants.map((headers) =>
          callProvider("/instance/disconnect", "POST", headers, undefined, PROVIDER_DISCONNECT_TIMEOUT_MS)
        )
      );

      const tokenWave = await runAttemptWave(
        tokenHeaderVariants.flatMap((headers) => [
          {
            endpoint: "/instance/delete",
            method: "DELETE" as const,
            headers,
            mode: "instance-token" as const,
          },
          {
            endpoint: "/instance/delete",
            method: "POST" as const,
            headers,
            mode: "instance-token" as const,
          },
          {
            endpoint: "/instance/remove",
            method: "DELETE" as const,
            headers,
            mode: "instance-token" as const,
          },
          {
            endpoint: "/instance/remove",
            method: "POST" as const,
            headers,
            mode: "instance-token" as const,
          },
          {
            endpoint: "/instance",
            method: "DELETE" as const,
            headers,
            mode: "instance-token" as const,
          },
        ])
      );
      if (tokenWave?.deleted) return tokenWave;

      const adminWave = await runAttemptWave(
        adminHeaderVariants.flatMap((headers) =>
          adminPayloads.flatMap((body) => [
            {
              endpoint: "/instance/delete",
              method: "POST" as const,
              headers,
              body,
              mode: "admin-route" as const,
            },
            {
              endpoint: "/instance/delete",
              method: "DELETE" as const,
              headers,
              body,
              mode: "admin-route" as const,
            },
            {
              endpoint: "/instance/remove",
              method: "POST" as const,
              headers,
              body,
              mode: "admin-route" as const,
            },
            {
              endpoint: "/instance/remove",
              method: "DELETE" as const,
              headers,
              body,
              mode: "admin-route" as const,
            },
          ])
        )
      );
      if (adminWave?.deleted) return adminWave;

      console.warn(`[admin-data] Failed to delete instance from provider`, {
        providerInstanceId: trimmedProviderId || null,
        label: trimmedLabel || null,
        hasToken: !!trimmedToken,
        attempted,
        tokenWave: tokenWave?.debugResults?.slice(0, 6) || [],
        adminWave: adminWave?.debugResults?.slice(0, 8) || [],
      });
      return {
        deleted: false,
        reason: "api_failed",
        attempted,
        providerInstanceId: trimmedProviderId || null,
        label: trimmedLabel || null,
        hasToken: !!trimmedToken,
      };
    };

    // ─── DELETE TOKEN ───
    if (action === "delete-token" && req.method === "POST") {
      const { token_id, target_user_id } = await req.json();

      // Fetch token details before deleting
      const { data: tokenRow } = await adminClient
        .from("user_api_tokens")
        .select("token, label")
        .eq("id", token_id)
        .maybeSingle();

      // Delete from UAZAPI (non-blocking)
      let providerResult = { deleted: false, reason: "no_token" } as any;
      if (tokenRow?.token) {
        providerResult = await deleteInstanceFromProvider(tokenRow.token, tokenRow.label);
      }

      await adminClient.from("user_api_tokens").delete().eq("id", token_id);
      await logAction(adminClient, user.id, target_user_id, "delete-token", `Token removido: ${token_id} | UAZAPI: ${providerResult.deleted ? "deletado" : providerResult.reason}`);
      return new Response(JSON.stringify({ success: true, provider_deleted: providerResult.deleted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DELETE ALL TOKENS ───
    if (action === "delete-all-tokens" && req.method === "POST") {
      const { target_user_id } = await req.json();
      console.log("[delete-all-tokens] target:", target_user_id);

      // Fetch all tokens before deleting
      const { data: allTokens } = await adminClient
        .from("user_api_tokens")
        .select("id, token, label")
        .eq("user_id", target_user_id);

      // Delete all from UAZAPI in parallel with bounded waves
      let providerDeleted = 0;
      if (allTokens && allTokens.length > 0) {
        for (let i = 0; i < allTokens.length; i += PROVIDER_DELETE_BATCH_SIZE) {
          const batch = allTokens.slice(i, i + PROVIDER_DELETE_BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map(t => deleteInstanceFromProvider(t.token, t.label))
          );
          providerDeleted += results.filter(r => r.status === "fulfilled" && (r.value as any).deleted).length;
        }
      }

      const { error, count } = await adminClient
        .from("user_api_tokens")
        .delete({ count: "exact" })
        .eq("user_id", target_user_id);
      
      console.log("[delete-all-tokens] deleted count:", count, "UAZAPI deleted:", providerDeleted, "error:", error);
      if (error) throw error;
      await logAction(adminClient, user.id, target_user_id, "delete-all-tokens", `${count} token(s) removido(s) | UAZAPI: ${providerDeleted} deletados`);
      return new Response(JSON.stringify({ success: true, removed: count, provider_deleted: providerDeleted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST ALL TOKENS (global) ───
    if (action === "list-all-tokens") {
      const { data: allTokens, error: tokErr } = await adminClient
        .from("user_api_tokens")
        .select("id, user_id, token, label, status, healthy, device_id, created_at, last_checked_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (tokErr) throw tokErr;

      const visibleTokens = (allTokens || []).filter((t: any) => t.status !== "deleted");

      // Get profile names for all unique user_ids
      const userIds = [...new Set(visibleTokens.map((t: any) => t.user_id))];
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      
      const profileMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name || "Sem nome"; });

      // Get device names for tokens in use
      const deviceIds = visibleTokens.map((t: any) => t.device_id).filter(Boolean);
      const { data: devices } = deviceIds.length > 0
        ? await adminClient.from("devices").select("id, name").in("id", deviceIds)
        : { data: [] };
      const deviceMap: Record<string, string> = {};
      (devices || []).forEach((d: any) => { deviceMap[d.id] = d.name; });

      const enriched = visibleTokens.map((t: any) => ({
        ...t,
        client_name: profileMap[t.user_id] || "Desconhecido",
        device_name: t.device_id ? (deviceMap[t.device_id] || "—") : null,
      }));

      return new Response(JSON.stringify({ tokens: enriched, total: enriched.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── FETCH UAZAPI INSTANCES (real-time from provider) ───
    if (action === "fetch-uazapi-instances") {
      const BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
      const ADMIN_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";
      if (!BASE_URL || !ADMIN_TOKEN) {
        throw new Error("Configuração do provedor incompleta.");
      }

      // Prioritize official admin listing routes first; always keep DB fallback below
      let instances: any[] = [];
      const endpoints = [
        "/admin/instances",
        "/admin/instance/list",
        "/admin/instance/all",
        "/instance/all",
        "/instance/list",
        "/instance/fetchInstances",
        "/instances",
      ];
      const authVariants = [
        { admintoken: ADMIN_TOKEN },
        { token: ADMIN_TOKEN },
        { Authorization: `Bearer ${ADMIN_TOKEN}` },
      ];
      const candidateKeys = ["instances", "data", "result", "content", "rows", "list", "items"];

      const looksLikeInstance = (item: any) => {
        if (!item || typeof item !== "object") return false;
        return Boolean(
          item.id || item.name || item.instanceName || item.instance_name || item.instance ||
          item.token || item.apiToken || item.api_token || item.auth?.jwt || item.auth?.token ||
          item.status || item.connectionStatus || item.state || item.owner || item.phone || item.ownerJid
        );
      };

      const extractInstanceList = (payload: any, depth = 0): any[] => {
        if (depth > 6 || payload == null) return [];

        if (Array.isArray(payload)) {
          if (payload.some(looksLikeInstance)) return payload;
          for (const item of payload) {
            const nested = extractInstanceList(item, depth + 1);
            if (nested.length > 0) return nested;
          }
          return [];
        }

        if (typeof payload !== "object") return [];
        if (looksLikeInstance(payload)) return [payload];

        for (const key of candidateKeys) {
          if (key in payload) {
            const nested = extractInstanceList(payload[key], depth + 1);
            if (nested.length > 0) return nested;
          }
        }

        for (const value of Object.values(payload)) {
          const nested = extractInstanceList(value, depth + 1);
          if (nested.length > 0) return nested;
        }

        return [];
      };

      for (const endpoint of endpoints) {
        let found = false;

        for (const authHeaders of authVariants) {
          try {
            const res = await fetch(`${BASE_URL}${endpoint}?t=${Date.now()}`, {
              method: "GET",
              headers: {
                ...authHeaders,
                Accept: "application/json",
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
              },
            });

            const text = await res.text();
            let json: any = null;
            try {
              json = text ? JSON.parse(text) : null;
            } catch {
              json = { raw: text.slice(0, 500) };
            }

            const extracted = extractInstanceList(json);
            console.log(`[admin-data] fetch-uazapi-instances endpoint=${endpoint} status=${res.status} extracted=${extracted.length}`);

            if (res.status === 401 || res.status === 403) continue;
            if (res.ok && extracted.length > 0) {
              instances = extracted;
              found = true;
              break;
            }
          } catch (err) {
            console.warn(`[admin-data] fetch-uazapi-instances endpoint=${endpoint} failed:`, err instanceof Error ? err.message : String(err));
          }
        }

        if (found) break;
      }

      // Enrich with DB info: merge provider instances + DB tokens fallback
      const { data: dbTokens } = await adminClient
        .from("user_api_tokens")
        .select("id, user_id, token, label, status, device_id")
        .limit(2000);

      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, full_name")
        .limit(2000);

      const { data: devices } = await adminClient
        .from("devices")
        .select("id, name, number, status, profile_name")
        .limit(2000);

      const connectedStatuses = ["open", "connected", "Connected", "Ready", "authenticated"];
      const profileMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        profileMap[p.id] = p.full_name || "Sem nome";
      });

      const deviceMap: Record<string, any> = {};
      (devices || []).forEach((d: any) => {
        deviceMap[d.id] = d;
      });

      const deletedTokens = (dbTokens || []).filter((t: any) => t.status === "deleted");
      const visibleDbTokens = (dbTokens || []).filter((t: any) => t.status !== "deleted");
      const deletedTokenSet = new Set(deletedTokens.map((t: any) => t.token).filter(Boolean));
      const deletedLabelSet = new Set(deletedTokens.map((t: any) => t.label).filter(Boolean));

      const tokenMap: Record<string, any> = {};
      const labelMap: Record<string, any> = {};
      visibleDbTokens.forEach((t: any) => {
        tokenMap[t.token] = t;
        if (t.label) labelMap[t.label] = t;
      });

      const matchedDbTokenIds = new Set<string>();
      const seenProviderKeys = new Set<string>();

      const providerInstances = instances.reduce((acc: any[], inst: any) => {
        const name = String(inst.name || inst.instance_name || inst.instanceName || inst.instance || "").trim();
        const token = String(inst.token || inst.apiToken || inst.api_token || inst.auth?.jwt || inst.auth?.token || "").trim();

        if ((token && deletedTokenSet.has(token)) || (name && deletedLabelSet.has(name))) {
          return acc;
        }

        const providerInstanceId = String(inst.id || inst.instanceId || inst.instance_id || "").trim() || null;
        const rawStatus = inst.status || inst.connectionStatus || inst.state || inst.connection?.status || "unknown";
        const dbMatch = tokenMap[token] || labelMap[name] || null;
        const device = dbMatch?.device_id ? deviceMap[dbMatch.device_id] : null;

        if (dbMatch?.id) matchedDbTokenIds.add(dbMatch.id);

        const status = rawStatus || dbMatch?.status || device?.status || "unknown";
        const phone = String(inst.phone || inst.number || inst.owner || inst.ownerJid || device?.number || "").trim();
        const profileName = String(inst.profileName || inst.pushname || inst.profile_picture || inst.profilePictureUrl || device?.profile_name || "").trim();

        const dedupeKey = [providerInstanceId || "-", token || "-", name || "-", phone || "-"].join("::");
        if (seenProviderKeys.has(dedupeKey)) {
          return acc;
        }
        seenProviderKeys.add(dedupeKey);

        acc.push({
          provider_instance_id: providerInstanceId,
          name,
          token: token ? `${token.substring(0, 12)}...` : "—",
          token_full: token,
          status,
          phone,
          profile_name: profileName,
          connected: connectedStatuses.includes(status),
          db_token_id: dbMatch?.id || null,
          db_user_id: dbMatch?.user_id || null,
          db_status: dbMatch?.status || null,
          client_name: dbMatch ? (profileMap[dbMatch.user_id] || "Desconhecido") : "Sem vínculo",
        });

        return acc;
      }, []);

      const dbOnlyTokens = visibleDbTokens
        .filter((t: any) => !matchedDbTokenIds.has(t.id))
        .map((t: any) => {
          const device = t.device_id ? deviceMap[t.device_id] : null;
          const resolvedStatus = device?.status || t.status || "unknown";
          const fallbackName = t.label || device?.name || `token-${String(t.token || "").substring(0, 8)}`;

          return {
            provider_instance_id: null,
            name: fallbackName,
            token: t.token ? `${t.token.substring(0, 12)}...` : "—",
            token_full: t.token || "",
            status: resolvedStatus,
            phone: device?.number || "",
            profile_name: device?.profile_name || "",
            connected: connectedStatuses.includes(resolvedStatus),
            db_token_id: t.id,
            db_user_id: t.user_id,
            db_status: t.status || null,
            client_name: profileMap[t.user_id] || "Desconhecido",
          };
        });

      const enriched = [...providerInstances, ...dbOnlyTokens];

      enriched.sort((a: any, b: any) => {
        if (a.connected !== b.connected) return a.connected ? 1 : -1;
        if (!!a.db_token_id !== !!b.db_token_id) return a.db_token_id ? -1 : 1;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });

      console.log(`[admin-data] fetch-uazapi-instances RESULT: raw=${instances.length} provider=${providerInstances.length} dbOnly=${dbOnlyTokens.length} hidden_deleted=${deletedTokens.length} total=${enriched.length}`);

      return new Response(JSON.stringify({
        instances: enriched,
        total: enriched.length,
        connected: enriched.filter((i: any) => i.connected).length,
        disconnected: enriched.filter((i: any) => !i.connected).length,
        _debug: {
          provider_count: providerInstances.length,
          db_fallback_count: dbOnlyTokens.length,
          db_tokens_total: (dbTokens || []).length,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── BULK DELETE UAZAPI INSTANCES ───
    if (action === "bulk-delete-uazapi-instances" && req.method === "POST") {
      const body = await req.json();
      const rawInstances = Array.isArray(body?.instances) ? body.instances : [];
      const fallbackNames = Array.isArray(body?.instance_names) ? body.instance_names : [];

      const normalizedMap = new Map<string, any>();
      const upsertInstance = (item: any) => {
        const normalized = {
          provider_instance_id: String(item?.provider_instance_id || "").trim(),
          name: String(item?.name || "").trim(),
          token_full: String(item?.token_full || "").trim(),
          db_token_id: String(item?.db_token_id || "").trim(),
        };

        if (!normalized.provider_instance_id && !normalized.name && !normalized.token_full && !normalized.db_token_id) return;

        const key = normalized.db_token_id || normalized.name || normalized.token_full || normalized.provider_instance_id;
        const previous = normalizedMap.get(key) || {};
        normalizedMap.set(key, {
          provider_instance_id: normalized.provider_instance_id || previous.provider_instance_id || "",
          name: normalized.name || previous.name || "",
          token_full: normalized.token_full || previous.token_full || "",
          db_token_id: normalized.db_token_id || previous.db_token_id || "",
        });
      };

      rawInstances.forEach(upsertInstance);
      fallbackNames.forEach((name: string) => upsertInstance({ name }));

      const uniqueInstances = Array.from(normalizedMap.values());
      if (uniqueInstances.length === 0) {
        return new Response(JSON.stringify({ success: true, deleted: 0, db_cleaned: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const candidateIds = [...new Set(uniqueInstances.map((item: any) => item.db_token_id).filter(Boolean))];
      const candidateNames = [...new Set(uniqueInstances.map((item: any) => item.name).filter(Boolean))];
      const candidateTokens = [...new Set(uniqueInstances.map((item: any) => item.token_full).filter(Boolean))];

      const lookupFilters = await Promise.all([
        candidateIds.length > 0
          ? adminClient.from("user_api_tokens").select("id, token, label").in("id", candidateIds)
          : Promise.resolve({ data: [] as any[] }),
        candidateNames.length > 0
          ? adminClient.from("user_api_tokens").select("id, token, label").in("label", candidateNames)
          : Promise.resolve({ data: [] as any[] }),
        candidateTokens.length > 0
          ? adminClient.from("user_api_tokens").select("id, token, label").in("token", candidateTokens)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const tokenById = new Map<string, any>();
      const tokenByLabel = new Map<string, any>();
      const tokenByToken = new Map<string, any>();
      for (const lookup of lookupFilters) {
        for (const row of lookup.data || []) {
          if (row?.id) tokenById.set(row.id, row);
          if (row?.label) tokenByLabel.set(row.label, row);
          if (row?.token) tokenByToken.set(row.token, row);
        }
      }

      const enrichedInstances = uniqueInstances.map((item: any) => {
        const dbRow = tokenById.get(item.db_token_id) || tokenByLabel.get(item.name) || tokenByToken.get(item.token_full) || null;
        return {
          ...item,
          db_token_id: item.db_token_id || dbRow?.id || "",
          token_full: item.token_full || dbRow?.token || "",
          name: item.name || dbRow?.label || "",
        };
      });

      let deleted = 0;
      for (let i = 0; i < enrichedInstances.length; i += PROVIDER_DELETE_BATCH_SIZE) {
        const batch = enrichedInstances.slice(i, i + PROVIDER_DELETE_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((item: any) => deleteInstanceFromProvider(item.token_full || "", item.name || null, item.provider_instance_id || null))
        );
        deleted += results.filter((r) => r.status === "fulfilled" && (r.value as any).deleted).length;
      }

      const idsToDelete = [...new Set(enrichedInstances.map((item: any) => item.db_token_id).filter(Boolean))];
      if (idsToDelete.length > 0) {
        for (let i = 0; i < idsToDelete.length; i += 200) {
          await adminClient
            .from("user_api_tokens")
            .update({ status: "deleted", device_id: null, assigned_at: null })
            .in("id", idsToDelete.slice(i, i + 200));
        }
      }

      await logAction(adminClient, user.id, null, "bulk-delete-uazapi-instances", `${deleted} instância(s) deletada(s) da UAZAPI | ${idsToDelete.length} tokens removidos do DB`);
      return new Response(JSON.stringify({ success: true, deleted, db_cleaned: idsToDelete.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    if (action === "bulk-delete-idle-tokens" && req.method === "POST") {
      // Get all idle tokens (available or blocked, no device)
      const { data: idleTokens, error: idleErr } = await adminClient
        .from("user_api_tokens")
        .select("id, token, label, user_id")
        .in("status", ["available", "blocked"])
        .is("device_id", null)
        .limit(2000);
      if (idleErr) throw idleErr;

      if (!idleTokens || idleTokens.length === 0) {
        return new Response(JSON.stringify({ success: true, removed: 0, provider_deleted: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete from UAZAPI in bounded waves to keep the function responsive
      let providerDeleted = 0;
      for (let i = 0; i < idleTokens.length; i += PROVIDER_DELETE_BATCH_SIZE) {
        const batch = idleTokens.slice(i, i + PROVIDER_DELETE_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(t => deleteInstanceFromProvider(t.token, t.label))
        );
        providerDeleted += results.filter(r => r.status === "fulfilled" && (r.value as any).deleted).length;
      }

      // Delete from DB
      const idleIds = idleTokens.map(t => t.id);
      // Delete in chunks of 200
      let totalRemoved = 0;
      for (let i = 0; i < idleIds.length; i += 200) {
        const chunk = idleIds.slice(i, i + 200);
        const { count } = await adminClient
          .from("user_api_tokens")
          .delete({ count: "exact" })
          .in("id", chunk);
        totalRemoved += count || 0;
      }

      await logAction(adminClient, user.id, null, "bulk-delete-idle-tokens", `${totalRemoved} token(s) ociosos removidos | UAZAPI: ${providerDeleted} deletados`);
      return new Response(JSON.stringify({ success: true, removed: totalRemoved, provider_deleted: providerDeleted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE MONITOR TOKEN ───
    if (action === "update-monitor-token" && req.method === "POST") {
      const { target_user_id, whatsapp_monitor_token } = await req.json();
      console.log("[admin-data] update-monitor-token for:", target_user_id, "token:", whatsapp_monitor_token ? "***" : "(empty)");
      const { error: updErr } = await adminClient.from("profiles").update({
        whatsapp_monitor_token: whatsapp_monitor_token || null,
        updated_at: new Date().toISOString(),
      }).eq("id", target_user_id);
      if (updErr) {
        console.error("[admin-data] update-monitor-token error:", updErr);
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── Sync report_wa device ───
      if (whatsapp_monitor_token) {
        // Build base_url from token (UAZAPI pattern: base_url/instance/{token})
        const ADMIN_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");

        // Check if report_wa device already exists
        const { data: existingDevice } = await adminClient.from("devices")
          .select("id").eq("user_id", target_user_id).eq("login_type", "report_wa").maybeSingle();

        if (existingDevice) {
          // Update existing device with new token
          await adminClient.from("devices").update({
            uazapi_token: whatsapp_monitor_token,
            uazapi_base_url: ADMIN_BASE_URL || null,
            updated_at: new Date().toISOString(),
          }).eq("id", existingDevice.id);
          console.log("[admin-data] Updated report_wa device with new token:", existingDevice.id);
        } else {
          // Create new report_wa device
          const { data: profile } = await adminClient.from("profiles")
            .select("full_name").eq("id", target_user_id).maybeSingle();
          const deviceName = `Relatório WA - ${profile?.full_name || "Cliente"}`;

          const { data: newDevice, error: devErr } = await adminClient.from("devices").insert({
            user_id: target_user_id,
            name: deviceName,
            login_type: "report_wa",
            instance_type: "report_wa",
            status: "Disconnected",
            uazapi_token: whatsapp_monitor_token,
            uazapi_base_url: ADMIN_BASE_URL || null,
          }).select("id").single();

          if (devErr) {
            console.error("[admin-data] Error creating report_wa device:", devErr);
          } else {
            console.log("[admin-data] Created report_wa device:", newDevice.id);
            // Create report_wa_configs if not exists
            const { data: existingConfig } = await adminClient.from("report_wa_configs")
              .select("id").eq("user_id", target_user_id).maybeSingle();
            if (!existingConfig) {
              await adminClient.from("report_wa_configs").insert({
                user_id: target_user_id,
                device_id: newDevice.id,
              });
            } else {
              await adminClient.from("report_wa_configs").update({
                device_id: newDevice.id,
              }).eq("id", existingConfig.id);
            }
          }
        }
      }

      await logAction(adminClient, user.id, target_user_id, "update-monitor-token",
        whatsapp_monitor_token ? `Token de monitoramento configurado` : `Token de monitoramento removido`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // (toggle-notification handler moved to end of file with auto-provision logic)

    // ─── GROUPS POOL CRUD ───
    if (action === "groups-pool-add" && req.method === "POST") {
      const { name, external_group_ref } = await req.json();
      const { error } = await adminClient.from("warmup_groups_pool").insert({ name, external_group_ref: external_group_ref || "" });
      if (error) throw error;
      await logAction(adminClient, user.id, null, "groups_pool_updated", `Grupo adicionado: ${name}`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "groups-pool-toggle" && req.method === "POST") {
      const { group_id, is_active } = await req.json();
      const { error } = await adminClient.from("warmup_groups_pool").update({ is_active, updated_at: new Date().toISOString() }).eq("id", group_id);
      if (error) throw error;
      await logAction(adminClient, user.id, null, "groups_pool_updated", `Grupo ${is_active ? "ativado" : "desativado"}: ${group_id}`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "groups-pool-update" && req.method === "POST") {
      const { group_id, name, external_group_ref } = await req.json();
      const { error } = await adminClient.from("warmup_groups_pool").update({ name, external_group_ref, updated_at: new Date().toISOString() }).eq("id", group_id);
      if (error) throw error;
      await logAction(adminClient, user.id, null, "groups_pool_updated", `Grupo atualizado: ${name}`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "groups-pool-delete" && req.method === "POST") {
      const { group_id } = await req.json();
      const { error } = await adminClient.from("warmup_groups_pool").delete().eq("id", group_id);
      if (error) throw error;
      await logAction(adminClient, user.id, null, "groups_pool_updated", `Grupo removido: ${group_id}`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── COMMUNITY POOL: LIST ALL INSTANCES WITH ENROLLMENT ───
    if (action === "community-pool-list") {
      const { data: allDevices } = await adminClient.from("devices").select("id, user_id, name, number, status, instance_type, login_type, created_at").neq("login_type", "report_wa").order("created_at", { ascending: false });
      const { data: profiles } = await adminClient.from("profiles").select("id, full_name, phone");
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const { data: cycles } = await adminClient.from("warmup_cycles").select("id, device_id, user_id, phase, is_running, day_index").eq("is_running", true);
      const { data: memberships } = await adminClient.from("warmup_community_membership").select("id, device_id, user_id, is_enabled, is_eligible, cycle_id, enabled_at, disabled_at, notes");

      const enriched = (allDevices || []).map((d: any) => {
        const profile = profiles?.find((p: any) => p.id === d.user_id);
        const authUser = authUsers?.users?.find((u: any) => u.id === d.user_id);
        const cycle = cycles?.find((c: any) => c.device_id === d.id);
        const membership = memberships?.find((m: any) => m.device_id === d.id);
        return {
          ...d,
          owner_name: profile?.full_name || authUser?.email || "Desconhecido",
          owner_email: authUser?.email || null,
          cycle_active: !!cycle,
          cycle_phase: cycle?.phase || null,
          cycle_day_index: cycle?.day_index || null,
          cycle_days_total: cycle?.days_total || null,
          is_enrolled: membership?.is_enabled || false,
          is_eligible: membership?.is_eligible ?? true,
          membership_id: membership?.id || null,
        };
      });

      return new Response(JSON.stringify({ instances: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── COMMUNITY POOL: TOGGLE ENROLLED/ELIGIBLE ───
    if (action === "community-pool-toggle" && req.method === "POST") {
      const { device_id, field, value, user_id: targetUserId } = await req.json();

      // Get existing membership
      const { data: existing } = await adminClient.from("warmup_community_membership")
        .select("id, device_id, user_id, is_enabled, is_eligible, cycle_id, enabled_at, disabled_at").eq("device_id", device_id).maybeSingle();

      const now = new Date().toISOString();
      let before: any = {};
      let after: any = {};

      if (existing) {
        before = { is_enabled: existing.is_enabled, is_eligible: existing.is_eligible };
        const updateData: any = { updated_at: now };
        if (field === "is_enrolled") {
          updateData.is_enabled = value;
          if (value) updateData.enabled_at = now;
          else updateData.disabled_at = now;
        } else if (field === "is_eligible") {
          updateData.is_eligible = value;
        }
        await adminClient.from("warmup_community_membership").update(updateData).eq("id", existing.id);
        after = { ...before, ...updateData };
      } else {
        before = { is_enabled: false, is_eligible: true };
        const insertData: any = {
          device_id,
          user_id: targetUserId,
          is_enabled: field === "is_enrolled" ? value : false,
          is_eligible: field === "is_eligible" ? value : true,
          enabled_at: field === "is_enrolled" && value ? now : null,
        };
        await adminClient.from("warmup_community_membership").insert(insertData);
        after = insertData;
      }

      // Audit log
      await adminClient.from("warmup_audit_logs").insert({
        user_id: targetUserId,
        device_id,
        event_type: field === "is_enrolled" ? "pool_enrolled" : "eligibility_changed",
        level: "info",
        message: `${field} alterado: ${before[field === "is_enrolled" ? "is_enabled" : "is_eligible"]} → ${value}`,
        meta: { admin_user_id: user.id, before, after, timestamp: now },
      });

      await logAction(adminClient, user.id, targetUserId, `community-${field}`,
        `Device ${device_id}: ${field} = ${value}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── COMMUNITY PAIRS: LIST ───
    if (action === "community-pairs-list") {
      const { data: pairs } = await adminClient.from("community_pairs")
        .select("id, cycle_id, instance_id_a, instance_id_b, status, meta, created_at, closed_at").order("created_at", { ascending: false }).limit(200);
      const { data: allDevices } = await adminClient.from("devices").select("id, name, number, user_id");
      const { data: profiles } = await adminClient.from("profiles").select("id, full_name");

      const enriched = (pairs || []).map((p: any) => {
        const devA = allDevices?.find((d: any) => d.id === p.instance_id_a);
        const devB = allDevices?.find((d: any) => d.id === p.instance_id_b);
        const profA = profiles?.find((pr: any) => pr.id === devA?.user_id);
        const profB = profiles?.find((pr: any) => pr.id === devB?.user_id);
        return {
          ...p,
          instance_a_name: devA?.name || "?",
          instance_a_number: devA?.number || "?",
          instance_a_owner: profA?.full_name || "?",
          instance_b_name: devB?.name || "?",
          instance_b_number: devB?.number || "?",
          instance_b_owner: profB?.full_name || "?",
        };
      });

      return new Response(JSON.stringify({ pairs: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── COMMUNITY PAIRS: CLOSE/FAIL ───
    if (action === "community-pair-update" && req.method === "POST") {
      const { pair_id, new_status, reason } = await req.json();
      const now = new Date().toISOString();

      const { data: pair } = await adminClient.from("community_pairs")
        .select("id, cycle_id, instance_id_a, instance_id_b, status, meta").eq("id", pair_id).maybeSingle();
      if (!pair) throw new Error("Par não encontrado");

      await adminClient.from("community_pairs").update({
        status: new_status,
        closed_at: now,
        meta: { ...(pair.meta || {}), reason, closed_by: user.id },
      }).eq("id", pair_id);

      // Audit log for both instances
      const devA = pair.instance_id_a;
      const devB = pair.instance_id_b;
      const { data: devAData } = await adminClient.from("devices").select("user_id").eq("id", devA).maybeSingle();

      if (devAData) {
        await adminClient.from("warmup_audit_logs").insert({
          user_id: devAData.user_id,
          device_id: devA,
          event_type: "pair_closed",
          level: new_status === "failed" ? "warn" : "info",
          message: `Par ${pair_id} ${new_status}: ${reason || "sem motivo"}`,
          meta: { admin_user_id: user.id, pair_id, new_status, reason },
        });
      }

      await logAction(adminClient, user.id, null, "community-pair-update",
        `Par ${pair_id} → ${new_status}: ${reason || "—"}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── COMMUNITY PAIRS: GENERATE (placeholder) ───
    if (action === "community-generate-pairs" && req.method === "POST") {
      // Same-owner restriction removed — all eligible instances can pair freely
      // Get enrolled instances (exclude report_wa devices)
      const { data: memberships } = await adminClient.from("warmup_community_membership")
        .select("device_id, user_id").eq("is_enabled", true).eq("is_eligible", true);

      // Filter out report_wa devices
      let filteredMemberships = memberships || [];
      if (filteredMemberships.length > 0) {
        const deviceIds = filteredMemberships.map((m: any) => m.device_id);
        const { data: devices } = await adminClient.from("devices")
          .select("id, login_type").in("id", deviceIds);
        const reportDeviceIds = new Set((devices || []).filter((d: any) => d.login_type === "report_wa").map((d: any) => d.id));
        filteredMemberships = filteredMemberships.filter((m: any) => !reportDeviceIds.has(m.device_id));
      }

      if (filteredMemberships.length < 2) {
        return new Response(JSON.stringify({ success: false, message: "Menos de 2 instâncias elegíveis no pool" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get settings
      const { data: settings } = await adminClient.from("community_settings").select("id, key, value");
      const maxPairs = parseInt(settings?.find((s: any) => s.key === "max_active_pairs_per_instance")?.value || "1");
      const rotationN = parseInt(settings?.find((s: any) => s.key === "rotation_policy_last_n")?.value || "3");

      // Get active pairs count per instance
      const { data: activePairs } = await adminClient.from("community_pairs")
        .select("id, instance_id_a, instance_id_b").eq("status", "active");

      const pairCountMap: Record<string, number> = {};
      for (const p of (activePairs || [])) {
        pairCountMap[p.instance_id_a] = (pairCountMap[p.instance_id_a] || 0) + 1;
        pairCountMap[p.instance_id_b] = (pairCountMap[p.instance_id_b] || 0) + 1;
      }

      // Get recent pairs to avoid repetition
      const { data: recentPairs } = await adminClient.from("community_pairs")
        .select("instance_id_a, instance_id_b")
        .order("created_at", { ascending: false })
        .limit(rotationN * filteredMemberships.length);

      const recentPairSet = new Set(
        (recentPairs || []).map((p: any) =>
          [p.instance_id_a, p.instance_id_b].sort().join("|")
        )
      );

      // Filter eligible (under max pairs limit)
      const available = filteredMemberships.filter((m: any) => (pairCountMap[m.device_id] || 0) < maxPairs);

      // Shuffle
      const shuffled = [...available].sort(() => Math.random() - 0.5);
      const paired = new Set<string>();
      const newPairs: any[] = [];

      for (let i = 0; i < shuffled.length; i++) {
        if (paired.has(shuffled[i].device_id)) continue;
        for (let j = i + 1; j < shuffled.length; j++) {
          if (paired.has(shuffled[j].device_id)) continue;
          // Same-owner pairing is now allowed for all instances
          // Check rotation
          const pairKey = [shuffled[i].device_id, shuffled[j].device_id].sort().join("|");
          if (recentPairSet.has(pairKey)) continue;

          // Get cycle_id for the pair
          const { data: cycleA } = await adminClient.from("warmup_cycles")
            .select("id").eq("device_id", shuffled[i].device_id).eq("is_running", true).maybeSingle();

          newPairs.push({
            cycle_id: cycleA?.id || shuffled[i].device_id, // fallback
            instance_id_a: shuffled[i].device_id,
            instance_id_b: shuffled[j].device_id,
            status: "active",
            meta: { generated_by: user.id, generated_at: new Date().toISOString() },
          });
          paired.add(shuffled[i].device_id);
          paired.add(shuffled[j].device_id);
          break;
        }
      }

      if (newPairs.length > 0) {
        // community_pairs requires cycle_id which is uuid FK to warmup_cycles
        // Only insert pairs where we have a valid cycle
        const validPairs = [];
        for (const p of newPairs) {
          const { data: cycleCheck } = await adminClient.from("warmup_cycles")
            .select("id").eq("device_id", p.instance_id_a).eq("is_running", true).maybeSingle();
          if (cycleCheck) {
            validPairs.push({ ...p, cycle_id: cycleCheck.id });
          }
        }

        if (validPairs.length > 0) {
          await adminClient.from("community_pairs").insert(validPairs);
        }

        // Audit
        for (const p of validPairs) {
          const { data: devData } = await adminClient.from("devices").select("user_id").eq("id", p.instance_id_a).maybeSingle();
          if (devData) {
            await adminClient.from("warmup_audit_logs").insert({
              user_id: devData.user_id,
              device_id: p.instance_id_a,
              event_type: "pair_created",
              level: "info",
              message: `Par criado: ${p.instance_id_a} ↔ ${p.instance_id_b}`,
              meta: { admin_user_id: user.id, pair_id: null },
            });
          }
        }

        await logAction(adminClient, user.id, null, "community-generate-pairs",
          `${validPairs.length} par(es) gerado(s)`);

        return new Response(JSON.stringify({ success: true, pairs_created: validPairs.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, pairs_created: 0, message: "Nenhum par disponível" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── COMMUNITY SETTINGS: GET/UPDATE ───
    if (action === "community-settings-get") {
      const { data: settings } = await adminClient.from("community_settings").select("id, key, value");
      return new Response(JSON.stringify({ settings: settings || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "community-settings-update" && req.method === "POST") {
      const { key, value } = await req.json();
      const now = new Date().toISOString();
      await adminClient.from("community_settings")
        .update({ value, updated_at: now, updated_by: user.id })
        .eq("key", key);
      await logAction(adminClient, user.id, null, "community-settings", `${key} = ${value}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── COMMUNITY AUDIT LOGS ───
    if (action === "community-audit-logs") {
      const url2 = new URL(req.url);
      const eventType = url2.searchParams.get("event_type") || "";
      const deviceId = url2.searchParams.get("device_id") || "";

      let query = adminClient.from("warmup_audit_logs")
        .select("id, user_id, device_id, cycle_id, event_type, level, message, meta, created_at")
        .in("event_type", ["pool_enrolled", "pool_removed", "pair_created", "pair_closed", "eligibility_changed"])
        .order("created_at", { ascending: false })
        .limit(200);

      if (eventType) query = query.eq("event_type", eventType);
      if (deviceId) query = query.eq("device_id", deviceId);

      const { data: logs } = await query;

      return new Response(JSON.stringify({ logs: logs || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── WA REPORT: GET CONFIG ───
    if (action === "wa-report-config-get") {
      const { data: config } = await adminClient.from("community_settings")
        .select("key, value")
        .in("key", ["wa_report_device_id", "wa_report_group_id", "wa_report_group_name"]);

      const configMap: Record<string, string> = {};
      for (const c of (config || [])) configMap[c.key] = c.value;

      return new Response(JSON.stringify({
        config: {
          device_id: configMap["wa_report_device_id"] || null,
          group_id: configMap["wa_report_group_id"] || null,
          group_name: configMap["wa_report_group_name"] || null,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── WA REPORT: SAVE CONFIG ───
    if (action === "wa-report-config-save" && req.method === "POST") {
      const { device_id, group_id, group_name } = await req.json();
      const now = new Date().toISOString();

      for (const [key, value] of [
        ["wa_report_device_id", device_id],
        ["wa_report_group_id", group_id],
        ["wa_report_group_name", group_name || ""],
      ]) {
        const { data: existing } = await adminClient.from("community_settings")
          .select("id").eq("key", key).maybeSingle();
        if (existing) {
          await adminClient.from("community_settings")
            .update({ value, updated_at: now, updated_by: user.id })
            .eq("key", key);
        } else {
          await adminClient.from("community_settings")
            .insert({ key, value, updated_by: user.id });
        }
      }

      await logAction(adminClient, user.id, null, "wa-report-config", `Config: device=${device_id}, group=${group_id}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── WA REPORT: CREATE DEVICE FROM TOKEN ───
    if (action === "wa-report-create-device" && req.method === "POST") {
      const { name, base_url, token } = await req.json();
      if (!token || !base_url) {
        return new Response(JSON.stringify({ error: "token e base_url obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create device
      const { data: device, error: devErr } = await adminClient.from("devices").insert({
        user_id: user.id,
        name: name || "Relatório WA",
        status: "disconnected",
        instance_type: "uazapi",
        login_type: "qr",
        uazapi_base_url: base_url,
        uazapi_token: token,
      }).select("id").single();

      if (devErr) {
        return new Response(JSON.stringify({ error: devErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Also create a token record
      await adminClient.from("user_api_tokens").insert({
        user_id: user.id,
        admin_id: user.id,
        token: token,
        device_id: device.id,
        label: name || "Relatório WA",
        status: "in_use",
      });

      return new Response(JSON.stringify({ ok: true, device_id: device.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── WA REPORT: UPDATE TOKEN MANUALLY ───
    if (action === "wa-report-update-token" && req.method === "POST") {
      const { device_id, base_url, token } = await req.json();
      if (!device_id || !token || !base_url) {
        return new Response(JSON.stringify({ error: "device_id, token e base_url obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update device credentials
      const { error: devErr } = await adminClient.from("devices").update({
        uazapi_base_url: base_url,
        uazapi_token: token,
        updated_at: new Date().toISOString(),
      }).eq("id", device_id);

      if (devErr) {
        return new Response(JSON.stringify({ error: devErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update or create token record
      const { data: existingToken } = await adminClient.from("user_api_tokens")
        .select("id")
        .eq("device_id", device_id)
        .maybeSingle();

      if (existingToken) {
        await adminClient.from("user_api_tokens").update({
          token: token,
          status: "in_use",
        }).eq("id", existingToken.id);
      } else {
        // Get device owner
        const { data: dev } = await adminClient.from("devices").select("user_id").eq("id", device_id).single();
        if (dev) {
          await adminClient.from("user_api_tokens").insert({
            user_id: dev.user_id,
            admin_id: user.id,
            token: token,
            device_id: device_id,
            label: "Relatório WA (manual)",
            status: "in_use",
          });
        }
      }

      await logAction(adminClient, user.id, null, "wa-report-update-token", `Token manual atualizado para device ${device_id}`);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── WA REPORT: LIST ADMIN DEVICES ───
    if (action === "wa-report-devices") {
      const { data: devices } = await adminClient.from("devices")
        .select("id, name, number, status, login_type")
        .eq("user_id", user.id)
        .eq("login_type", "report_wa")
        .order("created_at", { ascending: false });

      return new Response(JSON.stringify({ devices: devices || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── WA REPORT: LIST GROUPS FOR A DEVICE ───
    if (action === "wa-report-groups" && req.method === "POST") {
      const { device_id } = await req.json();
      if (!device_id) {
        return new Response(JSON.stringify({ error: "device_id obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: device } = await adminClient.from("devices")
        .select("id, uazapi_token, uazapi_base_url, status")
        .eq("id", device_id)
        .maybeSingle();

      if (!device) {
        return new Response(JSON.stringify({ error: "Dispositivo não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let token = device.uazapi_token;
      let baseUrl = device.uazapi_base_url;

      if (!token) {
        const { data: poolToken } = await adminClient.from("user_api_tokens")
          .select("token")
          .eq("device_id", device_id)
          .eq("status", "in_use")
          .maybeSingle();
        token = poolToken?.token || null;
      }
      if (!baseUrl) {
        // No fallback to global env — only device-specific credentials
        baseUrl = null;
      }

      if (!token || !baseUrl) {
        return new Response(JSON.stringify({ error: "Dispositivo sem credenciais" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanUrl = baseUrl.replace(/\/+$/, "");
      const allGroups: any[] = [];
      const seenJids = new Set<string>();

      const addGroups = (groupArray: any[]) => {
        for (const g of groupArray) {
          const jid = g.JID || g.jid || g.id || "";
          if (jid && !seenJids.has(jid)) {
            seenJids.add(jid);
            allGroups.push({
              id: jid,
              name: g.Name || g.name || g.Subject || g.subject || "Grupo sem nome",
              participants: g.ParticipantCount || g.Participants?.length || g.participants?.length || 0,
            });
          }
        }
      };

      // Strategy 1: paginated list (page 0-based)
      for (let page = 0; page < 10; page++) {
        try {
          const res = await fetch(`${cleanUrl}/group/list?GetParticipants=false&page=${page}&count=500`, {
            method: "GET",
            headers: { token, Accept: "application/json", "Content-Type": "application/json" },
          });
          if (!res.ok) { console.log(`[groups] page ${page} status ${res.status}`); break; }
          const data = await res.json();
          const groups = data.groups || data || [];
          const groupArray = Array.isArray(groups) ? groups : [];
          console.log(`[groups] page ${page}: ${groupArray.length} items, total unique so far: ${seenJids.size}`);
          if (groupArray.length === 0) break;
          const before = seenJids.size;
          addGroups(groupArray);
          if (seenJids.size === before) break;
        } catch (_e) {
          break;
        }
      }

      // Strategy 2: try page 1-based pagination (some APIs start at 1)
      for (let page = 1; page <= 5; page++) {
        try {
          const res = await fetch(`${cleanUrl}/group/list?GetParticipants=false&page=${page}&count=500`, {
            method: "GET",
            headers: { token, Accept: "application/json", "Content-Type": "application/json" },
          });
          if (!res.ok) break;
          const data = await res.json();
          const groups = data.groups || data || [];
          const groupArray = Array.isArray(groups) ? groups : [];
          if (groupArray.length === 0) break;
          addGroups(groupArray);
        } catch (_e) {
          break;
        }
      }

      // Strategy 3: try alternate endpoints
      for (const endpoint of ["/group/listAll", "/group/list?GetParticipants=false&count=9999", "/chat/list?type=group&count=500"]) {
        try {
          const res = await fetch(`${cleanUrl}${endpoint}`, {
            method: "GET",
            headers: { token, Accept: "application/json", "Content-Type": "application/json" },
          });
          if (!res.ok) continue;
          const data = await res.json();
          const rawGroups = data.groups || data.chats || data || [];
          const groupArray = Array.isArray(rawGroups) ? rawGroups : [];
          const before = seenJids.size;
          addGroups(groupArray);
          console.log(`[groups] ${endpoint}: +${seenJids.size - before} new groups`);
        } catch (_e) {
          // ignore
        }
      }

      console.log(`[groups] TOTAL: ${allGroups.length} groups found`);

      return new Response(JSON.stringify({ groups: allGroups }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── WA REPORT: SEND PV + GROUP NOTIFICATION ───
    if (action === "wa-report-send-group" && req.method === "POST") {
      const { target_user_id, template_type, message_content, group_notification } = await req.json();
      console.log("[wa-report-send] target:", target_user_id, "template:", template_type);

      // Get config
      const { data: configRows } = await adminClient.from("community_settings")
        .select("key, value")
        .in("key", ["wa_report_device_id", "wa_report_group_id"]);

      const cfg: Record<string, string> = {};
      for (const c of (configRows || [])) cfg[c.key] = c.value;

      const deviceId = cfg["wa_report_device_id"];
      const groupId = cfg["wa_report_group_id"];
      console.log("[wa-report-send] config deviceId:", deviceId, "groupId:", groupId);

      if (!deviceId || !groupId) {
        return new Response(JSON.stringify({ error: "Configuração incompleta: instância ou grupo não definido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get device credentials
      const { data: device } = await adminClient.from("devices")
        .select("id, uazapi_token, uazapi_base_url")
        .eq("id", deviceId)
        .maybeSingle();

      if (!device) {
        return new Response(JSON.stringify({ error: "Dispositivo não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let token = device.uazapi_token;
      let baseUrl = device.uazapi_base_url;

      if (!token) {
        const { data: poolToken } = await adminClient.from("user_api_tokens")
          .select("token")
          .eq("device_id", deviceId)
          .eq("status", "in_use")
          .maybeSingle();
        token = poolToken?.token || null;
      }

      if (!baseUrl) {
        baseUrl = Deno.env.get("UAZAPI_BASE_URL") || "";
      }

      if (!token || !baseUrl) {
        return new Response(JSON.stringify({ error: "Credenciais do dispositivo não encontradas" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanUrl = baseUrl.replace(/\/+$/, "");

      // Get client phone number
      const { data: clientProfile } = await adminClient.from("profiles")
        .select("phone")
        .eq("id", target_user_id)
        .maybeSingle();

      const clientPhone = (clientProfile?.phone || "").replace(/\D/g, "");

      // ─── 1) SEND PRIVATE MESSAGE TO CLIENT ───
      let pvSuccess = false;
      let pvError = "";

      if (!clientPhone) {
        pvError = "Cliente sem telefone cadastrado";
      } else {
        try {
          // Use UAZAPI /send/text endpoint with number format
          const pvNumber = clientPhone.startsWith("55") ? clientPhone : `55${clientPhone}`;
          console.log("[wa-report-send] PV sending to number:", pvNumber);
          const res = await fetch(`${cleanUrl}/send/text`, {
            method: "POST",
            headers: { token, "Content-Type": "application/json" },
            body: JSON.stringify({ number: pvNumber, text: message_content }),
          });
          const resData = await res.json();
          console.log("[wa-report-send] PV response:", res.status, JSON.stringify(resData).slice(0, 200));
          if (res.ok) {
            pvSuccess = true;
          } else {
            pvError = JSON.stringify(resData).slice(0, 300);
          }
        } catch (e) {
          console.log("[wa-report-send] PV error:", e.message);
          pvError = e.message;
        }
      }

      // ─── 2) SEND NOTIFICATION TO ADMIN GROUP ───
      let groupSuccess = false;
      let groupError = "";

      const statusEmoji = pvSuccess ? "✅" : "❌";
      const groupMsg =
        `📋 *RELATÓRIO DG CONTINGÊNCIA PRO*\n\n` +
        `${statusEmoji} *Status do envio:* ${pvSuccess ? "Enviado com sucesso" : `Falha: ${pvError}`}\n\n` +
        group_notification;

      try {
        // Extract group number from JID (remove @g.us suffix) for UAZAPI
        const groupNumber = groupId.replace(/@g\.us$/, "");
        console.log("[wa-report-send] Group sending to:", groupNumber);
        const res = await fetch(`${cleanUrl}/send/text`, {
          method: "POST",
          headers: { token, "Content-Type": "application/json" },
          body: JSON.stringify({ number: groupNumber, text: groupMsg }),
        });
        const resData = await res.json();
        console.log("[wa-report-send] Group response:", res.status, JSON.stringify(resData).slice(0, 200));
        if (res.ok) {
          groupSuccess = true;
        } else {
          groupError = JSON.stringify(resData).slice(0, 300);
        }
      } catch (e) {
        console.log("[wa-report-send] Group error:", e.message);
        groupError = e.message;
      }

      // Save to client_messages for history
      const observation = pvSuccess
        ? `PV: ✅ enviado | Grupo: ${groupSuccess ? "✅" : "❌ " + groupError}`
        : `PV: ❌ ${pvError} | Grupo: ${groupSuccess ? "✅" : "❌ " + groupError}`;

      await adminClient.from("client_messages").insert({
        user_id: target_user_id,
        admin_id: user.id,
        template_type,
        message_content,
        observation,
      });

      await logAction(adminClient, user.id, target_user_id, "wa-report-sent",
        `Tipo: ${template_type}, PV: ${pvSuccess ? "OK" : pvError}, Grupo: ${groupSuccess ? "OK" : groupError}`);

      if (!pvSuccess && !groupSuccess) {
        return new Response(JSON.stringify({ success: false, error: `PV: ${pvError} | Grupo: ${groupError}` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, pv_sent: pvSuccess, group_sent: groupSuccess, pv_error: pvError, group_error: groupError }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── WA REPORT: HISTORY ───
    if (action === "wa-report-history") {
      const { data: messages } = await adminClient.from("client_messages")
        .select("id, user_id, admin_id, template_type, message_content, observation, sent_at, created_at")
        .order("sent_at", { ascending: false })
        .limit(100);

      return new Response(JSON.stringify({ messages: messages || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST MESSAGES (for client detail) ───
    if (action === "list-messages" && req.method === "POST") {
      const { target_user_id } = await req.json();
      const { data: messages } = await adminClient.from("client_messages")
        .select("id, template_type, message_content, observation, sent_at")
        .eq("user_id", target_user_id)
        .order("sent_at", { ascending: false })
        .limit(50);

      return new Response(JSON.stringify({ messages: messages || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SAVE MESSAGE ───
    if (action === "save-message" && req.method === "POST") {
      const { target_user_id, template_type, message_content, observation } = await req.json();
      await adminClient.from("client_messages").insert({
        user_id: target_user_id,
        admin_id: user.id,
        template_type,
        message_content,
        observation: observation || null,
      });
      await logAction(adminClient, user.id, target_user_id, "message-sent", `Tipo: ${template_type}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DELETE MESSAGE ───
    if (action === "delete-message" && req.method === "POST") {
      const { message_id, target_user_id } = await req.json();
      await adminClient.from("client_messages").delete().eq("id", message_id);
      await logAction(adminClient, user.id, target_user_id, "message-deleted", `ID: ${message_id}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Payments ──
    if (action === "list-payments" && req.method === "POST") {
      const { target_user_id } = await req.json();
      const { data: payments } = await adminClient.from("payments")
        .select("*")
        .eq("user_id", target_user_id)
        .order("paid_at", { ascending: false });
      return new Response(JSON.stringify({ payments: payments || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "add-payment" && req.method === "POST") {
      const { target_user_id, amount, method, notes, paid_at, discount, fee } = await req.json();
      const { error: insErr } = await adminClient.from("payments").insert({
        user_id: target_user_id,
        admin_id: user.id,
        amount: amount || 0,
        method: method || "PIX",
        notes: notes || null,
        paid_at: paid_at || new Date().toISOString(),
        discount: discount || 0,
        fee: fee || 0,
      });
      if (insErr) throw new Error(insErr.message);
      await logAction(adminClient, user.id, target_user_id, "add-payment", `Pagamento R$ ${amount} registrado`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-payment" && req.method === "POST") {
      const { payment_id, target_user_id, amount, method, notes, paid_at, discount, fee } = await req.json();
      const { error: updErr } = await adminClient.from("payments")
        .update({ amount, method, notes, paid_at, discount, fee })
        .eq("id", payment_id);
      if (updErr) throw new Error(updErr.message);
      await logAction(adminClient, user.id, target_user_id, "update-payment", `Pagamento atualizado`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-payment" && req.method === "POST") {
      const { payment_id, target_user_id } = await req.json();
      const { error: delErr } = await adminClient.from("payments").delete().eq("id", payment_id);
      if (delErr) throw new Error(delErr.message);
      await logAction(adminClient, user.id, target_user_id, "delete-payment", `Pagamento removido`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── TOGGLE NOTIFICATION (auto-provision monitoring token) ──
    if (action === "toggle-notification") {
      const { target_user_id, enabled } = await req.json();

      // Update profile flag
      await adminClient.from("profiles").update({
        notificacao_liberada: !!enabled,
        updated_at: new Date().toISOString(),
      }).eq("id", target_user_id);

      let monitorTokenValue = "";

      if (enabled) {
        // Check if client already has a monitoring token
        const { data: profile } = await adminClient.from("profiles")
          .select("whatsapp_monitor_token").eq("id", target_user_id).maybeSingle();

        if (!profile?.whatsapp_monitor_token) {
          // Auto-provision a UAZAPI instance for monitoring
          const ADMIN_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
          const ADMIN_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";

          if (ADMIN_BASE_URL && ADMIN_TOKEN) {
            // Get client name for label
            const { data: fullProfile } = await adminClient.from("profiles")
              .select("full_name").eq("id", target_user_id).maybeSingle();
            const { data: authUser } = await adminClient.auth.admin.getUserById(target_user_id);
            const clientName = fullProfile?.full_name || authUser?.user?.email || "cliente";
            const sanitizedName = clientName.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 20);
            const instanceName = `${sanitizedName}_monitor`;

            try {
              const res = await fetch(`${ADMIN_BASE_URL}/instance/init`, {
                method: "POST",
                headers: { "admintoken": ADMIN_TOKEN, "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ name: instanceName }),
              });
              const body = await res.json();
              console.log(`[monitor-provision] ${instanceName}: status=${res.status}`, JSON.stringify(body));

              const token = body?.token || body?.data?.token || body?.instance?.token;
              if (token) {
                monitorTokenValue = token;
                // Save token to profile
                await adminClient.from("profiles").update({
                  whatsapp_monitor_token: token,
                  updated_at: new Date().toISOString(),
                }).eq("id", target_user_id);

                // ─── Create/update report_wa device ───
                const { data: existingDevice } = await adminClient.from("devices")
                  .select("id").eq("user_id", target_user_id).eq("login_type", "report_wa").maybeSingle();

                if (existingDevice) {
                  await adminClient.from("devices").update({
                    uazapi_token: token,
                    uazapi_base_url: ADMIN_BASE_URL || null,
                    updated_at: new Date().toISOString(),
                  }).eq("id", existingDevice.id);
                  console.log("[monitor-provision] Updated report_wa device:", existingDevice.id);
                } else {
                  const deviceName = `Relatório WA - ${clientName}`;
                  const { data: newDevice, error: devErr } = await adminClient.from("devices").insert({
                    user_id: target_user_id,
                    name: deviceName,
                    login_type: "report_wa",
                    instance_type: "report_wa",
                    status: "Disconnected",
                    uazapi_token: token,
                    uazapi_base_url: ADMIN_BASE_URL || null,
                  }).select("id").single();

                  if (devErr) {
                    console.error("[monitor-provision] Error creating report_wa device:", devErr);
                  } else {
                    console.log("[monitor-provision] Created report_wa device:", newDevice.id);
                    // Create report_wa_configs if not exists
                    const { data: existingConfig } = await adminClient.from("report_wa_configs")
                      .select("id").eq("user_id", target_user_id).maybeSingle();
                    if (!existingConfig) {
                      await adminClient.from("report_wa_configs").insert({
                        user_id: target_user_id,
                        device_id: newDevice.id,
                      });
                    } else {
                      await adminClient.from("report_wa_configs").update({
                        device_id: newDevice.id,
                      }).eq("id", existingConfig.id);
                    }
                  }
                }

                await logAction(adminClient, user.id, target_user_id, "monitor-token-provisioned",
                  `Token de monitoramento provisionado automaticamente: ${instanceName}`);
              } else {
                console.warn(`[monitor-provision] No token in response for ${instanceName}`);
              }
            } catch (e) {
              console.error(`[monitor-provision] Error provisioning monitor token:`, e.message);
            }
          }
        } else {
          monitorTokenValue = profile.whatsapp_monitor_token;
        }
      }

      await logAction(adminClient, user.id, target_user_id, "toggle-notification",
        enabled ? "Notificação WhatsApp ativada" : "Notificação WhatsApp desativada");

      return new Response(JSON.stringify({ ok: true, monitor_token: monitorTokenValue }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // (update-monitor-token handler is defined earlier in the file)

    // ─── DELETE CLIENT ───
    if (action === "delete-client" && req.method === "POST") {
      const { target_user_id } = await req.json();
      if (!target_user_id) throw new Error("target_user_id obrigatório");

      // Prevent deleting yourself
      if (target_user_id === user.id) throw new Error("Não é possível excluir sua própria conta");

      // Delete in order to respect FK constraints
      const tables = [
        "warmup_logs", "warmup_audit_logs", "warmup_jobs", "warmup_instance_groups",
        "warmup_community_membership", "warmup_unique_recipients", "warmup_cycles",
        "warmup_sessions", "warmup_messages", "warmup_groups", "warmup_autosave_contacts",
        "campaign_contacts", "campaign_device_locks", "campaigns",
        "group_join_logs", "operation_logs", "notifications", "alerts",
        "report_wa_logs", "report_wa_configs",
        "user_api_tokens", "delay_profiles", "contacts", "devices",
        "client_messages", "payments", "subscription_cycles", "subscriptions",
        "admin_logs", "user_roles", "profiles",
      ];

      for (const table of tables) {
        const { error } = await adminClient.from(table).delete().eq("user_id", target_user_id);
        if (error) console.warn(`[delete-client] Error deleting from ${table}:`, error.message);
      }

      // Delete from auth.users
      const { error: authError } = await adminClient.auth.admin.deleteUser(target_user_id);
      if (authError) console.error("[delete-client] auth delete error:", authError.message);

      await logAction(adminClient, user.id, target_user_id, "delete-client", "Cliente excluído permanentemente");

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── BULK DISPATCH (create dispatch + enqueue contacts + process inline) ───
    if (action === "bulk-dispatch" && req.method === "POST") {
      const body = await req.json();
      const { targets, message_content, connection_purpose, min_delay_seconds, max_delay_seconds, pause_every_min, pause_every_max, pause_duration_min, pause_duration_max } = body;

      if (!targets || !Array.isArray(targets) || targets.length === 0) throw new Error("Nenhum destinatário");
      if (!message_content?.trim()) throw new Error("Mensagem vazia");

      // Get dispatch device
      const { data: connPurpose } = await adminClient
        .from("admin_connection_purposes")
        .select("device_id")
        .eq("purpose", connection_purpose || "dispatch")
        .maybeSingle();

      let deviceToken = "";
      let deviceBaseUrl = "";
      if (connPurpose?.device_id) {
        const { data: dev } = await adminClient
          .from("devices")
          .select("id, uazapi_token, uazapi_base_url, status")
          .eq("id", connPurpose.device_id)
          .maybeSingle();
        if (dev) {
          deviceToken = dev.uazapi_token || "";
          deviceBaseUrl = (dev.uazapi_base_url || Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
        }
      }

      // Create dispatch record
      const { data: dispatch, error: dispErr } = await adminClient
        .from("admin_dispatches")
        .insert({
          admin_id: user.id,
          message_content,
          connection_purpose: connection_purpose || "dispatch",
          device_id: connPurpose?.device_id || null,
          total_contacts: targets.length,
          min_delay_seconds: min_delay_seconds || 5,
          max_delay_seconds: max_delay_seconds || 15,
          pause_every_min: pause_every_min || 10,
          pause_every_max: pause_every_max || 20,
          pause_duration_min: pause_duration_min || 30,
          pause_duration_max: pause_duration_max || 120,
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (dispErr || !dispatch) throw new Error(dispErr?.message || "Erro ao criar disparo");

      // Insert contacts
      const contactRows = targets.map((t: any) => ({
        dispatch_id: dispatch.id,
        phone: String(t.phone || "").replace(/\D/g, ""),
        name: t.name || "Contato",
        user_id: t.user_id || null,
        status: "pending",
      }));
      await adminClient.from("admin_dispatch_contacts").insert(contactRows);

      // Process inline (send messages with delays)
      let sent = 0;
      let failed = 0;
      const minD = min_delay_seconds || 5;
      const maxD = max_delay_seconds || 15;
      const pauseMin = pause_every_min || 10;
      const pauseMax = pause_every_max || 20;
      const pauseDMin = pause_duration_min || 30;
      const pauseDMax = pause_duration_max || 120;
      const pauseAt = pauseMin + Math.floor(Math.random() * (pauseMax - pauseMin + 1));
      let msgsSincePause = 0;

      // Fetch contacts
      const { data: contacts } = await adminClient
        .from("admin_dispatch_contacts")
        .select("id, phone, name")
        .eq("dispatch_id", dispatch.id)
        .eq("status", "pending")
        .order("created_at");

      for (const contact of (contacts || [])) {
        // Check if dispatch was paused/cancelled
        const { data: currentDispatch } = await adminClient
          .from("admin_dispatches")
          .select("status")
          .eq("id", dispatch.id)
          .single();

        if (currentDispatch?.status === "paused" || currentDispatch?.status === "cancelled") {
          break;
        }

        if (!deviceToken || !deviceBaseUrl) {
          await adminClient.from("admin_dispatch_contacts").update({
            status: "failed",
            error_message: "Sem dispositivo configurado",
          }).eq("id", contact.id);
          failed++;
          continue;
        }

        try {
          const phone = contact.phone.startsWith("55") ? contact.phone : `55${contact.phone}`;
          const res = await fetch(`${deviceBaseUrl}/send/text`, {
            method: "POST",
            headers: { token: deviceToken, "Content-Type": "application/json" },
            body: JSON.stringify({ number: phone, text: message_content }),
          });

          if (res.ok) {
            await adminClient.from("admin_dispatch_contacts").update({
              status: "sent",
              sent_at: new Date().toISOString(),
            }).eq("id", contact.id);
            sent++;
          } else {
            const errBody = await res.text().catch(() => "Unknown");
            await adminClient.from("admin_dispatch_contacts").update({
              status: "failed",
              error_message: `HTTP ${res.status}: ${errBody.substring(0, 200)}`,
            }).eq("id", contact.id);
            failed++;
          }
        } catch (e: any) {
          await adminClient.from("admin_dispatch_contacts").update({
            status: "failed",
            error_message: e.message?.substring(0, 200) || "Erro desconhecido",
          }).eq("id", contact.id);
          failed++;
        }

        // Update dispatch counters
        await adminClient.from("admin_dispatches").update({
          sent_count: sent,
          failed_count: failed,
          updated_at: new Date().toISOString(),
        }).eq("id", dispatch.id);

        msgsSincePause++;

        // Pause logic
        if (msgsSincePause >= pauseAt && sent + failed < (contacts?.length || 0)) {
          const pauseMs = (pauseDMin + Math.random() * (pauseDMax - pauseDMin)) * 1000;
          await new Promise(r => setTimeout(r, pauseMs));
          msgsSincePause = 0;
        } else {
          // Normal delay
          const delay = (minD + Math.random() * (maxD - minD)) * 1000;
          await new Promise(r => setTimeout(r, delay));
        }
      }

      // Mark dispatch as completed
      const finalStatus = (await adminClient.from("admin_dispatches").select("status").eq("id", dispatch.id).single())?.data?.status;
      if (finalStatus === "running") {
        await adminClient.from("admin_dispatches").update({
          status: "completed",
          sent_count: sent,
          failed_count: failed,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", dispatch.id);
      }

      await logAction(adminClient, user.id, null, "bulk-dispatch",
        `Disparo para ${targets.length} contatos: ${sent} enviados, ${failed} falhas`);

      return new Response(JSON.stringify({ ok: true, dispatch_id: dispatch.id, enqueued: sent, failed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DISPATCH STATUS ───
    if (action === "dispatch-status" && req.method === "POST") {
      const { dispatch_id } = await req.json();
      const { data: disp } = await adminClient.from("admin_dispatches").select("*").eq("id", dispatch_id).single();
      const { data: contacts } = await adminClient.from("admin_dispatch_contacts")
        .select("id, phone, name, status, sent_at, error_message")
        .eq("dispatch_id", dispatch_id)
        .order("created_at");
      return new Response(JSON.stringify({ dispatch: disp, contacts: contacts || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DISPATCH LIST ───
    if (action === "dispatch-list") {
      const { data: dispatches } = await adminClient
        .from("admin_dispatches")
        .select("id, admin_id, name, status, total_contacts, sent_count, failed_count, message_content, connection_purpose, started_at, completed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      return new Response(JSON.stringify({ dispatches: dispatches || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DISPATCH CONTROL (pause/resume/cancel) ───
    if (action === "dispatch-control" && req.method === "POST") {
      const { dispatch_id, command } = await req.json();
      if (!dispatch_id || !command) throw new Error("dispatch_id e command obrigatórios");

      const validCommands: Record<string, string> = {
        pause: "paused",
        resume: "running",
        cancel: "cancelled",
      };
      const newStatus = validCommands[command];
      if (!newStatus) throw new Error("Comando inválido");

      await adminClient.from("admin_dispatches").update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...(command === "cancel" ? { completed_at: new Date().toISOString() } : {}),
      }).eq("id", dispatch_id);

      await logAction(adminClient, user.id, null, `dispatch-${command}`, `Disparo ${dispatch_id} → ${newStatus}`);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── BO CAMPAIGNS LIST (admin's own campaigns only) ───
    if (action === "bo-campaigns") {
      const { data: campaigns, error: campErr } = await adminClient
        .from("campaigns")
        .select("id, user_id, name, status, message_type, message_content, media_url, buttons, template_id, total_contacts, sent_count, delivered_count, failed_count, scheduled_at, started_at, completed_at, created_at, updated_at, min_delay_seconds, max_delay_seconds, pause_every_min, pause_every_max, pause_duration_min, pause_duration_max, device_id, device_ids, messages_per_instance, pause_on_disconnect")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (campErr) throw campErr;

      // Enrich with user email/name
      const userIds = [...new Set((campaigns || []).map((c: any) => c.user_id))];
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await adminClient
          .from("profiles")
          .select("id, full_name, company")
          .in("id", userIds);
        for (const p of profiles || []) {
          profilesMap[p.id] = p;
        }
      }

      const enriched = (campaigns || []).map((c: any) => ({
        ...c,
        owner_name: profilesMap[c.user_id]?.full_name || profilesMap[c.user_id]?.company || "—",
      }));

      return new Response(JSON.stringify(enriched), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "";
    console.error("[admin-data] ERROR:", msg, stack);
    const status = msg.includes("autorizado") ? 401 : msg.includes("negado") ? 403 : 500;
    return new Response(
      JSON.stringify({ error: msg }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
