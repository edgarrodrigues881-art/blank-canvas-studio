/**
 * Single source of truth for Hero metrics — keeps badge,
 * mobile viz and desktop viz consistent.
 */
export const HERO_METRICS = {
  messagesToday: { value: "12.847", trend: "+18%" },
  activeChips: { value: "47", trend: "+3" },
  deliveryRate: { value: "98,4%", trend: "+0,6%" },
} as const;

// Shared bar series for both viz variants
export const HERO_BAR_SERIES = [42, 68, 56, 81, 64, 88, 72, 92, 60, 78, 48, 70];

// Shared sparkline path
export const HERO_SPARKLINE = "M0,80 L40,72 L80,58 L120,64 L160,42 L200,48 L240,28 L280,36 L320,18 L360,24 L400,10";
