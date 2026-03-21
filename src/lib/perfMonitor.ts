/**
 * FPS monitor — adds `.low-perf` to <html> when FPS drops below 50
 * for 3 consecutive frames, disabling all animations via CSS.
 * Runs only once on mount, self-cleans after activation.
 */
export function initPerfMonitor() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.documentElement.classList.add("low-perf");
    return;
  }

  let lastTime = performance.now();
  let lowCount = 0;
  let rafId: number;

  const check = (now: number) => {
    const delta = now - lastTime;
    lastTime = now;
    const fps = 1000 / delta;

    if (fps < 50) {
      lowCount++;
    } else {
      lowCount = 0;
    }

    if (lowCount >= 3) {
      document.documentElement.classList.add("low-perf");
      return; // stop monitoring
    }

    rafId = requestAnimationFrame(check);
  };

  // Start after initial paint settles
  setTimeout(() => {
    rafId = requestAnimationFrame(check);
  }, 2000);

  // Stop after 10s regardless — no need to monitor forever
  setTimeout(() => cancelAnimationFrame(rafId), 12000);
}
