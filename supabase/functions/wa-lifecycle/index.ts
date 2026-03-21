// WA Lifecycle — Automated welcome messages + daily lifecycle alerts to admin group
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPORTE_NUMERO = "(62) 99419-2500";

// ─── MESSAGE TEMPLATES ───
function buildWelcomeMessage(nome: string, plano: string, vencimento: string): string {
  return `Olá ${nome}! 👋\n\nSeja bem-vindo ao DG CONTINGÊNCIA PRO.\n\nSeu teste gratuito de 3 dias já está ativo.\n\n📅 Vencimento: ${vencimento}\n\nSe precisar de ajuda, fale com nosso suporte:\n📞 ${SUPORTE_NUMERO}\n\nBons envios! 🚀`;
}

function buildLifecycleGroupAlert(tipo: string, nome: string, email: string, phone: string, plano: string, vencimento: string, diasRestantes: number): string {
  let emoji = "";
  let statusText = "";

  switch (tipo) {
    case "faltam-3-dias":
      emoji = "⏰";
      statusText = `Vence em ${diasRestantes} dias`;
      break;
    case "vence-hoje":
      emoji = "⚠️";
      statusText = "VENCE HOJE";
      break;
    case "vencido-1-dia":
      emoji = "❌";
      statusText = "Vencido há 1 dia";
      break;
    case "vencido-7-dias":
      emoji = "🔴";
      statusText = "Vencido há 7 dias";
      break;
    case "vencido-30-dias":
      emoji = "💀";
      statusText = "Vencido há 30 dias";
      break;
  }

  return (
    `${emoji} *ALERTA DE CICLO DE VIDA*\n\n` +
    `*Status:* ${statusText}\n\n` +
    `👤 *Cliente:* ${nome}\n` +
    `📧 *Email:* ${email}\n` +
    `📱 *Telefone:* ${phone || "—"}\n` +
    `📦 *Plano:* ${plano}\n` +
    `📅 *Vencimento:* ${vencimento}\n\n` +
    `─────────────────\n` +
    `💡 Acesse o BackOffice → Relatório WhatsApp para enviar a mensagem manualmente.`
  );
}

// ─── SEND TEXT VIA UAZAPI ───
async function sendText(baseUrl: string, token: string, number: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: { token, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    const data = await res.json();
    if (res.ok) return { ok: true };
    return { ok: false, error: JSON.stringify(data).slice(0, 200) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── GET WA REPORT CONFIG ───
async function getReportConfig(adminClient: any): Promise<{ baseUrl: string; token: string; groupNumber: string } | null> {
  const { data: configRows } = await adminClient.from("community_settings")
    .select("key, value")
    .in("key", ["wa_report_device_id", "wa_report_group_id"]);

  const cfg: Record<string, string> = {};
  for (const c of (configRows || [])) cfg[c.key] = c.value;

  const deviceId = cfg["wa_report_device_id"];
  const groupId = cfg["wa_report_group_id"];

  if (!deviceId || !groupId) {
    console.log("[wa-lifecycle] Config incomplete: no device or group");
    return null;
  }

  const { data: device } = await adminClient.from("devices")
    .select("id, uazapi_token, uazapi_base_url")
    .eq("id", deviceId)
    .maybeSingle();

  if (!device) {
    console.log("[wa-lifecycle] Device not found:", deviceId);
    return null;
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

  if (!baseUrl) baseUrl = Deno.env.get("UAZAPI_BASE_URL") || "";

  if (!token || !baseUrl) {
    console.log("[wa-lifecycle] No credentials for device:", deviceId);
    return null;
  }

  const groupNumber = groupId.replace(/@g\.us$/, "");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token, groupNumber };
}

function formatDateUTC(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "cron";

    // ─── ACTION: WELCOME (called from provision-trial) ───
    if (action === "welcome") {
      const body = await req.json();
      const user_id = body.user_id;
      const force = body.force === true;
      console.log("[wa-lifecycle] Welcome for user:", user_id);

      const config = await getReportConfig(adminClient);
      if (!config) {
        return new Response(JSON.stringify({ skipped: true, reason: "WA report not configured" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get user profile + subscription
      const { data: profile } = await adminClient.from("profiles")
        .select("full_name, phone, company")
        .eq("id", user_id)
        .maybeSingle();

      const { data: sub } = await adminClient.from("subscriptions")
        .select("plan_name, expires_at")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!profile || !sub) {
        console.log("[wa-lifecycle] No profile or subscription found");
        return new Response(JSON.stringify({ skipped: true, reason: "No profile/sub" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const nome = profile.full_name || "Cliente";
      const plano = sub.plan_name || "Trial";
      const vencimento = formatDateUTC(sub.expires_at);
      const clientPhone = (profile.phone || "").replace(/\D/g, "");

      // Get email
      const { data: authUser } = await adminClient.auth.admin.getUserById(user_id);
      const email = authUser?.user?.email || "—";

      // 1) Check if WELCOME already queued (handle_new_user trigger may have inserted one)
      let pvQueued = false;
      if (clientPhone) {
        let shouldInsert = force;

        if (!force) {
          const { data: existing } = await adminClient
            .from("message_queue")
            .select("id")
            .eq("user_id", user_id)
            .eq("message_type", "WELCOME")
            .limit(1);
          shouldInsert = !existing || existing.length === 0;
        }

        if (shouldInsert) {
          const phoneNumber = clientPhone.startsWith("55") ? clientPhone : `55${clientPhone}`;
          await adminClient.from("message_queue").insert({
            user_id,
            client_name: nome,
            client_email: email,
            client_phone: phoneNumber,
            plan_name: plano,
            expires_at: sub.expires_at,
            message_type: "WELCOME" as any,
            status: "pending" as any,
          });
          pvQueued = true;
          console.log(`[wa-lifecycle] WELCOME queued for processing${force ? " (forced)" : ""}`);
        } else {
          pvQueued = true;
          console.log("[wa-lifecycle] WELCOME already exists, skipping duplicate");
        }
      }

      // 2) Notify admin group
      const groupMsg =
        `🎉 *NOVO CLIENTE CADASTRADO*\n\n` +
        `👤 *Nome:* ${nome}\n` +
        `📧 *Email:* ${email}\n` +
        `📱 *Telefone:* ${clientPhone || "—"}\n` +
        `🏢 *Empresa:* ${profile.company || "—"}\n` +
        `📦 *Plano:* ${plano}\n` +
        `📅 *Vencimento:* ${vencimento}\n\n` +
        (pvQueued ? `✅ Mensagem de boas-vindas enfileirada para envio automático` : `⚠️ Sem telefone — boas-vindas não será enviada`);

      let groupResult = { ok: false, error: "No config" };
      if (config) {
        groupResult = await sendText(config.baseUrl, config.token, config.groupNumber, groupMsg);
        console.log("[wa-lifecycle] Group result:", groupResult.ok ? "OK" : groupResult.error);
      }

      // 3) DO NOT trigger process-message-queue immediately for welcome either.
      // The message stays as "pending" and will be processed by the cron
      // within the 09:00-19:00 BRT sending window.
      if (pvQueued) {
        console.log("[wa-lifecycle] WELCOME queued as pending. Will be sent by cron within 09-19h BRT window.");
      }

      // Save to client_messages history
      await adminClient.from("client_messages").insert({
        user_id,
        admin_id: user_id,
        template_type: "boas-vindas",
        message_content: buildWelcomeMessage(nome, plano, vencimento),
        observation: `AUTO | PV: ${pvQueued ? "enfileirado" : "sem telefone"} | Grupo: ${groupResult.ok ? "✅" : "❌ " + groupResult.error}`,
      });

      return new Response(JSON.stringify({ success: true, pvQueued, group: groupResult.ok }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: CRON (daily lifecycle check) ───
    if (action === "cron") {
      console.log("[wa-lifecycle] Running daily lifecycle check");

      const config = await getReportConfig(adminClient);

      // ── CAPACITY CHECK (280+ instances) ──
      const SERVER_MAX = 300;
      const ALERT_THRESHOLD = 280;
      const { count: totalDevices } = await adminClient.from("devices")
        .select("id", { count: "exact", head: true });

      if (config && totalDevices !== null && totalDevices >= ALERT_THRESHOLD) {
        const pct = Math.round((totalDevices / SERVER_MAX) * 100);
        const capacityMsg =
          `🔥 *ALERTA DE CAPACIDADE DO SERVIDOR*\n\n` +
          `📊 *${totalDevices}/${SERVER_MAX}* instâncias ativas (${pct}%)\n\n` +
          (totalDevices >= SERVER_MAX
            ? `🚨 *SERVIDOR LOTADO!* Nenhuma nova instância pode ser criada.\n`
            : `⚠️ Restam apenas *${SERVER_MAX - totalDevices}* vagas.\n`) +
          `\n💡 Considere expandir a infraestrutura ou remover instâncias inativas.`;

        await sendText(config.baseUrl, config.token, config.groupNumber, capacityMsg);
        console.log(`[wa-lifecycle] Capacity alert sent: ${totalDevices}/${SERVER_MAX}`);
      }

      // ── LIFECYCLE ALERTS + AUTO MESSAGE QUEUE ──
      // Get all subscriptions (latest per user)
      const { data: subs } = await adminClient.from("subscriptions")
        .select("user_id, plan_name, expires_at")
        .order("created_at", { ascending: false });

      if (!subs || subs.length === 0) {
        return new Response(JSON.stringify({ processed: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Deduplicate: keep only latest subscription per user
      const latestSubs = new Map<string, typeof subs[0]>();
      for (const s of subs) {
        if (!latestSubs.has(s.user_id)) latestSubs.set(s.user_id, s);
      }

      // Get all profiles
      const userIds = [...latestSubs.keys()];
      const { data: profiles } = await adminClient.from("profiles")
        .select("id, full_name, phone")
        .in("id", userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      // Get auth users for emails
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const emailMap = new Map((authUsers?.users || []).map(u => [u.id, u.email]));

      // Check which messages were already queued/sent today
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { data: queuedToday } = await adminClient.from("message_queue")
        .select("user_id, message_type")
        .gte("created_at", todayStart.toISOString());
      const queuedSet = new Set((queuedToday || []).map(q => `${q.user_id}:${q.message_type}`));

      // Map legacy types to message_queue types
      const LIFECYCLE_MAP: Record<string, { days: number; mqType: string; legacyType: string }> = {
        "DUE_3_DAYS":  { days: 3,   mqType: "DUE_3_DAYS",  legacyType: "faltam-3-dias" },
        "DUE_TODAY":   { days: 0,   mqType: "DUE_TODAY",    legacyType: "vence-hoje" },
        "OVERDUE_1":   { days: -1,  mqType: "OVERDUE_1",    legacyType: "vencido-1-dia" },
        "OVERDUE_7":   { days: -7,  mqType: "OVERDUE_7",    legacyType: "vencido-7-dias" },
        "OVERDUE_30":  { days: -30, mqType: "OVERDUE_30",   legacyType: "vencido-30-dias" },
      };

      let alertsSent = 0;
      let queued = 0;
      const now = new Date();

      for (const [userId, sub] of latestSubs) {
        const expiresAt = new Date(sub.expires_at);
        const diffMs = expiresAt.getTime() - now.getTime();
        const daysLeft = Math.floor(diffMs / 86400000);

        // Find matching lifecycle stage
        let matchedKey: string | null = null;
        for (const [key, cfg] of Object.entries(LIFECYCLE_MAP)) {
          if (daysLeft === cfg.days) {
            matchedKey = key;
            break;
          }
        }

        if (!matchedKey) continue;

        const lifecycle = LIFECYCLE_MAP[matchedKey];
        const mqKey = `${userId}:${lifecycle.mqType}`;

        // Skip if already queued today
        if (queuedSet.has(mqKey)) {
          console.log(`[wa-lifecycle] Skipping ${lifecycle.mqType} for ${userId} - already queued today`);
          continue;
        }

        const profile = profileMap.get(userId);
        const nome = profile?.full_name || "Cliente";
        const phone = (profile?.phone || "").replace(/\D/g, "");
        const email = emailMap.get(userId) || "—";
        const vencimento = formatDateUTC(sub.expires_at);

        // 1) Insert into message_queue for automatic PV sending
        if (phone) {
          const phoneNumber = phone.startsWith("55") ? phone : `55${phone}`;
          await adminClient.from("message_queue").insert({
            user_id: userId,
            client_name: nome,
            client_email: email,
            client_phone: phoneNumber,
            plan_name: sub.plan_name,
            expires_at: sub.expires_at,
            message_type: lifecycle.mqType as any,
            status: "pending" as any,
          });
          queued++;
          console.log(`[wa-lifecycle] Queued ${lifecycle.mqType} for ${nome} (${email})`);
        }

        // 2) Send group alert to admin group
        if (config) {
          const alertMsg = buildLifecycleGroupAlert(lifecycle.legacyType, nome, email, phone, sub.plan_name, vencimento, daysLeft);
          const result = await sendText(config.baseUrl, config.token, config.groupNumber, alertMsg);
          console.log(`[wa-lifecycle] Group alert ${lifecycle.legacyType} for ${userId}: ${result.ok ? "OK" : result.error}`);
          if (result.ok) alertsSent++;
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      // 3) DO NOT trigger process-message-queue immediately.
      // Messages stay as "pending" so admin can review them in the BackOffice.
      // The process-message-queue cron (every 5 min) will pick them up
      // only within the 09:00-19:00 BRT sending window.
      if (queued > 0) {
        console.log(`[wa-lifecycle] ${queued} messages queued as pending. Will be sent by cron within 09-19h BRT window.`);
      }

      console.log(`[wa-lifecycle] Cron completed: ${alertsSent} group alerts, ${queued} messages queued, ${totalDevices} total devices`);

      return new Response(JSON.stringify({ success: true, alerts_sent: alertsSent, queued, total_devices: totalDevices }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[wa-lifecycle] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
