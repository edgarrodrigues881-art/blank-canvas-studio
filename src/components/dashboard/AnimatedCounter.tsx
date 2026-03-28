import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
}

export function AnimatedCounter({ value, duration = 500, className = "" }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>();

  useEffect(() => {
    const startVal = prevRef.current;
    const diff = value - startVal;
    if (diff === 0) return;

    // Reduced-motion: skip animation
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      prevRef.current = value;
      return;
    }

    let startTs: number | null = null;

    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quint for ultra-smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 5);
      const current = Math.round(startVal + diff * eased);
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        prevRef.current = value;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <span className={className}>{display.toLocaleString("pt-BR")}</span>;
}
