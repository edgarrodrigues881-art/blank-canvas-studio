const PAIRING_PHRASE_RE = /(?:pair(?:ing)?\s*code|c[óo]digo(?:\s+de)?\s*pareamento)/i;
const PAIRING_KEY_RE = /^(pairing|pairing_?code|pair_?code|code_?pairing|c[óo]digo_?pareamento|c[óo]digo_?de_?pareamento)$/i;
const PAIRING_CONTEXT_VALUE_KEY_RE = /^(pairing_?code|code|value)$/i;
const MESSAGE_LIKE_KEY_RE = /^(message|msg|error|details|detail|description|text)$/i;
const NON_CODE_WORDS = new Set(["PAIRING", "CODE", "CODIGO", "PAREAMENTO", "GENERATED", "SUCCESSFULLY"]);

function extractPairingCodeFromText(text: string, phoneNumber = ""): string | null {
  const phraseMatch = text.match(PAIRING_PHRASE_RE);
  if (!phraseMatch || phraseMatch.index === undefined) return null;

  const tail = text.slice(phraseMatch.index + phraseMatch[0].length);
  const candidates = tail.match(/[a-z0-9-]{6,16}/gi) || [];

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const normalized = normalizePairingCode(candidates[index], phoneNumber);
    if (!normalized || NON_CODE_WORDS.has(normalized)) continue;
    return normalized;
  }

  return null;
}

export function normalizePairingCode(value: string, phoneNumber = ""): string | null {
  const normalized = String(value || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim()
    .toUpperCase();

  if (!normalized) return null;

  const normalizedPhone = String(phoneNumber || "").replace(/\D/g, "");
  if (normalizedPhone && normalized === normalizedPhone) return null;
  if (normalized.length < 6 || normalized.length > 12) return null;

  return normalized;
}

export function extractPairingCode(payload: unknown, phoneNumber = "", depth = 0, inPairingContext = false): string | null {
  if (!payload || depth > 6) return null;

  if (typeof payload === "string") {
    if (inPairingContext) return normalizePairingCode(payload, phoneNumber);
    return extractPairingCodeFromText(payload, phoneNumber);
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractPairingCode(item, phoneNumber, depth + 1, inPairingContext);
      if (nested) return nested;
    }
    return null;
  }

  if (typeof payload !== "object") return null;

  const entries = Object.entries(payload as Record<string, unknown>);

  for (const [key, value] of entries) {
    if (!PAIRING_KEY_RE.test(key)) continue;

    const direct = extractPairingCode(value, phoneNumber, depth + 1, true);
    if (direct) return direct;
  }

  if (inPairingContext) {
    for (const [key, value] of entries) {
      if (!PAIRING_CONTEXT_VALUE_KEY_RE.test(key)) continue;

      const direct = extractPairingCode(value, phoneNumber, depth + 1, true);
      if (direct) return direct;
    }
  }

  for (const [key, value] of entries) {
    if (typeof value !== "string" || !MESSAGE_LIKE_KEY_RE.test(key)) continue;

    const direct = extractPairingCode(value, phoneNumber, depth + 1, false);
    if (direct) return direct;
  }

  for (const [, value] of entries) {
    if (!value || typeof value !== "object") continue;

    const nested = extractPairingCode(value, phoneNumber, depth + 1, false);
    if (nested) return nested;
  }

  return null;
}