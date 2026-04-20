import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import dashboardPreview from "@/assets/dashboard-preview.png";

const HeroSection = () => {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        setScrollY(window.scrollY);
        rafRef.current = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Parallax: dashboard moves slower than scroll (translates up at 0.15x rate)
  const parallaxY = -scrollY * 0.15;

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-start pt-28 pb-12 overflow-hidden">
      {/* Announcement badge */}
      <aside
        className="mb-8 inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full border border-emerald-500/20 bg-black/80 max-w-full"
        style={{ animation: "fadeIn 0.6s ease-out" }}
      >
        <span className="text-xs text-center whitespace-nowrap text-emerald-400 font-medium">
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
        className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-center max-w-4xl px-6 mb-6 leading-[1.1] tracking-tight"
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          background: "linear-gradient(to bottom, #ffffff, #ffffff, rgba(255, 255, 255, 0.6))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          letterSpacing: "-0.03em",
          animation: "heroRise 0.7s ease-out 0s both",
        }}
      >
        Automação inteligente para o seu WhatsApp
      </h1>

      {/* Subtitle */}
      <p
        className="text-sm sm:text-base md:text-lg text-white/40 text-center max-w-2xl px-6 mb-10"
        style={{ animation: "heroRise 0.7s ease-out 0.15s both" }}
      >
        Conecte o QR Code e acompanhe em tempo real o processo de aquecimento do seu número.
        <br />
        Plataforma completa de gestão e contingência.
      </p>

      {/* CTA */}
      <div
        className="flex items-center gap-4 relative z-10 mb-20"
        style={{ animation: "heroRise 0.7s ease-out 0.3s both" }}
      >
        <Button
          onClick={() => navigate("/auth")}
          size="lg"
          className="h-12 px-8 text-base font-medium rounded-xl bg-gradient-to-b from-white via-white/95 to-white/70 text-black shadow-[0_8px_24px_-6px_rgba(255,255,255,0.25)] hover:shadow-[0_16px_44px_-6px_rgba(255,255,255,0.4)] hover:scale-[1.03] active:scale-[0.98] transition-all duration-[250ms] ease-out"
        >
          Começar Agora
        </Button>
      </div>

      {/* Dashboard Preview with parallax wrapper */}
      <div
        className="relative w-full max-w-5xl mx-auto px-6 will-change-transform"
        style={{
          transform: `translate3d(0, ${parallaxY}px, 0)`,
          animation: "heroRise 0.9s ease-out 0.4s both",
        }}
      >
        {/* Visible radial glow — emerald + violet blend behind image */}
        <div
          className="absolute -top-[30%] left-1/2 -translate-x-1/2 w-[130%] pointer-events-none"
          style={{
            height: "130%",
            background:
              "radial-gradient(ellipse 55% 50% at 40% 50%, rgba(7,193,96,0.28) 0%, transparent 65%), radial-gradient(ellipse 50% 45% at 65% 55%, rgba(139,92,246,0.22) 0%, transparent 65%)",
            filter: "blur(70px)",
          }}
        />

        {/* Soft spotlight directly behind image */}
        <div
          className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[85%] pointer-events-none"
          style={{
            height: "80%",
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.08) 0%, transparent 65%)",
            filter: "blur(40px)",
          }}
        />

        {/* Floating image */}
        <div
          className="relative z-10 will-change-transform"
          style={{ perspective: "1200px", animation: "float 6s ease-in-out infinite" }}
        >
          <img
            src={dashboardPreview}
            alt="Dashboard preview - painel de controle DG Contingência"
            className="w-full h-auto rounded-lg border border-white/[0.08]"
            loading="eager"
            style={{
              transform: "rotateX(8deg) rotateY(-2deg) scale(0.97)",
              transformOrigin: "center bottom",
              boxShadow:
                "0 60px 120px -20px rgba(0,0,0,0.85), 0 40px 80px -30px rgba(0,0,0,0.7), 0 0 100px -20px rgba(7,193,96,0.25), 0 0 80px -30px rgba(139,92,246,0.2)",
            }}
          />
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroRise {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="animation"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
};

export default HeroSection;
