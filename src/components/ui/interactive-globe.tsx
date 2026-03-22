import { useEffect, useRef, useCallback } from "react";
import createGlobe from "cobe";

interface GlobeProps {
  className?: string;
}

export function InteractiveGlobe({ className = "" }: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const phiRef = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
  }, []);

  const onPointerUp = useCallback(() => {
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  }, []);

  const onPointerOut = useCallback(() => {
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (pointerInteracting.current !== null) {
      const delta = e.clientX - pointerInteracting.current;
      pointerInteractionMovement.current = delta;
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    const getSize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      return rect ? Math.min(rect.width, rect.height) : 400;
    };

    let currentSize = getSize();

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: currentSize * 2,
      height: currentSize * 2,
      phi: 0,
      theta: 0.25,
      dark: 1,
      diffuse: 2,
      mapSamples: 20000,
      mapBrightness: 2.5,
      baseColor: [0.04, 0.12, 0.08],
      markerColor: [0.2, 0.83, 0.6],
      glowColor: [0.04, 0.45, 0.3],
      markers: [
        { location: [-23.5505, -46.6333], size: 0.07 },
        { location: [-22.9068, -43.1729], size: 0.05 },
        { location: [40.7128, -74.006], size: 0.06 },
        { location: [51.5074, -0.1278], size: 0.06 },
        { location: [35.6762, 139.6503], size: 0.05 },
        { location: [1.3521, 103.8198], size: 0.05 },
        { location: [-33.8688, 151.2093], size: 0.05 },
        { location: [55.7558, 37.6173], size: 0.04 },
        { location: [-15.7975, -47.8919], size: 0.04 },
      ],
      onRender: (state) => {
        if (pointerInteracting.current === null) {
          phiRef.current += 0.003;
        }
        state.phi = phiRef.current + pointerInteractionMovement.current / 200;
        state.width = currentSize * 2;
        state.height = currentSize * 2;
      },
    });

    const onResize = () => {
      currentSize = getSize();
    };
    window.addEventListener("resize", onResize);

    return () => {
      globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.12) 0%, transparent 65%)",
          filter: "blur(30px)",
        }}
      />
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab relative z-10"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerOut={onPointerOut}
        onPointerMove={onPointerMove}
      />
    </div>
  );
}

export default InteractiveGlobe;
