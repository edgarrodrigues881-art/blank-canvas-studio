import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import {
  Zap, Shield, BarChart3, Smartphone, Settings,
  ArrowRight, CheckCircle2, MessageSquare, Users, Layers,
  ChevronDown, Star, Lock, UsersRound, MessageCircle, ShieldCheck, Megaphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo-new.png";
import heroCrmMobile from "@/assets/hero-crm-mobile.png";
import heroInstancesPanel from "@/assets/hero-instances-panel.png";
import HeroDataViz from "@/components/landing/HeroDataViz";
import { HERO_METRICS, HERO_BAR_SERIES } from "@/components/landing/heroMetrics";

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

// ─── Navbar ───
const Navbar = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const scroll = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const goToApp = () => navigate(session ? "/app" : "/login");

  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-[hsl(222,22%,5%)]/80 border-b border-white/[0.05]">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between h-14 px-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={logo} alt="DG" width={28} height={28} className="rounded-md flex-shrink-0" />
          <span className="hidden lg:inline text-[13px] font-semibold text-white tracking-tight whitespace-nowrap">DG Contingência Pro</span>
        </div>
        <nav className="hidden md:flex items-center gap-7">
          {[["produto", "Produto"], ["recursos", "Recursos"], ["planos", "Planos"], ["faq", "FAQ"]].map(([id, label]) => (
            <button key={id} onClick={() => scroll(id)} className="text-[13px] text-white/55 hover:text-white transition-colors">{label}</button>
          ))}
          <button onClick={() => scroll("comunidade")} className="text-[13px] text-amber-400/80 hover:text-amber-300 transition-colors">Comunidade</button>
        </nav>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={goToApp} className="text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/[0.04] h-8 px-3">
            {session ? "Ir para o app" : "Acessar sistema"}
          </Button>
          {!session && (
            <Button size="sm" onClick={() => navigate("/auth?mode=signup")} className="text-[12px] font-medium bg-white/95 hover:bg-white text-black h-8 px-3.5 rounded-md shadow-none">Começar grátis</Button>
          )}
        </div>
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

// ─── 1. Hero ───
const Hero = () => {
  const navigate = useNavigate();
  return (
    <section className="relative pt-24 md:pt-32 pb-14 md:pb-32 px-5 md:px-6 overflow-hidden lg:min-h-[100vh] flex items-center">
      {/* Background — animated data visualization (desktop) */}
      <HeroDataViz />

      <div className="max-w-[1320px] mx-auto relative z-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-6 items-center">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="lg:col-span-6 text-left">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 mb-6 md:mb-7 px-2.5 py-1 md:px-3 md:py-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" style={{ animationDuration: "2.4s" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <span className="text-[10.5px] md:text-[11px] font-medium text-emerald-300/90 tracking-wide">+{HERO_METRICS.messagesToday.value} mensagens enviadas hoje</span>
            </motion.div>

            <motion.h1 variants={fadeUp} className="text-[2.25rem] sm:text-[2.75rem] md:text-[3.75rem] lg:text-[4.25rem] xl:text-[4.75rem] font-semibold text-white leading-[1.08] md:leading-[1.0] tracking-[-0.03em] md:tracking-[-0.04em] mb-5 md:mb-7 [text-wrap:balance]">
              <span className="whitespace-nowrap">Pare de perder</span>{" "}
              <span className="whitespace-nowrap">números no</span>{" "}
              <span className="bg-gradient-to-br from-emerald-300 via-emerald-400 to-emerald-500 bg-clip-text text-transparent whitespace-nowrap">WhatsApp.</span>{" "}
              <span className="text-white/55">Escale com controle total.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-[15px] md:text-[17px] text-white/65 md:text-white/60 max-w-[500px] mb-8 md:mb-9 leading-[1.55]">
              Evite banimentos, gerencie múltiplos chips com segurança e escale sua operação sem caos.
            </motion.p>

            <motion.div variants={fadeScale} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Button
                size="lg"
                onClick={() => navigate("/auth?mode=signup")}
                className="group w-full sm:w-auto h-[52px] md:h-[50px] px-7 rounded-[12px] gap-2
                  bg-gradient-to-b from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-500
                  text-emerald-950 text-[15px] md:text-[14.5px] font-semibold tracking-tight
                  shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_8px_24px_-6px_rgba(16,185,129,0.55)]
                  hover:shadow-[0_1px_0_0_rgba(255,255,255,0.3)_inset,0_14px_32px_-6px_rgba(16,185,129,0.7)]
                  hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(222,22%,5%)]
                  transition-all duration-200"
              >
                Começar agora
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={() => document.getElementById("uso")?.scrollIntoView({ behavior: "smooth" })}
                className="group w-full sm:w-auto h-[52px] md:h-[50px] px-5 rounded-[12px] gap-1.5
                  bg-white/[0.03] hover:bg-white/[0.07]
                  border border-white/10 hover:border-white/20
                  text-white/80 hover:text-white text-[14.5px] font-medium
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(222,22%,5%)]
                  transition-all duration-200"
              >
                Ver como funciona
                <ArrowRight className="w-4 h-4 opacity-60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
              </Button>
            </motion.div>

            <motion.p variants={fadeUp} className="text-[12px] text-white/45 md:text-white/40 mt-6 md:mt-5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70 flex-shrink-0" />
              Acesso imediato · Sem cartão · Sem contrato
            </motion.p>
          </motion.div>

          {/* Mobile/tablet — compact data viz panel (no competing screenshot) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeOut, delay: 0.2 }}
            className="lg:hidden relative mt-4"
          >
            <div className="absolute -inset-8 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.18)_0%,transparent_70%)] blur-2xl pointer-events-none" />
            <div className="relative rounded-2xl border border-emerald-400/15 bg-[hsl(222,28%,7%)]/90 backdrop-blur-sm p-4 shadow-[0_20px_60px_-20px_rgba(16,185,129,0.35)] overflow-hidden">
              {/* Subtle grid */}
              <svg className="absolute inset-0 w-full h-full opacity-[0.05] pointer-events-none" aria-hidden="true">
                <defs>
                  <pattern id="hero-mob-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                    <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgb(52,211,153)" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#hero-mob-grid)" />
              </svg>

              {/* KPI row */}
              <div className="relative grid grid-cols-2 gap-2.5 mb-4">
                {[
                  { label: "Mensagens hoje", ...HERO_METRICS.messagesToday },
                  { label: "Taxa de entrega", ...HERO_METRICS.deliveryRate },
                ].map((s, i) => (
                  <div key={s.label} className="rounded-lg border border-emerald-400/15 bg-white/[0.02] px-3 py-2.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] uppercase tracking-wider text-white/40 font-medium">{s.label}</span>
                      <span className="text-[9px] text-emerald-400 font-semibold">{s.trend}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[17px] font-semibold text-white tabular-nums tracking-tight">{s.value}</span>
                      <motion.span
                        className="w-1 h-1 rounded-full bg-emerald-400"
                        animate={{ opacity: [0.9, 0.35, 0.9] }}
                        transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.5, ease: "easeInOut" }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Mini bar chart */}
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] uppercase tracking-wider text-white/40 font-medium">Volume últimas 24h</span>
                  <span className="text-[10px] text-emerald-400 font-semibold tabular-nums">↑ {HERO_METRICS.messagesToday.trend.replace("+", "")}</span>
                </div>
                <div className="flex items-end gap-1 h-[68px]">
                  {HERO_BAR_SERIES.map((v, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: [`${v}%`, `${Math.max(25, v - 6)}%`, `${v}%`] }}
                      transition={{
                        height: { duration: 5 + (i % 3), repeat: Infinity, delay: i * 0.12, ease: "easeInOut" },
                      }}
                      className="flex-1 rounded-t-sm bg-gradient-to-t from-emerald-600/70 via-emerald-500/85 to-emerald-300/95"
                      style={{ boxShadow: "0 0 6px rgba(16,185,129,0.28)" }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          <div className="hidden lg:block lg:col-span-6" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
};

// ─── 2. Trust (product-focused) ───
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

      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.4, ease: easeOut }} className="lg:col-span-7 relative">
        <div className="absolute -inset-8 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.06)_0%,transparent_70%)] blur-3xl pointer-events-none" />
        <div className="relative rounded-xl border border-white/[0.06] overflow-hidden bg-[hsl(222,22%,7%)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]">
          <div className="bg-white/[0.015] px-4 py-2.5 border-b border-white/[0.04] flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-white/[0.1]" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/[0.1]" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/[0.1]" />
            <span className="ml-3 text-[10px] text-white/25 font-medium tracking-wide">Painel de instâncias</span>
          </div>
          <img src={heroInstancesPanel} alt="Painel" className="w-full h-auto block opacity-80" loading="lazy" style={{ filter: "brightness(0.85) contrast(0.92) saturate(0.9)" }} />
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
  { q: "Quantas instâncias posso usar?", a: "Cada plano tem um limite: Starter (1), Essencial (5), Start (10), Pro (30), Scale (50) e Elite (100)." },
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
