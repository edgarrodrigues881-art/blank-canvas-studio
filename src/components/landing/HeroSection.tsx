import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const HeroSection = () => {
  const navigate = useNavigate();

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

          {/* RIGHT — empty space (panel removed) */}
          <div className="hidden lg:block" />
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
