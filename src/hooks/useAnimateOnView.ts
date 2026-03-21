import { useEffect, useRef, useState } from "react";

type AnimationType = "fade-in" | "slide-up" | "scale-in";

interface UseAnimateOnViewOptions {
  animation?: AnimationType;
  threshold?: number;
  delay?: number; // stagger index (0-4)
  once?: boolean;
}

/**
 * Lightweight IntersectionObserver hook for viewport-triggered animations.
 * Only animates transform + opacity (GPU composited).
 */
export function useAnimateOnView({
  animation = "fade-in",
  threshold = 0.1,
  delay = 0,
  once = true,
}: UseAnimateOnViewOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.unobserve(el);
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once]);

  const className = isVisible
    ? `aov-${animation}${delay > 0 ? ` aov-delay-${delay}` : ""}`
    : "aov-hidden";

  return { ref, className };
}
