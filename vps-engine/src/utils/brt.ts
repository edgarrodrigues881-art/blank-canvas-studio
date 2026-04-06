// ══════════════════════════════════════════════════════════
// VPS Engine — BRT timezone helpers
// ══════════════════════════════════════════════════════════

export function getBrtNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

export function getBrtHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

export function getBrtTodayAt(hour: number, minute = 0): Date {
  const brtDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(new Date());
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "GMT-3";
  const offsetMatch = tzPart.match(/GMT([+-]?\d+)/);
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : -3;

  const result = new Date();
  const [y, m, d] = brtDateStr.split("-").map(Number);
  result.setUTCFullYear(y, m - 1, d);
  result.setUTCHours(hour - offsetHours, minute, 0, 0);
  return result;
}

export function isWithinOperatingWindow(startHour = 7, endHour = 19): boolean {
  const now = new Date();
  return now.getTime() >= getBrtTodayAt(startHour).getTime() && now.getTime() < getBrtTodayAt(endHour).getTime();
}

export function getBrtDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getBrtDayOfWeek(): string {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][getBrtNow().getDay()];
}

export function getBrtHourMinute(): string {
  const brt = getBrtNow();
  return `${String(brt.getHours()).padStart(2, "0")}:${String(brt.getMinutes()).padStart(2, "0")}`;
}

export function calculateWindow(forced = false): { effectiveStart: number; effectiveEnd: number } | null {
  const now = new Date();
  const nowMs = now.getTime();
  const startMs = getBrtTodayAt(7).getTime();
  const endMs = getBrtTodayAt(19).getTime();

  if (forced && nowMs < startMs) {
    return { effectiveStart: nowMs, effectiveEnd: endMs };
  }
  if (forced && nowMs >= endMs) {
    return { effectiveStart: nowMs, effectiveEnd: nowMs + 2 * 3600000 };
  }
  if (nowMs < startMs) return { effectiveStart: startMs, effectiveEnd: endMs };
  if (nowMs >= endMs) return null;
  return { effectiveStart: nowMs, effectiveEnd: endMs };
}
