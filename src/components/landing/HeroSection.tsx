import { useNavigate } from "react-router-dom";
import { useRef, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardMockup from "./DashboardMockup";

const HeroSection = () => {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (window.matchMedia("(hover: none)").matches) return;

    let rx = 0, ry = 0, tx = 0;
    let trx = 0, try_ = 0, ttx = 0;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      const dy = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
      try_ = Math.max(-1, Math.min(1, dx)) * 3.5;
      trx = -Math.max(-1, Math.min(1, dy)) * 2.5;
      ttx = Math.max(-1, Math.min(1, dx)) * 4;
    };
    const onLeave = () => { trx = 0; try_ = 0; ttx = 0; };

    const tick = () => {
      rx += (trx - rx) * 0.08;
      ry += (try_ - ry) * 0.08;
      tx += (ttx - tx) * 0.08;
      el.style.transform = `perspective(1200px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateX(${tx.toFixed(2)}px)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="relative min-h-screen w-full flex items-center pt-24 pb-12 overflow-x-hidden">
      {/* Section vignette — darker edges */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 0%, transparent 50%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {/* Big halo behind the panel */}
      <div
        className="absolute pointer-events-none z-0"
        style={{
          top: "50%",
          left: "75%",
          width: "1100px",
          height: "1100px",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(99,102,241,0.20) 0%, rgba(59,130,246,0.10) 30%, transparent 65%)",
          filter: "blur(40px)",
        }}
      />
      {/* Secondary diffuse halo */}
      <div
        className="absolute pointer-events-none z-0"
        style={{
          top: "50%",
          left: "78%",
          width: "1500px",
          height: "1500px",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(7,193,96,0.08) 0%, transparent 60%)",
          filter: "blur(80px)",
        }}
      />
      <div className="relative z-10 w-full max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-12 lg:gap-8 items-center lg:min-h-[85vh] relative">
          {/* LEFT — Content */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            {/* Announcement badge */}
            <aside
              className="mb-6 inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full border border-emerald-500/20 bg-black/80 max-w-full"
              style={{ animation: "fadeIn 0.6s ease-out" }}
            >
              <span className="text-xs whitespace-nowrap text-emerald-400 font-medium">
                Plataforma atualizada com novas funcionalidades!
              </span>
              <a
                href="#planos"
                className="flex items-center gap-1 text-xs text-white/80 hover:text-white transition-colors"
                aria-label="Ver novidades"
              >
                Saiba mais
                <ArrowRight size={12} />
              </a>
            </aside>

            {/* Headline */}
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6 leading-[1.05] tracking-tight"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                background: "linear-gradient(to bottom, #ffffff, #ffffff, rgba(255, 255, 255, 0.6))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                letterSpacing: "-0.03em",
                animation: "fadeIn 0.6s ease-out 0.1s both",
              }}
            >
              Automação inteligente para o seu WhatsApp
            </h1>

            {/* Subtitle */}
            <p
              className="text-sm sm:text-base lg:text-lg text-white/40 mb-8 max-w-xl"
              style={{ animation: "fadeIn 0.6s ease-out 0.2s both" }}
            >
              Conecte o QR Code e acompanhe em tempo real o processo de aquecimento do seu número.
              Plataforma completa de gestão e contingência.
            </p>

            {/* CTA */}
            <div
              className="flex items-center gap-4 relative z-10"
              style={{ animation: "fadeIn 0.6s ease-out 0.3s both" }}
            >
              <Button
                onClick={() => navigate("/auth")}
                size="lg"
                className="h-12 px-8 text-base font-medium rounded-xl bg-gradient-to-b from-white via-white/95 to-white/60 text-black hover:scale-105 active:scale-95 transition-transform btn-press"
              >
                Começar Agora
              </Button>
            </div>
          </div>

          {/* RIGHT — Dashboard panel (floats freely on desktop) */}
          <div
            className="relative w-full mt-8 lg:mt-0 lg:absolute lg:top-1/2 lg:right-[-15%] lg:w-[70vw] lg:h-[85vh] lg:-translate-y-1/2 flex items-center justify-start"
            style={{ animation: "panelEnter 2.4s cubic-bezier(0.16, 1, 0.3, 1) 0.5s both" }}
          >
            {/* Soft backdrop blur behind panel */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "rgba(2,6,23,0.4)",
                filter: "blur(80px)",
              }}
            />

            {/* Green ambient glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(7,193,96,0.18) 0%, transparent 65%)",
                filter: "blur(60px)",
              }}
            />

            {/* Blue/violet edge glow (right side light) */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at 85% 50%, rgba(99,102,241,0.20) 0%, transparent 55%)",
                filter: "blur(70px)",
              }}
            />

            {/* Panel wrapper — fills the floating container */}
            <div
              ref={panelRef}
              className="relative z-10 w-full lg:max-w-none group/dashboard will-change-transform"
              style={{
                transformStyle: "preserve-3d",
                transformOrigin: "left center",
                filter:
                  "drop-shadow(0 50px 100px rgba(0,0,0,0.65)) drop-shadow(0 0 80px rgba(99,102,241,0.22)) brightness(1.05)",
              }}
            >
              <DashboardMockup />

              {/* Top glass highlight */}
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-20"
                style={{
                  background:
                    "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                }}
              />
              <div
                className="absolute inset-x-0 top-0 h-24 pointer-events-none z-20 rounded-t-xl"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(255,255,255,0.07) 0%, transparent 100%)",
                  mixBlendMode: "overlay",
                }}
              />

              {/* Strong left fade — panel dissolves into the dark */}
              <div
                className="absolute inset-y-0 left-0 w-1/2 pointer-events-none z-30"
                style={{
                  background:
                    "linear-gradient(to right, #020617 0%, rgba(2,6,23,0.95) 25%, rgba(2,6,23,0.7) 45%, rgba(2,6,23,0.3) 70%, transparent 100%)",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes panelEnter {
          0%   { opacity: 0; transform: translateX(120px) scale(0.92); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
    </section>
  );
};

export default HeroSection;
