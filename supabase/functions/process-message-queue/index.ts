// Process Message Queue — sends pending messages via WhatsApp using DB templates + buttons
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPORTE_NUMERO = "(62) 99419-2500";

const API_TIMEOUT_MS = 25_000;

// ─── BUTTON TYPES ───
interface TemplateButton {
  id?: number;
  type: "reply" | "url" | "phone";
  text: string;
  value: string;
}

// ─── FALLBACK TEMPLATES (used if DB template not found) ───
function fallbackMessage(type: string, nome: string, plano: string, vencimento: string): string {
  switch (type) {
    case "WELCOME":
      return `Olá ${nome}! 👋\n\nSeja bem-vindo ao DG CONTINGÊNCIA PRO.\n\nSeu teste gratuito de 3 dias já está ativo.\n\n📅 Vencimento: ${vencimento}\n\nSe precisar de ajuda, fale com nosso suporte:\n📞 ${SUPORTE_NUMERO}\n\nBons envios! 🚀`;
    case "DUE_3_DAYS":
      return `Olá ${nome}! ⏳\n\nSeu plano ${plano} vence em 3 dias.\n\nPara evitar interrupção nas suas instâncias, recomendamos renovar antecipadamente.\n\n📅 Vencimento: ${vencimento}\n\nSe precisar de ajuda, fale com nosso suporte:\n📞 ${SUPORTE_NUMERO}`;
    case "DUE_TODAY":
      return `Olá ${nome}! ⚠️\n\nSeu plano ${plano} vence HOJE.\n\nSem renovação, suas instâncias poderão ser bloqueadas automaticamente.\n\n📅 Vencimento: ${vencimento}\n\nRenove para continuar utilizando a plataforma normalmente.\n\nSuporte:\n📞 ${SUPORTE_NUMERO}`;
    case "OVERDUE_1":
      return `Olá ${nome}! 🚫\n\nSeu plano ${plano} venceu ontem.\n\nSuas instâncias estão temporariamente bloqueadas.\n\nRenove para voltar a utilizá-las imediatamente.\n\nSuporte:\n📞 ${SUPORTE_NUMERO}`;
    case "OVERDUE_7":
      return `Olá ${nome}! 📢\n\nSeu plano está vencido há 7 dias.\n\nAinda é possível reativar sua conta e continuar utilizando suas instâncias normalmente.\n\nSe precisar de ajuda com a renovação, fale com nosso suporte.\n\n📞 ${SUPORTE_NUMERO}`;
    case "OVERDUE_30":
      return `Olá ${nome}! 🎁\n\nJá se passaram 30 dias desde o vencimento do seu plano.\n\nPara você voltar a utilizar a plataforma, liberamos uma condição especial de retorno.\n\n💸 Desconto exclusivo na renovação.\n\nSe quiser reativar sua conta, fale com nosso suporte.\n\n📞 ${SUPORTE_NUMERO}`;
    default:
      return `Olá ${nome}, esta é uma mensagem do DG CONTINGÊNCIA PRO. Suporte: ${SUPORTE_NUMERO}`;
  }
}

// ─── REPLACE VARIABLES IN TEMPLATE ───
function replaceVariables(content: string, nome: string, plano: string, vencimento: string): string {
  return content
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{plano\}\}/g, plano)
    .replace(/\{\{vencimento\}\}/g, vencimento)
    .replace(/\{\{suporte\}\}/g, SUPORTE_NUMERO);
}

// ─── BUILD MENU CHOICE (same logic as process-campaign) ───
function buildMenuChoice(button: TemplateButton, index: number): string | null {
  const text = (button.text || "").trim();
  if (!text) return null;
  if (button.type === "url") {
    const url = (button.value || "").trim();
    return url ? `${text}|url:${url}` : text;
  }
  if (button.type === "phone") {
    const phone = (button.value || "").trim();
    return phone ? `${text}|call:${phone}` : text;
  }
  const replyId = (button.value || `btn_${index}`).trim();
  return `${text}|${replyId}`;
}

// ─── UAZAPI REQUEST ───
async function uazapiRequest(baseUrl: string, token: string, endpoint: string, payload: any): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const url = `${baseUrl}${endpoint}`;
  const headers: Record<string, string> = { token, "Content-Type": "application/json" };

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal });
  } catch (fetchErr: any) {
    clearTimeout(timeoutId);
    if (fetchErr?.name === "AbortError") throw new Error(`Timeout após ${API_TIMEOUT_MS / 1000}s`);
    throw fetchErr;
  }
  clearTimeout(timeoutId);

  const text = await res.text();
  if (!res.ok) {
    let errorMsg = `API error ${res.status}`;
    try { const data = JSON.parse(text); errorMsg = data?.message || data?.error || text; } catch (_e) { errorMsg = text; }
    throw new Error(errorMsg);
  }
  return JSON.parse(text);
}

// ─── SEND MESSAGE (text or with buttons via /send/menu) ───
async function sendMessage(
  baseUrl: string,
  token: string,
  number: string,
  text: string,
  buttons: TemplateButton[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const phone = number.replace(/\D/g, "");
    const choices = buttons
      .map((b, i) => buildMenuChoice(b, i))
      .filter((c): c is string => Boolean(c));

    if (choices.length > 0) {
      // Send as interactive menu with buttons
      await uazapiRequest(baseUrl, token, "/send/menu", {
        number: phone,
        type: "button",
        text,
        choices,
      });
    } else {
      // Send as plain text
      await uazapiRequest(baseUrl, token, "/send/text", { number: phone, text });
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ─── TYPE LABEL MAP ───
function typeLabel(type: string): string {
  const map: Record<string, string> = {
    WELCOME: "Boas-vindas",
    DUE_3_DAYS: "Vence em 3 dias",
    DUE_TODAY: "Vence hoje",
    OVERDUE_1: "Vencido há 1 dia",
    OVERDUE_7: "Vencido há 7 dias",
    OVERDUE_30: "Vencido há 30 dias",
  };
  return map[type] || type;
}

// ─── GET REPORT DEVICE CREDENTIALS + GROUP ───
async function getReportDevice(adminClient: any): Promise<{ baseUrl: string; token: string; groupNumber: string | null } | null> {
  const { data: configRows } = await adminClient
    .from("community_settings")
    .select("key, value")
    .in("key", ["wa_report_device_id", "wa_report_group_id"]);

  const cfg: Record<string, string> = {};
  for (const c of configRows || []) cfg[c.key] = c.value;

  const deviceId = cfg["wa_report_device_id"];
  const groupId = cfg["wa_report_group_id"] || null;

  if (!deviceId) {
    console.log("[process-mq] No wa_report_device_id configured");
    return null;
  }

  const { data: device } = await adminClient
    .from("devices")
    .select("id, uazapi_token, uazapi_base_url")
    .eq("id", deviceId)
    .maybeSingle();

  if (!device) {
    console.log("[process-mq] Device not found:", deviceId);
    return null;
  }

  let token = device.uazapi_token;
  let baseUrl = device.uazapi_base_url;

  if (!token) {
    const { data: poolToken } = await adminClient
      .from("user_api_tokens")
      .select("token")
      .eq("device_id", deviceId)
      .eq("status", "in_use")
      .maybeSingle();
    token = poolToken?.token || null;
  }

  if (!baseUrl) baseUrl = Deno.env.get("UAZAPI_BASE_URL") || "";
  if (!token || !baseUrl) {
    console.log("[process-mq] No credentials for device:", deviceId);
    return null;
  }

  const groupNumber = groupId ? groupId.replace(/@g\.us$/, "") : null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token, groupNumber };
}

function formatDateBR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ─── VALIDATE PHONE NUMBER (BR) ───
function isValidPhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length < 10 || local.length > 11) return false;
  const ddd = parseInt(local.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;
  return true;
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((r) => setTimeout(r, ms));
}

// ─── LOAD DB TEMPLATES ───
async function loadTemplates(adminClient: any): Promise<Map<string, { content: string; buttons: TemplateButton[] }>> {
  const { data, error } = await adminClient
    .from("auto_message_templates")
    .select("message_type, content, buttons, is_active")
    .eq("is_active", true);

  const map = new Map<string, { content: string; buttons: TemplateButton[] }>();
  if (error || !data) {
    console.error("[process-mq] Failed to load templates:", error?.message);
    return map;
  }
  for (const tpl of data) {
    const buttons: TemplateButton[] = Array.isArray(tpl.buttons) ? tpl.buttons : [];
    map.set(tpl.message_type, { content: tpl.content, buttons });
  }
  console.log(`[process-mq] Loaded ${map.size} active templates from DB`);
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("INTERNAL_TICK_SECRET");

    if (cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // ── TIME WINDOW CHECK: only send between 09:00 and 19:00 BRT ──
    const nowBRT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hourBRT = nowBRT.getHours();
    if (hourBRT < 9 || hourBRT >= 19) {
      console.log(`[process-mq] Outside sending window (${hourBRT}h BRT). Skipping.`);
      return new Response(
        JSON.stringify({ skipped: true, reason: `Outside sending window (${hourBRT}h BRT, allowed 09-19)` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── RANDOM DELAY 1-4 MINUTES before processing to avoid spam ──
    const delayMinutes = 1 + Math.random() * 3;
    const delayMs = Math.floor(delayMinutes * 60_000);
    console.log(`[process-mq] Waiting ${Math.round(delayMinutes * 10) / 10} min (${delayMs}ms) before processing...`);
    await new Promise((r) => setTimeout(r, delayMs));

    console.log("[process-mq] Starting queue processing...");

    // Get device credentials for sending
    const device = await getReportDevice(adminClient);
    if (!device) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No WA device configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load templates from DB
    const templates = await loadTemplates(adminClient);

    // Process only 1 message per cron tick
    let claimed: any[] | null = null;
    let claimErr: any = null;

    const result = await adminClient.rpc("claim_pending_messages", { _limit: 1 });
    claimed = result.data;
    claimErr = result.error;

    if (claimErr) {
      console.error("[process-mq] Claim error:", claimErr.message);
      return new Response(JSON.stringify({ error: claimErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate: only process first message per user+type, revert rest
    const seen = new Set<string>();
    const pendingItems: any[] = [];
    const duplicateIds: string[] = [];
    for (const item of (claimed || [])) {
      const key = `${item.user_id}:${item.message_type}`;
      if (seen.has(key)) {
        duplicateIds.push(item.id);
      } else {
        seen.add(key);
        pendingItems.push(item);
      }
    }
    if (duplicateIds.length > 0) {
      await adminClient
        .from("message_queue")
        .update({ status: "failed", error_message: "Duplicata removida automaticamente", updated_at: new Date().toISOString() })
        .in("id", duplicateIds);
      console.log(`[process-mq] Removed ${duplicateIds.length} duplicate messages`);
    }

    if (!pendingItems || pendingItems.length === 0) {
      console.log("[process-mq] No pending messages");
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[process-mq] Claimed ${pendingItems.length} messages (${duplicateIds.length} duplicates removed)`);

    let sent = 0;
    let failed = 0;

    for (const item of pendingItems) {
      const phone = (item.client_phone || "").replace(/\D/g, "");

      if (!phone) {
        await adminClient.from("message_queue").update({
          status: "failed", error_message: "Telefone não informado",
          sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        failed++;
        continue;
      }

      if (!isValidPhoneNumber(phone)) {
        await adminClient.from("message_queue").update({
          status: "failed", error_message: `Número inválido: ${phone}`,
          sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        failed++;
        continue;
      }

      const number = phone.startsWith("55") ? phone : `55${phone}`;
      const vencimento = item.expires_at ? formatDateBR(item.expires_at) : "—";
      const nome = item.client_name || "Cliente";
      const plano = item.plan_name || "—";

      // Build message from DB template or fallback
      let messageText: string;
      let buttons: TemplateButton[] = [];
      const dbTemplate = templates.get(item.message_type);

      if (dbTemplate) {
        messageText = replaceVariables(dbTemplate.content, nome, plano, vencimento);
        buttons = dbTemplate.buttons;
        console.log(`[process-mq] Using DB template for ${item.message_type} (${buttons.length} buttons)`);
      } else {
        messageText = fallbackMessage(item.message_type, nome, plano, vencimento);
        console.log(`[process-mq] Using fallback template for ${item.message_type}`);
      }

      // Send via WhatsApp (with buttons if configured)
      const result = await sendMessage(device.baseUrl, device.token, number, messageText, buttons);

      if (result.ok) {
        await adminClient.from("message_queue").update({
          message_content: messageText,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        sent++;
        console.log(`[process-mq] ✅ Sent ${item.message_type} to ${nome}${buttons.length > 0 ? ` (with ${buttons.length} buttons)` : ""}`);
      } else {
        await adminClient.from("message_queue").update({
          status: "failed",
          error_message: result.error || "Erro desconhecido",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        failed++;
        console.log(`[process-mq] ❌ Failed ${item.message_type} for ${nome}: ${result.error}`);
      }

      // Only 1 message per tick — next message will be sent on next cron execution
    }

    console.log(`[process-mq] Done: ${sent} sent, ${failed} failed`);

    return new Response(
      JSON.stringify({ success: true, sent, failed, total: pendingItems.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[process-mq] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
