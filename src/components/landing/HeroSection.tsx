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
        className="flex items-center gap-4 relative z-10 mb-16"
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

      {/* Dashboard Preview */}
      <div
        className="relative w-full max-w-5xl mx-auto px-6"
        style={{ animation: "slideUp 0.8s ease-out 0.4s both" }}
      >
        {/* Green glow behind */}
        <div
          className="absolute -top-[23%] left-1/2 -translate-x-1/2 w-[98%] pointer-events-none"
          style={{
            height: "50%",
            background: "radial-gradient(ellipse at center, rgba(7,193,96,0.15) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />

        <div className="relative z-10 group/dashboard" style={{ perspective: "1200px" }}>
          <img
            src={dashboardPreview}
            alt="Dashboard preview - painel de controle DG Contingência"
            className="w-full h-auto rounded-lg shadow-2xl border border-white/[0.08] transition-transform duration-500 ease-out group-hover/dashboard:!transform-none"
            loading="eager"
            style={{
              transform: "rotateX(8deg) rotateY(-2deg) scale(0.97)",
              transformOrigin: "center bottom",
            }}
          />
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
};

export default HeroSection;
