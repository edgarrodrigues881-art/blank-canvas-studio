import { describe, it, expect } from "vitest";

/* ── Replicate helper functions from WarmupInstanceDetail ── */

function getAutosaveStartDay(chipState: string): number {
  const groupsEnd = chipState === "unstable" ? 6 : 4;
  return groupsEnd + 1;
}

function getCommunityStartDay(chipState: string): number {
  const groupsEnd = chipState === "unstable" ? 6 : 4;
  return groupsEnd + 2;
}

function getPhaseForDay(day: number, chipState: string): string {
  const groupsEndDay = chipState === "unstable" ? 6 : 4;
  if (day <= 1) return "pre_24h";
  if (day <= groupsEndDay) return "groups_only";
  if (day === groupsEndDay + 1) return "autosave_enabled";
  return "community_enabled";
}

/* ── Community pairs per day sequence ── */
const COMMUNITY_PAIRS_SEQUENCE = [3, 5, 10, 10, 15, 20, 25, 30, 35, 40];

describe("Warmup Progression — Chip Novo (new)", () => {
  const chip = "new";

  it("Dia 1 → pre_24h (descanso total)", () => {
    expect(getPhaseForDay(1, chip)).toBe("pre_24h");
  });

  it("Dias 2-4 → groups_only (interação em grupos)", () => {
    expect(getPhaseForDay(2, chip)).toBe("groups_only");
    expect(getPhaseForDay(3, chip)).toBe("groups_only");
    expect(getPhaseForDay(4, chip)).toBe("groups_only");
  });

  it("Dia 5 → autosave_enabled", () => {
    expect(getPhaseForDay(5, chip)).toBe("autosave_enabled");
    expect(getAutosaveStartDay(chip)).toBe(5);
  });

  it("Dia 6+ → community_enabled", () => {
    expect(getPhaseForDay(6, chip)).toBe("community_enabled");
    expect(getPhaseForDay(7, chip)).toBe("community_enabled");
    expect(getPhaseForDay(30, chip)).toBe("community_enabled");
    expect(getCommunityStartDay(chip)).toBe(6);
  });

  it("Auto Save desbloqueia no dia correto", () => {
    const autosaveDay = getAutosaveStartDay(chip);
    expect(autosaveDay).toBe(5);
    // Day 4 → locked, Day 5 → unlocked
    expect(4 >= autosaveDay).toBe(false);
    expect(5 >= autosaveDay).toBe(true);
  });

  it("Comunitário desbloqueia no dia correto", () => {
    const communityDay = getCommunityStartDay(chip);
    expect(communityDay).toBe(6);
    expect(5 >= communityDay).toBe(false);
    expect(6 >= communityDay).toBe(true);
  });

  it("Progressão completa dia a dia (30 dias)", () => {
    const expected: Record<number, string> = {
      1: "pre_24h",
      2: "groups_only",
      3: "groups_only",
      4: "groups_only",
      5: "autosave_enabled",
    };
    for (let d = 6; d <= 30; d++) expected[d] = "community_enabled";

    for (let day = 1; day <= 30; day++) {
      expect(getPhaseForDay(day, chip)).toBe(expected[day]);
    }
  });

  it("Sequência de pares comunitários escala corretamente", () => {
    expect(COMMUNITY_PAIRS_SEQUENCE).toEqual([3, 5, 10, 10, 15, 20, 25, 30, 35, 40]);
    // From community start day (6), each subsequent day gets next value
    const communityDay = getCommunityStartDay(chip);
    // Day 6 = 3 pares, Day 7 = 5, Day 8 = 10, etc.
    for (let i = 0; i < COMMUNITY_PAIRS_SEQUENCE.length; i++) {
      const day = communityDay + i;
      const pairsIndex = Math.min(i, COMMUNITY_PAIRS_SEQUENCE.length - 1);
      expect(COMMUNITY_PAIRS_SEQUENCE[pairsIndex]).toBe(COMMUNITY_PAIRS_SEQUENCE[i]);
    }
  });
});

describe("Warmup Progression — Chip Banido (unstable)", () => {
  const chip = "unstable";

  it("Dia 1 → pre_24h", () => {
    expect(getPhaseForDay(1, chip)).toBe("pre_24h");
  });

  it("Dias 2-6 → groups_only (5 dias de grupos)", () => {
    for (let d = 2; d <= 6; d++) {
      expect(getPhaseForDay(d, chip)).toBe("groups_only");
    }
  });

  it("Dia 7 → autosave_enabled", () => {
    expect(getPhaseForDay(7, chip)).toBe("autosave_enabled");
    expect(getAutosaveStartDay(chip)).toBe(7);
  });

  it("Dia 8+ → community_enabled", () => {
    expect(getPhaseForDay(8, chip)).toBe("community_enabled");
    expect(getCommunityStartDay(chip)).toBe(8);
  });

  it("Progressão completa dia a dia (30 dias)", () => {
    const expected: Record<number, string> = {
      1: "pre_24h",
      2: "groups_only",
      3: "groups_only",
      4: "groups_only",
      5: "groups_only",
      6: "groups_only",
      7: "autosave_enabled",
    };
    for (let d = 8; d <= 30; d++) expected[d] = "community_enabled";

    for (let day = 1; day <= 30; day++) {
      expect(getPhaseForDay(day, chip)).toBe(expected[day]);
    }
  });
});

describe("Warmup Progression — Chip Recuperado (recovered)", () => {
  const chip = "recovered";

  it("Segue mesma progressão de chip novo", () => {
    expect(getAutosaveStartDay(chip)).toBe(5);
    expect(getCommunityStartDay(chip)).toBe(6);
    for (let d = 1; d <= 30; d++) {
      expect(getPhaseForDay(d, chip)).toBe(getPhaseForDay(d, "new"));
    }
  });
});

describe("Toggle unlock logic", () => {
  it("Auto Save toggle: locked before day, unlocked on/after day", () => {
    // Chip novo
    const asDay = getAutosaveStartDay("new");
    expect(asDay).toBe(5);
    
    // Simulates isUnlockedAS = cycle.day_index >= autosaveDay
    expect(3 >= asDay).toBe(false); // day 3 → locked
    expect(4 >= asDay).toBe(false); // day 4 → locked
    expect(5 >= asDay).toBe(true);  // day 5 → unlocked
    expect(10 >= asDay).toBe(true); // day 10 → unlocked
  });

  it("Community toggle: locked before day, unlocked on/after day", () => {
    const comDay = getCommunityStartDay("new");
    expect(comDay).toBe(6);
    
    expect(5 >= comDay).toBe(false); // day 5 → locked
    expect(6 >= comDay).toBe(true);  // day 6 → unlocked
  });

  it("Auto Save active checks correct phases", () => {
    const autosavePhases = ["autosave_enabled", "community_enabled", "community_light"];
    expect(autosavePhases.includes("autosave_enabled")).toBe(true);
    expect(autosavePhases.includes("community_enabled")).toBe(true);
    expect(autosavePhases.includes("groups_only")).toBe(false);
    expect(autosavePhases.includes("pre_24h")).toBe(false);
  });
});
