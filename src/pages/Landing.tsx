import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";
import {
  Zap, Shield, BarChart3, Smartphone, Settings,
  ArrowRight, CheckCircle2, MessageSquare, Users, Layers,
  ChevronDown, Star, Lock, UsersRound, MessageCircle, ShieldCheck, Megaphone, Menu, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo-new.png";
import heroCrmMobile from "@/assets/hero-crm-mobile.png";
import heroInstancesPanel from "@/assets/hero-instances-panel-real-v2.png";
import HeroDataViz from "@/components/landing/HeroDataViz";
import { HERO_METRICS, HERO_BAR_SERIES } from "@/components/landing/heroMetrics";
import { TiltCard } from "@/components/ui/tilt-card";
import { Flame } from "lucide-react";

// ─── Prefetch ───
const prefetchRoutes = () => {
  const load = () => { import("./Auth"); import("./dashboard/MyPlan"); };
  if ("requestIdleCallback" in window) (window as any).requestIdleCallback(load);
  else setTimeout(load, 2000);
};

// ─── Animation — premium, subtle, Linear-style (normalized) ───
const easeOut = [0.16, 1, 0.3, 1] as const;
const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOut } } };
const fadeScale = { hidden: { opacity: 0, scale: 0.98 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: easeOut } } };
const stagger = { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } } };

// ─── Background — single soft gradient, almost flat ───
const Background = () => (
  <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
    <div className="absolute top-[-25%] left-[15%] w-[1100px] h-[700px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.05)_0%,transparent_60%)] blur-[140px]" />
    <div className="absolute bottom-[-15%] right-[5%] w-[800px] h-[600px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.035)_0%,transparent_70%)] blur-[140px]" />
  </div>
);

// ─── Navbar (tailark-style: pill central + CTA destacado) ───
const Navbar = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scroll = (id: string) => { setOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };
  const goToApp = () => navigate(session ? "/app" : "/login");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const items: [string, string][] = [["produto", "Produto"], ["recursos", "Recursos"], ["uso", "Como funciona"], ["planos", "Planos"], ["faq", "FAQ"]];

  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className={`mx-auto transition-all duration-300 ${scrolled ? "max-w-[1100px] mt-3 px-3" : "max-w-[1320px] mt-0 px-5"}`}>
        <div className={`flex items-center justify-between h-14 px-3 md:px-4 transition-all duration-300 ${scrolled ? "rounded-2xl border border-white/[0.06] bg-[hsl(222,22%,5%)]/85 backdrop-blur-xl shadow-[0_8px_30px_-10px_rgba(0,0,0,0.6)]" : "border-b border-white/[0.04] bg-[hsl(222,22%,5%)]/70 backdrop-blur-xl"}`}>
          <button onClick={() => scroll("top")} className="flex items-center gap-2.5 min-w-0">
            <img src={logo} alt="DG" width={28} height={28} className="rounded-md flex-shrink-0" />
            <span className="hidden sm:inline text-[13px] font-semibold text-white tracking-tight whitespace-nowrap">DG Contingência Pro</span>
          </button>

          <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {items.map(([id, label]) => (
              <button key={id} onClick={() => scroll(id)} className="text-[13px] text-white/60 hover:text-white px-3 py-1.5 rounded-full hover:bg-white/[0.04] transition-colors">{label}</button>
            ))}
            <button onClick={() => scroll("comunidade")} className="text-[13px] text-amber-400/85 hover:text-amber-300 px-3 py-1.5 rounded-full hover:bg-amber-400/[0.06] transition-colors">Comunidade</button>
          </nav>

          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={goToApp} className="hidden sm:inline-flex text-[13px] font-medium text-white/65 hover:text-white hover:bg-white/[0.04] h-8 px-3">
              {session ? "Ir para o app" : "Entrar"}
            </Button>
            {!session && (
              <Button size="sm" onClick={() => navigate("/auth?mode=signup")} className="text-[12.5px] font-semibold bg-gradient-to-b from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-500 text-emerald-950 h-8 px-3.5 rounded-full shadow-[0_4px_14px_-4px_rgba(16,185,129,0.55)] hover:shadow-[0_8px_20px_-4px_rgba(16,185,129,0.7)] transition-all">
                Começar grátis
              </Button>
            )}
            <button onClick={() => setOpen(!open)} className="md:hidden p-2 -mr-1 text-white/70 hover:text-white" aria-label="Menu">
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden mt-2 rounded-2xl border border-white/[0.06] bg-[hsl(222,22%,5%)]/95 backdrop-blur-xl p-2 shadow-2xl">
            {items.map(([id, label]) => (
              <button key={id} onClick={() => scroll(id)} className="block w-full text-left text-[14px] text-white/75 hover:text-white px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors">{label}</button>
            ))}
            <button onClick={() => scroll("comunidade")} className="block w-full text-left text-[14px] text-amber-400/90 hover:text-amber-300 px-3 py-2.5 rounded-lg hover:bg-amber-400/[0.06] transition-colors">Comunidade</button>
            <div className="h-px bg-white/[0.06] my-1.5" />
            <button onClick={goToApp} className="block w-full text-left text-[14px] text-white/75 hover:text-white px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors">{session ? "Ir para o app" : "Entrar"}</button>
          </div>
        )}
      </div>
    </header>
  );
};

// ─── Section wrapper ───
const Section = ({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) => (
  <section id={id} className={`py-14 md:py-32 px-5 md:px-6 ${className}`}>
    <div className="max-w-[1200px] mx-auto">{children}</div>
  </section>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-block text-[11px] font-medium uppercase tracking-[0.18em] text-white/45 mb-4 md:mb-5">{children}</span>
);

const SectionTitle = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <h2 className={`text-[1.875rem] md:text-[2.75rem] lg:text-[3.25rem] font-semibold text-white tracking-[-0.025em] leading-[1.1] md:leading-[1.05] ${className}`}>{children}</h2>
);

const SectionSub = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-[15px] md:text-base text-white/65 md:text-white/50 leading-[1.55] md:leading-[1.6] ${className}`}>{children}</p>
);

// ─── 1. Hero (tailark-style: centralizado + mockup grande embaixo) ───
const Hero = () => {
  const navigate = useNavigate();
  const mockupRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: mockupRef,
    offset: ["start end", "center center"],
  });
  // Suaviza com spring
  const smooth = useSpring(scrollYProgress, { stiffness: 80, damping: 22, mass: 0.5 });
  // Começa "deitada" (25deg) e endireita (0deg)
  const rotateX = useTransform(smooth, [0, 1], [25, 0]);
  // Leve scale conforme aproxima
  const scale = useTransform(smooth, [0, 1], [0.92, 1]);
  // Sombra mais intensa quando endireita
  const shadowOpacity = useTransform(smooth, [0, 1], [0.15, 0.45]);

  // Hover tilt 3D suave (motion values + spring)
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  // Spring suave: stiffness baixa + damping alto = sem trepidação, sem overshoot
  const springConfig = { stiffness: 60, damping: 18, mass: 0.6 };
  const springTiltX = useSpring(tiltX, springConfig);
  const springTiltY = useSpring(tiltY, springConfig);

  const handleMockupMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const TILT = 3; // graus máximos — bem sutil, sem distorção
    // Clamp pra garantir que nunca passe do limite mesmo com movimentos rápidos
    const xVal = Math.max(-TILT, Math.min(TILT, -(py - 0.5) * (TILT * 2)));
    const yVal = Math.max(-TILT, Math.min(TILT, (px - 0.5) * (TILT * 2)));
    tiltX.set(xVal);
    tiltY.set(yVal);
  };
  const handleMockupLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };
  return (
    <section id="top" className="relative pt-32 md:pt-40 pb-16 md:pb-24 px-5 md:px-6 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1200px] h-[700px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.18)_0%,transparent_60%)] blur-[120px]" />
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08)_0%,transparent_70%)] blur-[100px]" />
        {/* Grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.025]" aria-hidden>
          <defs>
            <pattern id="hero-grid-bg" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid-bg)" />
        </svg>
      </div>

      <div className="max-w-[1200px] mx-auto relative z-10">
        <motion.div initial="hidden" animate="visible" variants={stagger} className="text-center max-w-[860px] mx-auto">
          {/* Badge */}
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 mb-7 md:mb-8 px-3 py-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" style={{ animationDuration: "2.4s" }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            <span className="text-[11px] font-medium text-emerald-300/90 tracking-wide">+{HERO_METRICS.messagesToday.value} mensagens enviadas hoje</span>
          </motion.div>

          {/* Title */}
          <motion.h1 variants={fadeUp} className="text-[2.25rem] sm:text-[2.75rem] md:text-[4rem] lg:text-[4.75rem] font-semibold text-white leading-[1.05] tracking-[-0.04em] mb-6 md:mb-7 [text-wrap:balance]">
            Pare de perder números no{" "}
            <span className="bg-gradient-to-br from-emerald-300 via-emerald-400 to-emerald-500 bg-clip-text text-transparent">WhatsApp.</span>
            <br className="hidden md:block" />
            <span className="text-white/55">Escale com controle total.</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p variants={fadeUp} className="text-[15px] md:text-[18px] text-white/60 max-w-[600px] mx-auto mb-9 md:mb-10 leading-[1.55]">
            Evite banimentos, gerencie múltiplos chips com segurança e escale sua operação sem caos.
          </motion.p>

          {/* CTAs */}
          <motion.div variants={fadeScale} className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-5">
            <Button
              size="lg"
              onClick={() => navigate("/auth?mode=signup")}
              className="group w-full sm:w-auto h-[52px] px-7 rounded-full gap-2
                bg-gradient-to-b from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-500
                text-emerald-950 text-[15px] font-semibold tracking-tight
                shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_10px_30px_-6px_rgba(16,185,129,0.6)]
                hover:shadow-[0_1px_0_0_rgba(255,255,255,0.3)_inset,0_16px_40px_-6px_rgba(16,185,129,0.75)]
                hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98]
                transition-all duration-200"
            >
              Começar agora
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              onClick={() => document.getElementById("uso")?.scrollIntoView({ behavior: "smooth" })}
              className="group w-full sm:w-auto h-[52px] px-6 rounded-full gap-1.5
                bg-white/[0.03] hover:bg-white/[0.07]
                border border-white/10 hover:border-white/20
                text-white/80 hover:text-white text-[14.5px] font-medium
                transition-all duration-200"
            >
              Ver como funciona
            </Button>
          </motion.div>

          <motion.p variants={fadeUp} className="text-[12.5px] text-white/45 flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70" />
            Acesso imediato · Sem cartão · Sem contrato
          </motion.p>
        </motion.div>

        {/* Mockup grande do dashboard */}
        <div
          ref={mockupRef}
          className="relative mt-14 md:mt-20 max-w-[1100px] mx-auto"
          style={{ perspective: "2200px" }}
        >
          {/* Glow ATRÁS do mockup (não na frente) */}
          <motion.div
            style={{ opacity: shadowOpacity }}
            className="absolute -inset-x-32 -top-20 -bottom-32 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(16,185,129,0.22)_0%,transparent_70%)] blur-3xl pointer-events-none"
            aria-hidden
          />

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: easeOut, delay: 0.3 }}
            style={{
              rotateX,
              scale,
              transformOrigin: "50% 100%",
              transformStyle: "preserve-3d",
              willChange: "transform",
            }}
            className="relative"
          >
            {/* Frame com tilt-on-hover suave */}
            <motion.div
              onPointerMove={handleMockupMove}
              onPointerLeave={handleMockupLeave}
              style={{
                rotateX: springTiltX,
                rotateY: springTiltY,
                transformStyle: "preserve-3d",
                transformPerspective: 1600,
              }}
              className="relative rounded-3xl p-px bg-gradient-to-b from-white/[0.12] to-white/[0.04] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
            >
              <div className="rounded-3xl overflow-hidden bg-[hsl(222,22%,6%)] ring-1 ring-inset ring-white/[0.05]">
                <img
                  src={heroInstancesPanel}
                  alt="Painel DG Contingência Pro — Aquecimento Automático"
                  className="block w-full h-auto"
                  loading="eager"
                  draggable={false}
                />
              </div>
              {/* Reflexo sutil no topo */}
              <div className="absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
const trustPoints = [
  "Gerenciamento de múltiplos chips em um só lugar",
  "Monitoramento contínuo das instâncias",
  "Controle de envio para reduzir bloqueios",
];

const Stats = () => (
  <section className="py-12 md:py-24 px-5 md:px-6 border-y border-white/[0.04]">
    <div className="max-w-[1100px] mx-auto">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={stagger}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-16 items-start"
      >
        <motion.h2
          variants={fadeUp}
          className="lg:col-span-5 text-[1.625rem] md:text-[2rem] font-semibold text-white tracking-[-0.03em] leading-[1.15] md:leading-[1.1]"
        >
          Controle real da <span className="text-white/70">sua operação.</span>
        </motion.h2>

        <motion.ul variants={fadeUp} className="lg:col-span-7 space-y-3.5 md:space-y-5">
          {trustPoints.map((point) => (
            <li key={point} className="flex items-start gap-3 text-[15px] text-white/85 md:text-white/90 leading-[1.5] md:leading-[1.55]">
              <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />
              <span>{point}</span>
            </li>
          ))}
        </motion.ul>
      </motion.div>
    </div>
  </section>
);

// ─── 3. Produto (explanation) ───
const Product = () => (
  <Section id="produto">
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger} className="max-w-3xl">
      <motion.div variants={fadeUp}><Eyebrow>O produto</Eyebrow></motion.div>
      <motion.div variants={fadeUp}>
        <SectionTitle className="mb-6">
          Tudo que você precisa para operar com <span className="text-white/45">controle total.</span>
        </SectionTitle>
      </motion.div>
      <motion.div variants={fadeUp}>
        <SectionSub className="max-w-xl">
          Uma plataforma única que substitui ferramentas dispersas. Aquecimento, disparo, contatos e monitoramento — em um só lugar.
        </SectionSub>
      </motion.div>
    </motion.div>
  </Section>
);

// ─── 4. Features (3 colunas) ───
const features = [
  { icon: Zap, title: "Envio com intervalos", desc: "Pausas e ritmos automáticos para manter as instâncias ativas durante campanhas." },
  { icon: Shield, title: "Aquecimento automático", desc: "Amadurecimento gradual de cada chip antes do uso em volume." },
  { icon: BarChart3, title: "Métricas em tempo real", desc: "Veja entregas, falhas e desempenho de cada instância no painel." },
  { icon: Smartphone, title: "Múltiplas instâncias", desc: "Conecte e controle dezenas de chips em um único ambiente." },
  { icon: Layers, title: "Disparo em massa", desc: "Distribua mensagens entre instâncias com pausas programadas." },
  { icon: Lock, title: "Alertas no WhatsApp", desc: "Receba avisos de desconexão, falhas e status direto no seu WhatsApp." },
];

const Features = () => (
  <Section id="recursos">
    <div className="max-w-3xl mb-10 md:mb-16">
      <Eyebrow>Recursos</Eyebrow>
      <SectionTitle className="mb-4 md:mb-6">Construído para quem leva a operação a sério.</SectionTitle>
      <SectionSub>Cada recurso pensado para reduzir risco e dar previsibilidade.</SectionSub>
    </div>
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={stagger} className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-x-10 md:gap-y-14">
      {features.map((f) => (
        <motion.div
          key={f.title}
          variants={fadeUp}
          className="group p-5 md:-m-5 rounded-xl border border-white/[0.05] md:border-transparent bg-white/[0.015] md:bg-transparent hover:border-white/[0.1] md:hover:border-white/[0.06] hover:bg-white/[0.03] md:hover:bg-white/[0.02] md:hover:-translate-y-1 transition-all duration-200 ease-out"
        >
          <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4 md:mb-5 group-hover:border-white/[0.12] group-hover:bg-white/[0.06] transition-colors duration-200">
            <f.icon className="w-4 h-4 text-white/70 group-hover:text-white transition-colors duration-200" />
          </div>
          <h3 className="text-[15px] font-semibold text-white mb-1.5 md:mb-2 tracking-tight">{f.title}</h3>
          <p className="text-[13px] text-white/55 md:text-white/45 leading-[1.55] md:leading-[1.6] group-hover:text-white/65 md:group-hover:text-white/60 transition-colors duration-200">{f.desc}</p>
        </motion.div>
      ))}
    </motion.div>
  </Section>
);

// ─── 4.5. Tilt Card highlight (Aquecimento automático) ───
const TiltHighlight = () => (
  <Section className="!py-10 md:!py-20">
    <div className="flex justify-center">
      <TiltCard
        tiltLimit={12}
        scale={1.03}
        perspective={1400}
        effect="evade"
        spotlight
        className="w-full max-w-[520px] cursor-default"
      >
        <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-emerald-400/40 via-white/[0.06] to-emerald-500/20 shadow-[0_30px_80px_-30px_rgba(16,185,129,0.35)]">
          <div className="rounded-2xl bg-[hsl(222,22%,7%)] border border-white/[0.05] p-7 md:p-9">
            <div className="flex items-center justify-between mb-10 md:mb-14">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-medium text-white/55 tracking-wide">Automático</span>
              </div>
              <span className="text-[11px] font-medium text-emerald-300/80 tracking-wide">3D hover</span>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
                <Flame className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-[24px] md:text-[28px] font-semibold text-white tracking-tight">
                Aquecimento automático
              </h3>
            </div>
            <p className="text-[14px] md:text-[15px] text-white/55 leading-[1.6]">
              Nossa ferramenta faz tudo por você de forma automática, sem dor de cabeça.
              Seus chips amadurecem sozinhos no ritmo certo.
            </p>
          </div>
        </div>
      </TiltCard>
    </div>
  </Section>
);

// ─── 5. Use case (left text + right mockup) ───
const UseCase = () => (
  <Section id="uso">
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-16 lg:gap-12 items-center">
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger} className="lg:col-span-5">
        <motion.div variants={fadeUp}><Eyebrow>Como funciona</Eyebrow></motion.div>
        <motion.div variants={fadeUp}>
          <SectionTitle className="mb-6 md:mb-8 text-[1.625rem] md:text-[2.25rem] lg:text-[2.5rem]">
            Como funciona na prática.
          </SectionTitle>
        </motion.div>
        <motion.ol variants={fadeUp} className="space-y-5 md:space-y-7">
          {[
            { n: "1", title: "Conecte seus chips", desc: "Adicione e organize múltiplos números em um só lugar." },
            { n: "2", title: "Configure sua operação", desc: "Defina intervalos, limites e regras de envio." },
            { n: "3", title: "Escale com segurança", desc: "Acompanhe tudo em tempo real e reduza riscos de bloqueio." },
          ].map((step) => (
            <li key={step.n} className="flex gap-4">
              <span className="flex-shrink-0 w-7 h-7 rounded-full border border-white/[0.1] bg-white/[0.03] flex items-center justify-center text-[12px] font-medium text-white/65">
                {step.n}
              </span>
              <div className="pt-0.5">
                <h3 className="text-[14px] font-semibold text-white mb-1.5 tracking-tight">{step.title}</h3>
                <p className="text-[13px] text-white/55 leading-[1.55]">{step.desc}</p>
              </div>
            </li>
          ))}
        </motion.ol>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.5, ease: easeOut }} className="lg:col-span-7 relative">
        {/* Gradient border wrapper */}
        <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-emerald-400/40 via-white/[0.08] to-emerald-500/20 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="rounded-2xl overflow-hidden bg-[#0a0e1a] ring-1 ring-inset ring-white/[0.04]">
            <img
              src={heroInstancesPanel}
              alt="Painel de instâncias"
              className="block w-full h-auto"
              loading="lazy"
              style={{ filter: "brightness(1.05) contrast(1.08) saturate(1.25)" }}
            />
          </div>
          {/* Reflexo sutil no topo */}
          <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/40 to-transparent pointer-events-none" />
        </div>
      </motion.div>
    </div>
  </Section>
);

// ─── 6. Plans (mantido, redesenhado clean) ───
const allPlans = [
  {
    name: "Starter",
    tagline: "Tudo para começar a vender mais pelo WhatsApp com um número. CRM, disparo, automações, IA e prospecção em um só lugar.",
    instances: 1,
    price: "39,99",
    popular: false,
    cta: "Começar agora",
    benefits: [
      "1 chip simultâneo",
      "CRM, automações e IA inclusos",
      "Aquecimento e disparo inclusos",
    ],
    whatsappIncluded: false,
  },
  {
    name: "Essencial",
    tagline: "Opere com consistência usando até 5 números. Distribua atendimentos, mantenha backup e escale seus disparos sem travar a operação.",
    instances: 5,
    price: "99,99",
    popular: false,
    cta: "Testar o sistema",
    benefits: [
      "Até 5 chips simultâneos",
      "CRM, automações e IA inclusos",
      "Aquecimento e disparo inclusos",
    ],
    whatsappIncluded: false,
  },
  {
    name: "Pro",
    tagline: "Operação profissional com 10 números trabalhando juntos. Mais alcance no disparo, mais leads no CRM e mais produtividade no time.",
    instances: 10,
    price: "187,99",
    popular: false,
    cta: "Começar agora",
    benefits: [
      "Até 10 chips simultâneos",
      "CRM completo + pipelines",
      "Prospecção e IA inclusos",
    ],
    whatsappIncluded: false,
  },
  {
    name: "Scale",
    tagline: "Escale com 30 números, automações avançadas e relatórios direto no WhatsApp. Ideal para times que vendem em alto volume todos os dias.",
    instances: 30,
    price: "397,99",
    popular: true,
    cta: "Começar agora",
    benefits: [
      "Até 30 chips simultâneos",
      "Suporte prioritário no WhatsApp",
      "Relatórios e alertas via WhatsApp",
    ],
    whatsappIncluded: true,
  },
  {
    name: "Business",
    tagline: "Estrutura robusta com 50 números para empresas que precisam de performance, organização e controle total da operação comercial.",
    instances: 50,
    price: "597,99",
    popular: false,
    cta: "Começar agora",
    benefits: [
      "Até 50 chips simultâneos",
      "Suporte prioritário no WhatsApp",
      "Relatórios e alertas via WhatsApp",
    ],
    whatsappIncluded: true,
  },
  {
    name: "Enterprise",
    tagline: "Máxima capacidade com 100 números simultâneos. Para grandes operações que exigem escala industrial, IA dedicada e prospecção em larga escala.",
    instances: 100,
    price: "1.097,99",
    popular: false,
    cta: "Começar agora",
    benefits: [
      "Até 100 chips simultâneos",
      "Suporte prioritário dedicado",
      "Relatórios e alertas via WhatsApp",
    ],
    whatsappIncluded: true,
  },
];

const Plans = () => {
  const navigate = useNavigate();

  const renderCard = (p: typeof allPlans[0]) => (
    <motion.div key={p.name} variants={fadeUp}
      className={`relative rounded-xl border transition-all duration-200 ease-out flex flex-col h-full p-5 hover:-translate-y-1 ${
        p.popular
          ? "border-white/[0.22] bg-white/[0.05] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_-12px_rgba(255,255,255,0.08)] hover:border-white/[0.3] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_12px_50px_-12px_rgba(255,255,255,0.12)]"
          : "border-white/[0.06] bg-white/[0.015] hover:border-white/[0.14] hover:bg-white/[0.035]"
      }`}
    >
      {p.popular && (
        <span className="absolute -top-2.5 left-5 text-[9px] font-semibold uppercase tracking-wider bg-white text-black px-2 py-0.5 rounded-full">
          Mais escolhido
        </span>
      )}
      <h3 className="text-[14px] font-semibold text-white mb-1">{p.name}</h3>
      <p className="text-[11px] text-white/35 mb-4">{p.tagline}</p>

      <div className="flex items-baseline gap-0.5 mb-5">
        {p.price ? (
          <>
            <span className="text-[11px] font-medium text-white/35 mr-0.5">R$</span>
            <span className="text-[1.75rem] font-semibold tracking-[-0.02em] leading-none text-white">{p.price.split(",")[0]}</span>
            <span className="text-[13px] font-medium text-white/45">,{p.price.split(",")[1]}</span>
            <span className="text-[10px] text-white/30 ml-1">/mês</span>
          </>
        ) : (
          <span className="text-[1.5rem] font-semibold tracking-tight text-white">Sob consulta</span>
        )}
      </div>

      <ul className="space-y-2 mb-5 flex-1">
        {p.benefits.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[12px] text-white/60 leading-[1.45]">
            <CheckCircle2 className="w-3 h-3 text-white/35 flex-shrink-0 mt-[3px]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <Button onClick={() => {
        if (p.name === "Custom") {
          window.open(`https://wa.me/5562994192500?text=${encodeURIComponent("Olá, tenho interesse no plano Custom.")}`, "_blank");
        } else {
          navigate("/auth?mode=signup");
        }
      }}
        className={`w-full text-[12px] font-medium h-9 mt-auto rounded-md shadow-none ${
          p.popular
            ? "bg-white hover:bg-white text-black"
            : "bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.06]"
        }`}
      >
        {p.cta}
      </Button>
    </motion.div>
  );

  return (
    <Section id="planos">
      <div className="max-w-3xl mb-8 md:mb-14">
        <Eyebrow>Planos</Eyebrow>
        <SectionTitle className="mb-4 md:mb-6">Escolha o plano que acompanha sua escala.</SectionTitle>
        <SectionSub>Acesso completo em todos os planos. Muda apenas a capacidade e o nível de suporte.</SectionSub>
      </div>
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {allPlans.map(renderCard)}
      </motion.div>
      <p className="text-center text-[12px] text-white/40 md:text-white/35 mt-8 md:mt-10">
        Sem contrato. Cancele quando quiser.
      </p>
    </Section>
  );
};

// ─── 7. Comunidade (preservada, simplificada) ───
const communityBenefits = [
  { icon: Megaphone, title: "Atualizações em primeira mão" },
  { icon: Star, title: "Melhorias e correções" },
  { icon: ShieldCheck, title: "Boas práticas de segurança" },
  { icon: MessageCircle, title: "Network com outros operadores" },
];

const CommunitySection = () => (
  <section id="comunidade" className="pt-4 pb-14 md:py-32 px-5 md:px-6">
    <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4 lg:gap-12 items-center">
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger} className="lg:col-span-6 order-2 lg:order-1">
        <motion.div variants={fadeUp}><Eyebrow>Comunidade</Eyebrow></motion.div>
        <motion.div variants={fadeUp}>
          <SectionTitle className="mb-4 md:mb-6">
            Faça parte do <span className="text-amber-400/90">grupo oficial.</span>
          </SectionTitle>
        </motion.div>
        <motion.div variants={fadeUp}>
          <SectionSub className="mb-6 md:mb-8 max-w-md">
            Receba atualizações, melhorias, correções e avisos importantes da plataforma em primeira mão.
          </SectionSub>
        </motion.div>
        <motion.ul variants={fadeUp} className="space-y-2.5 md:space-y-3 mb-6 md:mb-10">
          {communityBenefits.map((b) => (
            <li key={b.title} className="flex items-center gap-3 text-[13px] text-white/65">
              <b.icon className="w-4 h-4 text-amber-400/70" />
              {b.title}
            </li>
          ))}
        </motion.ul>
        <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3">
          <a
            href="https://chat.whatsapp.com/F9Xw6819N8J97Am6T8yC8D?mode=gi_t"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 h-10 rounded-[10px] bg-amber-400/90 hover:bg-amber-400 text-black text-[13px] font-medium transition-colors"
          >
            <UsersRound className="w-4 h-4" />
            Entrar na comunidade
          </a>
          <a
            href="https://wa.me/5562994192500?text=Ol%C3%A1%2C%20vim%20do%20site%20da%20DG%20Conting%C3%AAncia%20PRO%20e%20preciso%20de%20suporte."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 h-10 rounded-[10px] border border-white/10 bg-white/[0.02] text-white/70 text-[13px] font-medium hover:bg-white/[0.05] transition-colors"
          >
            Falar com suporte
          </a>
        </motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.98 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.4, ease: easeOut }} className="lg:col-span-6 flex justify-center order-1 lg:order-2">
        <div className="relative">
          <div className="absolute -inset-10 bg-[radial-gradient(circle_at_50%_45%,rgba(202,138,4,0.18)_0%,rgba(161,98,7,0.06)_45%,transparent_70%)] blur-2xl pointer-events-none" />
          <div className="absolute -inset-2 bg-[radial-gradient(ellipse_at_30%_25%,rgba(234,179,8,0.14)_0%,transparent_55%)] blur-md pointer-events-none" />
          {/* Gold particles */}
          <div className="absolute -inset-12 pointer-events-none overflow-hidden">
            {Array.from({ length: 16 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute w-1 h-1 rounded-full bg-amber-400"
                style={{
                  left: `${10 + Math.random() * 80}%`,
                  top: `${10 + Math.random() * 80}%`,
                }}
                animate={{
                  y: [0, -18 - Math.random() * 25, 0],
                  x: [0, (Math.random() - 0.5) * 16, 0],
                  opacity: [0.05, 0.4 + Math.random() * 0.3, 0.05],
                  scale: [0.4, 1 + Math.random() * 0.5, 0.4],
                }}
                transition={{
                  duration: 3 + Math.random() * 3,
                  repeat: Infinity,
                  delay: Math.random() * 3,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
          <div className="relative w-[110px] h-[110px] md:w-[200px] md:h-[200px] rounded-2xl overflow-hidden border border-amber-500/25 bg-[hsl(222,22%,7%)] shadow-[0_1px_0_0_rgba(253,224,71,0.08)_inset,0_0_0_1px_rgba(202,138,4,0.12),0_18px_40px_-18px_rgba(120,53,15,0.55),0_6px_16px_-6px_rgba(0,0,0,0.6)]">
            <img src={logo} alt="DG Contingência Pro" className="w-full h-full object-cover" />
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

// ─── 8. FAQ ───
const faqs = [
  { q: "Preciso ter servidor ou infraestrutura própria?", a: "Não. Tudo roda na nuvem. Você só precisa criar sua conta, conectar os chips e começar a operar." },
  { q: "Como funciona o aquecimento automático?", a: "O sistema realiza interações graduais e controladas para amadurecer o chip antes de qualquer envio em volume." },
  { q: "Existe fidelidade ou contrato mínimo?", a: "Não. Você pode cancelar ou trocar de plano a qualquer momento, sem multas." },
  { q: "O que são os alertas via WhatsApp?", a: "Recurso adicional que envia notificações de desconexões, falhas e status de campanhas direto no seu WhatsApp." },
  { q: "Quantas instâncias posso usar?", a: "Cada plano tem um limite: Starter (1), Essencial (5), Pro (10), Scale (30), Business (50) e Enterprise (100)." },
];

const FAQ = () => (
  <Section id="faq">
    <div className="max-w-3xl mb-8 md:mb-12">
      <Eyebrow>Perguntas frequentes</Eyebrow>
      <SectionTitle>Tudo que você precisa saber.</SectionTitle>
    </div>
    <div className="max-w-3xl border-t border-white/[0.05]">
      {faqs.map((f) => (
        <details key={f.q} className="group border-b border-white/[0.05]">
          <summary className="flex items-start gap-4 justify-between py-4 md:py-5 cursor-pointer text-[14px] font-medium text-white/85 hover:text-white transition-colors list-none">
            <span className="flex-1">{f.q}</span>
            <ChevronDown className="w-4 h-4 mt-0.5 flex-shrink-0 text-white/30 group-open:rotate-180 transition-transform" />
          </summary>
          <p className="pb-4 md:pb-5 text-[13px] text-white/55 md:text-white/45 leading-[1.6] md:leading-[1.65] max-w-2xl">{f.a}</p>
        </details>
      ))}
    </div>
  </Section>
);

// ─── 9. Final CTA ───
const FinalCTA = () => {
  const navigate = useNavigate();
  return (
    <Section>
      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.4, ease: easeOut }} className="relative max-w-4xl mx-auto text-center py-12 md:py-28 px-5 md:px-6 rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08)_0%,transparent_60%)] pointer-events-none" />
        <div className="relative">
          <h2 className="text-[1.75rem] md:text-[2.75rem] lg:text-[3.25rem] font-semibold text-white tracking-[-0.025em] leading-[1.1] md:leading-[1.05] mb-4 md:mb-5 max-w-2xl mx-auto">
            Pronto para escalar seu WhatsApp com controle?
          </h2>
          <p className="text-[15px] text-white/65 md:text-white/55 mb-7 md:mb-10 max-w-md mx-auto leading-[1.55] md:leading-[1.6]">
            Comece agora e gerencie toda sua operação em um só lugar.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="w-full sm:w-auto bg-white hover:bg-white text-black text-[13px] font-semibold px-6 h-11 rounded-[10px] gap-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_-6px_rgba(255,255,255,0.18)] hover:scale-[1.02] transition-all duration-200">
              Começar agora <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <Button size="lg" variant="ghost" onClick={() => document.getElementById("uso")?.scrollIntoView({ behavior: "smooth" })} className="w-full sm:w-auto bg-transparent text-white/65 hover:text-white hover:bg-transparent text-[13px] font-medium px-3 h-11">
              Ver como funciona →
            </Button>
          </div>
          <p className="text-[12px] text-white/40 md:text-white/35 mt-5 md:mt-6">
            Sem contrato. Cancele quando quiser.
          </p>
        </div>
      </motion.div>
    </Section>
  );
};

// ─── Footer ───
const FooterSection = () => (
  <footer className="py-12 px-6 border-t border-white/[0.04]">
    <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <img src={logo} alt="DG" width={24} height={24} className="rounded-md" />
        <span className="text-[13px] font-medium text-white/70">DG Contingência</span>
      </div>
      <p className="text-[11px] text-white/30">© {new Date().getFullYear()} DG Contingência. Todos os direitos reservados.</p>
    </div>
  </footer>
);

// ─── Main ───
const Landing = () => {
  useEffect(() => { prefetchRoutes(); }, []);

  return (
    <div className="min-h-screen bg-[hsl(222,22%,5%)] relative" style={{ overflowX: "hidden" }}>
      <Background />
      <div className="relative z-10">
        <Navbar />
        <Hero />
        <Stats />
        <Product />
        <Features />
        <TiltHighlight />
        <UseCase />
        <Plans />
        <CommunitySection />
        <FAQ />
        <FinalCTA />
        <FooterSection />
      </div>
      
    </div>
  );
};

export default Landing;
