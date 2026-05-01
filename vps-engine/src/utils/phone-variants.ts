// ══════════════════════════════════════════════════════════
// Phone / JID variant helpers (mirror of supabase/_shared/phone-variants.ts)
// Handles BR 9th-digit alternation when looking up WhatsApp chats.
// ══════════════════════════════════════════════════════════

export const PRIVATE_JID_SUFFIX = "@s.whatsapp.net";
export const GROUP_JID_SUFFIX = "@g.us";
export const LID_JID_SUFFIX = "@lid";

export const cleanNumber = (value: string) => String(value || "").replace(/\D/g, "");

export const isGroupJid = (value: string) => String(value || "").includes(GROUP_JID_SUFFIX);
export const isLidJid = (value: string) => String(value || "").toLowerCase().includes(LID_JID_SUFFIX);

export function normalizeChatId(value: string, isGroup = false): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.endsWith(GROUP_JID_SUFFIX)) return raw;
  if (isLidJid(raw)) return `${cleanNumber(raw)}${LID_JID_SUFFIX}`;
  const digits = cleanNumber(raw);
  if (!digits) return raw.includes("@") ? raw : "";
  return `${digits}${isGroup ? GROUP_JID_SUFFIX : PRIVATE_JID_SUFFIX}`;
}

function buildBrazilPhoneVariants(digits: string): string[] {
  const value = cleanNumber(digits);
  if (!value.startsWith("55")) return [value];
  const local = value.slice(4);
  const variants = new Set<string>([value]);
  if (value.length === 13 && local.length === 9 && local.startsWith("9")) {
    variants.add(`${value.slice(0, 4)}${local.slice(1)}`);
  }
  if (value.length === 12 && local.length === 8) {
    variants.add(`${value.slice(0, 4)}9${local}`);
  }
  return Array.from(variants).filter(Boolean);
}

export function buildEquivalentChatIds(value: string): string[] {
  const normalized = normalizeChatId(value, isGroupJid(value));
  if (!normalized) return [];
  if (normalized.endsWith(GROUP_JID_SUFFIX)) return [normalized];
  if (normalized.endsWith(LID_JID_SUFFIX)) return [normalized];
  return buildBrazilPhoneVariants(cleanNumber(normalized)).map((d) => `${d}${PRIVATE_JID_SUFFIX}`);
}
