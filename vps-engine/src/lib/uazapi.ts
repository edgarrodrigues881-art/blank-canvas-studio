// ══════════════════════════════════════════════════════════
// VPS Engine — UAZAPI communication with timeout & circuit breaker
// ══════════════════════════════════════════════════════════

import { config } from "../config";
import { canRequest, recordSuccess, recordFailure } from "./circuit-breaker";

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

  const headers = {
    token: cleanApiToken,
    Accept: "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

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
  const headers: Record<string, string> = { token, Accept: "application/json" };

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
    if (err?.name === "AbortError") {
      throw new Error(`Timeout após ${config.apiTimeoutMs / 1000}s aguardando resposta da API`);
    }
    throw err;
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
    if (isInvalidApiKeyResponse(res.status, errorMsg)) {
      throw new Error(`Invalid API key (${endpoint})`);
    }
    throw new Error(errorMsg);
  }
  const parsed = JSON.parse(text);
  if (parsed?.error && typeof parsed.error === "string") {
    throw new Error(parsed.error);
  }
  return parsed;
}

export async function uazapiSendText(
  baseUrl: string,
  token: string,
  number: string,
  text: string,
  isGroup = false,
): Promise<any> {
  const safeText = String(text || "").trim();
  if (!safeText) throw new Error("Texto vazio");

  const chatId = number.includes("@") ? number : isGroup ? `${number}@g.us` : `${number}@s.whatsapp.net`;

  const attempts = isGroup
    ? [
        { path: "/chat/send-text", body: { chatId, text: safeText } },
        { path: "/send/text", body: { number: chatId, text: safeText } },
        { path: "/message/sendText", body: { chatId, text: safeText } },
      ]
    : [
        { path: "/send/text", body: { number, text: safeText } },
        { path: "/chat/send-text", body: { number, to: number, chatId, body: safeText, text: safeText } },
        { path: "/message/sendText", body: { chatId, text: safeText } },
      ];

  let lastErr = "";
  for (const at of attempts) {
    try {
      const res = await fetch(`${baseUrl}${at.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
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
          return parsed;
        } catch {
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
  throw new Error(`Text send failed: ${lastErr}`);
}

export async function uazapiSendImage(
  baseUrl: string,
  token: string,
  number: string,
  imageUrl: string,
  caption: string,
): Promise<any> {
  if (!imageUrl) throw new Error("Image URL ausente");
  const safeCaption = (caption || "📸").trim() || "📸";

  const res = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token, Accept: "application/json" },
    body: JSON.stringify({ number, file: imageUrl, type: "image", caption: safeCaption }),
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
  number: string,
  imageUrl: string,
): Promise<any> {
  if (!imageUrl) throw new Error("Sticker URL ausente");

  const res = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token, Accept: "application/json" },
    body: JSON.stringify({ number, file: imageUrl, type: "sticker" }),
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
  number: string,
  audioUrl: string,
): Promise<any> {
  if (!audioUrl) throw new Error("Audio URL ausente");

  const attempts = [
    { path: "/send/media", body: { number, file: audioUrl, type: "audio", ptt: true } },
    { path: "/send/media", body: { number, file: audioUrl, type: "audio" } },
  ];

  let lastErr = "";
  for (const at of attempts) {
    try {
      const res = await fetch(`${baseUrl}${at.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
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
  number: string,
  lat: number,
  lng: number,
  name: string,
): Promise<any> {
  const attempts = [
    { path: "/send/location", body: { number, lat, lng, name, address: name } },
    { path: "/message/sendLocation", body: { chatId: number, lat, lng, name, address: name } },
  ];

  let lastErr = "";
  for (const at of attempts) {
    try {
      const res = await fetch(`${baseUrl}${at.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
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
): Promise<boolean> {
  const endpoints = [
    { url: `${baseUrl}/misc/checkPhones`, body: { phones: [phone] } },
    { url: `${baseUrl}/chat/check`, body: { phone } },
    { url: `${baseUrl}/misc/isOnWhatsapp`, body: { phone } },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(ep.body),
      });
      if (res.status === 405 || res.status === 404 || !res.ok) continue;
      const raw = await res.text();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const item = Array.isArray(parsed) ? parsed[0] : parsed?.data?.[0] || parsed?.data || parsed;
      if (!item) continue;
      if (item.exists === false || item.onWhatsapp === false || item.isOnWhatsapp === false || item.numberExists === false) return false;
      if (item.exists === true || item.onWhatsapp === true || item.isOnWhatsapp === true || item.numberExists === true) return true;
    } catch { continue; }
  }
  return true;
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
        headers: { token, Accept: "application/json", "Cache-Control": "no-cache" },
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
