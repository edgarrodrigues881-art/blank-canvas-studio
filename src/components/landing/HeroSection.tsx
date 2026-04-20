import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import dashboardPreview from "@/assets/dashboard-preview.png";

const HeroSection = () => {
  const navigate = useNavigate();

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
          animation: "fadeIn 0.6s ease-out 0.1s both",
        }}
      >
        Automação inteligente para o seu WhatsApp
      </h1>

      {/* Subtitle */}
      <p
        className="text-sm sm:text-base md:text-lg text-white/40 text-center max-w-2xl px-6 mb-10"
        style={{ animation: "fadeIn 0.6s ease-out 0.2s both" }}
      >
        Conecte o QR Code e acompanhe em tempo real o processo de aquecimento do seu número.
        <br />
        Plataforma completa de gestão e contingência.
      </p>

      {/* CTA */}
      <div
        className="flex items-center gap-4 relative z-10 mb-20"
        style={{ animation: "fadeIn 0.7s ease-out 0.4s both" }}
      >
        <Button
          onClick={() => navigate("/auth")}
          size="lg"
          className="h-12 px-8 text-base font-medium rounded-xl bg-gradient-to-b from-white via-white/95 to-white/70 text-black shadow-[0_8px_24px_-6px_rgba(255,255,255,0.2)] hover:shadow-[0_12px_36px_-6px_rgba(255,255,255,0.35)] hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 ease-out"
        >
          Começar Agora
        </Button>
      </div>

      {/* Dashboard Preview */}
      <div
        className="relative w-full max-w-5xl mx-auto px-6"
        style={{ animation: "slideUp 0.9s ease-out 0.55s both" }}
      >
        {/* Ambient radial gradient backdrop */}
        <div
          className="absolute -top-[40%] left-1/2 -translate-x-1/2 w-[120%] pointer-events-none"
          style={{
            height: "120%",
            background:
              "radial-gradient(ellipse 60% 50% at center, rgba(7,193,96,0.18) 0%, rgba(7,193,96,0.06) 35%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />

        {/* Soft spotlight glow directly behind image */}
        <div
          className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[85%] pointer-events-none"
          style={{
            height: "80%",
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.06) 0%, transparent 65%)",
            filter: "blur(40px)",
          }}
        />

        <div
          className="relative z-10"
          style={{ perspective: "1200px", animation: "float 8s ease-in-out infinite" }}
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
                "0 50px 100px -20px rgba(0,0,0,0.7), 0 30px 60px -30px rgba(0,0,0,0.6), 0 0 80px -20px rgba(7,193,96,0.15)",
            }}
          />
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="animation"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
};

export default HeroSection;
