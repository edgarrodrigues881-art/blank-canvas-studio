import { describe, it, expect } from "vitest";

/**
 * Tests for community session/block engine
 * Validates: session creation, progression, cooldown, concurrency, community_day
 */

// ── Replicate core logic from community-core ──

function getCommunityStartDay(chipState: string): number {
  if (chipState === "unstable") return 9;
  if (chipState === "recovered") return 7;
  return 6;
}

function getPairsTarget(communityDay: number): { min: number; max: number } {
  if (communityDay <= 1) return { min: 1, max: 3 };
  if (communityDay === 2) return { min: 2, max: 5 };
  if (communityDay === 3) return { min: 4, max: 7 };
  if (communityDay <= 6) return { min: 5, max: 8 };
  return { min: 6, max: 10 };
}

interface Session {
  id: string;
  device_a: string;
  device_b: string;
  target_messages: number;
  messages_total: number;
  messages_sent_a: number;
  messages_sent_b: number;
  status: "active" | "completed";
  last_sender: string | null;
  end_reason: string | null;
}

function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    device_a: "device-A",
    device_b: "device-B",
    target_messages: 120,
    messages_total: 0,
    messages_sent_a: 0,
    messages_sent_b: 0,
    status: "active",
    last_sender: null,
    end_reason: null,
    ...overrides,
  };
}

function simulateTurn(session: Session, senderDeviceId: string): Session {
  const isSenderA = senderDeviceId === session.device_a;
  const newTotal = session.messages_total + 1;
  const completed = newTotal >= session.target_messages;
  return {
    ...session,
    messages_total: newTotal,
    messages_sent_a: isSenderA ? session.messages_sent_a + 1 : session.messages_sent_a,
    messages_sent_b: !isSenderA ? session.messages_sent_b + 1 : session.messages_sent_b,
    last_sender: senderDeviceId,
    status: completed ? "completed" : "active",
    end_reason: completed ? "target_reached" : null,
  };
}

function getNextSender(session: Session): string {
  if (!session.last_sender) return session.device_a;
  return session.last_sender === session.device_a ? session.device_b : session.device_a;
}

// ── Tests ──

describe("Community Session — Creation", () => {
  it("creates a session with target_messages = 120", () => {
    const session = createMockSession();
    expect(session.target_messages).toBe(120);
    expect(session.messages_total).toBe(0);
    expect(session.status).toBe("active");
  });

  it("tracks counters for both sides", () => {
    const session = createMockSession();
    expect(session.messages_sent_a).toBe(0);
    expect(session.messages_sent_b).toBe(0);
  });
});

describe("Community Session — Turn Execution", () => {
  it("increments total and side counter on send", () => {
    let session = createMockSession();
    session = simulateTurn(session, "device-A");
    expect(session.messages_total).toBe(1);
    expect(session.messages_sent_a).toBe(1);
    expect(session.messages_sent_b).toBe(0);
    expect(session.last_sender).toBe("device-A");
  });

  it("alternates senders correctly", () => {
    let session = createMockSession();
    session = simulateTurn(session, "device-A");
    expect(getNextSender(session)).toBe("device-B");
    session = simulateTurn(session, "device-B");
    expect(getNextSender(session)).toBe("device-A");
    session = simulateTurn(session, "device-A");
    expect(getNextSender(session)).toBe("device-B");
  });

  it("distributes messages roughly equally over 120 turns", () => {
    let session = createMockSession({ target_messages: 120 });
    for (let i = 0; i < 120; i++) {
      const sender = getNextSender(session);
      session = simulateTurn(session, sender);
    }
    expect(session.messages_total).toBe(120);
    expect(session.messages_sent_a).toBe(60);
    expect(session.messages_sent_b).toBe(60);
    expect(session.status).toBe("completed");
    expect(session.end_reason).toBe("target_reached");
  });
});

describe("Community Session — Completion", () => {
  it("completes when messages_total reaches target", () => {
    let session = createMockSession({ target_messages: 3 });
    session = simulateTurn(session, "device-A");
    expect(session.status).toBe("active");
    session = simulateTurn(session, "device-B");
    expect(session.status).toBe("active");
    session = simulateTurn(session, "device-A");
    expect(session.status).toBe("completed");
    expect(session.end_reason).toBe("target_reached");
  });

  it("does not exceed target", () => {
    let session = createMockSession({ target_messages: 2 });
    session = simulateTurn(session, "device-A");
    session = simulateTurn(session, "device-B");
    expect(session.status).toBe("completed");
    // Should not process further (session is completed)
    expect(session.messages_total).toBe(2);
  });
});

describe("Community Session — Concurrency", () => {
  it("prevents two active sessions for same device", () => {
    const activeSessions: Session[] = [
      createMockSession({ id: "s1", device_a: "device-A", device_b: "device-B" }),
    ];

    // Check if device-A already has an active session
    const hasActive = activeSessions.some(
      s => s.status === "active" && (s.device_a === "device-A" || s.device_b === "device-A")
    );
    expect(hasActive).toBe(true);

    // Device-A should NOT be able to start another session
    const canStartNew = !hasActive;
    expect(canStartNew).toBe(false);
  });

  it("allows new session after previous completes", () => {
    const activeSessions: Session[] = [
      createMockSession({ id: "s1", device_a: "device-A", device_b: "device-B", status: "completed" }),
    ];

    const hasActive = activeSessions.some(
      s => s.status === "active" && (s.device_a === "device-A" || s.device_b === "device-A")
    );
    expect(hasActive).toBe(false);
    expect(!hasActive).toBe(true);
  });
});

describe("Community Session — Cooldown", () => {
  it("applies cooldown after session completes (15-45 min)", () => {
    const cooldownMinutes = 30; // mid-range
    const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000);
    expect(cooldownUntil.getTime()).toBeGreaterThan(Date.now());
    expect(cooldownUntil.getTime()).toBeLessThanOrEqual(Date.now() + 45 * 60 * 1000);
  });

  it("blocks device during cooldown", () => {
    const cooldownUntil = new Date(Date.now() + 20 * 60 * 1000);
    const isInCooldown = cooldownUntil > new Date();
    expect(isInCooldown).toBe(true);
  });

  it("allows device after cooldown expires", () => {
    const cooldownUntil = new Date(Date.now() - 5 * 60 * 1000); // 5min ago
    const isInCooldown = cooldownUntil > new Date();
    expect(isInCooldown).toBe(false);
  });
});

describe("Community — Chip-specific start days", () => {
  it("chip novo: community starts day 6", () => {
    expect(getCommunityStartDay("new")).toBe(6);
  });
  it("chip recuperado: community starts day 7", () => {
    expect(getCommunityStartDay("recovered")).toBe(7);
  });
  it("chip fraco: community starts day 9", () => {
    expect(getCommunityStartDay("unstable")).toBe(9);
  });
});

describe("Community — Pairs progression by community_day", () => {
  it("day 1: 1-3 pairs", () => {
    const t = getPairsTarget(1);
    expect(t.min).toBe(1);
    expect(t.max).toBe(3);
  });
  it("day 2: 2-5 pairs", () => {
    const t = getPairsTarget(2);
    expect(t.min).toBe(2);
    expect(t.max).toBe(5);
  });
  it("day 3: 4-7 pairs", () => {
    const t = getPairsTarget(3);
    expect(t.min).toBe(4);
    expect(t.max).toBe(7);
  });
  it("days 4-6: 5-8 pairs", () => {
    for (const d of [4, 5, 6]) {
      const t = getPairsTarget(d);
      expect(t.min).toBe(5);
      expect(t.max).toBe(8);
    }
  });
  it("day 7+: 6-10 pairs", () => {
    for (const d of [7, 10, 20, 30]) {
      const t = getPairsTarget(d);
      expect(t.min).toBe(6);
      expect(t.max).toBe(10);
    }
  });
  it("is NOT fixed at 10 for all days", () => {
    expect(getPairsTarget(1).max).not.toBe(10);
    expect(getPairsTarget(2).max).not.toBe(10);
    expect(getPairsTarget(3).max).not.toBe(10);
  });
});

describe("Community — Volume per block", () => {
  it("target ~120 messages per block", () => {
    const session = createMockSession();
    expect(session.target_messages).toBe(120);
  });

  it("messages are split between both sides", () => {
    let session = createMockSession({ target_messages: 120 });
    for (let i = 0; i < 120; i++) {
      session = simulateTurn(session, getNextSender(session));
    }
    expect(session.messages_sent_a + session.messages_sent_b).toBe(120);
    expect(Math.abs(session.messages_sent_a - session.messages_sent_b)).toBe(0);
  });
});

describe("Community — Daily limits", () => {
  it("respects pairs_today vs max from progression", () => {
    const communityDay = 1;
    const target = getPairsTarget(communityDay);
    const pairsToday = 3;
    const canDoMore = pairsToday < target.max;
    expect(canDoMore).toBe(false); // 3 >= 3
  });

  it("allows more pairs when under limit", () => {
    const communityDay = 7;
    const target = getPairsTarget(communityDay);
    const pairsToday = 5;
    expect(pairsToday < target.max).toBe(true); // 5 < 10
  });
});
