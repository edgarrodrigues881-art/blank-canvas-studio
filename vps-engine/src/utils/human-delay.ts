// ══════════════════════════════════════════════════════════
// Human Delay — pre-send "thinking/typing" pause.
//
// Adds a single human-like delay BEFORE the actual API call,
// scaled to content length. Fail-safe (never throws).
//
// Do NOT use for: status posts, group joins, internal events.
// ══════════════════════════════════════════════════════════

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export type HumanDelayContent = string | { length?: number } | null | undefined;

/**
 * Sleeps for a human-like duration based on content size.
 *  - empty / unknown   → 3–6s
 *  - text < 40 chars   → 3–6s
 *  - text < 120 chars  → 5–9s
 *  - text >= 120       → 7–12s
 *  - non-string media  → 4–8s
 *
 * Always fail-safe: any internal error swallowed.
 */
export async function applyHumanDelay(content?: HumanDelayContent): Promise<void> {
  try {
    let delay: number;
    if (content == null) {
      delay = rand(3000, 6000);
    } else if (typeof content === "string") {
      const len = content.length;
      if (len < 40) delay = rand(3000, 6000);
      else if (len < 120) delay = rand(5000, 9000);
      else delay = rand(7000, 12000);
    } else {
      delay = rand(4000, 8000);
    }
    console.log("WARMUP_HUMAN_DELAY", { delay, kind: typeof content === "string" ? "text" : "media" });
    await new Promise((r) => setTimeout(r, delay));
  } catch {
    // never break send flow
  }
}
