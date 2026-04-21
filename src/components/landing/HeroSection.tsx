import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardMockup from "./DashboardMockup";

const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-screen w-full flex items-center pt-24 pb-12 overflow-x-hidden">
      <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-12 lg:gap-8 items-center">
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

          {/* RIGHT — Dashboard panel */}
          <div
            className="relative w-full lg:h-[85vh] flex items-center justify-center lg:justify-start"
            style={{ animation: "slideUp 0.8s ease-out 0.4s both" }}
          >
            {/* Green glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(7,193,96,0.18) 0%, transparent 65%)",
                filter: "blur(60px)",
              }}
            />

            {/* Panel — overflows to the right on desktop */}
            <div
              className="relative z-10 w-full lg:w-[135%] lg:max-w-none group/dashboard"
              style={{ perspective: "1400px" }}
            >
              <DashboardMockup />
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
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
};

export default HeroSection;
