import { interpolate, spring, useCurrentFrame, useVideoConfig, AbsoluteFill } from "remotion";

interface Props {
  screenshotSrc?: string;
}

export function HeroDeviceAssemble({ screenshotSrc }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const assemble = spring({
    frame,
    fps,
    config: { mass: 1.4, damping: 12, stiffness: 90 },
    durationInFrames: 60,
  });

  const lidZ = interpolate(assemble, [0, 1], [1000, 0]);
  const baseZ = interpolate(assemble, [0, 1], [-800, 0]);
  const bezelZ = interpolate(assemble, [0, 1], [600, 0]);
  const screenZ = interpolate(assemble, [0, 1], [300, 0]);
  const rotX = interpolate(assemble, [0, 1], [-22, 0]);
  const rotY = interpolate(assemble, [0, 1], [28, 0]);
  const layerOpacity = interpolate(assemble, [0, 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const settleFrame = 45;
  const screenWake = interpolate(frame, [settleFrame, settleFrame + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shimmerProgress = interpolate(frame, [settleFrame + 6, settleFrame + 30], [-1, 2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const deviceW = 760;
  const deviceH = 470;
  const screenInset = 18;
  const bezelRadius = 14;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: "transparent" }}>
      <div
        style={{
          width: deviceW,
          height: deviceH,
          position: "relative",
          transformStyle: "preserve-3d",
          transform: `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
        }}
      >
        {/* Back lid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: bezelRadius + 2,
            background: "linear-gradient(135deg, #1a1a2e, #16213e)",
            transform: `translateZ(${lidZ - 6}px)`,
            opacity: layerOpacity,
            boxShadow: "0 4px 30px rgba(0,0,0,0.4)",
          }}
        />

        {/* Keyboard base */}
        <div
          style={{
            position: "absolute",
            left: "5%",
            right: "5%",
            bottom: -30,
            height: 28,
            borderRadius: "0 0 8px 8px",
            background: "linear-gradient(180deg, #2a2a3e, #1a1a2e)",
            transform: `translateZ(${baseZ}px)`,
            opacity: layerOpacity,
          }}
        />

        {/* Bezel */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: bezelRadius,
            border: "3px solid #2a2a3e",
            background: "#0d0d14",
            transform: `translateZ(${bezelZ}px)`,
            opacity: layerOpacity,
          }}
        />

        {/* Screen */}
        <div
          style={{
            position: "absolute",
            inset: screenInset,
            borderRadius: bezelRadius - 6,
            overflow: "hidden",
            transform: `translateZ(${screenZ}px)`,
            opacity: layerOpacity,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "#0a0a0f",
              opacity: 1 - screenWake,
              zIndex: 2,
            }}
          />
          <div style={{ position: "absolute", inset: 0, opacity: screenWake }}>
            {screenshotSrc ? (
              <img
                src={screenshotSrc}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", background: "#111" }} />
            )}
          </div>
          {/* Shimmer */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 3,
              background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 55%, transparent 60%)`,
              transform: `translateX(${shimmerProgress * 100}%)`,
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
