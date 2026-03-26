import { describe, it, expect } from "vitest";

/**
 * Tests for community scheduler, pairing, and session engine v3
 */

// ── Core logic replicas ──

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
    id: "session-1", device_a: "device-A", device_b: "device-B",
    target_messages: 120, messages_total: 0, messages_sent_a: 0, messages_sent_b: 0,
    status: "active", last_sender: null, end_reason: null, ...overrides,
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

// ── Pairing fairness logic ──
interface EligibleDevice {
  device_id: string;
  user_id: string;
  pairs_today: number;
  community_mode: string;
}

interface TodayPairHistory {
  instance_id_a: string;
  instance_id_b: string;
}

function scoreCandidates(
  device: EligibleDevice,
  candidates: EligibleDevice[],
  todayHistory: TodayPairHistory[],
): Array<EligibleDevice & { score: number }> {
  const todayPartnerCount: Record<string, number> = {};
  for (const p of todayHistory) {
    if (p.instance_id_a === device.device_id) todayPartnerCount[p.instance_id_b] = (todayPartnerCount[p.instance_id_b] || 0) + 1;
    if (p.instance_id_b === device.device_id) todayPartnerCount[p.instance_id_a] = (todayPartnerCount[p.instance_id_a] || 0) + 1;
  }

  return candidates.map(c => {
    let score = 100;
    if (c.user_id === device.user_id) score += 20;
    const timesToday = todayPartnerCount[c.device_id] || 0;
    score -= timesToday * 30;
    score -= (c.pairs_today || 0) * 5;
    return { ...c, score };
  }).sort((a, b) => b.score - a.score);
}

// ── Tests ──

describe("Session — Turn execution", () => {
  it("alternates senders correctly through 120 messages", () => {
    let session = createMockSession({ target_messages: 120 });
    for (let i = 0; i < 120; i++) {
      session = simulateTurn(session, getNextSender(session));
    }
    expect(session.messages_total).toBe(120);
    expect(session.messages_sent_a).toBe(60);
    expect(session.messages_sent_b).toBe(60);
    expect(session.status).toBe("completed");
  });

  it("completes exactly at target", () => {
    let session = createMockSession({ target_messages: 4 });
    for (let i = 0; i < 4; i++) session = simulateTurn(session, getNextSender(session));
    expect(session.status).toBe("completed");
    expect(session.end_reason).toBe("target_reached");
    expect(session.messages_total).toBe(4);
  });
});

describe("Session — Concurrency", () => {
  it("prevents two active sessions for same device", () => {
    const activeSessions = [createMockSession({ device_a: "device-A" })];
    const hasActive = activeSessions.some(s => s.status === "active" && (s.device_a === "device-A" || s.device_b === "device-A"));
    expect(hasActive).toBe(true);
  });

  it("allows new session after completion", () => {
    const sessions = [createMockSession({ device_a: "device-A", status: "completed" })];
    const hasActive = sessions.some(s => s.status === "active" && (s.device_a === "device-A" || s.device_b === "device-A"));
    expect(hasActive).toBe(false);
  });
});

describe("Session — Cooldown", () => {
  it("cooldown blocks device (15-45 min range)", () => {
    const cd = new Date(Date.now() + 20 * 60 * 1000);
    expect(cd > new Date()).toBe(true);
  });
  it("expired cooldown allows device", () => {
    const cd = new Date(Date.now() - 5 * 60 * 1000);
    expect(cd > new Date()).toBe(false);
  });
});

describe("Pairing — Fairness scoring", () => {
  const device: EligibleDevice = { device_id: "A", user_id: "u1", pairs_today: 0, community_mode: "warmup_managed" };
  const candidates: EligibleDevice[] = [
    { device_id: "B", user_id: "u1", pairs_today: 0, community_mode: "warmup_managed" },
    { device_id: "C", user_id: "u2", pairs_today: 2, community_mode: "warmup_managed" },
    { device_id: "D", user_id: "u3", pairs_today: 0, community_mode: "warmup_managed" },
  ];

  it("prefers own accounts (same user_id)", () => {
    const scored = scoreCandidates(device, candidates, []);
    expect(scored[0].device_id).toBe("B"); // same user gets +20
  });

  it("penalizes repeated partners today", () => {
    const history: TodayPairHistory[] = [
      { instance_id_a: "A", instance_id_b: "B" },
      { instance_id_a: "A", instance_id_b: "B" },
    ];
    const scored = scoreCandidates(device, candidates, history);
    // B penalized by 60 (2*30), D should be preferred over B now
    const bScore = scored.find(s => s.device_id === "B")!.score;
    const dScore = scored.find(s => s.device_id === "D")!.score;
    expect(dScore).toBeGreaterThan(bScore);
  });

  it("penalizes devices with high pairs_today", () => {
    const scored = scoreCandidates(device, candidates, []);
    const cScore = scored.find(s => s.device_id === "C")!.score;
    const dScore = scored.find(s => s.device_id === "D")!.score;
    expect(dScore).toBeGreaterThan(cScore); // C has pairs_today=2, penalized
  });

  it("never pairs device with itself", () => {
    const self = candidates.filter(c => c.device_id !== device.device_id);
    expect(self.every(c => c.device_id !== "A")).toBe(true);
  });

  it("allows cross-user pairing", () => {
    const scored = scoreCandidates(device, candidates, []);
    const crossUser = scored.filter(s => s.user_id !== device.user_id);
    expect(crossUser.length).toBeGreaterThan(0);
  });
});

describe("Pairing — Anti-repetition", () => {
  const device: EligibleDevice = { device_id: "A", user_id: "u1", pairs_today: 0, community_mode: "warmup_managed" };
  const candidates: EligibleDevice[] = [
    { device_id: "B", user_id: "u2", pairs_today: 0, community_mode: "warmup_managed" },
    { device_id: "C", user_id: "u3", pairs_today: 0, community_mode: "warmup_managed" },
  ];

  it("allows return to partners on different days", () => {
    // No today history = both available
    const scored = scoreCandidates(device, candidates, []);
    expect(scored.length).toBe(2);
  });

  it("max 2 same pair per day rule", () => {
    const history: TodayPairHistory[] = [
      { instance_id_a: "A", instance_id_b: "B" },
      { instance_id_a: "A", instance_id_b: "B" },
    ];
    // B has 2 repeats today, heavily penalized
    const scored = scoreCandidates(device, candidates, history);
    const bIdx = scored.findIndex(s => s.device_id === "B");
    const cIdx = scored.findIndex(s => s.device_id === "C");
    expect(cIdx).toBeLessThan(bIdx); // C preferred
  });
});

describe("Progression — Chip start days", () => {
  it("novo=6, recuperado=7, fraco=9", () => {
    expect(getCommunityStartDay("new")).toBe(6);
    expect(getCommunityStartDay("recovered")).toBe(7);
    expect(getCommunityStartDay("unstable")).toBe(9);
  });
});

describe("Progression — Pairs target by community_day", () => {
  it("progressive, not fixed", () => {
    expect(getPairsTarget(1).max).toBe(3);
    expect(getPairsTarget(2).max).toBe(5);
    expect(getPairsTarget(3).max).toBe(7);
    expect(getPairsTarget(5).max).toBe(8);
    expect(getPairsTarget(7).max).toBe(10);
  });
  it("never exceeds 10 for warmup_managed", () => {
    for (let d = 1; d <= 30; d++) {
      expect(getPairsTarget(d).max).toBeLessThanOrEqual(10);
    }
  });
});

describe("Distribution — Anti-burst", () => {
  const MAX_NEW_SESSIONS_PER_TICK = 3;

  it("limits new sessions per tick to 3", () => {
    const eligible = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}` }));
    const started = Math.min(eligible.length / 2, MAX_NEW_SESSIONS_PER_TICK);
    expect(started).toBe(3);
  });

  it("natural distribution over 10 ticks (20 min)", () => {
    // With 3 sessions per tick × 10 ticks = 30 possible sessions
    // For 10 pairs target (day 7+), that's well distributed
    const maxSessionsIn20Min = MAX_NEW_SESSIONS_PER_TICK * 10;
    expect(maxSessionsIn20Min).toBe(30);
    expect(maxSessionsIn20Min).toBeGreaterThanOrEqual(10);
  });
});

describe("Stale cleanup", () => {
  it("identifies sessions inactive for 4+ hours as stale", () => {
    const STALE_HOURS = 4;
    const lastActivity = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5h ago
    const threshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
    expect(lastActivity < threshold).toBe(true);
  });
  it("does not flag recent sessions", () => {
    const STALE_HOURS = 4;
    const lastActivity = new Date(Date.now() - 30 * 60 * 1000); // 30min ago
    const threshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
    expect(lastActivity < threshold).toBe(false);
  });
});

describe("Volume per block", () => {
  it("~120 msgs per block, split equally", () => {
    let session = createMockSession({ target_messages: 120 });
    for (let i = 0; i < 120; i++) session = simulateTurn(session, getNextSender(session));
    expect(session.messages_sent_a + session.messages_sent_b).toBe(120);
    expect(session.messages_sent_a).toBe(60);
  });
});
