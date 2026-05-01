// ══════════════════════════════════════════════════════════
// Contact Saver — simulates real WhatsApp behavior by saving
// the contact in the device's address book before chatting.
//
// Lightweight, in-memory dedupe (24h). Direct chats only.
// Fail-safe: any error is swallowed (must not break send flow).
// ══════════════════════════════════════════════════════════

import { buildUazapiHeaders } from "../integrations/uazapi-headers";

const SAVE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// key = `${instanceId}::${digits}`
const savedContacts = new Map<string, number>();

function onlyDigits(v: string): string {
  return String(v || "").replace(/\D/g, "");
}

function isGroupOrLid(target: string): boolean {
  const t = String(target || "").toLowerCase();
  return t.includes("@g.us") || t.includes("@lid") || t.includes("@broadcast");
}

function gcExpired(now: number) {
  if (savedContacts.size < 500) return;
  for (const [k, ts] of savedContacts) {
    if (now - ts > SAVE_TTL_MS) savedContacts.delete(k);
  }
}

/**
 * Save a contact on the device address book (UAZAPI POST /save/contact)
 * if not already saved in the last 24h. Direct chats only — groups skipped.
 *
 * Always fail-safe. Adds a 2–5s delay AFTER actually saving to mimic human flow.
 */
export async function saveContactIfNeeded(
  baseUrl: string,
  token: string,
  instanceId: string,
  targetNumber: string,
): Promise<void> {
  try {
    if (!baseUrl || !token || !instanceId || !targetNumber) return;
    if (isGroupOrLid(targetNumber)) return;

    const digits = onlyDigits(targetNumber);
    if (!digits || digits.length < 8) return;

    const key = `${instanceId}::${digits}`;
    const now = Date.now();
    const last = savedContacts.get(key);
    if (last && now - last < SAVE_TTL_MS) {
      console.log("WARMUP_SAVE_CONTACT", { instanceId, number: digits, saved: false, reason: "recent" });
      return;
    }

    gcExpired(now);

    const lastDigits = digits.slice(-4);
    const payload = { number: digits, name: `Contato ${lastDigits}` };

    let saved = false;
    try {
      const res = await fetch(`${baseUrl}/save/contact`, {
        method: "POST",
        headers: buildUazapiHeaders(token, { json: true, context: "saveContact" }),
        body: JSON.stringify(payload),
      });
      saved = res.ok;
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        console.log("WARMUP_SAVE_CONTACT", {
          instanceId,
          number: digits,
          saved: false,
          status: res.status,
          error: raw.substring(0, 160),
        });
      }
    } catch (e: any) {
      console.log("WARMUP_SAVE_CONTACT", { instanceId, number: digits, saved: false, error: e?.message });
    }

    if (saved) {
      savedContacts.set(key, now);
      console.log("WARMUP_SAVE_CONTACT", { instanceId, number: digits, saved: true });
      // Random 2–5s human-like pause AFTER saving the contact.
      const delay = 2000 + Math.floor(Math.random() * 3000);
      await new Promise((r) => setTimeout(r, delay));
    }
  } catch {
    // fully fail-safe: never throw
  }
}
