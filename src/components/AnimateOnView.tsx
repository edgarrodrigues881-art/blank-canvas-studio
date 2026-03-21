import React from "react";
import { useAnimateOnView } from "@/hooks/useAnimateOnView";

interface AnimateOnViewProps {
  children: React.ReactNode;
  animation?: "fade-in" | "slide-up" | "scale-in";
  delay?: number;
  className?: string;
}

/**
 * Wrapper component that animates children when entering the viewport.
 * GPU-only animations (transform + opacity), 60fps guaranteed.
 */
const AnimateOnView = ({
  children,
  animation = "slide-up",
  delay = 0,
  className = "",
}: AnimateOnViewProps) => {
  const { ref, className: animClass } = useAnimateOnView({ animation, delay });

  return (
    <div ref={ref} className={`${animClass} ${className}`.trim()}>
      {children}
    </div>
  );
};

export default AnimateOnView;
