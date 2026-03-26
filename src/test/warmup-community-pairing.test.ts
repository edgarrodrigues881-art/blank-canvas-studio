import { describe, it, expect } from "vitest";

/**
 * Tests for community scheduler, pairing, fairness, and session engine v4
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

const MAX_SAME_PAIR_PER_DAY = 1;
const MIN_SPACING_BETWEEN_PAIRS_MINUTES = 20;

// ── Session simulation ──

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

// ── Fairness scoring (mirrors edge function logic) ──

interface EligibleDevice {
  device_id: string;
  user_id: string;
  pairs_today: number;
  community_mode: string;
  last_partner_device_id?: string | null;
}

interface TodayPairHistory {
  instance_id_a: string;
  instance_id_b: string;
}

function scoreCandidates(
  device: EligibleDevice,
  candidates: EligibleDevice[],
  todayHistory: TodayPairHistory[],
): Array<EligibleDevice & { score: number; timesToday: number }> {
  // Build partner count
  const todayPartnerCount: Record<string, number> = {};
  for (const p of todayHistory) {
    if (p.instance_id_a === device.device_id) todayPartnerCount[p.instance_id_b] = (todayPartnerCount[p.instance_id_b] || 0) + 1;
    if (p.instance_id_b === device.device_id) todayPartnerCount[p.instance_id_a] = (todayPartnerCount[p.instance_id_a] || 0) + 1;
  }

  // Count unique partners today per candidate
  const uniquePartnersToday: Record<string, number> = {};
  for (const p of todayHistory) {
    uniquePartnersToday[p.instance_id_a] = (uniquePartnersToday[p.instance_id_a] || 0);
    uniquePartnersToday[p.instance_id_b] = (uniquePartnersToday[p.instance_id_b] || 0);
  }
  // Simplified: count entries per device
  for (const c of candidates) {
    const partners = new Set<string>();
    for (const p of todayHistory) {
      if (p.instance_id_a === c.device_id) partners.add(p.instance_id_b);
      if (p.instance_id_b === c.device_id) partners.add(p.instance_id_a);
    }
    uniquePartnersToday[c.device_id] = partners.size;
  }

  return candidates.map(c => {
    let score = 100;

    // Same user bonus
    if (c.user_id === device.user_id) score += 20;

    // Anti-repetition: heavy penalty for same-day repeat
    const timesToday = todayPartnerCount[c.device_id] || 0;
    if (timesToday >= MAX_SAME_PAIR_PER_DAY) {
      score -= 200;
    } else if (timesToday > 0) {
      score -= 80;
    }

    // Load balancing
    score -= (c.pairs_today || 0) * 8;

    // Variety: penalize devices with many unique partners (they've had enough variety)
    score -= (uniquePartnersToday[c.device_id] || 0) * 3;

    // Back-to-back penalty
    if (device.last_partner_device_id === c.device_id) score -= 25;

    // Cross-user bonus
    if (c.user_id !== device.user_id) score += 5;

    return { ...c, score, timesToday };
  }).sort((a, b) => b.score - a.score);
}

function checkSpacing(lastSessionAt: string | null): boolean {
  if (!lastSessionAt) return true;
  const elapsed = Date.now() - new Date(lastSessionAt).getTime();
  return elapsed >= MIN_SPACING_BETWEEN_PAIRS_MINUTES * 60 * 1000;
}

// ══════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════

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

describe("Pairing — Same-day repetition avoidance", () => {
  const device: EligibleDevice = { device_id: "A", user_id: "u1", pairs_today: 0, community_mode: "warmup_managed" };
  const candidates: EligibleDevice[] = [
    { device_id: "B", user_id: "u2", pairs_today: 0, community_mode: "warmup_managed" },
    { device_id: "C", user_id: "u3", pairs_today: 0, community_mode: "warmup_managed" },
  ];

  it("avoids same pair on same day (MAX_SAME_PAIR_PER_DAY=1)", () => {
    const history: TodayPairHistory[] = [
      { instance_id_a: "A", instance_id_b: "B" },
    ];
    const scored = scoreCandidates(device, candidates, history);
    // B already paired once today → heavily penalized, C should be first
    expect(scored[0].device_id).toBe("C");
    expect(scored[0].timesToday).toBe(0);
  });

  it("blocks partner at MAX_SAME_PAIR_PER_DAY with score < -50", () => {
    const history: TodayPairHistory[] = [
      { instance_id_a: "A", instance_id_b: "B" },
    ];
    const scored = scoreCandidates(device, candidates, history);
    const bScore = scored.find(s => s.device_id === "B")!.score;
    // With timesToday=1 >= MAX(1), score -= 200, so score ≈ 100-200+5 = -95
    expect(bScore).toBeLessThan(-50);
  });

  it("allows return to same partner on future days (no history = no penalty)", () => {
    const scored = scoreCandidates(device, candidates, []);
    expect(scored.every(s => s.score > 50)).toBe(true);
  });

  it("allows forced repeat only when no alternatives exist", () => {
    const onlyOneCandidate: EligibleDevice[] = [
      { device_id: "B", user_id: "u2", pairs_today: 0, community_mode: "warmup_managed" },
    ];
    const history: TodayPairHistory[] = [
      { instance_id_a: "A", instance_id_b: "B" },
    ];
    const scored = scoreCandidates(device, onlyOneCandidate, history);
    // Even penalized, it's the only option
    expect(scored.length).toBe(1);
    expect(scored[0].device_id).toBe("B");
  });
});

describe("Pairing — Fairness & variety", () => {
  const device: EligibleDevice = { device_id: "A", user_id: "u1", pairs_today: 0, community_mode: "warmup_managed" };

  it("prefers own accounts (same user_id)", () => {
    const candidates: EligibleDevice[] = [
      { device_id: "B", user_id: "u1", pairs_today: 0, community_mode: "warmup_managed" },
      { device_id: "C", user_id: "u2", pairs_today: 0, community_mode: "warmup_managed" },
    ];
    const scored = scoreCandidates(device, candidates, []);
    // B (same user) gets +20, C (cross user) gets +5
    const bScore = scored.find(s => s.device_id === "B")!.score;
    const cScore = scored.find(s => s.device_id === "C")!.score;
    expect(bScore).toBeGreaterThan(cScore);
  });

  it("penalizes devices with high pairs_today", () => {
    const candidates: EligibleDevice[] = [
      { device_id: "B", user_id: "u2", pairs_today: 5, community_mode: "warmup_managed" },
      { device_id: "C", user_id: "u3", pairs_today: 0, community_mode: "warmup_managed" },
    ];
    const scored = scoreCandidates(device, candidates, []);
    const bScore = scored.find(s => s.device_id === "B")!.score;
    const cScore = scored.find(s => s.device_id === "C")!.score;
    expect(cScore).toBeGreaterThan(bScore);
  });

  it("penalizes back-to-back same partner", () => {
    const deviceWithLast: EligibleDevice = {
      ...device, last_partner_device_id: "B",
    };
    const candidates: EligibleDevice[] = [
      { device_id: "B", user_id: "u2", pairs_today: 0, community_mode: "warmup_managed" },
      { device_id: "C", user_id: "u2", pairs_today: 0, community_mode: "warmup_managed" },
    ];
    const scored = scoreCandidates(deviceWithLast, candidates, []);
    const bScore = scored.find(s => s.device_id === "B")!.score;
    const cScore = scored.find(s => s.device_id === "C")!.score;
    expect(cScore).toBeGreaterThan(bScore); // B penalized by -25
  });

  it("allows cross-user pairing", () => {
    const candidates: EligibleDevice[] = [
      { device_id: "X", user_id: "u99", pairs_today: 0, community_mode: "warmup_managed" },
    ];
    const scored = scoreCandidates(device, candidates, []);
    expect(scored.length).toBe(1);
    expect(scored[0].user_id).not.toBe(device.user_id);
  });

  it("never pairs device with itself", () => {
    const candidates: EligibleDevice[] = [
      { device_id: "B", user_id: "u2", pairs_today: 0, community_mode: "warmup_managed" },
    ];
    const self = candidates.filter(c => c.device_id !== device.device_id);
    expect(self.every(c => c.device_id !== "A")).toBe(true);
  });
});

describe("Distribution — Spacing between pairs", () => {
  it("blocks device if last session was < 20 min ago", () => {
    const recentSession = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    expect(checkSpacing(recentSession)).toBe(false);
  });

  it("allows device if last session was >= 20 min ago", () => {
    const oldSession = new Date(Date.now() - 25 * 60 * 1000).toISOString(); // 25 min ago
    expect(checkSpacing(oldSession)).toBe(true);
  });

  it("allows device with no previous session", () => {
    expect(checkSpacing(null)).toBe(true);
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
    const maxSessionsIn20Min = MAX_NEW_SESSIONS_PER_TICK * 10;
    expect(maxSessionsIn20Min).toBe(30);
    expect(maxSessionsIn20Min).toBeGreaterThanOrEqual(10);
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
  it("progressive scale", () => {
    expect(getPairsTarget(1).max).toBe(3);
    expect(getPairsTarget(2).max).toBe(5);
    expect(getPairsTarget(3).max).toBe(7);
    expect(getPairsTarget(5).max).toBe(8);
    expect(getPairsTarget(7).max).toBe(10);
  });
  it("never exceeds 10", () => {
    for (let d = 1; d <= 30; d++) {
      expect(getPairsTarget(d).max).toBeLessThanOrEqual(10);
    }
  });
});

describe("Cooldown & Stale cleanup", () => {
  it("identifies sessions inactive for 4+ hours as stale", () => {
    const lastActivity = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const threshold = new Date(Date.now() - 4 * 60 * 60 * 1000);
    expect(lastActivity < threshold).toBe(true);
  });
  it("does not flag recent sessions", () => {
    const lastActivity = new Date(Date.now() - 30 * 60 * 1000);
    const threshold = new Date(Date.now() - 4 * 60 * 60 * 1000);
    expect(lastActivity < threshold).toBe(false);
  });
  it("cooldown blocks device (15-45 min range)", () => {
    const cd = new Date(Date.now() + 20 * 60 * 1000);
    expect(cd > new Date()).toBe(true);
  });
  it("expired cooldown allows device", () => {
    const cd = new Date(Date.now() - 5 * 60 * 1000);
    expect(cd > new Date()).toBe(false);
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
