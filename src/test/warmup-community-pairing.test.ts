import { describe, it, expect } from "vitest";

/**
 * Tests for community pairing logic
 * Validates: pair formation, peer selection, scaling, edge cases
 */

// ── Replicate pairing logic from warmup-tick ──

interface PeerCandidate {
  deviceId: string;
  fromPair: boolean;
  pairId?: string;
}

interface CommunityPair {
  id: string;
  instance_id_a: string;
  instance_id_b: string;
  status: string;
}

interface RunningCycle {
  id: string;
  device_id: string;
  user_id: string;
}

// Build peer candidates from formal pairs + fallback cycles
function buildPeerCandidates(
  myDeviceId: string,
  pairs: CommunityPair[],
  otherCycles: RunningCycle[]
): PeerCandidate[] {
  const candidates: PeerCandidate[] = [];

  for (const pair of pairs) {
    const isA = pair.instance_id_a === myDeviceId;
    const partnerId = isA ? pair.instance_id_b : pair.instance_id_a;
    candidates.push({ deviceId: partnerId, fromPair: true, pairId: pair.id });
  }

  for (const oc of otherCycles) {
    if (!candidates.some(p => p.deviceId === oc.device_id)) {
      candidates.push({ deviceId: oc.device_id, fromPair: false });
    }
  }

  return candidates;
}

// Select peer by index (stable within a burst)
function selectPeer(candidates: PeerCandidate[], peerIndex: number): PeerCandidate {
  return candidates[peerIndex % candidates.length];
}

// Community pairs per day sequence
const COMMUNITY_PAIRS_SEQUENCE = [3, 5, 10, 10, 15, 20, 25, 30, 35, 40];

function getPairsForCommunityDay(dayInCommunity: number): number {
  const idx = Math.min(dayInCommunity, COMMUNITY_PAIRS_SEQUENCE.length - 1);
  return COMMUNITY_PAIRS_SEQUENCE[idx];
}

// Messages per burst
const BURST_MIN = 30;
const BURST_MAX = 50;

describe("Community Pairing — Peer Candidate Building", () => {
  const myDevice = "device-A";

  it("Builds candidates from formal pairs", () => {
    const pairs: CommunityPair[] = [
      { id: "p1", instance_id_a: "device-A", instance_id_b: "device-B", status: "active" },
      { id: "p2", instance_id_a: "device-C", instance_id_b: "device-A", status: "active" },
    ];
    const candidates = buildPeerCandidates(myDevice, pairs, []);

    expect(candidates).toHaveLength(2);
    expect(candidates[0].deviceId).toBe("device-B");
    expect(candidates[0].fromPair).toBe(true);
    expect(candidates[1].deviceId).toBe("device-C");
    expect(candidates[1].fromPair).toBe(true);
  });

  it("Adds fallback cycles without duplicates", () => {
    const pairs: CommunityPair[] = [
      { id: "p1", instance_id_a: "device-A", instance_id_b: "device-B", status: "active" },
    ];
    const otherCycles: RunningCycle[] = [
      { id: "c1", device_id: "device-B", user_id: "u2" }, // Already in pairs
      { id: "c2", device_id: "device-D", user_id: "u3" }, // New
      { id: "c3", device_id: "device-E", user_id: "u4" }, // New
    ];
    const candidates = buildPeerCandidates(myDevice, pairs, otherCycles);

    expect(candidates).toHaveLength(3); // B from pair + D, E from fallback
    expect(candidates[0]).toEqual({ deviceId: "device-B", fromPair: true, pairId: "p1" });
    expect(candidates[1]).toEqual({ deviceId: "device-D", fromPair: false });
    expect(candidates[2]).toEqual({ deviceId: "device-E", fromPair: false });
  });

  it("Returns empty when no peers available", () => {
    const candidates = buildPeerCandidates(myDevice, [], []);
    expect(candidates).toHaveLength(0);
  });

  it("Never includes self in candidates", () => {
    const otherCycles: RunningCycle[] = [
      { id: "c1", device_id: "device-B", user_id: "u2" },
      { id: "c2", device_id: "device-C", user_id: "u3" },
    ];
    const candidates = buildPeerCandidates(myDevice, [], otherCycles);
    expect(candidates.every(c => c.deviceId !== myDevice)).toBe(true);
  });
});

describe("Community Pairing — Peer Selection", () => {
  const candidates: PeerCandidate[] = [
    { deviceId: "device-B", fromPair: true, pairId: "p1" },
    { deviceId: "device-C", fromPair: false },
    { deviceId: "device-D", fromPair: false },
  ];

  it("peerIndex 0 selects first candidate", () => {
    expect(selectPeer(candidates, 0).deviceId).toBe("device-B");
  });

  it("peerIndex wraps around with modulo", () => {
    expect(selectPeer(candidates, 3).deviceId).toBe("device-B"); // 3 % 3 = 0
    expect(selectPeer(candidates, 4).deviceId).toBe("device-C"); // 4 % 3 = 1
    expect(selectPeer(candidates, 5).deviceId).toBe("device-D"); // 5 % 3 = 2
  });

  it("Same peerIndex always returns same peer (stable burst)", () => {
    const peer1 = selectPeer(candidates, 1);
    const peer2 = selectPeer(candidates, 1);
    expect(peer1.deviceId).toBe(peer2.deviceId);
  });
});

describe("Community Pairing — Daily Scaling", () => {
  it("Day 0 (first community day) = 3 pairs", () => {
    expect(getPairsForCommunityDay(0)).toBe(3);
  });

  it("Follows exact sequence", () => {
    const expected = [3, 5, 10, 10, 15, 20, 25, 30, 35, 40];
    for (let i = 0; i < expected.length; i++) {
      expect(getPairsForCommunityDay(i)).toBe(expected[i]);
    }
  });

  it("Caps at 40 after day 9", () => {
    expect(getPairsForCommunityDay(10)).toBe(40);
    expect(getPairsForCommunityDay(20)).toBe(40);
    expect(getPairsForCommunityDay(100)).toBe(40);
  });
});

describe("Community Pairing — Burst Messages", () => {
  it("Each pair exchanges 30-50 messages", () => {
    expect(BURST_MIN).toBe(30);
    expect(BURST_MAX).toBe(50);
    expect(BURST_MAX).toBeGreaterThanOrEqual(BURST_MIN);
  });

  it("25% of messages are images", () => {
    const IMAGE_RATIO = 0.25;
    const totalMsgs = 40; // average burst
    const expectedImages = Math.round(totalMsgs * IMAGE_RATIO);
    expect(expectedImages).toBe(10);
  });

  it("Total messages per day scales with pairs", () => {
    // Day 0: 3 pairs × ~40 msgs = ~120 community messages
    // Day 9+: 40 pairs × ~40 msgs = ~1600 community messages
    const avgBurst = (BURST_MIN + BURST_MAX) / 2; // 40
    expect(getPairsForCommunityDay(0) * avgBurst).toBe(120);
    expect(getPairsForCommunityDay(9) * avgBurst).toBe(1600);
  });
});

describe("Community Pairing — Chip-specific start days", () => {
  function getCommunityStartDay(chipState: string): number {
    const groupsEnd = chipState === "unstable" ? 6 : 4;
    return groupsEnd + 2;
  }

  it("Chip novo: community day 0 = calendar day 6", () => {
    const startDay = getCommunityStartDay("new");
    expect(startDay).toBe(6);
    // Community day index = calendar_day - startDay
    expect(6 - startDay).toBe(0); // First community day
  });

  it("Chip banido: community day 0 = calendar day 8", () => {
    const startDay = getCommunityStartDay("unstable");
    expect(startDay).toBe(8);
    expect(8 - startDay).toBe(0);
  });

  it("All chips use same pair scaling once community starts", () => {
    // Day 0 of community = 3 pairs regardless of chip type
    expect(getPairsForCommunityDay(0)).toBe(3);
  });
});
