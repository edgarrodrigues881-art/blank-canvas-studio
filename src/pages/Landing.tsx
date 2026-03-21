import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Zap, Shield, BarChart3, Smartphone, Settings, Globe,
  ArrowRight, CheckCircle2, MessageSquare, Users, Layers,
  ChevronDown, Star, Rocket, Clock, Lock, UsersRound, MessageCircle, ShieldCheck, Megaphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo-new.png";
import dashboardPreview from "@/assets/dashboard-preview-landing.png";

// Prefetch
const prefetchRoutes = () => {
  const load = () => { import("./Auth"); import("./dashboard/MyPlan"); };
  if ("requestIdleCallback" in window) (window as any).requestIdleCallback(load);
  else setTimeout(load, 2000);
};

// ─── Animation helpers ───
const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { visible: { transition: { staggerChildren: 0.08 } } };

// ─── Grid pattern background ───
const GridPattern = () => (
  <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
  <div className="absolute inset-0" style={{
      backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
      backgroundSize: '64px 64px',
    }} />
    <div className="absolute inset-0 bg-gradient-to-b from-[hsl(222,22%,6%)] via-transparent to-[hsl(222,22%,6%)]" />
  </div>
);

// ─── Navbar ───
const Navbar = () => {
  const navigate = useNavigate();
  const scroll = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-[hsl(222,22%,6%)]/90 border-b border-white/[0.06]">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-5">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="DG" width={32} height={32} className="rounded-lg" />
          <span className="text-sm font-bold text-white tracking-tight">
            DG Contingência <span className="text-[hsl(var(--primary))]">PRO</span>
          </span>
        </div>
        <nav className="hidden md:flex items-center gap-7">
          {[["beneficios", "Benefícios"], ["como-funciona", "Como funciona"], ["recursos", "Recursos"], ["planos", "Planos"]].map(([id, label]) => (
            <button key={id} onClick={() => scroll(id)} className="text-[13px] font-medium text-white/45 hover:text-white transition-colors">{label}</button>
          ))}
          <button onClick={() => scroll("comunidade")} className="text-[13px] font-semibold text-amber-400 hover:text-amber-300 transition-colors border border-amber-500/30 rounded-full px-4 py-1.5 bg-amber-500/10 hover:bg-amber-500/15">⭐ Comunidade</button>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/auth")} className="text-xs font-medium text-white/50 hover:text-white hover:bg-white/5">Entrar</Button>
          <Button size="sm" onClick={() => navigate("/auth?mode=signup")} className="text-xs font-semibold bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-white">Criar conta</Button>
        </div>
      </div>
    </header>
  );
};

// ─── Section wrapper ─── (120px spacing)
const Section = ({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) => (
  <section id={id} className={`py-12 md:py-20 px-5 ${className}`}>
    <div className="max-w-6xl mx-auto">{children}</div>
  </section>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-block text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--primary))]/80 mb-4">{children}</span>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-3xl md:text-[2.75rem] font-extrabold text-white tracking-tight mb-4 leading-tight">{children}</h2>
);

const SectionSub = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm md:text-base text-white/45 max-w-2xl leading-relaxed font-medium mx-auto">{children}</p>
);

// ─── 1. Hero ───
const Hero = () => {
  const navigate = useNavigate();
  return (
    <section className="relative pt-28 md:pt-40 pb-14 md:pb-20 px-5 text-center overflow-hidden">
      {/* Radial glow behind title */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] pointer-events-none" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.12)_0%,transparent_70%)]" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-[hsl(var(--primary))]/8 rounded-full blur-[100px]" />
      </div>
      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div initial="hidden" animate="visible" variants={stagger}>
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-semibold text-white/60 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse" />
              Gestão profissional de WhatsApp
            </span>
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-4xl sm:text-5xl md:text-7xl font-extrabold text-white tracking-tight leading-[1.08] mb-6 max-w-4xl mx-auto">
            Opere múltiplos chips com{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(var(--primary))] to-emerald-300">controle total</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="text-base sm:text-lg md:text-xl text-white/40 max-w-xl mx-auto mb-10 leading-relaxed font-medium">
            Aquecimento, disparo e monitoramento em uma única plataforma. Escale com organização e reduza riscos.
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-white text-sm font-semibold px-8 h-12 gap-2 shadow-lg shadow-[hsl(var(--primary))]/20">
              Começar agora <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" })} className="bg-transparent border-white/10 text-white/70 hover:text-white hover:bg-white/5 text-sm font-semibold px-8 h-12">
              Ver planos
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

// ─── Dashboard Preview ───
const DashboardPreview = () => (
  <Section>
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={fadeUp} className="relative max-w-5xl mx-auto">
      {/* Glow behind */}
      <div className="absolute -inset-4 bg-gradient-to-b from-[hsl(var(--primary))]/10 via-[hsl(var(--primary))]/5 to-transparent rounded-3xl blur-[40px] pointer-events-none" />
      {/* Frame */}
      <div className="relative rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl shadow-black/40">
        <div className="bg-white/[0.03] px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500/60" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
          <span className="w-3 h-3 rounded-full bg-green-500/60" />
          <span className="ml-3 text-[11px] text-white/25 font-medium">DG Contingência PRO — Painel</span>
        </div>
        <img src={dashboardPreview} alt="Painel DG Contingência PRO" className="w-full h-auto" loading="lazy" />
      </div>
    </motion.div>
  </Section>
);

// ─── 2. Benefícios ───
const benefits = [
  { icon: Zap, title: "Envio otimizado", desc: "Intervalos inteligentes entre mensagens para manter suas instâncias saudáveis." },
  { icon: Shield, title: "Redução de risco", desc: "Aquecimento automático e rotação de chips para minimizar bloqueios." },
  { icon: BarChart3, title: "Visão em tempo real", desc: "Monitore entregas, falhas e desempenho de cada instância no painel." },
  { icon: Globe, title: "Escala sob controle", desc: "Opere de 10 a 100+ instâncias em um único ambiente centralizado." },
];

const Benefits = () => (
  <Section id="beneficios">
    <div className="text-center mb-10">
      <SectionLabel>Benefícios</SectionLabel>
      <SectionTitle>O que a plataforma entrega</SectionTitle>
      <SectionSub>Estrutura pensada para quem precisa de estabilidade, controle e escala.</SectionSub>
    </div>
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {benefits.map((b) => (
        <motion.div key={b.title} variants={fadeUp} className="group rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 hover:bg-white/[0.06] hover:border-white/[0.14] transition-all duration-300">
          <div className="w-11 h-11 rounded-xl bg-[hsl(var(--primary))]/10 flex items-center justify-center mb-5 group-hover:bg-[hsl(var(--primary))]/15 transition-colors">
            <b.icon className="w-5 h-5 text-[hsl(var(--primary))]" />
          </div>
          <h3 className="text-[15px] font-bold text-white mb-2">{b.title}</h3>
          <p className="text-[13px] text-white/40 leading-relaxed">{b.desc}</p>
        </motion.div>
      ))}
    </motion.div>
  </Section>
);

// ─── 3. Como funciona ───
const steps = [
  { num: "01", title: "Crie sua conta", desc: "Cadastro simples e liberação imediata do painel." },
  { num: "02", title: "Conecte seus chips", desc: "Vincule instâncias via QR Code em poucos segundos." },
  { num: "03", title: "Monte suas campanhas", desc: "Defina mensagens, intervalos, contatos e regras de envio." },
  { num: "04", title: "Acompanhe e escale", desc: "Monitore métricas em tempo real e ajuste conforme necessário." },
];

const HowItWorks = () => (
  <Section id="como-funciona">
    <div className="text-center mb-10">
      <SectionLabel>Como funciona</SectionLabel>
      <SectionTitle>Como funciona na prática</SectionTitle>
      <SectionSub>Do cadastro ao primeiro envio em poucos minutos.</SectionSub>
    </div>
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={stagger} className="grid grid-cols-1 md:grid-cols-4 gap-8">
      {steps.map((s, i) => (
        <motion.div key={s.num} variants={fadeUp} className="relative text-center md:text-left">
          <span className="text-5xl font-extrabold text-[hsl(var(--primary))]/20 block mb-3 font-mono">{s.num}</span>
          <h3 className="text-[15px] font-bold text-white mb-2">{s.title}</h3>
          <p className="text-[13px] text-white/40 leading-relaxed">{s.desc}</p>
          {i < 3 && <div className="hidden md:block absolute top-8 -right-4 w-8 border-t border-dashed border-white/10" />}
        </motion.div>
      ))}
    </motion.div>
  </Section>
);

// ─── 4. Recursos ───
const features = [
  { icon: Smartphone, title: "Múltiplas instâncias", desc: "Conecte e controle dezenas de chips ao mesmo tempo em um painel único." },
  { icon: Layers, title: "Aquecimento progressivo", desc: "Warmup automático com fases controladas para amadurecer cada chip." },
  { icon: MessageSquare, title: "Campanhas em massa", desc: "Envios com intervalos, pausas programadas e distribuição entre instâncias." },
  { icon: Users, title: "Base de contatos", desc: "Importe, organize e segmente seus contatos de forma prática." },
  { icon: Settings, title: "Modelos de mensagem", desc: "Crie templates com variáveis dinâmicas e reutilize em qualquer campanha." },
  { icon: Lock, title: "Alertas no WhatsApp", desc: "Receba notificações sobre desconexões, falhas e status das campanhas." },
];

const Features = () => (
  <Section id="recursos">
    <div className="text-center mb-10">
      <SectionLabel>Recursos</SectionLabel>
      <SectionTitle>Recursos inclusos na plataforma</SectionTitle>
      <SectionSub>Todas as ferramentas que você precisa para operar com organização.</SectionSub>
    </div>
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {features.map((f) => (
        <motion.div key={f.title} variants={fadeUp} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 hover:border-white/[0.14] hover:bg-white/[0.06] transition-all duration-300">
          <f.icon className="w-5 h-5 text-[hsl(var(--primary))] mb-5" />
          <h3 className="text-[15px] font-bold text-white mb-2">{f.title}</h3>
          <p className="text-[13px] text-white/40 leading-relaxed">{f.desc}</p>
        </motion.div>
      ))}
    </motion.div>
  </Section>
);

// ─── 5. Planos ───
const allPlans = [
  {
    name: "Essencial", instances: 5, price: "89,90", popular: false, whatsappReports: false,
    subtitle: "Para quem está começando a aquecer chips com segurança e estrutura profissional.",
    extraCopy: null, cta: "Começar",
    features: ["Aquecimento automatizado", "Disparo interativo", "Monitoramento em tempo real limitado", "Suporte padrão", "Relatórios via WhatsApp (add-on)", "Módulos extras disponíveis"],
  },
  {
    name: "Start", instances: 10, price: "159,90", popular: false, whatsappReports: false,
    subtitle: "Para quem já validou a operação e quer expandir.",
    extraCopy: "Melhor custo-benefício inicial", cta: "Começar",
    features: ["Aquecimento automatizado", "Disparo interativo", "Painel centralizado", "Monitoramento em tempo real", "Organização de instâncias", "Relatórios via WhatsApp (add-on)", "Módulos extras disponíveis"],
  },
  {
    name: "Pro", instances: 30, price: "349,90", popular: true, whatsappReports: false,
    subtitle: "Para operadores ativos que precisam escalar com consistência.",
    extraCopy: "Recomendado para operações reais", cta: "Escalar",
    features: ["Aquecimento automatizado", "Disparo interativo", "Painel centralizado", "Gestão avançada de instâncias", "Monitoramento completo", "Suporte prioritário", "Relatórios via WhatsApp (add-on)", "Módulos extras disponíveis"],
  },
  {
    name: "Scale", instances: 50, price: "549,90", popular: false, whatsappReports: true,
    subtitle: "Para quem precisa escalar com mais chips e visibilidade sobre toda a operação.",
    extraCopy: null, cta: "Escalar",
    features: ["Aquecimento automatizado", "Disparo interativo", "Painel centralizado", "Monitoramento em tempo real", "Suporte prioritário", "Relatórios via WhatsApp incluso", "Módulos extras disponíveis"],
  },
  {
    name: "Elite", instances: 100, price: "999,90", popular: false, whatsappReports: true,
    subtitle: "Ideal para operações que exigem volume alto com performance e suporte dedicado.",
    extraCopy: "Alta performance garantida", cta: "Contratar",
    features: ["Aquecimento automatizado em escala", "Disparo avançado", "Monitoramento avançado", "Suporte VIP", "Relatórios via WhatsApp incluso", "Módulos extras disponíveis"],
  },
  {
    name: "Custom", instances: 200, price: null, popular: false, whatsappReports: true,
    subtitle: "Soluções personalizadas para operações de grande escala com necessidades específicas.",
    extraCopy: null, cta: "Consultar",
    features: ["Instâncias sob medida", "Aquecimento automatizado em escala", "Estrutura personalizada", "Infraestrutura dedicada", "Suporte VIP", "Ajustes personalizados", "Relatórios via WhatsApp incluso", "Configuração sob consulta"],
  },
];

const Plans = () => {
  const navigate = useNavigate();

  const renderCard = (p: typeof allPlans[0]) => (
    <motion.div key={p.name} variants={fadeUp}
      className={`relative rounded-2xl border transition-all duration-300 flex flex-col h-full min-w-0 ${
        p.popular
          ? "border-amber-500/40 bg-amber-500/[0.04] p-5 shadow-[0_0_40px_-8px_rgba(245,158,11,0.2)] z-10"
          : "border-white/[0.08] bg-white/[0.03] p-5 hover:border-white/[0.14]"
      }`}
    >
      {p.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider bg-amber-500 text-black px-3 py-1 rounded-full whitespace-nowrap">
          Recomendado
        </span>
      )}
      {/* Fixed-height header block to align prices */}
      <div className="min-h-[5.5rem]">
        <h3 className="text-base font-extrabold text-white mb-0.5">{p.name}</h3>
        <p className="text-[11px] text-white/40 font-medium mb-1">
          {p.name === "Custom" ? "200+ instâncias" : `até ${p.instances} instâncias`}
        </p>
        <p className="text-[10px] text-white/25 leading-relaxed mb-1">{p.subtitle}</p>
        {p.extraCopy && <p className={`text-[10px] font-semibold ${p.popular ? "text-amber-400/80" : "text-emerald-400/70"}`}>{p.extraCopy}</p>}
      </div>

      <div className="flex items-baseline gap-0.5 mb-3">
        {p.price ? (
          <>
            <span className="text-xs font-medium text-white/30">R$</span>
            <span className="text-2xl font-extrabold tracking-tighter leading-none text-white">{p.price.split(",")[0]}</span>
            <span className="text-sm font-bold text-white/40">,{p.price.split(",")[1]}</span>
            <span className="text-[10px] font-medium text-white/25 ml-0.5">/ mês</span>
          </>
        ) : (
          <span className="text-2xl font-extrabold tracking-tighter leading-none text-white">Sob consulta</span>
        )}
      </div>

      <div className="h-px bg-white/[0.05] mb-3" />

      <ul className="space-y-1.5 mb-4 flex-1">
        {p.features.map((item) => (
          <li key={item} className="flex items-start gap-1.5 text-[11px] text-white/50 font-medium">
            <CheckCircle2 className="w-3 h-3 text-white/30 flex-shrink-0 mt-0.5" />{item}
          </li>
        ))}
      </ul>
      <Button onClick={() => {
        if (p.name === "Custom") {
          const msg = `Olá, tudo bem?\nTenho interesse no plano Custom (200+ instâncias).\nPode me enviar mais detalhes?`;
          window.open(`https://wa.me/5562994192500?text=${encodeURIComponent(msg)}`, "_blank");
        } else {
          navigate("/auth?mode=signup");
        }
      }}
        className={`w-full text-[11px] font-bold h-10 mt-auto ${
          p.popular
            ? "bg-amber-500 hover:bg-amber-400 text-black shadow-md"
            : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
        }`}
      >
        {p.cta} <ArrowRight className="w-3.5 h-3.5 ml-1 flex-shrink-0" />
      </Button>
    </motion.div>
  );

  return (
    <Section id="planos">
      <div className="text-center mb-10">
        <SectionLabel>Planos</SectionLabel>
        <SectionTitle>Planos sob medida para cada operação</SectionTitle>
        <SectionSub>Acesso completo em todos os planos. O que muda é a quantidade de instâncias e nível de suporte.</SectionSub>
      </div>
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={stagger} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-stretch mx-auto">
        {allPlans.map(renderCard)}
      </motion.div>
    </Section>
  );
};

// ─── 7. FAQ ───
const faqs = [
  { q: "Preciso ter servidor ou infraestrutura própria?", a: "Não. Tudo roda na nuvem. Você só precisa criar sua conta, conectar os chips e começar a operar." },
  { q: "Como funciona o aquecimento automático?", a: "O sistema realiza interações graduais e controladas para amadurecer o chip antes de qualquer envio em volume." },
  { q: "Existe fidelidade ou contrato mínimo?", a: "Não. Você pode cancelar ou trocar de plano a qualquer momento, sem multas ou compromissos." },
  { q: "O que são os alertas via WhatsApp?", a: "É um recurso adicional que envia notificações de desconexões, falhas e status de campanhas direto no seu WhatsApp." },
  { q: "Quantas instâncias posso usar?", a: "Cada plano tem um limite: Start (10), Pro (30), Scale (50) e Elite (100 instâncias)." },
];

const FAQ = () => (
  <Section id="faq">
    <div className="text-center mb-10">
      <SectionLabel>FAQ</SectionLabel>
      <SectionTitle>Dúvidas comuns</SectionTitle>
    </div>
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={stagger} className="max-w-2xl mx-auto space-y-3">
      {faqs.map((f) => (
        <motion.details key={f.q} variants={fadeUp} className="group rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
          <summary className="flex items-center justify-between px-6 py-5 cursor-pointer text-[15px] font-semibold text-white/85 hover:text-white transition-colors list-none">
            {f.q}
            <ChevronDown className="w-4 h-4 text-white/25 group-open:rotate-180 transition-transform" />
          </summary>
          <p className="px-6 pb-5 text-[13px] text-white/40 leading-relaxed font-medium">{f.a}</p>
        </motion.details>
      ))}
    </motion.div>
  </Section>
);


// ─── Community ───
const communityBenefits = [
  { icon: Megaphone, title: "Atualizações", desc: "Fique por dentro de novas funcionalidades assim que forem lançadas." },
  { icon: Star, title: "Melhorias", desc: "Receba avisos sobre otimizações e correções da ferramenta." },
  { icon: ShieldCheck, title: "Dicas de Segurança", desc: "Boas práticas para manter seus chips e operações seguras." },
  { icon: MessageCircle, title: "Comunidade", desc: "Tire dúvidas, compartilhe experiências e evolua junto com outros usuários." },
];

const CommunitySection = () => (
  <Section id="comunidade">
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={stagger} className="max-w-3xl mx-auto text-center">
      {/* Logo with gold frame */}
      <motion.div variants={fadeUp} className="flex justify-center mb-8">
        <div className="relative">
          {/* Glow effect behind */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/30 via-yellow-500/20 to-amber-600/30 blur-[40px] scale-110" />
          <div className="absolute inset-0 rounded-2xl bg-amber-500/15 blur-[60px] scale-125" />
          {/* Gold particles – CSS-only for performance */}
          <div className="absolute -inset-12 pointer-events-none overflow-hidden">
            {Array.from({ length: 12 }).map((_, i) => (
              <span
                key={i}
                className="absolute w-1 h-1 rounded-full bg-amber-400 animate-[float_4s_ease-in-out_infinite]"
                style={{
                  left: `${15 + (i * 6) % 70}%`,
                  top: `${15 + (i * 7) % 70}%`,
                  animationDelay: `${i * 0.4}s`,
                  animationDuration: `${3 + (i % 3)}s`,
                  opacity: 0.2 + (i % 4) * 0.1,
                }}
              />
            ))}
          </div>
          {/* Gold frame */}
          <div className="relative w-[180px] h-[180px] rounded-2xl overflow-hidden" style={{
            padding: '2px',
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706, #fbbf24)',
          }}>
            <div className="w-full h-full rounded-[14px] overflow-hidden bg-[#0f1419]">
              <img src={logo} alt="DG Contingência PRO" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <span className="inline-block text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400/80 mb-4">Comunidade Exclusiva</span>
        <h2 className="text-3xl md:text-[2.75rem] font-extrabold text-white tracking-tight mb-4 leading-tight">
          DG Contingência <span className="text-amber-400">PRO</span>
        </h2>
        <p className="text-sm md:text-base text-white/45 max-w-xl mx-auto leading-relaxed font-medium mb-10">
          Receba atualizações, melhorias, correções e avisos importantes da ferramenta em primeira mão.
        </p>
      </motion.div>

      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {communityBenefits.map((b) => (
          <motion.div key={b.title} variants={fadeUp} className="rounded-2xl border border-amber-500/10 bg-amber-500/[0.04] p-6 text-left flex items-start gap-4 hover:border-amber-500/20 hover:bg-amber-500/[0.06] transition-all duration-300">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <b.icon className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-white mb-1">{b.title}</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">{b.desc}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={fadeUp} className="space-y-3">
        <a
          href="https://chat.whatsapp.com/F9Xw6819N8J97Am6T8yC8D?mode=gi_t"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2.5 w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold text-sm hover:from-amber-400 hover:to-yellow-400 transition-all shadow-[0_0_30px_-6px_rgba(245,158,11,0.4)]"
        >
          <UsersRound className="w-5 h-5" />
          Entrar na Comunidade
        </a>
        <a
          href="https://wa.me/5562994192500?text=Ol%C3%A1%2C%20vim%20do%20site%20da%20DG%20Conting%C3%AAncia%20PRO%20e%20preciso%20de%20suporte."
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2.5 w-full py-4 rounded-xl border border-white/10 bg-white/[0.04] text-white/70 font-semibold text-sm hover:bg-white/[0.08] transition-all"
        >
          <MessageCircle className="w-5 h-5" />
          Falar com Suporte
        </a>
      </motion.div>

      <p className="text-[11px] text-white/25 mt-6">
        Ao entrar, você concorda em receber comunicados oficiais da DG Contingência PRO.
      </p>
    </motion.div>
  </Section>
);

// ─── Footer ───
const FooterSection = () => (
  <footer className="py-12 px-5 border-t border-white/[0.04]">
    <div className="max-w-6xl mx-auto flex flex-col items-center gap-4">
      <div className="flex items-center gap-2.5">
        <img src={logo} alt="DG" width={28} height={28} className="rounded-lg" />
        <span className="text-sm font-semibold text-white">DG Contingência</span>
      </div>
      <p className="text-[11px] text-white/35 text-center max-w-lg leading-relaxed">
        Os resultados dependem da estratégia do operador. A plataforma fornece infraestrutura, ferramentas e suporte técnico.
      </p>
      <p className="text-[11px] text-white/25">© {new Date().getFullYear()} DG Contingência. Todos os direitos reservados.</p>
    </div>
  </footer>
);

// ─── WhatsApp Float ───
const WhatsAppFloat = () => (
  <a href="https://wa.me/5562994192500?text=Ol%C3%A1%2C%20vim%20do%20site%20da%20DG%20Conting%C3%AAncia%20PRO%20e%20preciso%20de%20suporte." target="_blank" rel="noopener noreferrer"
    className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[hsl(var(--primary))] hover:scale-110 flex items-center justify-center transition-transform shadow-lg shadow-[hsl(var(--primary))]/25"
  >
    <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.212l-.257-.154-2.874.854.854-2.874-.154-.257A8 8 0 1112 20z"/></svg>
  </a>
);

// ─── Main ───
const Landing = () => {
  useEffect(() => { prefetchRoutes(); }, []);

  return (
    <div className="min-h-screen bg-[#181c24] relative" style={{ overflowX: "hidden" }}>
      <GridPattern />
      <div className="relative z-10">
        <Navbar />
        <Hero />
        <DashboardPreview />
        <Benefits />
        <HowItWorks />
        <Features />
        <Plans />
        <CommunitySection />
       
        <FAQ />
        
        <FooterSection />
      </div>
      <WhatsAppFloat />
    </div>
  );
};

export default Landing;
