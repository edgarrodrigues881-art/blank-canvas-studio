// ══════════════════════════════════════════════════════════
// VPS Engine — Lightweight in-memory contact reuse tracker
// Avoids hitting the same recipient (group JID / phone / peer)
// from multiple chips within a short cooldown window.
// No DB, no schema changes, no scheduling changes.
// ══════════════════════════════════════════════════════════

interface ContactEntry {
  lastUsedAt: number;
  usedBy: string; // chipId / device_id
}

const recentContacts = new Map<string, ContactEntry>();

// Cooldown: random per-check between 5 and 15 minutes (per spec)
const MIN_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_COOLDOWN_MS = 15 * 60 * 1000;
// Hard expiration: 30 minutes
const EXPIRATION_MS = 30 * 60 * 1000;

let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 60 * 1000;

function maybeSweep(now: number) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [key, entry] of recentContacts) {
    if (now - entry.lastUsedAt > EXPIRATION_MS) recentContacts.delete(key);
  }
}

function cooldownWindow(): number {
  return MIN_COOLDOWN_MS + Math.floor(Math.random() * (MAX_COOLDOWN_MS - MIN_COOLDOWN_MS));
}

/**
 * Returns true if `contact` is currently on cooldown (recently used by any chip).
 * Logs the result. `chipId` is the caller's device id (for logging only).
 */
export function isContactOnCooldown(contact: string, chipId: string): { skipped: boolean; reason: string } {
  const now = Date.now();
  maybeSweep(now);

  const entry = recentContacts.get(contact);
  if (!entry) {
    console.log("CONTACT_CONTROL", { contact, skipped: false, reason: "not_seen", chipId });
    return { skipped: false, reason: "not_seen" };
  }

  const age = now - entry.lastUsedAt;
  if (age > EXPIRATION_MS) {
    recentContacts.delete(contact);
    console.log("CONTACT_CONTROL", { contact, skipped: false, reason: "expired", chipId });
    return { skipped: false, reason: "expired" };
  }

  const window = cooldownWindow();
  if (age < window) {
    console.log("CONTACT_CONTROL", {
      contact,
      skipped: true,
      reason: "cooldown",
      chipId,
      lastUsedBy: entry.usedBy,
      ageMs: age,
      windowMs: window,
    });
    return { skipped: true, reason: "cooldown" };
  }

  console.log("CONTACT_CONTROL", { contact, skipped: false, reason: "outside_cooldown", chipId, ageMs: age });
  return { skipped: false, reason: "outside_cooldown" };
}

/** Record a successful send, so future checks know this contact is hot. */
export function markContactUsed(contact: string, chipId: string): void {
  const now = Date.now();
  maybeSweep(now);
  recentContacts.set(contact, { lastUsedAt: now, usedBy: chipId });
}

/**
 * Pick the first candidate that is not on cooldown.
 * After 3 attempts, returns the first candidate anyway (fail-safe reuse).
 */
export function pickAvailableContact<T>(
  candidates: T[],
  getKey: (c: T) => string,
  chipId: string,
  maxAttempts = 3
): { chosen: T | null; reusedAfterFallback: boolean } {
  if (candidates.length === 0) return { chosen: null, reusedAfterFallback: false };

  const limit = Math.min(maxAttempts, candidates.length);
  for (let i = 0; i < limit; i++) {
    const cand = candidates[i];
    const { skipped } = isContactOnCooldown(getKey(cand), chipId);
    if (!skipped) return { chosen: cand, reusedAfterFallback: false };
  }

  // Fail-safe: allow reuse — return first candidate
  console.log("CONTACT_CONTROL", {
    contact: getKey(candidates[0]),
    skipped: false,
    reason: "fallback_reuse_after_3_attempts",
    chipId,
  });
  return { chosen: candidates[0], reusedAfterFallback: true };
}
