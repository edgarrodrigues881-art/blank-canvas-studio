import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  if (phone.length < 12 || phone.length > 13) return null;
  return phone;
}

type ContactProcessingStatus =
  | "completed"
  | "already_exists"
  | "temporary_error"
  | "connection_unconfirmed"
  | "confirmed_disconnect"
  | "permission_unconfirmed"
  | "confirmed_no_admin"
  | "invalid_group"
  | "contact_not_found"
  | "unauthorized"
  | "blocked";

interface AddAttemptResult {
  ok: boolean;
  status: number;
  body?: any;
  rawMessage: string;
  errorCode?: string;
}

interface FailureClassification {
  status: Exclude<ContactProcessingStatus, "completed" | "already_exists">;
  detail: string;
  retryable: boolean;
  pauseCampaign?: boolean;
  confirmed?: boolean;
}

interface ConnectionCheckResult {
  connected: boolean | null;
  status: string;
  detail: string;
}

interface GroupCheckResult {
  accessible: boolean | null;
  invalid: boolean;
  detail: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(token: string, includeJson = false) {
  return includeJson
    ? { token, Accept: "application/json", "Content-Type": "application/json" }
    : { token, Accept: "application/json" };
}

async function readApiResponse(res: Response) {
  const raw = await res.text();
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = { raw };
  }
  return { raw, body };
}

function extractProviderMessage(body: any, raw: string): string {
  const candidates = [
    typeof body?.error === "string" ? body.error : "",
    typeof body?.message === "string" ? body.message : "",
    typeof body?.msg === "string" ? body.msg : "",
    typeof body?.details === "string" ? body.details : "",
    typeof body?.data?.error === "string" ? body.data.error : "",
    typeof body?.data?.message === "string" ? body.data.message : "",
    raw,
  ];

  return candidates.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() || "";
}

function classifyAddFailure(rawMessage: string, httpStatus: number): FailureClassification {
  const message = (rawMessage || "").toLowerCase();

  if (message.includes("rate-overlimit") || message.includes("429") || message.includes("too many requests")) {
    return {
      status: "temporary_error",
      detail: "Erro temporário de integração: a instância atingiu um limite momentâneo e a campanha seguirá com nova tentativa automática.",
      retryable: true,
    };
  }

  if (message.includes("websocket disconnected before info query") || message.includes("connection reset") || message.includes("socket hang up")) {
    return {
      status: "temporary_error",
      detail: "Erro temporário de integração: a consulta do contato foi interrompida antes da resposta do provedor.",
      retryable: true,
    };
  }

  if (message.includes("whatsapp disconnected") || message.includes("session disconnected") || message.includes("socket closed")) {
    return {
      status: "connection_unconfirmed",
      detail: "A integração informou possível desconexão, mas a instância ainda será revalidada antes de qualquer pausa.",
      retryable: true,
    };
  }

  if (message.includes("not admin") || message.includes("not an admin") || message.includes("admin required")) {
    return {
      status: "permission_unconfirmed",
      detail: "A integração informou possível falta de privilégio de admin. O sistema vai revalidar antes de concluir.",
      retryable: true,
    };
  }

  if (message.includes("info query returned status 404") || ((message.includes("number") || message.includes("participant") || message.includes("contact")) && (message.includes("not found") || message.includes("does not exist")))) {
    return {
      status: "contact_not_found",
      detail: "O contato não foi encontrado no WhatsApp.",
      retryable: false,
    };
  }

  if ((message.includes("group") && (message.includes("not found") || message.includes("invalid") || message.includes("does not exist"))) || message.includes("@g.us inválido")) {
    return {
      status: "invalid_group",
      detail: "Não foi possível validar o grupo informado.",
      retryable: false,
      pauseCampaign: true,
      confirmed: true,
    };
  }

  if (httpStatus === 401 || message.includes("unauthorized") || message.includes("invalid token") || message.includes("token invalid")) {
    return {
      status: "unauthorized",
      detail: "Não foi possível autenticar a instância. Verifique o token e reconecte a conta antes de retomar.",
      retryable: false,
      pauseCampaign: true,
      confirmed: true,
    };
  }

  if (message.includes("blocked") || message.includes("ban")) {
    return {
      status: "blocked",
      detail: "O contato não pode ser adicionado por bloqueio ou restrição do WhatsApp.",
      retryable: false,
    };
  }

  if (message.includes("full") || message.includes("limit reached")) {
    return {
      status: "invalid_group",
      detail: "O grupo não aceita novas entradas neste momento.",
      retryable: false,
      pauseCampaign: true,
      confirmed: true,
    };
  }

  if (message.includes("timeout") || message.includes("timed out") || httpStatus === 408 || httpStatus === 504) {
    return {
      status: "temporary_error",
      detail: "Erro temporário de integração por tempo de resposta excedido. O sistema tentará novamente.",
      retryable: true,
    };
  }

  return {
    status: "temporary_error",
    detail: "Falha temporária de integração. O sistema tentará novamente sem marcar a instância como desconectada.",
    retryable: true,
  };
}

async function getDeviceCredentials(sb: any, deviceId: string, userId: string, isAdmin: boolean) {
  const q = sb.from("devices").select("id, name, uazapi_base_url, uazapi_token, user_id").eq("id", deviceId);
  if (!isAdmin) q.eq("user_id", userId);
  const { data: device } = await q.single();
  if (!device?.uazapi_base_url || !device?.uazapi_token) return null;
  return {
    ...device,
    uazapi_base_url: device.uazapi_base_url.replace(/\/+$/, ""),
  };
}

async function getGroupParticipants(baseUrl: string, token: string, groupId: string): Promise<Set<string>> {
  const participants = new Set<string>();
  try {
    const res = await fetch(`${baseUrl}/group/participants?groupJid=${groupId}`, {
      headers: buildHeaders(token),
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.participants || data?.data || [];
      for (const p of list) {
        const num = (p.number || p.id || p.jid || "").replace(/@.*/, "").replace(/[^\d]/g, "");
        if (num) participants.add(num);
      }
    } else {
      await res.text();
    }
  } catch (error) {
    console.error("Error fetching participants:", error);
  }
  return participants;
}

async function checkInstanceConnection(baseUrl: string, token: string): Promise<ConnectionCheckResult> {
  try {
    const res = await fetch(`${baseUrl}/instance/status?t=${Date.now()}`, {
      method: "GET",
      headers: {
        ...buildHeaders(token),
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    const { raw, body } = await readApiResponse(res);
    if (res.status === 401) {
      return {
        connected: null,
        status: "token_invalid",
        detail: "A autenticação da instância falhou durante a validação de conexão.",
      };
    }

    if (!res.ok) {
      return {
        connected: null,
        status: `http_${res.status}`,
        detail: extractProviderMessage(body, raw) || "Não foi possível confirmar o status da instância agora.",
      };
    }

    const inst = body?.instance || body?.data || body || {};
    const status = String(inst.status || body?.status || "unknown").toLowerCase();
    if (["connected", "ready", "active", "open", "online"].some((value) => status.includes(value))) {
      return { connected: true, status, detail: "Conexão confirmada na instância." };
    }

    if (["disconnected", "closed", "close", "offline", "qr", "pairing", "not_connected"].some((value) => status.includes(value))) {
      return { connected: false, status, detail: "A instância foi revalidada como desconectada." };
    }

    const message = extractProviderMessage(body, raw).toLowerCase();
    if (message.includes("connected")) {
      return { connected: true, status: status || "connected", detail: "Conexão confirmada na instância." };
    }

    if (message.includes("disconnected")) {
      return { connected: false, status: status || "disconnected", detail: "A instância foi revalidada como desconectada." };
    }

    return {
      connected: null,
      status,
      detail: "A instância respondeu, mas o status não pôde ser confirmado com segurança.",
    };
  } catch (error: any) {
    return {
      connected: null,
      status: "request_failed",
      detail: `Não foi possível validar a conexão da instância agora: ${error.message}`,
    };
  }
}

async function checkGroupAccess(baseUrl: string, token: string, groupId: string): Promise<GroupCheckResult> {
  const endpoints = [
    { method: "POST", url: `${baseUrl}/group/info`, body: { groupJid: groupId } },
    { method: "GET", url: `${baseUrl}/group/info?groupJid=${encodeURIComponent(groupId)}`, body: undefined },
    { method: "POST", url: `${baseUrl}/chat/info`, body: { chatId: groupId } },
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: endpoint.body ? buildHeaders(token, true) : buildHeaders(token),
        ...(endpoint.body ? { body: JSON.stringify(endpoint.body) } : {}),
      });

      const { raw, body } = await readApiResponse(res);
      const message = extractProviderMessage(body, raw).toLowerCase();
      const group = body?.group || body?.data || body || {};
      const jid = group?.JID || group?.jid || group?.id || group?.groupJid || group?.chatId || "";

      if (res.ok && (jid || raw.toLowerCase().includes(groupId.toLowerCase()))) {
        return {
          accessible: true,
          invalid: false,
          detail: "Acesso ao grupo confirmado na revalidação.",
        };
      }

      if (message.includes("not found") || message.includes("invalid") || message.includes("does not exist") || message.includes("not a participant")) {
        return {
          accessible: false,
          invalid: true,
          detail: "O grupo informado não foi encontrado ou esta instância não tem acesso a ele.",
        };
      }

      if (res.status === 401) {
        return {
          accessible: null,
          invalid: false,
          detail: "A autenticação da instância falhou durante a validação do grupo.",
        };
      }
    } catch (error) {
      console.error("checkGroupAccess error:", error);
    }
  }

  return {
    accessible: null,
    invalid: false,
    detail: "Não foi possível confirmar o acesso ao grupo nesta validação.",
  };
}

async function addToGroup(
  baseUrl: string,
  token: string,
  groupId: string,
  phone: string,
): Promise<AddAttemptResult> {
  const headers = buildHeaders(token, true);
  const plainPhone = phone.replace(/@.*/, "");

  const strategies = [
    {
      method: "POST",
      url: `${baseUrl}/group/updateParticipants`,
      body: { groupJid: groupId, action: "add", participants: [plainPhone] },
    },
    {
      method: "PUT",
      url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`,
      body: { action: "add", participants: [plainPhone] },
    },
    {
      method: "POST",
      url: `${baseUrl}/group/updateParticipants`,
      body: { groupJid: groupId, action: "add", participants: [`${plainPhone}@s.whatsapp.net`] },
    },
    {
      method: "PUT",
      url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`,
      body: { action: "add", participants: [`${plainPhone}@s.whatsapp.net`] },
    },
  ];

  let lastError = "";
  let lastStatus = 405;

  for (const strat of strategies) {
    try {
      console.log(`addToGroup trying: ${strat.method} ${strat.url}`);
      const res = await fetch(strat.url, {
        method: strat.method,
        headers,
        body: JSON.stringify(strat.body),
      });

      if (res.status === 405) continue;

      const { raw, body } = await readApiResponse(res);
      const providerMessage = extractProviderMessage(body, raw);
      const rawLower = `${raw} ${providerMessage}`.toLowerCase();
      lastStatus = res.status;

      console.log(`addToGroup response: ${res.status} ${raw.substring(0, 400)}`);

      if (res.status === 404 && (body?.message === "Not Found." || body?.message === "Not Found")) continue;

      if (res.status === 200 || res.status === 201) {
        const errMsg = providerMessage.toLowerCase();
        if (errMsg.includes("failed") || errMsg.includes("bad-request")) {
          lastError = providerMessage || raw.substring(0, 200);
          continue;
        }
        return { ok: true, status: res.status, body, rawMessage: providerMessage || raw };
      }

      if (rawLower.includes("already") || rawLower.includes("já") || res.status === 409) {
        return { ok: false, status: 409, errorCode: "already_exists", body, rawMessage: providerMessage || raw };
      }

      if (
        rawLower.includes("rate-overlimit") ||
        rawLower.includes("429") ||
        rawLower.includes("whatsapp disconnected") ||
        rawLower.includes("websocket disconnected before info query") ||
        rawLower.includes("not admin") ||
        rawLower.includes("not an admin") ||
        rawLower.includes("info query returned status 404") ||
        rawLower.includes("unauthorized")
      ) {
        return { ok: false, status: res.status, rawMessage: providerMessage || raw, body };
      }

      if (res.status === 500 && rawLower.includes("failed to update participant")) {
        lastError = providerMessage || raw.substring(0, 200);
        continue;
      }

      lastError = providerMessage || raw.substring(0, 200);
    } catch (error: any) {
      console.error("addToGroup strategy error:", error);
      lastError = error.message;
    }
  }

  return {
    ok: false,
    status: lastStatus,
    rawMessage: lastError || "Nenhum endpoint de adição funcionou. Verifique a versão da API.",
  };
}

async function executeAddWithRecovery(
  baseUrl: string,
  token: string,
  groupId: string,
  phone: string,
): Promise<{ status: ContactProcessingStatus; detail: string; pauseCampaign?: boolean; attempts: number }> {
  const maxAttempts = 3;
  let adminSignals = 0;
  let lastFailure: FailureClassification | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const addResult = await addToGroup(baseUrl, token, groupId, phone);
    if (addResult.ok) {
      return {
        status: "completed",
        detail: attempt === 1 ? "Contato adicionado com sucesso." : `Contato adicionado com sucesso após ${attempt} tentativa(s).`,
        attempts: attempt,
      };
    }

    if (addResult.errorCode === "already_exists" || addResult.status === 409) {
      return {
        status: "already_exists",
        detail: "Contato já estava no grupo.",
        attempts: attempt,
      };
    }

    const providerMessage = addResult.rawMessage || "Falha sem detalhe retornado pela integração.";
    const providerMessageLower = providerMessage.toLowerCase();
    let failure = classifyAddFailure(providerMessage, addResult.status);
    let connectionCheck: ConnectionCheckResult | null = null;
    let groupCheck: GroupCheckResult | null = null;

    if (failure.status === "connection_unconfirmed" || providerMessageLower.includes("disconnected")) {
      connectionCheck = await checkInstanceConnection(baseUrl, token);
      if (connectionCheck.connected === true) {
        failure = {
          status: "temporary_error",
          detail: "A integração acusou desconexão, mas a conexão da instância foi confirmada. A falha foi tratada como temporária e uma nova tentativa será feita.",
          retryable: true,
        };
      } else if (connectionCheck.connected === false) {
        failure = {
          status: "confirmed_disconnect",
          detail: "A instância foi revalidada e está realmente desconectada. Reconecte o WhatsApp antes de retomar a campanha.",
          retryable: false,
          pauseCampaign: true,
          confirmed: true,
        };
      } else {
        failure = {
          status: "connection_unconfirmed",
          detail: "Não foi possível confirmar o status da instância nesta tentativa. A falha foi isolada e não será tratada como desconexão definitiva.",
          retryable: attempt < maxAttempts,
        };
      }
    }

    if (failure.status === "permission_unconfirmed" || failure.status === "invalid_group") {
      groupCheck = await checkGroupAccess(baseUrl, token, groupId);

      if (groupCheck.invalid) {
        failure = {
          status: "invalid_group",
          detail: groupCheck.detail,
          retryable: false,
          pauseCampaign: true,
          confirmed: true,
        };
      } else if (failure.status === "permission_unconfirmed") {
        if (providerMessageLower.includes("not admin") || providerMessageLower.includes("not an admin")) {
          adminSignals += 1;
        }

        if (connectionCheck?.connected === false) {
          failure = {
            status: "confirmed_disconnect",
            detail: "A instância foi revalidada e está realmente desconectada. Reconecte o WhatsApp antes de retomar a campanha.",
            retryable: false,
            pauseCampaign: true,
            confirmed: true,
          };
        } else if (adminSignals >= 2 && groupCheck.accessible === true) {
          failure = {
            status: "confirmed_no_admin",
            detail: "A instância respondeu ao grupo corretamente, mas a integração confirmou em múltiplas tentativas que ela não tem privilégio de admin para adicionar participantes.",
            retryable: false,
            pauseCampaign: true,
            confirmed: true,
          };
        } else {
          failure = {
            status: "permission_unconfirmed",
            detail: "Não foi possível confirmar falta de privilégio de admin no grupo. A falha será tratada como isolada sem invalidar a instância.",
            retryable: attempt < maxAttempts,
          };
        }
      } else if (failure.status === "invalid_group" && groupCheck.accessible === true) {
        failure = {
          status: "temporary_error",
          detail: "O grupo respondeu à revalidação. A falha foi tratada como instabilidade temporária de integração.",
          retryable: true,
        };
      }
    }

    lastFailure = failure;

    console.log(JSON.stringify({
      type: "mass-group-inject.attempt_failed",
      phone,
      attempt,
      providerMessage,
      classifiedAs: failure.status,
      retryable: failure.retryable,
      connectionStatus: connectionCheck?.status || null,
      groupAccessible: groupCheck?.accessible ?? null,
      groupInvalid: groupCheck?.invalid ?? false,
    }));

    if (failure.retryable && attempt < maxAttempts) {
      const backoffMs = providerMessageLower.includes("429") || providerMessageLower.includes("rate-overlimit")
        ? 2500 * attempt
        : 1500 * attempt;
      await sleep(backoffMs);
      continue;
    }

    return {
      status: failure.status,
      detail: failure.detail,
      pauseCampaign: !!failure.pauseCampaign,
      attempts: attempt,
    };
  }

  return {
    status: lastFailure?.status || "temporary_error",
    detail: lastFailure?.detail || "Falha temporária de integração.",
    pauseCampaign: !!lastFailure?.pauseCampaign,
    attempts: maxAttempts,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!roleData;

    const body = await req.json();
    const { action } = body;

    if (action === "list-groups") {
      const { deviceId } = body;
      if (!deviceId) {
        return new Response(JSON.stringify({ error: "ID da instância não informado", groups: [], diagnostics: "missing_device_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const device = await getDeviceCredentials(sb, deviceId, user.id, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Instância não encontrada ou sem credenciais configuradas. Verifique se a instância tem URL base e token da Uazapi.", groups: [], diagnostics: "device_not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const allGroups: any[] = [];
        const seenIds = new Set<string>();
        let diagnosticInfo = "";

        const addGroups = (items: any[]) => {
          for (const g of items) {
            const gid = g.id || g.jid || g.JID || g.groupId || g.chatId || "";
            if (!gid || seenIds.has(gid)) continue;
            seenIds.add(gid);
            allGroups.push({
              jid: gid,
              name: g.subject || g.name || g.Subject || g.Name || g.groupName || "Sem nome",
              participants: g.ParticipantCount || g.participants?.length || g.Participants?.length || g.size || 0,
            });
          }
        };

        for (let page = 0; page < 10; page++) {
          try {
            const res = await fetch(`${device.uazapi_base_url}/group/list?GetParticipants=false&page=${page}&count=500`, {
              headers: buildHeaders(device.uazapi_token),
            });
            if (!res.ok) {
              diagnosticInfo += `group/list page ${page}: HTTP ${res.status}; `;
              break;
            }
            const data = await res.json();
            const arr = Array.isArray(data) ? data : data?.groups || data?.data || [];
            if (!Array.isArray(arr) || arr.length === 0) break;
            addGroups(arr);
            if (arr.length < 500) break;
          } catch (error: any) {
            diagnosticInfo += `group/list page ${page} error: ${error.message}; `;
            break;
          }
        }

        if (allGroups.length === 0) {
          for (const endpoint of ["/group/listAll", "/group/fetchAllGroups", "/chat/list?type=group&count=500"]) {
            try {
              const res = await fetch(`${device.uazapi_base_url}${endpoint}`, {
                method: endpoint === "/group/fetchAllGroups" ? "POST" : "GET",
                headers: endpoint === "/group/fetchAllGroups" ? buildHeaders(device.uazapi_token, true) : buildHeaders(device.uazapi_token),
                ...(endpoint === "/group/fetchAllGroups" ? { body: JSON.stringify({}) } : {}),
              });
              if (!res.ok) {
                diagnosticInfo += `${endpoint}: HTTP ${res.status}; `;
                continue;
              }
              const data = await res.json();
              const arr = Array.isArray(data) ? data : data?.groups || data?.data || data?.chats || [];
              addGroups(Array.isArray(arr) ? arr : []);
              if (allGroups.length > 0) break;
            } catch (error: any) {
              diagnosticInfo += `${endpoint} error: ${error.message}; `;
            }
          }
        }

        let errorMessage = "";
        if (allGroups.length === 0) {
          errorMessage = "Esta instância não retornou grupos disponíveis no momento. ";
          if (diagnosticInfo.includes("401") || diagnosticInfo.includes("403")) {
            errorMessage += "O token da instância pode estar expirado ou inválido. Verifique as credenciais.";
          } else if (diagnosticInfo.toLowerCase().includes("timeout") || diagnosticInfo.includes("ECONNREFUSED")) {
            errorMessage += "A instância não respondeu. Verifique se está online e conectada.";
          } else {
            errorMessage += "Tente recarregar a lista, trocar de instância, ou use 'Link do Grupo' / 'JID Manual'.";
          }
        }

        return new Response(JSON.stringify({
          groups: allGroups,
          error: errorMessage || undefined,
          diagnostics: diagnosticInfo || undefined,
          deviceName: device.name,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: any) {
        console.error("list-groups exception:", error);
        return new Response(JSON.stringify({
          error: `Erro ao buscar grupos: ${error.message}. Verifique se a instância está online.`,
          groups: [],
          diagnostics: error.message,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === "resolve-link") {
      const { deviceId, link } = body;
      if (!deviceId || !link) {
        return new Response(JSON.stringify({ error: "Informe a instância e o link do grupo." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const device = await getDeviceCredentials(sb, deviceId, user.id, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Instância não encontrada ou sem credenciais." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanLink = link.trim().replace(/[,;)\]}>'"]+$/, "").split("?")[0];
      const match = cleanLink.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
      const inviteCode = match ? match[1] : cleanLink;

      if (!inviteCode || inviteCode.length < 10) {
        return new Response(JSON.stringify({ error: "Link inválido. Use o formato: https://chat.whatsapp.com/CODIGO" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const strategies = [
        { method: "GET", url: `${device.uazapi_base_url}/group/inviteInfo?inviteCode=${inviteCode}`, body: undefined },
        { method: "POST", url: `${device.uazapi_base_url}/group/join`, body: JSON.stringify({ invitecode: inviteCode }) },
        { method: "POST", url: `${device.uazapi_base_url}/group/join`, body: JSON.stringify({ invitecode: cleanLink }) },
        { method: "PUT", url: `${device.uazapi_base_url}/group/acceptInviteGroup`, body: JSON.stringify({ inviteCode }) },
      ];

      try {
        for (const strat of strategies) {
          try {
            const res = await fetch(strat.url, {
              method: strat.method,
              headers: strat.body ? buildHeaders(device.uazapi_token, true) : buildHeaders(device.uazapi_token),
              ...(strat.body ? { body: strat.body } : {}),
            });
            if (res.status === 405) continue;

            const { raw, body: data } = await readApiResponse(res);
            console.log(`resolve-link ${strat.method} ${strat.url}: ${res.status} ${raw.substring(0, 300)}`);

            if (res.status === 500 && (data?.error === "error joining group" || data?.error === "internal server error")) {
              continue;
            }

            const jid = data?.group?.JID || data?.group?.jid || data?.JID || data?.jid || data?.id || data?.groupJid || data?.gid || data?.groupId || data?.data?.JID || data?.data?.jid || "";
            const name = data?.group?.Name || data?.group?.name || data?.group?.Subject || data?.group?.subject || data?.Name || data?.name || data?.Subject || data?.subject || data?.data?.Name || "";

            if (jid) {
              return new Response(JSON.stringify({ jid, name: name || "Grupo", joined: res.status >= 200 && res.status < 300 }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            const msg = extractProviderMessage(data, raw).toLowerCase();
            if (msg.includes("already") || msg.includes("já")) {
              return new Response(JSON.stringify({ error: "A instância já é membro deste grupo. Use 'Meus Grupos' para encontrá-lo na lista." }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } catch (error) {
            console.error("resolve-link strategy error:", error);
          }
        }

        return new Response(JSON.stringify({
          error: "Não foi possível validar o link do grupo. Confirme se o link está correto e se a instância tem acesso ao grupo. Se o grupo é privado, a instância precisa estar nele.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: any) {
        console.error("resolve-link error:", error);
        return new Response(JSON.stringify({ error: `Erro interno ao resolver link: ${error.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === "validate") {
      const { contacts: rawContacts } = body;
      if (!Array.isArray(rawContacts) || rawContacts.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhum contato informado" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const seen = new Set<string>();
      const valid: string[] = [];
      const invalid: string[] = [];
      const duplicates: string[] = [];

      for (const raw of rawContacts) {
        const normalized = normalizePhone(String(raw));
        if (!normalized) {
          invalid.push(String(raw));
          continue;
        }
        if (seen.has(normalized)) {
          duplicates.push(String(raw));
          continue;
        }
        seen.add(normalized);
        valid.push(normalized);
      }

      return new Response(JSON.stringify({
        total: rawContacts.length,
        valid,
        invalid,
        duplicates,
        validCount: valid.length,
        invalidCount: invalid.length,
        duplicateCount: duplicates.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "check-participants") {
      const { groupId, deviceId, contacts } = body;
      if (!groupId || !deviceId || !Array.isArray(contacts)) {
        return new Response(JSON.stringify({ error: "Parâmetros incompletos para verificação de participantes" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const device = await getDeviceCredentials(sb, deviceId, user.id, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Instância não encontrada" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const participants = await getGroupParticipants(device.uazapi_base_url, device.uazapi_token, groupId);
      const ready: string[] = [];
      const alreadyExists: string[] = [];

      for (const phone of contacts) {
        if (participants.has(phone)) {
          alreadyExists.push(phone);
        } else {
          ready.push(phone);
        }
      }

      return new Response(JSON.stringify({
        ready,
        alreadyExists,
        readyCount: ready.length,
        alreadyExistsCount: alreadyExists.length,
        totalParticipants: participants.size,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "add-single") {
      const { groupId, deviceId, phone, campaignId, contactId } = body;
      if (!groupId || !deviceId || !phone) {
        return new Response(JSON.stringify({ error: "Parâmetros incompletos", status: "temporary_error" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const device = await getDeviceCredentials(sb, deviceId, user.id, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Instância não encontrada", status: "temporary_error" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await executeAddWithRecovery(device.uazapi_base_url, device.uazapi_token, groupId, phone);
      const status = result.status;
      const detail = result.detail;
      const errorMsg = status === "completed" || status === "already_exists" ? null : detail;

      if (campaignId && contactId) {
        try {
          await sb.from("mass_inject_contacts").update({
            status,
            error_message: errorMsg,
            device_used: device.name || device.id,
            processed_at: new Date().toISOString(),
          }).eq("id", contactId);

          const field = status === "completed" ? "success_count" : status === "already_exists" ? "already_count" : "fail_count";
          const { data: campaign } = await sb.from("mass_inject_campaigns").select(field).eq("id", campaignId).single();
          if (campaign) {
            const campaignUpdate: Record<string, any> = {
              [field]: (campaign[field] || 0) + 1,
              updated_at: new Date().toISOString(),
            };

            if (result.pauseCampaign) {
              campaignUpdate.status = "paused";
              campaignUpdate.completed_at = null;
            }

            await sb.from("mass_inject_campaigns").update(campaignUpdate).eq("id", campaignId);
          }
        } catch (error) {
          console.error("Erro ao persistir no banco:", error);
        }
      }

      return new Response(JSON.stringify({
        status,
        error: errorMsg,
        detail,
        pauseCampaign: !!result.pauseCampaign,
        attempts: result.attempts,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação desconhecida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("mass-group-inject error:", error);
    return new Response(JSON.stringify({ error: `Erro interno: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
