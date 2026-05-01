// ══════════════════════════════════════════════════════════
// VPS Engine — UAZAPI communication with timeout & circuit breaker
// ══════════════════════════════════════════════════════════

import { config } from "../core/config";
import { canRequest, recordSuccess, recordFailure } from "../core/circuit-breaker";
import { buildUazapiHeaders, assertUazapiToken } from "./uazapi-headers";
import { isLidTarget, onlyDigits, toLidChatId } from "../utils/lid";

export interface UazapiCredentialValidation {
  status: "valid" | "invalid" | "unknown";
  reason: string;
  httpStatus: number | null;
}

function isInvalidApiKeyResponse(status: number, text: string): boolean {
  const normalized = String(text || "").toLowerCase();
  return status === 401
    || normalized.includes("invalid api key")
    || normalized.includes("api key inválida")
    || normalized.includes("token inválido")
    || normalized.includes("token invalido")
    || normalized.includes("unauthorized");
}

export async function validateUazapiCredentials(
  baseUrl: string,
  token: string,
): Promise<UazapiCredentialValidation> {
  const cleanBaseUrl = String(baseUrl || "").trim().replace(/\/+$/, "");
  const cleanApiToken = String(token || "").trim();

  if (!cleanApiToken) {
    return { status: "invalid", reason: "missing_token", httpStatus: null };
  }

  if (!cleanBaseUrl) {
    return { status: "invalid", reason: "missing_base_url", httpStatus: null };
  }

  const headers = buildUazapiHeaders(cleanApiToken, { context: "validateUazapiCredentials" });

  const endpoints = [
    `${cleanBaseUrl}/instance/status?t=${Date.now()}`,
    `${cleanBaseUrl}/profile?t=${Date.now()}`,
  ];

  let lastStatus: number | null = null;
  let sawTransportError = false;

  for (const url of endpoints) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.min(config.apiTimeoutMs, 4000));

    try {
      const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
      clearTimeout(timeoutId);

      const text = await res.text();
      lastStatus = res.status;

      if (res.ok) {
        return { status: "valid", reason: `validated:${new URL(url).pathname}`, httpStatus: res.status };
      }

      if (isInvalidApiKeyResponse(res.status, text)) {
        return { status: "invalid", reason: "invalid_api_key", httpStatus: res.status };
      }

      if (![404, 405].includes(res.status)) {
        return { status: "unknown", reason: `http_${res.status}`, httpStatus: res.status };
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      sawTransportError = true;

      if (err?.name === "AbortError") {
        return { status: "unknown", reason: "timeout", httpStatus: null };
      }
    }
  }

  return {
    status: "unknown",
    reason: sawTransportError ? "transport_error" : lastStatus ? `http_${lastStatus}` : "unverified",
    httpStatus: lastStatus,
  };
}

export async function uazapiRequest(
  baseUrl: string,
  token: string,
  endpoint: string,
  payload: any,
  method: "POST" | "GET" = "POST",
): Promise<any> {
  // Circuit breaker check
  const check = canRequest(baseUrl);
  if (!check.allowed) {
    throw new Error(`Circuit breaker OPEN for ${baseUrl.slice(0, 40)}… — ${check.reason} (retry in ${Math.round(check.retryInMs / 1000)}s)`);
  }
  let url = `${baseUrl}${endpoint}`;
  const headers: Record<string, string> = buildUazapiHeaders(token, { context: `uazapiRequest:${endpoint}` });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.apiTimeoutMs);

  let fetchOptions: RequestInit;
  if (method === "GET") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null) params.append(key, String(value));
    }
    url += `?${params.toString()}`;
    fetchOptions = { method: "GET", headers, signal: controller.signal };
  } else {
    headers["Content-Type"] = "application/json";
    fetchOptions = { method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal };
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err: any) {
    clearTimeout(timeoutId);
    const msg = err?.name === "AbortError"
      ? `Timeout após ${config.apiTimeoutMs / 1000}s aguardando resposta da API`
      : err?.message || String(err);
    recordFailure(baseUrl, msg);
    throw new Error(msg);
  }
  clearTimeout(timeoutId);

  const text = await res.text();
  if (res.status === 405 && method === "POST") {
    return uazapiRequest(baseUrl, token, endpoint, payload, "GET");
  }
  if (!res.ok) {
    let errorMsg = `API error ${res.status}`;
    try {
      const data = JSON.parse(text);
      errorMsg = data?.message || data?.error || text;
    } catch {
      errorMsg = text;
    }
    recordFailure(baseUrl, errorMsg);
    if (isInvalidApiKeyResponse(res.status, errorMsg)) {
      throw new Error(`Invalid API key (${endpoint})`);
    }
    throw new Error(errorMsg);
  }
  const parsed = JSON.parse(text);
  if (parsed?.error && typeof parsed.error === "string") {
    recordFailure(baseUrl, parsed.error);
    throw new Error(parsed.error);
  }
  recordSuccess(baseUrl);
  return parsed;
}

// ── Target classification helpers ──
// UAZAPIGO V2 RULE: the `number` field is UNIVERSAL. It carries:
//   - normal numbers   → "5511999999999"
//   - LID              → "123456789@lid"
//   - groups           → "123@g.us"
//   - newsletters      → "123@newsletter"
// `chatId` MUST NOT be used in any send payload anymore.
export function buildUazapiTarget(target: string, forceGroup = false): {
  number: string;        // UNIVERSAL field for UAZAPIGO V2 (digits | @lid | @g.us | @newsletter)
  isLid: boolean;
  isGroup: boolean;
  isNewsletter: boolean;
  original: string;
} {
  const raw = String(target || "").trim();
  const lower = raw.toLowerCase();
  const isLid = isLidTarget(raw);
  const isGroup = forceGroup || lower.includes("@g.us");
  const isNewsletter = lower.includes("@newsletter");
  const digits = onlyDigits(raw);

  let number: string;
  if (isLid) {
    number = `${digits}@lid`;
  } else if (isNewsletter) {
    number = raw;
  } else if (isGroup) {
    number = raw.includes("@") ? raw : `${digits}@g.us`;
  } else if (raw.includes("@")) {
    // any other JID (e.g. @s.whatsapp.net) — keep digits-only per V2.
    number = digits || raw;
  } else {
    number = digits;
  }

  return { number, isLid, isGroup, isNewsletter, original: raw };
}

export async function uazapiSendText(
  baseUrl: string,
  token: string,
  target: string,
  text: string,
  isGroup = false,
): Promise<any> {
  // Circuit breaker check
  const check = canRequest(baseUrl);
  if (!check.allowed) {
    throw new Error(`Circuit breaker OPEN — ${check.reason} (retry in ${Math.round(check.retryInMs / 1000)}s)`);
  }

  const safeText = String(text || "").trim();
  if (!safeText) throw new Error("Texto vazio");

  const t = buildUazapiTarget(target, isGroup);

  // LID: only chatId-based attempts. NEVER place "@lid" in `number`.
  const attempts = t.isLid
    ? [
        { path: "/chat/send-text", body: { chatId: t.chatId, text: safeText, body: safeText } },
        { path: "/message/sendText", body: { chatId: t.chatId, text: safeText } },
      ]
    : t.isGroup
    ? [
        { path: "/chat/send-text", body: { chatId: t.chatId, text: safeText } },
        { path: "/send/text", body: { number: t.chatId, text: safeText } },
        { path: "/message/sendText", body: { chatId: t.chatId, text: safeText } },
      ]
    : [
        { path: "/send/text", body: { number: t.number, text: safeText } },
        { path: "/chat/send-text", body: { number: t.number, to: t.number, chatId: t.chatId, body: safeText, text: safeText } },
        { path: "/message/sendText", body: { chatId: t.chatId, text: safeText } },
      ];

  let lastErr = "";
  for (const at of attempts) {
    try {
      const res = await fetch(`${baseUrl}${at.path}`, {
        method: "POST",
        headers: buildUazapiHeaders(token, { json: true, context: "uazapiSend" }),
        body: JSON.stringify(at.body),
      });
      const raw = await res.text();
      if (res.ok) {
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          if (parsed?.error || parsed?.code === 404 || parsed?.status === "error") {
            lastErr = `${at.path}: ${raw.substring(0, 240)}`;
            continue;
          }
          recordSuccess(baseUrl);
          return parsed;
        } catch {
          recordSuccess(baseUrl);
          return { ok: true, raw };
        }
      }
      if (res.status === 405 || res.status === 404) {
        lastErr = `${res.status} @ ${at.path}`;
        continue;
      }
      lastErr = `${res.status} @ ${at.path}: ${raw.substring(0, 240)}`;
    } catch (e: any) {
      lastErr = `${at.path}: ${e?.message || String(e)}`;
    }
  }
  recordFailure(baseUrl, lastErr);
  throw new Error(`Text send failed: ${lastErr}`);
}

export async function uazapiSendImage(
  baseUrl: string,
  token: string,
  target: string,
  imageUrl: string,
  caption: string,
): Promise<any> {
  if (!imageUrl) throw new Error("Image URL ausente");
  const safeCaption = (caption || "📸").trim() || "📸";

  const t = buildUazapiTarget(target);
  // LID → chatId; otherwise digits-only `number`.
  const payload: Record<string, unknown> = t.isLid
    ? { chatId: t.chatId, file: imageUrl, type: "image", caption: safeCaption }
    : { number: t.number, file: imageUrl, type: "image", caption: safeCaption };

  const res = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: buildUazapiHeaders(token, { json: true, context: "uazapiSend" }),
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  if (res.ok) {
    try { return JSON.parse(raw); } catch { return { ok: true, raw }; }
  }
  throw new Error(`Image send failed: ${res.status} — ${raw.substring(0, 240)}`);
}

export async function uazapiSendSticker(
  baseUrl: string,
  token: string,
  target: string,
  imageUrl: string,
): Promise<any> {
  if (!imageUrl) throw new Error("Sticker URL ausente");

  const t = buildUazapiTarget(target);
  const payload: Record<string, unknown> = t.isLid
    ? { chatId: t.chatId, file: imageUrl, type: "sticker" }
    : { number: t.number, file: imageUrl, type: "sticker" };

  const res = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: buildUazapiHeaders(token, { json: true, context: "uazapiSend" }),
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  if (res.ok) {
    try { return JSON.parse(raw); } catch { return { ok: true, raw }; }
  }
  throw new Error(`Sticker send failed: ${res.status} — ${raw.substring(0, 240)}`);
}

export async function uazapiSendAudio(
  baseUrl: string,
  token: string,
  target: string,
  audioUrl: string,
): Promise<any> {
  if (!audioUrl) throw new Error("Audio URL ausente");

  const t = buildUazapiTarget(target);
  const baseBody: Record<string, unknown> = t.isLid
    ? { chatId: t.chatId }
    : { number: t.number };

  const attempts = [
    { path: "/send/media", body: { ...baseBody, file: audioUrl, type: "audio", ptt: true } },
    { path: "/send/media", body: { ...baseBody, file: audioUrl, type: "audio" } },
  ];

  let lastErr = "";
  for (const at of attempts) {
    try {
      const res = await fetch(`${baseUrl}${at.path}`, {
        method: "POST",
        headers: buildUazapiHeaders(token, { json: true, context: "uazapiSend" }),
        body: JSON.stringify(at.body),
      });
      const raw = await res.text();
      if (res.ok) {
        try { return JSON.parse(raw); } catch { return { ok: true, raw }; }
      }
      lastErr = `${res.status} @ ${at.path}: ${raw.substring(0, 240)}`;
    } catch (e: any) {
      lastErr = `${at.path}: ${e?.message || String(e)}`;
    }
  }
  throw new Error(`Audio send failed: ${lastErr}`);
}

export async function uazapiSendLocation(
  baseUrl: string,
  token: string,
  target: string,
  lat: number,
  lng: number,
  name: string,
): Promise<any> {
  const t = buildUazapiTarget(target);
  const attempts = t.isLid
    ? [
        { path: "/send/location", body: { chatId: t.chatId, lat, lng, name, address: name } },
        { path: "/message/sendLocation", body: { chatId: t.chatId, lat, lng, name, address: name } },
      ]
    : [
        { path: "/send/location", body: { number: t.number, lat, lng, name, address: name } },
        { path: "/message/sendLocation", body: { chatId: t.chatId, lat, lng, name, address: name } },
      ];

  let lastErr = "";
  for (const at of attempts) {
    try {
      const res = await fetch(`${baseUrl}${at.path}`, {
        method: "POST",
        headers: buildUazapiHeaders(token, { json: true, context: "uazapiSend" }),
        body: JSON.stringify(at.body),
      });
      const raw = await res.text();
      if (res.ok) {
        try { return JSON.parse(raw); } catch { return { ok: true, raw }; }
      }
      lastErr = `${res.status} @ ${at.path}: ${raw.substring(0, 240)}`;
    } catch (e: any) {
      lastErr = `${at.path}: ${e?.message || String(e)}`;
    }
  }
  throw new Error(`Location send failed: ${lastErr}`);
}

export async function uazapiCheckPhone(
  baseUrl: string,
  token: string,
  phone: string,
): Promise<{ exists: boolean }> {
  // LIDs are not phone numbers. Never validate them via /chat/check or any number-check endpoint.
  console.log("VALIDATION CHECK", { target: phone, isLid: isLidTarget(phone) });
  if (isLidTarget(phone)) return { exists: true };

  const digitsOnly = onlyDigits(phone);
  if (!digitsOnly) return { exists: false };

  const endpoints = [
    { url: `${baseUrl}/misc/checkPhones`, body: { phones: [digitsOnly] } },
    { url: `${baseUrl}/chat/check`, body: { phone: digitsOnly } },
    { url: `${baseUrl}/misc/isOnWhatsapp`, body: { phone: digitsOnly } },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: buildUazapiHeaders(token, { json: true, context: "uazapiSend" }),
        body: JSON.stringify(ep.body),
      });
      if (res.status === 405 || res.status === 404 || !res.ok) continue;
      const raw = await res.text();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const item = Array.isArray(parsed) ? parsed[0] : parsed?.data?.[0] || parsed?.data || parsed;
      if (!item) continue;
      if (item.exists === false || item.onWhatsapp === false || item.isOnWhatsapp === false || item.numberExists === false) return { exists: false };
      if (item.exists === true || item.onWhatsapp === true || item.isOnWhatsapp === true || item.numberExists === true) return { exists: true };
    } catch { continue; }
  }
  return { exists: true };
}

export async function fetchLiveGroups(baseUrl: string, token: string): Promise<any[]> {
  const endpoints = [
    `${baseUrl}/group/fetchAllGroups`,
    `${baseUrl}/group/fetchAllGroups?getParticipants=false`,
    `${baseUrl}/group/list?GetParticipants=false&count=500`,
    `${baseUrl}/group/listAll`,
    `${baseUrl}/chats?type=group`,
  ];

  const dedup = new Map<string, any>();

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: "GET",
        headers: buildUazapiHeaders(token, { context: "fetchLiveGroups" }),
      });
      if (!res.ok) continue;
      const raw = await res.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
      if (!parsed) continue;

      const arrCandidates = [parsed, parsed?.groups, parsed?.data, parsed?.data?.groups, parsed?.chats, parsed?.data?.chats];
      const rows: any[] = [];
      for (const c of arrCandidates) {
        if (Array.isArray(c)) rows.push(...c);
      }

      for (const g of rows) {
        const jid = g?.JID || g?.jid || g?.id || g?.groupJid || g?.chatId || null;
        const name = g?.subject || g?.name || g?.Name || g?.title || "Grupo detectado";
        if (!jid || !String(jid).includes("@g.us")) continue;
        if (!dedup.has(jid)) dedup.set(jid, { ...g, jid, name });
      }

      if (dedup.size > 0) return Array.from(dedup.values());
    } catch { continue; }
  }
  return [];
}
