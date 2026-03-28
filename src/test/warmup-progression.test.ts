import { describe, it, expect } from "vitest";

/* ── Replicate helper functions from WarmupInstanceDetail ── */

function getAutosaveStartDay(chipState: string): number {
  if (chipState === "unstable") return 7;
  if (chipState === "recovered") return 6;
  return 5; // new
}

function getCommunityStartDay(chipState: string): number {
  if (chipState === "unstable") return 9;
  if (chipState === "recovered") return 7;
  return 6; // new
}

function getPhaseForDay(day: number, chipState: string): string {
  if (day <= 1) return "pre_24h";
  const groupsEndDay = chipState === "unstable" ? 6 : chipState === "recovered" ? 5 : 4;
  if (day <= groupsEndDay) return "groups_only";
  const autosaveDay = getAutosaveStartDay(chipState);
  const communityDay = getCommunityStartDay(chipState);
  if (day < communityDay) return "autosave_enabled";
  return "community_enabled";
}

function getAutosaveContacts(dayIndex: number, chipState: string): number {
  const autosaveStart = getAutosaveStartDay(chipState);
  const daysSince = dayIndex - autosaveStart;
  if (daysSince < 0) return 0;

  if (chipState === "new") {
    if (daysSince <= 1) return 1;
    if (daysSince <= 3) return 2;
    if (daysSince <= 5) return 3;
    if (daysSince <= 10) return 4;
    return 5;
  }
  if (chipState === "recovered") {
    if (daysSince === 0) return 1;
    if (daysSince <= 2) return 2;
    if (daysSince <= 4) return 3;
    if (daysSince <= 9) return 4;
    return 5;
  }
  // unstable
  if (daysSince === 0) return 1;
  if (daysSince === 1) return 2;
  if (daysSince <= 3) return 3;
  if (daysSince <= 8) return 4;
  return 5;
}

function getCommunityPairs(dayIndex: number, chipState: string): number {
  const communityStart = getCommunityStartDay(chipState);
  if (dayIndex < communityStart) return 0;
  const cd = dayIndex - communityStart + 1;
  if (cd <= 1) return 1;
  if (cd === 2) return 2;
  if (cd === 3) return 3;
  if (cd === 4) return 4;
  return 5;
}

describe("Warmup Progression — Chip Novo (new)", () => {
  const chip = "new";

  it("Dia 1 → pre_24h (descanso total)", () => {
    expect(getPhaseForDay(1, chip)).toBe("pre_24h");
  });

  it("Dias 2-4 → groups_only", () => {
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
    expect(getCommunityStartDay(chip)).toBe(6);
  });

  it("Auto Save contacts escalam corretamente", () => {
    expect(getAutosaveContacts(4, chip)).toBe(0);
    expect(getAutosaveContacts(5, chip)).toBe(1);  // day 5: 1c
    expect(getAutosaveContacts(6, chip)).toBe(1);  // day 6: 1c
    expect(getAutosaveContacts(7, chip)).toBe(2);  // day 7: 2c
    expect(getAutosaveContacts(8, chip)).toBe(2);  // day 8: 2c
    expect(getAutosaveContacts(9, chip)).toBe(3);  // day 9: 3c
    expect(getAutosaveContacts(10, chip)).toBe(3); // day 10: 3c
    expect(getAutosaveContacts(11, chip)).toBe(4); // day 11: 4c
    expect(getAutosaveContacts(15, chip)).toBe(4); // day 15: 4c
    expect(getAutosaveContacts(16, chip)).toBe(5); // day 16: 5c
    expect(getAutosaveContacts(30, chip)).toBe(5); // day 30: 5c
  });

  it("Community pairs escalam corretamente", () => {
    expect(getCommunityPairs(5, chip)).toBe(0);
    expect(getCommunityPairs(6, chip)).toBe(1);
    expect(getCommunityPairs(7, chip)).toBe(2);
    expect(getCommunityPairs(8, chip)).toBe(3);
    expect(getCommunityPairs(9, chip)).toBe(4);
    expect(getCommunityPairs(10, chip)).toBe(5);
    expect(getCommunityPairs(30, chip)).toBe(5);
  });
});

describe("Warmup Progression — Chip Recuperado (recovered)", () => {
  const chip = "recovered";

  it("Dias 2-5 → groups_only", () => {
    for (let d = 2; d <= 5; d++) {
      expect(getPhaseForDay(d, chip)).toBe("groups_only");
    }
  });

  it("Dia 6 → autosave_enabled", () => {
    expect(getPhaseForDay(6, chip)).toBe("autosave_enabled");
    expect(getAutosaveStartDay(chip)).toBe(6);
  });

  it("Dia 7+ → community_enabled", () => {
    expect(getPhaseForDay(7, chip)).toBe("community_enabled");
    expect(getCommunityStartDay(chip)).toBe(7);
  });

  it("Auto Save contacts escalam corretamente", () => {
    expect(getAutosaveContacts(5, chip)).toBe(0);
    expect(getAutosaveContacts(6, chip)).toBe(1);
    expect(getAutosaveContacts(7, chip)).toBe(2);
    expect(getAutosaveContacts(8, chip)).toBe(2);
    expect(getAutosaveContacts(9, chip)).toBe(3);
    expect(getAutosaveContacts(10, chip)).toBe(3);
    expect(getAutosaveContacts(11, chip)).toBe(4);
    expect(getAutosaveContacts(15, chip)).toBe(4);
    expect(getAutosaveContacts(16, chip)).toBe(5);
  });

  it("Community pairs escalam corretamente", () => {
    expect(getCommunityPairs(6, chip)).toBe(0);
    expect(getCommunityPairs(7, chip)).toBe(1);
    expect(getCommunityPairs(8, chip)).toBe(2);
    expect(getCommunityPairs(9, chip)).toBe(3);
    expect(getCommunityPairs(10, chip)).toBe(4);
    expect(getCommunityPairs(11, chip)).toBe(5);
    expect(getCommunityPairs(30, chip)).toBe(5);
  });
});

describe("Warmup Progression — Chip Fraco (unstable)", () => {
  const chip = "unstable";

  it("Dias 2-6 → groups_only", () => {
    for (let d = 2; d <= 6; d++) {
      expect(getPhaseForDay(d, chip)).toBe("groups_only");
    }
  });

  it("Dia 7-8 → autosave_enabled (sem comunitário ainda)", () => {
    expect(getPhaseForDay(7, chip)).toBe("autosave_enabled");
    expect(getPhaseForDay(8, chip)).toBe("autosave_enabled");
    expect(getAutosaveStartDay(chip)).toBe(7);
  });

  it("Dia 9+ → community_enabled", () => {
    expect(getPhaseForDay(9, chip)).toBe("community_enabled");
    expect(getCommunityStartDay(chip)).toBe(9);
  });

  it("Auto Save contacts escalam corretamente (5 msgs/contato)", () => {
    expect(getAutosaveContacts(6, chip)).toBe(0);
    expect(getAutosaveContacts(7, chip)).toBe(1);
    expect(getAutosaveContacts(8, chip)).toBe(2);
    expect(getAutosaveContacts(9, chip)).toBe(3);
    expect(getAutosaveContacts(10, chip)).toBe(3);
    expect(getAutosaveContacts(11, chip)).toBe(4);
    expect(getAutosaveContacts(15, chip)).toBe(4);
    expect(getAutosaveContacts(16, chip)).toBe(5);
  });

  it("Community pairs escalam corretamente", () => {
    expect(getCommunityPairs(8, chip)).toBe(0);
    expect(getCommunityPairs(9, chip)).toBe(1);
    expect(getCommunityPairs(10, chip)).toBe(2);
    expect(getCommunityPairs(11, chip)).toBe(3);
    expect(getCommunityPairs(12, chip)).toBe(4);
    expect(getCommunityPairs(13, chip)).toBe(5);
    expect(getCommunityPairs(30, chip)).toBe(5);
  });
});

describe("Toggle unlock logic", () => {
  it("Auto Save toggle: locked before day, unlocked on/after day", () => {
    expect(3 >= getAutosaveStartDay("new")).toBe(false);
    expect(5 >= getAutosaveStartDay("new")).toBe(true);
  });

  it("Community toggle: locked before day, unlocked on/after day", () => {
    expect(5 >= getCommunityStartDay("new")).toBe(false);
    expect(6 >= getCommunityStartDay("new")).toBe(true);
    expect(8 >= getCommunityStartDay("unstable")).toBe(false);
    expect(9 >= getCommunityStartDay("unstable")).toBe(true);
  });
});
