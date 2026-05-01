// ══════════════════════════════════════════════════════════
// LID helpers — centralized detection for WhatsApp internal LID IDs.
// A LID is not a phone number and must never go through number validation.
// ══════════════════════════════════════════════════════════

export const LID_SUFFIX = "@lid";

export function onlyDigits(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

export function isLidTarget(value: unknown): boolean {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return false;
  if (raw.includes(LID_SUFFIX)) return true;
  return /^\d{14,}$/.test(raw);
}

export function toLidChatId(value: unknown): string {
  const digits = onlyDigits(value);
  return digits ? `${digits}${LID_SUFFIX}` : "";
}
