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

// ─── Animation ───
const fadeUp = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } } };
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

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
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="DG" width={28} height={28} className="rounded-md" />
          <span className="text-[13px] font-semibold text-white tracking-tight">DG Contingência</span>
        </div>
        <nav className="hidden md:flex items-center gap-7">
          {[["produto", "Produto"], ["recursos", "Recursos"], ["planos", "Planos"], ["faq", "FAQ"]].map(([id, label]) => (
            <button key={id} onClick={() => scroll(id)} className="text-[13px] text-white/55 hover:text-white transition-colors">{label}</button>
          ))}
          <button onClick={() => scroll("comunidade")} className="text-[13px] text-amber-400/80 hover:text-amber-300 transition-colors">Comunidade</button>
        </nav>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate("/auth")} className="text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/[0.04] h-8 px-3">Entrar</Button>
          <Button size="sm" onClick={() => navigate("/auth?mode=signup")} className="text-[12px] font-medium bg-white/95 hover:bg-white text-black h-8 px-3.5 rounded-md shadow-none">Criar conta</Button>
        </div>
      </div>
    </header>
  );
};

// ─── Section wrapper ───
const Section = ({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) => (
  <section id={id} className={`py-24 md:py-32 px-6 ${className}`}>
    <div className="max-w-[1200px] mx-auto">{children}</div>
  </section>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-block text-[11px] font-medium uppercase tracking-[0.18em] text-white/45 mb-5">{children}</span>
);

const SectionTitle = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <h2 className={`text-[2rem] md:text-[2.75rem] lg:text-[3.25rem] font-semibold text-white tracking-[-0.025em] leading-[1.05] ${className}`}>{children}</h2>
);

const SectionSub = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-[15px] md:text-base text-white/50 leading-[1.6] ${className}`}>{children}</p>
);

// ─── 1. Hero ───
const Hero = () => {
  const navigate = useNavigate();
  return (
    <section className="relative pt-44 md:pt-56 pb-32 md:pb-44 px-6 overflow-hidden">
      <div className="max-w-[1280px] mx-auto relative z-10 lg:pl-2 xl:pl-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-20 lg:gap-10 items-center">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="lg:col-span-7 text-center lg:text-left">
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.07] bg-white/[0.02] text-[11px] font-medium text-white/55 mb-10 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />
                Novo · Plataforma 2.0
              </span>
            </motion.div>

            <motion.h1 variants={fadeUp} className="text-[2.75rem] sm:text-5xl md:text-[3.75rem] lg:text-[4.25rem] xl:text-[4.5rem] font-semibold text-white leading-[1.02] tracking-[-0.035em] mb-10">
              The WhatsApp<br />operating system<br />
              <span className="text-white/55">for serious teams.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-[15px] md:text-[16px] text-white/55 max-w-[440px] mx-auto lg:mx-0 mb-12 leading-[1.65]">
              Aquecimento, disparo e monitoramento em uma única plataforma. Projetada para escala.
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center lg:items-start lg:justify-start justify-center gap-5">
              <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="bg-white/95 hover:bg-white text-black text-[13px] font-medium px-5 h-10 rounded-[10px] gap-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_4px_16px_-4px_rgba(0,0,0,0.4)] transition-all duration-200">
                Começar grátis <ArrowRight className="w-3.5 h-3.5" />
              </Button>
              <Button size="lg" variant="ghost" onClick={() => document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" })} className="bg-transparent text-white/65 hover:text-white hover:bg-transparent text-[13px] font-medium px-2 h-10 rounded-[10px]">
                Ver planos →
              </Button>
            </motion.div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} className="lg:col-span-5 relative lg:mt-16 lg:translate-x-4 xl:translate-x-8">
            <div className="relative">
              <div className="absolute -inset-10 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.07)_0%,transparent_65%)] blur-3xl pointer-events-none" />
              <div className="relative rounded-xl border border-white/[0.06] overflow-hidden bg-[hsl(222,22%,7%)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.03)]">
                <div className="bg-white/[0.015] px-4 py-2.5 border-b border-white/[0.04] flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-white/[0.1]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-white/[0.1]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-white/[0.1]" />
                  <span className="ml-3 text-[10px] text-white/25 font-medium tracking-wide">DG Contingência PRO</span>
                </div>
                <img src={dashboardPreview} alt="Painel" className="w-full h-auto block opacity-80" loading="eager" style={{ filter: "brightness(0.85) contrast(0.92) saturate(0.9)" }} />
                <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(11,11,13,0.15)_0%,rgba(11,11,13,0.35)_100%)] pointer-events-none" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// ─── 2. Stats (social proof) ───
const stats = [
  { value: "1.000+", label: "Chips em operação" },
  { value: "50M+", label: "Mensagens entregues" },
  { value: "99.9%", label: "Estabilidade média" },
  { value: "24/7", label: "Suporte ativo" },
];

const Stats = () => (
  <section className="py-16 md:py-20 px-6 border-y border-white/[0.04]">
    <div className="max-w-[1200px] mx-auto">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/35 text-center mb-10">Confiado por equipes que escalam</p>
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger} className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
        {stats.map((s) => (
          <motion.div key={s.label} variants={fadeUp} className="text-center">
            <div className="text-[2rem] md:text-[2.5rem] font-semibold text-white tracking-[-0.03em] leading-none mb-2">{s.value}</div>
            <div className="text-[12px] text-white/40 font-medium">{s.label}</div>
          </motion.div>
        ))}
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
  { icon: Zap, title: "Envio otimizado", desc: "Intervalos inteligentes mantêm suas instâncias saudáveis durante campanhas." },
  { icon: Shield, title: "Aquecimento automático", desc: "Warmup progressivo em fases controladas para amadurecer cada chip." },
  { icon: BarChart3, title: "Métricas em tempo real", desc: "Acompanhe entregas, falhas e desempenho de cada instância no painel." },
  { icon: Smartphone, title: "Múltiplas instâncias", desc: "Conecte e controle dezenas de chips simultaneamente em um único ambiente." },
  { icon: Layers, title: "Campanhas em massa", desc: "Distribuição entre instâncias com pausas e intervalos programados." },
  { icon: Lock, title: "Alertas no WhatsApp", desc: "Notificações de desconexões, falhas e status direto no seu WhatsApp." },
];

const Features = () => (
  <Section id="recursos">
    <div className="max-w-3xl mb-16">
      <Eyebrow>Recursos</Eyebrow>
      <SectionTitle className="mb-6">Construído para quem leva a operação a sério.</SectionTitle>
      <SectionSub>Cada recurso pensado para reduzir risco e dar previsibilidade.</SectionSub>
    </div>
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={stagger} className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-14">
      {features.map((f) => (
        <motion.div key={f.title} variants={fadeUp}>
          <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-5">
            <f.icon className="w-4 h-4 text-white/70" />
          </div>
          <h3 className="text-[15px] font-semibold text-white mb-2 tracking-tight">{f.title}</h3>
          <p className="text-[13px] text-white/45 leading-[1.6]">{f.desc}</p>
        </motion.div>
      ))}
    </motion.div>
  </Section>
);

// ─── 5. Use case (left text + right mockup) ───
const UseCase = () => (
  <Section id="uso">
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-12 items-center">
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger} className="lg:col-span-5">
        <motion.div variants={fadeUp}><Eyebrow>Caso de uso</Eyebrow></motion.div>
        <motion.div variants={fadeUp}>
          <SectionTitle className="mb-6 text-[1.75rem] md:text-[2.25rem] lg:text-[2.5rem]">
            De 1 a 100+ chips, sem perder o controle.
          </SectionTitle>
        </motion.div>
        <motion.div variants={fadeUp}>
          <SectionSub className="mb-8 max-w-md">
            Painel único para gerenciar dezenas de instâncias. Receba alertas, monitore entregas e mantenha tudo organizado mesmo em alta escala.
          </SectionSub>
        </motion.div>
        <motion.ul variants={fadeUp} className="space-y-3">
          {["Visão consolidada de todas as instâncias", "Distribuição automática entre chips", "Pausas e intervalos programados"].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[13px] text-white/60">
              <CheckCircle2 className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" />{item}
            </li>
          ))}
        </motion.ul>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="lg:col-span-7 relative">
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
const standardPlanFeatures = [
  "Todas as funcionalidades inclusas",
  "Mesmo nível de suporte",
  "Monitoramento em tempo real",
  "Infraestrutura completa",
];

const allPlans = [
  { name: "Essencial", instances: 5, price: "99,99", popular: false, subtitle: "Ideal para começar.", cta: "Começar", features: [...standardPlanFeatures], whatsappLine: "Relatórios via WhatsApp", whatsappIncluded: false },
  { name: "Start", instances: 10, price: "187,99", popular: false, subtitle: "Mais capacidade.", cta: "Começar", features: [...standardPlanFeatures], whatsappLine: "Relatórios via WhatsApp", whatsappIncluded: false },
  { name: "Pro", instances: 30, price: "397,99", popular: true, subtitle: "Em crescimento.", cta: "Escalar", features: [...standardPlanFeatures], whatsappLine: "Relatórios via WhatsApp incluso", whatsappIncluded: true },
  { name: "Scale", instances: 50, price: "597,99", popular: false, subtitle: "Múltiplas instâncias.", cta: "Escalar", features: [...standardPlanFeatures], whatsappLine: "Relatórios via WhatsApp incluso", whatsappIncluded: true },
  { name: "Elite", instances: 100, price: "1.097,99", popular: false, subtitle: "Alta capacidade.", cta: "Contratar", features: [...standardPlanFeatures], whatsappLine: "Relatórios via WhatsApp incluso", whatsappIncluded: true },
  { name: "Custom", instances: 200, price: null, popular: false, subtitle: "Grande escala.", cta: "Consultar", features: [...standardPlanFeatures], whatsappLine: "Relatórios via WhatsApp incluso", whatsappIncluded: true },
];

const Plans = () => {
  const navigate = useNavigate();

  const renderCard = (p: typeof allPlans[0]) => (
    <motion.div key={p.name} variants={fadeUp}
      className={`relative rounded-xl border transition-all duration-300 flex flex-col h-full p-5 ${
        p.popular
          ? "border-white/[0.18] bg-white/[0.04]"
          : "border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.03]"
      }`}
    >
      {p.popular && (
        <span className="absolute -top-2.5 left-5 text-[9px] font-semibold uppercase tracking-wider bg-white text-black px-2 py-0.5 rounded-full">
          Recomendado
        </span>
      )}
      <h3 className="text-[14px] font-semibold text-white mb-1">{p.name}</h3>
      <p className="text-[11px] text-white/35 mb-4">{p.name === "Custom" ? "200+ instâncias" : `até ${p.instances} instâncias`}</p>

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
        {p.features.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[12px] text-white/55">
            <CheckCircle2 className="w-3 h-3 text-white/30 flex-shrink-0 mt-1" />{item}
          </li>
        ))}
        <li className={`flex items-start gap-2 text-[12px] ${p.whatsappIncluded ? "text-white/55" : "text-white/25"}`}>
          {p.whatsappIncluded ? (
            <CheckCircle2 className="w-3 h-3 text-white/30 flex-shrink-0 mt-1" />
          ) : (
            <span className="w-3 h-3 flex-shrink-0 mt-1 flex items-center justify-center text-white/15 text-[9px]">✕</span>
          )}
          {p.whatsappLine}
        </li>
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
            ? "bg-white/95 hover:bg-white text-black"
            : "bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.06]"
        }`}
      >
        {p.cta}
      </Button>
    </motion.div>
  );

  return (
    <Section id="planos">
      <div className="max-w-3xl mb-14">
        <Eyebrow>Planos</Eyebrow>
        <SectionTitle className="mb-6">Escolha o plano que acompanha sua escala.</SectionTitle>
        <SectionSub>Acesso completo em todos os planos. Muda apenas a quantidade de instâncias.</SectionSub>
      </div>
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={stagger} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {allPlans.map(renderCard)}
      </motion.div>
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger} className="lg:col-span-6">
        <motion.div variants={fadeUp}><Eyebrow>Comunidade</Eyebrow></motion.div>
        <motion.div variants={fadeUp}>
          <SectionTitle className="mb-6">
            Faça parte do <span className="text-amber-400/90">grupo oficial.</span>
          </SectionTitle>
        </motion.div>
        <motion.div variants={fadeUp}>
          <SectionSub className="mb-8 max-w-md">
            Receba atualizações, melhorias, correções e avisos importantes da plataforma em primeira mão.
          </SectionSub>
        </motion.div>
        <motion.ul variants={fadeUp} className="space-y-3 mb-10">
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

      <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.8 }} className="lg:col-span-6 flex justify-center">
        <div className="relative">
          <div className="absolute -inset-12 bg-[radial-gradient(circle,rgba(245,158,11,0.1)_0%,transparent_65%)] blur-3xl" />
          <div className="relative w-[200px] h-[200px] rounded-2xl overflow-hidden border border-amber-500/20 bg-[hsl(222,22%,7%)]">
            <img src={logo} alt="DG Contingência PRO" className="w-full h-full object-cover" />
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
    <div className="max-w-3xl mb-12">
      <Eyebrow>Perguntas frequentes</Eyebrow>
      <SectionTitle>Tudo que você precisa saber.</SectionTitle>
    </div>
    <div className="max-w-3xl border-t border-white/[0.05]">
      {faqs.map((f) => (
        <details key={f.q} className="group border-b border-white/[0.05]">
          <summary className="flex items-center justify-between py-5 cursor-pointer text-[14px] font-medium text-white/85 hover:text-white transition-colors list-none">
            {f.q}
            <ChevronDown className="w-4 h-4 text-white/30 group-open:rotate-180 transition-transform" />
          </summary>
          <p className="pb-5 text-[13px] text-white/45 leading-[1.65] max-w-2xl">{f.a}</p>
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
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.6 }} className="relative max-w-4xl mx-auto text-center py-20 md:py-28 px-6 rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08)_0%,transparent_60%)] pointer-events-none" />
        <div className="relative">
          <h2 className="text-[2rem] md:text-[2.75rem] lg:text-[3.25rem] font-semibold text-white tracking-[-0.025em] leading-[1.05] mb-5 max-w-2xl mx-auto">
            Pronto para operar com controle total?
          </h2>
          <p className="text-[15px] text-white/50 mb-10 max-w-md mx-auto leading-[1.6]">
            Crie sua conta em segundos. Sem fidelidade, sem contratos longos.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="bg-white/95 hover:bg-white text-black text-[13px] font-medium px-5 h-10 rounded-[10px] gap-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_4px_16px_-4px_rgba(0,0,0,0.4)]">
              Começar grátis <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <Button size="lg" variant="ghost" onClick={() => document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" })} className="bg-transparent text-white/65 hover:text-white hover:bg-transparent text-[13px] font-medium px-2 h-10">
              Ver planos →
            </Button>
          </div>
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

// ─── WhatsApp Float ───
const WhatsAppFloat = () => (
  <a href="https://wa.me/5562994192500?text=Ol%C3%A1%2C%20vim%20do%20site%20da%20DG%20Conting%C3%AAncia%20PRO%20e%20preciso%20de%20suporte." target="_blank" rel="noopener noreferrer"
    className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-[hsl(var(--primary))] hover:scale-105 flex items-center justify-center transition-transform shadow-lg shadow-black/30"
    aria-label="WhatsApp"
  >
    <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.212l-.257-.154-2.874.854.854-2.874-.154-.257A8 8 0 1112 20z"/></svg>
  </a>
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
      <WhatsAppFloat />
    </div>
  );
};

export default Landing;
