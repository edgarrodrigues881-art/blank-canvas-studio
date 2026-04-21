import { useRef } from "react";
import { Users, MessageSquareMore, Sparkles, CheckCircle2, TrendingUp, ArrowUpRight } from "lucide-react";
import { motion, useScroll, useTransform, useSpring, MotionValue, useMotionValueEvent } from "framer-motion";
import { useState } from "react";

/**
 * Scroll-driven animated CRM dashboard mockup.
 * Values, funnel bars and chart heights react in real-time to scroll progress.
 * Reversible: scroll up restores high values, scroll down lowers them.
 */

// [high, low] — high when entering, low at the end of scroll range
const KPIS = {
  leads: [212, 48],
  conversas: [8, 2],
  oportunidades: [5, 1],
  fechados: [1, 0],
  semana: [38, 6],
};

const FUNNEL = [
  { name: "Novo Lead",   color: "#3b82f6", high: 204, low: 40, pctHigh: 100, pctLow: 100 },
  { name: "Respondeu",   color: "#06b6d4", high: 120, low: 22, pctHigh: 60,  pctLow: 55 },
  { name: "Interessado", color: "#f59e0b", high: 64,  low: 12, pctHigh: 32,  pctLow: 30 },
  { name: "Negociação",  color: "#a855f7", high: 18,  low: 4,  pctHigh: 12,  pctLow: 10 },
  { name: "Fechado",     color: "#10b981", high: 6,   low: 1,  pctHigh: 6,   pctLow: 6 },
];

const CHART = [
  { day: "Seg", high: 5,  low: 2 },
  { day: "Ter", high: 8,  low: 3 },
  { day: "Qua", high: 3,  low: 1 },
  { day: "Qui", high: 10, low: 4 },
  { day: "Sex", high: 6,  low: 2 },
  { day: "Sáb", high: 2,  low: 1 },
  { day: "Dom", high: 4,  low: 1 },
];
const CHART_MAX = 10;

const DashboardMockup = () => {
  const ref = useRef<HTMLDivElement>(null);

  // Scroll progress: 0 when component enters bottom of viewport, 1 when it exits top
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 90%", "end 10%"],
  });

  // Smooth the scroll progress for buttery animations
  const progress = useSpring(scrollYProgress, { stiffness: 80, damping: 20, mass: 0.4 });

  // Debug: observe scroll progress in console
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (typeof window !== "undefined") console.log("[DashboardMockup] scrollYProgress:", v.toFixed(3));
  });

  return (
    <div
      ref={ref}
      className="relative w-full rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl overflow-hidden"
      style={{
        transform: "rotateX(8deg) rotateY(-2deg) scale(0.97)",
        transformOrigin: "center bottom",
      }}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#0d0d0d]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/90" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/90" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/90" />
        </div>
        <div className="flex-1 text-center text-[11px] text-white/40 font-medium">
          DG Contingência Pro — CRM
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* Title */}
        <div>
          <h3 className="text-lg font-extrabold text-white tracking-tight">Dashboard CRM</h3>
          <p className="text-[10px] text-white/40 mt-0.5">Visão geral do seu pipeline de vendas</p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-2.5">
          <KpiHero progress={progress} />
          <KpiSmall
            progress={progress}
            delay={0.04}
            label="Conversas Ativas"
            high={KPIS.conversas[0]} low={KPIS.conversas[1]}
            subTpl={(v) => `${v} em andamento`}
            icon={MessageSquareMore}
            iconBg="bg-emerald-500/15" iconColor="text-emerald-400"
            border="border-emerald-500/30" subColor="text-emerald-400"
          />
          <KpiSmall
            progress={progress}
            delay={0.08}
            label="Oportunidades"
            high={KPIS.oportunidades[0]} low={KPIS.oportunidades[1]}
            subTpl={(v) => `${v} qualificados`}
            icon={Sparkles}
            iconBg="bg-purple-500/15" iconColor="text-purple-400"
            border="border-purple-500/30" subColor="text-purple-400"
          />
          <KpiSmall
            progress={progress}
            delay={0.12}
            label="Fechados"
            high={KPIS.fechados[0]} low={KPIS.fechados[1]}
            subTpl={(v) => `${v} negócios`}
            icon={CheckCircle2}
            iconBg="bg-amber-500/15" iconColor="text-amber-400"
            border="border-amber-500/30" subColor="text-amber-400"
          />
        </div>

        {/* Funnel + Chart */}
        <div className="grid grid-cols-12 gap-2.5">
          {/* Funnel */}
          <div className="col-span-5 rounded-lg border border-white/5 bg-white/[0.02] p-3.5">
            <h4 className="text-[11px] font-bold text-white mb-2.5">Funil de Vendas</h4>
            <div className="space-y-1.5">
              {FUNNEL.map((s, i) => (
                <FunnelRow key={s.name} stage={s} progress={progress} delay={i * 0.03} />
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className="col-span-7 rounded-lg border border-white/5 bg-white/[0.02] p-3.5">
            <div className="flex items-start justify-between mb-2.5">
              <div>
                <h4 className="text-[11px] font-bold text-white">Novos Leads</h4>
                <p className="text-[9px] text-white/40 mt-0.5">Últimos 7 dias</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 text-[9px] font-bold">
                  <TrendingUp className="w-2.5 h-2.5" />
                  +<ScrollNumber progress={progress} high={KPIS.semana[0]} low={KPIS.semana[1]} />
                </div>
                <div className="text-right">
                  <p className="text-base font-extrabold text-white leading-none">
                    <ScrollNumber progress={progress} high={KPIS.semana[0]} low={KPIS.semana[1]} />
                  </p>
                  <p className="text-[8px] text-white/40 mt-0.5">esta semana</p>
                </div>
              </div>
            </div>
            <div className="flex items-end justify-between gap-1.5 h-[110px] pt-2">
              {CHART.map((c, i) => (
                <ChartBar key={c.day} bar={c} progress={progress} delay={i * 0.02} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Reactive number that follows scroll progress ── */
function ScrollNumber({
  progress, high, low, delay = 0,
}: { progress: MotionValue<number>; high: number; low: number; delay?: number }) {
  // Map scroll [delay, delay+0.6] → [high, low]
  const start = Math.min(delay, 0.4);
  const end = Math.min(start + 0.6, 1);
  const num = useTransform(progress, [start, end], [high, low]);
  const [val, setVal] = useState(high);
  useMotionValueEvent(num, "change", (v) => setVal(Math.round(v)));
  return <>{val.toLocaleString("pt-BR")}</>;
}

/* ── Hero card (Total de Leads) ── */
function KpiHero({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0, 0.5, 1], [1, 0.95, 0.85]);
  return (
    <motion.div
      style={{ opacity }}
      className="relative rounded-lg p-3 overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700 shadow-lg shadow-blue-500/20"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="w-7 h-7 rounded-md bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <Users className="w-3.5 h-3.5 text-white" />
        </div>
        <ArrowUpRight className="w-3 h-3 text-white/60" />
      </div>
      <p className="text-[9px] text-white/80 font-medium mb-0.5">Total de Leads</p>
      <p className="text-2xl font-extrabold text-white tracking-tight leading-none tabular-nums">
        <ScrollNumber progress={progress} high={KPIS.leads[0]} low={KPIS.leads[1]} />
      </p>
      <div className="flex items-center gap-1 mt-1.5">
        <TrendingUp className="w-2.5 h-2.5 text-white/90" />
        <p className="text-[8px] text-white/90 font-semibold">
          +<ScrollNumber progress={progress} high={KPIS.semana[0]} low={KPIS.semana[1]} delay={0.05} /> esta semana
        </p>
      </div>
    </motion.div>
  );
}

/* ── Small KPI card ── */
function KpiSmall({
  progress, delay, label, high, low, subTpl, icon: Icon, iconBg, iconColor, border, subColor,
}: {
  progress: MotionValue<number>; delay: number; label: string; high: number; low: number;
  subTpl: (v: number) => string;
  icon: React.ElementType; iconBg: string; iconColor: string; border: string; subColor: string;
}) {
  const opacity = useTransform(progress, [0, 0.5, 1], [1, 0.95, 0.88]);
  // Reactive sub text
  const subNum = useTransform(progress, [delay, Math.min(delay + 0.6, 1)], [high, low]);
  const [subVal, setSubVal] = useState(high);
  useMotionValueEvent(subNum, "change", (v) => setSubVal(Math.round(v)));

  return (
    <motion.div
      style={{ opacity }}
      className={`relative rounded-lg border ${border} p-3 bg-white/[0.02]`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`w-7 h-7 rounded-md ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        </div>
        <ArrowUpRight className="w-3 h-3 text-white/30" />
      </div>
      <p className="text-[9px] text-white/50 font-medium mb-0.5">{label}</p>
      <p className="text-2xl font-extrabold text-white tracking-tight leading-none tabular-nums">
        <ScrollNumber progress={progress} high={high} low={low} delay={delay} />
      </p>
      <div className="flex items-center gap-1 mt-1.5">
        <TrendingUp className={`w-2.5 h-2.5 ${subColor}`} />
        <p className={`text-[8px] font-semibold ${subColor}`}>{subTpl(subVal)}</p>
      </div>
    </motion.div>
  );
}

/* ── Funnel row ── */
function FunnelRow({
  stage, progress, delay,
}: {
  stage: typeof FUNNEL[number]; progress: MotionValue<number>; delay: number;
}) {
  const start = delay;
  const end = Math.min(start + 0.7, 1);
  const widthMv = useTransform(progress, [start, end], [`${stage.pctHigh}%`, `${Math.max(stage.pctLow, 6)}%`]);
  return (
    <div className="flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stage.color }} />
      <span className="text-[9px] text-white/50 w-16 shrink-0 truncate font-medium">{stage.name}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            width: widthMv,
            background: `linear-gradient(90deg, ${stage.color}, ${stage.color}cc)`,
          }}
        />
      </div>
      <span className="text-[10px] font-extrabold text-white tabular-nums w-8 text-right">
        <ScrollNumber progress={progress} high={stage.high} low={stage.low} delay={delay} />
      </span>
    </div>
  );
}

/* ── Chart bar ── */
function ChartBar({
  bar, progress, delay,
}: {
  bar: typeof CHART[number]; progress: MotionValue<number>; delay: number;
}) {
  const highPct = (bar.high / CHART_MAX) * 100;
  const lowPct = (bar.low / CHART_MAX) * 100;
  const start = delay;
  const end = Math.min(start + 0.7, 1);
  const heightMv = useTransform(progress, [start, end], [`${highPct}%`, `${lowPct}%`]);
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5">
      <div className="w-full flex-1 flex items-end">
        <motion.div
          className="w-full rounded-t-sm"
          style={{
            height: heightMv,
            background: "linear-gradient(180deg, #3b82f6, #1d4ed8)",
            minHeight: "4px",
          }}
        />
      </div>
      <span className="text-[8px] text-white/40 font-medium">{bar.day}</span>
    </div>
  );
}

export default DashboardMockup;
