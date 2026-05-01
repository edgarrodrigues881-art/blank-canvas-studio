// ══════════════════════════════════════════════════════════
// Presence Simulation — shows "typing..." / "recording..."
// to the target before sending. Fail-safe (never throws).
//
// Direct chats only. Skip groups/status/system events.
// ══════════════════════════════════════════════════════════

import { uazapiSendPresence } from "../integrations/uazapi";

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export type PresenceKind = "text" | "audio";

/**
 * Fire a presence indicator to a direct-chat target before sending.
 *  - audio → "recording" (5–12s)
 *  - text/other → "composing" (3–8s)
 *
 * The UAZAPI presence call carries its own `delay`, so this function does
 * NOT sleep — it dispatches the presence and returns immediately. The
 * presence stays visible for `delay` ms on the WhatsApp side.
 *
 * Always fail-safe: any error is swallowed and logged.
 */
export async function applyPresence(
  baseUrl: string,
  token: string,
  target: string,
  kind: PresenceKind,
): Promise<void> {
  try {
    if (!baseUrl || !token || !target) return;

    let presenceType: "composing" | "recording";
    let delay: number;
    if (kind === "audio") {
      presenceType = "recording";
      delay = rand(5000, 12000);
    } else {
      presenceType = "composing";
      delay = rand(3000, 8000);
    }

    console.log("WARMUP_PRESENCE", { target, presenceType, delay });
    await uazapiSendPresence(baseUrl, token, target, presenceType, delay, false);
  } catch (e: any) {
    console.log("WARMUP_PRESENCE_FAIL", { target, error: e?.message });
  }
}
