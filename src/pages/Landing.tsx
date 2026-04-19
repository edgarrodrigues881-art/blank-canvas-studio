import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Zap, Shield, BarChart3, Smartphone, Settings,
  ArrowRight, CheckCircle2, MessageSquare, Users, Layers,
  ChevronDown, Star, Lock, UsersRound, MessageCircle, ShieldCheck, Megaphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo-new.png";
import dashboardPreview from "@/assets/dashboard-preview-landing.png";

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
  const scroll = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-[hsl(222,22%,5%)]/80 border-b border-white/[0.05]">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between h-14 px-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={logo} alt="DG" width={28} height={28} className="rounded-md flex-shrink-0" />
          <span className="hidden sm:inline text-[13px] font-semibold text-white tracking-tight whitespace-nowrap">DG Contingência Pro</span>
        </div>
        <nav className="hidden md:flex items-center gap-7">
          {[["produto", "Produto"], ["recursos", "Recursos"], ["planos", "Planos"], ["faq", "FAQ"]].map(([id, label]) => (
            <button key={id} onClick={() => scroll(id)} className="text-[13px] text-white/55 hover:text-white transition-colors">{label}</button>
          ))}
          <button onClick={() => scroll("comunidade")} className="text-[13px] text-amber-400/80 hover:text-amber-300 transition-colors">Comunidade</button>
        </nav>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate("/auth")} className="text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/[0.04] h-8 px-3">Acessar sistema</Button>
          <Button size="sm" onClick={() => navigate("/auth?mode=signup")} className="text-[12px] font-medium bg-white/95 hover:bg-white text-black h-8 px-3.5 rounded-md shadow-none">Começar grátis</Button>
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
    <section className="relative pt-24 md:pt-32 pb-12 md:pb-32 px-5 md:px-6 overflow-hidden">
      <div className="max-w-[1320px] mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-center">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="lg:col-span-6 text-center lg:text-left">
            <motion.h1 variants={fadeUp} className="text-[2.25rem] sm:text-5xl md:text-[3.75rem] lg:text-[4.25rem] xl:text-[4.75rem] font-semibold text-white leading-[1.05] md:leading-[1.0] tracking-[-0.035em] md:tracking-[-0.04em] mb-5 md:mb-7">
              Pare de perder números no WhatsApp.<br />
              <span className="text-white/55">Escale com controle total.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-[15px] md:text-[17px] text-white/65 md:text-white/60 max-w-[500px] mx-auto lg:mx-0 mb-6 md:mb-9 leading-[1.5] md:leading-[1.55]">
              Evite banimentos, gerencie múltiplos chips com segurança e escale sua operação sem caos.
            </motion.p>

            <motion.div variants={fadeScale} className="flex flex-col sm:flex-row items-center lg:items-start lg:justify-start justify-center gap-2.5 md:gap-3">
              <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="w-full sm:w-auto bg-white hover:bg-white text-black text-[14px] font-semibold px-7 h-12 rounded-[10px] gap-2 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_32px_-4px_rgba(255,255,255,0.15)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_12px_40px_-4px_rgba(255,255,255,0.25)] hover:scale-[1.02] transition-all duration-200">
                Começar agora <ArrowRight className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="ghost" onClick={() => document.getElementById("uso")?.scrollIntoView({ behavior: "smooth" })} className="w-full sm:w-auto bg-transparent text-white/70 hover:text-white hover:bg-white/[0.04] text-[14px] font-medium px-4 h-12 rounded-[10px]">
                Ver como funciona →
              </Button>
            </motion.div>

            <motion.p variants={fadeUp} className="text-[12px] text-white/45 md:text-white/40 mt-4 md:mt-5 flex items-center justify-center lg:justify-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70" />
              Acesso imediato · Sem cartão · Sem contrato
            </motion.p>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease: easeOut, delay: 0.1 }} className="lg:col-span-6 relative w-full max-w-[420px] md:max-w-[640px] mx-auto lg:mx-0 lg:ml-auto">
            <div className="relative">
              {/* Premium multi-layer glow */}
              <div className="absolute -inset-20 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.18)_0%,transparent_60%)] blur-3xl pointer-events-none" />
              <div className="absolute -inset-16 bg-[radial-gradient(ellipse_at_60%_40%,rgba(139,92,246,0.12)_0%,transparent_65%)] blur-2xl pointer-events-none" />
              <div className="absolute -bottom-10 inset-x-10 h-32 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.6)_0%,transparent_70%)] blur-2xl pointer-events-none" />

              <div className="group relative rounded-xl border border-white/[0.08] overflow-hidden bg-[hsl(222,22%,7%)] shadow-[0_50px_120px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04),0_0_80px_-20px_rgba(99,102,241,0.25)] transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_60px_140px_-20px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06),0_0_100px_-20px_rgba(99,102,241,0.35)]">
                <div className="bg-white/[0.02] px-4 py-2.5 border-b border-white/[0.05] flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-white/[0.12]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-white/[0.12]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-white/[0.12]" />
                  <span className="ml-3 text-[10px] text-white/35 font-medium tracking-wide">DG Contingência Pro</span>
                </div>
                <img src={dashboardPreview} alt="Painel DG Contingência" className="w-full h-auto block transition-transform duration-300 ease-out group-hover:scale-[1.015]" loading="eager" />
              </div>
            </div>
          </motion.div>
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
          <img src={dashboardPreview} alt="Painel" className="w-full h-auto block opacity-80" loading="lazy" style={{ filter: "brightness(0.85) contrast(0.92) saturate(0.9)" }} />
        </div>
      </motion.div>
    </div>
  </Section>
);

// ─── 6. Plans (mantido, redesenhado clean) ───
const allPlans = [
  {
    name: "Essencial",
    tagline: "Para começar",
    instances: 5,
    price: "99,99",
    popular: false,
    cta: "Testar o sistema",
    benefits: [
      "Até 5 chips simultâneos",
      "Suporte por e-mail",
      "Aquecimento e disparo inclusos",
    ],
    whatsappIncluded: false,
  },
  {
    name: "Start",
    tagline: "Operação inicial",
    instances: 10,
    price: "187,99",
    popular: false,
    cta: "Começar agora",
    benefits: [
      "Até 10 chips simultâneos",
      "Suporte por e-mail",
      "Monitoramento em tempo real",
    ],
    whatsappIncluded: false,
  },
  {
    name: "Pro",
    tagline: "Mais escolhido",
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
    name: "Scale",
    tagline: "Operação em escala",
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
    name: "Elite",
    tagline: "Alta capacidade",
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
  {
    name: "Custom",
    tagline: "Grande escala",
    instances: 200,
    price: null,
    popular: false,
    cta: "Falar com vendas",
    benefits: [
      "200+ chips simultâneos",
      "Suporte dedicado por gerente",
      "Infraestrutura sob medida",
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
  <Section id="comunidade">
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-12 items-center">
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
          <div className="relative w-[140px] h-[140px] md:w-[200px] md:h-[200px] rounded-2xl overflow-hidden border border-amber-500/25 bg-[hsl(222,22%,7%)] shadow-[0_1px_0_0_rgba(253,224,71,0.08)_inset,0_0_0_1px_rgba(202,138,4,0.12),0_18px_40px_-18px_rgba(120,53,15,0.55),0_6px_16px_-6px_rgba(0,0,0,0.6)]">
            <img src={logo} alt="DG Contingência Pro" className="w-full h-full object-cover" />
          </div>
        </div>
      </motion.div>
    </div>
  </Section>
);

// ─── 8. FAQ ───
const faqs = [
  { q: "Preciso ter servidor ou infraestrutura própria?", a: "Não. Tudo roda na nuvem. Você só precisa criar sua conta, conectar os chips e começar a operar." },
  { q: "Como funciona o aquecimento automático?", a: "O sistema realiza interações graduais e controladas para amadurecer o chip antes de qualquer envio em volume." },
  { q: "Existe fidelidade ou contrato mínimo?", a: "Não. Você pode cancelar ou trocar de plano a qualquer momento, sem multas." },
  { q: "O que são os alertas via WhatsApp?", a: "Recurso adicional que envia notificações de desconexões, falhas e status de campanhas direto no seu WhatsApp." },
  { q: "Quantas instâncias posso usar?", a: "Cada plano tem um limite: Essencial (5), Start (10), Pro (30), Scale (50), Elite (100) e Custom (200+)." },
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
