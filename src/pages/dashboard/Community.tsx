import dgLogo from "@/assets/dg-logo-crown.jpeg";
import { Megaphone, Sparkles, ShieldCheck, MessageCircle, UsersRound } from "lucide-react";
import { useEffect, useRef } from "react";

const benefits = [
  {
    icon: Megaphone,
    title: "Atualizações",
    desc: "Fique por dentro de novas funcionalidades assim que forem lançadas.",
  },
  {
    icon: Sparkles,
    title: "Melhorias",
    desc: "Receba avisos sobre otimizações e correções da ferramenta.",
  },
  {
    icon: ShieldCheck,
    title: "Dicas de Segurança",
    desc: "Boas práticas para manter seus chips e operações seguras.",
  },
  {
    icon: MessageCircle,
    title: "Comunidade",
    desc: "Tire dúvidas, compartilhe experiências e evolua junto com outros usuários.",
  },
];

function GoldParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number; decay: number }[] = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener("resize", resize);

    const spawn = () => {
      if (particles.length < 25) {
        particles.push({
          x: Math.random() * canvas.offsetWidth,
          y: Math.random() * canvas.offsetHeight,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -Math.random() * 0.4 - 0.1,
          size: Math.random() * 2 + 0.5,
          alpha: Math.random() * 0.5 + 0.2,
          decay: Math.random() * 0.003 + 0.001,
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212, 175, 55, ${p.alpha})`;
        ctx.fill();
      }
      spawn();
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

const Community = () => {
  return (
    <div className="min-h-[calc(100vh-64px)] w-full flex items-center justify-center px-4 py-20 relative overflow-x-hidden mx-auto">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.07)_0%,transparent_60%)]" />
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.12)_0%,transparent_50%)]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-[radial-gradient(ellipse,hsl(var(--primary)/0.06)_0%,transparent_70%)]" />
        <GoldParticles />
      </div>

      <div className="relative z-10 max-w-2xl w-full flex flex-col items-center gap-10">
        {/* Logo with animated gold ring */}
        <div className="relative flex items-center justify-center">
          {/* Outer glow pulse */}
          <div className="absolute w-72 h-72 rounded-2xl bg-[radial-gradient(circle,rgba(212,175,55,0.15)_0%,transparent_65%)] blur-2xl animate-[pulse_3s_ease-in-out_infinite]" />
          {/* Animated conic border with snake light */}
          <div className="relative w-60 h-60 rounded-2xl p-[3px] shadow-[0_0_40px_rgba(212,175,55,0.3),0_0_80px_rgba(212,175,55,0.1)]">
            {/* Gold base border */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#b8860b] via-[#d4af37] to-[#b8860b]" />
            {/* Snake white light - uses SVG rect animation to trace the border */}
            <svg
              className="absolute inset-[-2px] w-[calc(100%+4px)] h-[calc(100%+4px)] pointer-events-none z-[5]"
              viewBox="0 0 244 244"
              fill="none"
            >
              <rect
                x="4" y="4" width="236" height="236" rx="16"
                stroke="url(#snake-gradient)"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                strokeDasharray="80 860"
                opacity="1"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  values="940;0"
                  dur="5s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.5;1;0.5"
                  dur="5s"
                  repeatCount="indefinite"
                />
              </rect>
              <defs>
                <linearGradient id="snake-gradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,1)" />
                  <stop offset="50%" stopColor="rgba(255,255,255,0.5)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="relative w-full h-full rounded-[13px] bg-background flex items-center justify-center overflow-hidden z-10">
              <img
                src={dgLogo}
                alt="DG Contingência PRO"
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2.5">
          <p className="text-[11px] font-bold tracking-[0.4em] uppercase text-[#d4af37]/70">
            Comunidade Exclusiva
          </p>
          <h1 className="text-3xl sm:text-[2.5rem] font-bold tracking-tight text-foreground leading-tight">
            DG Contingência{" "}
            <span className="bg-gradient-to-r from-[#d4af37] via-[#f5d76e] to-[#d4af37] bg-clip-text text-transparent">
              PRO
            </span>
          </h1>
          <p className="text-sm sm:text-[15px] text-muted-foreground max-w-md mx-auto leading-relaxed mt-3">
            Receba atualizações, melhorias, correções e avisos importantes da ferramenta em primeira mão.
          </p>
        </div>

        {/* Benefit cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          {benefits.map((item) => (
            <div
              key={item.title}
              className="group flex items-start gap-4 rounded-2xl border border-[#d4af37]/15 bg-gradient-to-br from-[#d4af37]/[0.04] to-transparent backdrop-blur-md p-5 transition-all duration-300 hover:border-[#d4af37]/35 hover:bg-[#d4af37]/[0.07] hover:shadow-[0_0_30px_rgba(212,175,55,0.08),inset_0_1px_0_rgba(212,175,55,0.1)]"
            >
              <div className="shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-[#d4af37]/15 to-[#b8860b]/10 border border-[#d4af37]/25 flex items-center justify-center transition-all duration-300 group-hover:from-[#d4af37]/25 group-hover:to-[#b8860b]/15 group-hover:border-[#d4af37]/40 group-hover:shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                <item.icon className="w-[18px] h-[18px] text-[#d4af37]" />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-foreground leading-tight">{item.title}</p>
                <p className="text-[12px] text-muted-foreground/80 leading-snug mt-1.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-3 w-full">
          <a
            href="https://chat.whatsapp.com/F9Xw6819N8J97Am6T8yC8D?mode=gi_t"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 w-full h-14 rounded-2xl bg-gradient-to-r from-[#b8860b] via-[#d4af37] to-[#b8860b] text-white text-[15px] font-bold tracking-wide transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.25)] hover:shadow-[0_0_35px_rgba(212,175,55,0.4)] hover:scale-[1.01]"
          >
            <UsersRound className="w-5 h-5" />
            Entrar na Comunidade
          </a>
          <a
            href="https://wa.me/5562994192500?text=Ol%C3%A1%2C%20vim%20do%20site%20da%20DG%20Conting%C3%AAncia%20PRO%20e%20preciso%20de%20suporte."
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 w-full h-14 rounded-2xl border border-border/50 text-[15px] font-medium text-muted-foreground hover:text-foreground hover:border-border hover:bg-accent/40 transition-all duration-300 hover:scale-[1.01]"
          >
            <MessageCircle className="w-5 h-5" />
            Falar com Suporte
          </a>
        </div>

        <p className="text-[11px] text-muted-foreground/30 text-center">
          Ao entrar, você concorda em receber comunicados oficiais da DG Contingência PRO.
        </p>
      </div>
    </div>
  );
};

export default Community;
