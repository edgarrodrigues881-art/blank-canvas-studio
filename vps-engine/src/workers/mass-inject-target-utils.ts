import { buildUazapiHeaders } from "../integrations/uazapi-headers";

const DEFAULT_TIMEOUT_MS = 12_000;

export type MassInjectTargetKind = "group" | "community_root" | "community_child" | "invalid";

export interface MassInjectTargetInfo {
  kind: MassInjectTargetKind;
  targetId: string;
  targetName: string;
  detail: string;
  parentGroupId: string | null;
  sourceEndpoint?: string;
  rawStatus?: number | null;
}

function buildHeaders(token: string, includeJson = false): Record<string, string> {
  return buildUazapiHeaders(token, { json: includeJson, context: "mass-inject-target" });
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function extractTargetPayload(body: any) {
  return body?.group || body?.data?.group || body?.data || body || {};
}

function extractTargetId(payload: any): string {
  return String(payload?.JID || payload?.jid || payload?.id || payload?.groupJid || payload?.chatId || payload?.groupId || "").trim();
}

function extractTargetName(payload: any): string {
  return String(payload?.subject || payload?.name || payload?.Name || payload?.Subject || payload?.groupName || "").trim();
}

function normalizeParentGroupId(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const clean = value.trim();
    return clean.endsWith("@g.us") ? clean : null;
  }
  if (typeof value === "object") {
    return normalizeParentGroupId(value?.JID || value?.jid || value?.id || value?.groupJid || value?.chatId);
  }
  return null;
}

function extractParentGroupId(payload: any): string | null {
  const candidates = [
    payload?.parentGroup,
    payload?.parentGroupId,
    payload?.parentJid,
    payload?.linkedParent,
    payload?.linked_parent,
    payload?.linkedCommunity,
    payload?.communityParent,
    payload?.communityParentId,
    payload?.communityId,
    payload?.parent,
  ];
  for (const candidate of candidates) {
    const parentId = normalizeParentGroupId(candidate);
    if (parentId) return parentId;
  }
  return null;
}

function isCommunityRootPayload(payload: any): boolean {
  const directFlags = [
    payload?.IsCommunity,
    payload?.isCommunity,
    payload?.is_community,
    payload?.IsParent,
    payload?.isParent,
    payload?.is_parent,
    payload?.isCommunityParent,
  ];
  if (directFlags.some((value) => value === true)) return true;

  const typeTokens = [payload?.groupType, payload?.type, payload?.chatType, payload?.kind]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => String(value).toLowerCase());

  return typeTokens.some((value) => value.includes("community") || value === "parent");
}

function buildCommunityDetail(name: string, targetId: string): string {
  return `Comunidade raiz detectada${name ? ` (${name})` : ""}. A UAZAPI não suporta adição direta nesse destino (${targetId}). Use o grupo interno da comunidade ou entre por link de convite.`;
}

function classifyTargetFromPayload(targetId: string, payload: any, providerMessage = ""): MassInjectTargetInfo {
  const resolvedTargetId = extractTargetId(payload) || targetId;
  const targetName = extractTargetName(payload);
  const parentGroupId = extractParentGroupId(payload);
  const message = providerMessage.toLowerCase();

  if (resolvedTargetId.includes("@lid") || targetId.includes("@lid")) {
    return {
      kind: "community_root",
      targetId: resolvedTargetId || targetId,
      targetName,
      parentGroupId,
      detail: buildCommunityDetail(targetName, resolvedTargetId || targetId),
    };
  }

  if (!(resolvedTargetId || targetId).includes("@g.us")) {
    return {
      kind: "invalid",
      targetId: resolvedTargetId || targetId,
      targetName,
      parentGroupId,
      detail: `Identificador inválido para adição em massa: ${resolvedTargetId || targetId}`,
    };
  }

  if (isCommunityRootPayload(payload) || (message.includes("community") && !parentGroupId)) {
    return {
      kind: "community_root",
      targetId: resolvedTargetId || targetId,
      targetName,
      parentGroupId,
      detail: buildCommunityDetail(targetName, resolvedTargetId || targetId),
    };
  }

  if (parentGroupId) {
    return {
      kind: "community_child",
      targetId: resolvedTargetId || targetId,
      targetName,
      parentGroupId,
      detail: `Grupo interno vinculado à comunidade ${parentGroupId}. Fluxo de grupo comum liberado.`,
    };
  }

  return {
    kind: "group",
    targetId: resolvedTargetId || targetId,
    targetName,
    parentGroupId,
    detail: "Grupo comum confirmado.",
  };
}

export async function inspectMassInjectTarget(baseUrl: string, token: string, targetId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<MassInjectTargetInfo> {
  const cleanTargetId = String(targetId || "").trim();

  if (!cleanTargetId) {
    return { kind: "invalid", targetId: "", targetName: "", parentGroupId: null, detail: "Destino vazio." };
  }

  if (cleanTargetId.includes("@lid")) {
    return {
      kind: "community_root",
      targetId: cleanTargetId,
      targetName: "",
      parentGroupId: null,
      detail: buildCommunityDetail("", cleanTargetId),
    };
  }

  if (!cleanTargetId.includes("@g.us")) {
    return {
      kind: "invalid",
      targetId: cleanTargetId,
      targetName: "",
      parentGroupId: null,
      detail: `Formato de grupo inválido: ${cleanTargetId}`,
    };
  }

  const endpoints = [
    { label: "group_info_post", method: "POST", url: `${baseUrl}/group/info`, body: { groupJid: cleanTargetId } },
    { label: "group_info_get", method: "GET", url: `${baseUrl}/group/info?groupJid=${encodeURIComponent(cleanTargetId)}` },
    { label: "chat_info_post", method: "POST", url: `${baseUrl}/chat/info`, body: { chatId: cleanTargetId } },
  ];

  let lastProviderMessage = "";

  for (const endpoint of endpoints) {
    try {
      const res = await fetchWithTimeout(endpoint.url, {
        method: endpoint.method,
        headers: endpoint.body ? buildHeaders(token, true) : buildHeaders(token),
        ...(endpoint.body ? { body: JSON.stringify(endpoint.body) } : {}),
      }, timeoutMs);

      const { raw, body } = await readApiResponse(res);
      const providerMessage = extractProviderMessage(body, raw);
      lastProviderMessage = providerMessage || lastProviderMessage;
      const lowered = providerMessage.toLowerCase();

      if (lowered.includes("not found") || lowered.includes("invalid") || lowered.includes("does not exist") || lowered.includes("not a participant")) {
        return {
          kind: "invalid",
          targetId: cleanTargetId,
          targetName: "",
          parentGroupId: null,
          sourceEndpoint: endpoint.label,
          rawStatus: res.status,
          detail: `Grupo inválido ou sem acesso: ${cleanTargetId}`,
        };
      }

      const payload = extractTargetPayload(body);
      if (res.ok || Object.keys(payload || {}).length > 0) {
        return {
          ...classifyTargetFromPayload(cleanTargetId, payload, providerMessage),
          sourceEndpoint: endpoint.label,
          rawStatus: res.status,
        };
      }
    } catch (error: any) {
      lastProviderMessage = error?.message || lastProviderMessage;
    }
  }

  return {
    kind: "group",
    targetId: cleanTargetId,
    targetName: "",
    parentGroupId: null,
    detail: lastProviderMessage
      ? `Metadados não confirmados (${lastProviderMessage.substring(0, 120)}). Tratando como grupo padrão.`
      : "Metadados não confirmados. Tratando como grupo padrão.",
  };
}