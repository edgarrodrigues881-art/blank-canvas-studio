"use client";

import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface HeroDeviceAssembleProps {
  assembleStart?: number;
  device?: "laptop" | "phone";
  accentColor?: string;
  speed?: number;
  className?: string;
  screenshotSrc?: string;
}

const FONT_FAMILY =
  "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif";

function MockUI({ accentColor }: { accentColor: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background:
          "linear-gradient(180deg, hsl(222 45% 8%) 0%, hsl(224 36% 7%) 100%)",
        color: "hsl(0 0% 100%)",
        fontFamily: FONT_FAMILY,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: 42,
          borderBottom: "1px solid hsl(0 0% 100% / 0.08)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 999, background: "hsl(7 85% 60%)" }} />
        <span style={{ width: 10, height: 10, borderRadius: 999, background: "hsl(42 96% 56%)" }} />
        <span style={{ width: 10, height: 10, borderRadius: 999, background: accentColor }} />
        <span style={{ marginLeft: 8, fontSize: 12, color: "hsl(0 0% 100% / 0.34)" }}>
          DG Contingência PRO — Preview
        </span>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        <div
          style={{
            width: "26%",
            borderRight: "1px solid hsl(0 0% 100% / 0.06)",
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 12,
                width: i === 0 ? "78%" : `${54 + i * 8}%`,
                borderRadius: 999,
                background: i === 0 ? `${accentColor}33` : "hsl(0 0% 100% / 0.06)",
              }}
            />
          ))}
        </div>

        <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              "hsl(210 100% 60%)",
              accentColor,
              "hsl(271 91% 65%)",
              "hsl(35 96% 56%)",
            ].map((color, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 88,
                  borderRadius: 16,
                  background: "hsl(224 31% 12%)",
                  border: "1px solid hsl(0 0% 100% / 0.06)",
                  boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.04)",
                  padding: 14,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    background: `${color}22`,
                    marginBottom: 12,
                  }}
                />
                <div style={{ height: 10, width: "62%", borderRadius: 999, background: "hsl(0 0% 100% / 0.14)", marginBottom: 8 }} />
                <div style={{ height: 8, width: "42%", borderRadius: 999, background: color }} />
              </div>
            ))}
          </div>

          <div
            style={{
              flex: 1,
              borderRadius: 20,
              background: "hsl(224 31% 12%)",
              border: "1px solid hsl(0 0% 100% / 0.06)",
              padding: 18,
            }}
          >
            <div style={{ height: 12, width: "28%", borderRadius: 999, background: "hsl(0 0% 100% / 0.16)", marginBottom: 18 }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 12, background: `${accentColor}22` }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 10, width: `${48 + i * 9}%`, borderRadius: 999, background: "hsl(0 0% 100% / 0.14)", marginBottom: 6 }} />
                  <div style={{ height: 8, width: `${24 + i * 7}%`, borderRadius: 999, background: "hsl(0 0% 100% / 0.08)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroDeviceAssemble({
  assembleStart = 0,
  device = "laptop",
  accentColor = "hsl(142 72% 45%)",
  speed = 1,
  className,
  screenshotSrc,
}: HeroDeviceAssembleProps) {
  const frame = useCurrentFrame() * speed;
  const { fps } = useVideoConfig();

  const assemble = spring({
    frame: frame - assembleStart,
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

  const settleFrame = assembleStart + 45;
  const screenWake = interpolate(frame, [settleFrame, settleFrame + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const shimmerProgress = interpolate(frame, [settleFrame + 6, settleFrame + 30], [-1, 2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isPhone = device === "phone";
  const deviceW = isPhone ? 320 : 760;
  const deviceH = isPhone ? 640 : 470;
  const screenInset = isPhone ? 12 : 18;
  const bezelRadius = isPhone ? 36 : 14;

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", justifyContent: "center", alignItems: "center" }}>
      <div
        className={className}
        style={{
          width: deviceW,
          height: deviceH,
          position: "relative",
          transformStyle: "preserve-3d",
          transform: `perspective(1600px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
          filter: "drop-shadow(0 36px 80px hsl(220 80% 3% / 0.55))",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: bezelRadius + 4,
            background: "linear-gradient(135deg, hsl(224 24% 18%) 0%, hsl(224 22% 9%) 100%)",
            transform: `translateZ(${lidZ}px)`,
            opacity: layerOpacity,
            boxShadow: `0 0 0 1px hsl(0 0% 100% / 0.05), 0 0 90px hsl(142 72% 45% / 0.08)`,
          }}
        />

        {!isPhone && (
          <div
            style={{
              position: "absolute",
              left: "4%",
              right: "4%",
              bottom: -28,
              height: 26,
              borderRadius: "0 0 16px 16px",
              background: "linear-gradient(180deg, hsl(224 18% 20%) 0%, hsl(224 18% 12%) 100%)",
              transform: `translateZ(${baseZ}px)`,
              opacity: layerOpacity,
              boxShadow: "0 16px 40px hsl(224 50% 3% / 0.35)",
            }}
          />
        )}

        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: bezelRadius,
            border: "1px solid hsl(0 0% 100% / 0.08)",
            background: "linear-gradient(180deg, hsl(222 28% 7%) 0%, hsl(223 32% 5%) 100%)",
            transform: `translateZ(${bezelZ}px)`,
            opacity: layerOpacity,
            overflow: "hidden",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: screenInset,
            borderRadius: bezelRadius - 6,
            overflow: "hidden",
            transform: `translateZ(${screenZ}px)`,
            opacity: layerOpacity,
            boxShadow: `0 0 0 1px hsl(0 0% 100% / 0.04), inset 0 0 0 1px hsl(0 0% 100% / 0.04)`,
            background: "hsl(223 32% 5%)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, hsl(223 32% 5%) 0%, hsl(223 32% 3%) 100%)",
              opacity: 1 - screenWake,
              zIndex: 2,
            }}
          />

          <div style={{ position: "absolute", inset: 0, opacity: screenWake, zIndex: 1 }}>
            {screenshotSrc ? (
              <img
                src={screenshotSrc}
                alt="Dashboard preview"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <MockUI accentColor={accentColor} />
            )}
          </div>

          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 3,
              background:
                "linear-gradient(105deg, transparent 38%, hsl(0 0% 100% / 0.04) 44%, hsl(0 0% 100% / 0.14) 50%, hsl(0 0% 100% / 0.04) 56%, transparent 62%)",
              transform: `translateX(${shimmerProgress * 100}%)`,
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
