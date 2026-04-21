import { useEffect, useRef, useState } from "react";
import { Users, MessageSquareMore, Sparkles, CheckCircle2, TrendingUp, ArrowUpRight } from "lucide-react";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";

/**
 * Animated CRM Dashboard mockup for the landing hero.
 * Replaces the static dashboard-preview.png with a live, animated component.
 * Animations trigger when entering the viewport (IntersectionObserver).
 */
const FUNNEL = [
  { name: "Novo Lead", value: 204, color: "#3b82f6", pct: 100 },
  { name: "Respondeu", value: 0, color: "#06b6d4", pct: 6 },
  { name: "Interessado", value: 0, color: "#f59e0b", pct: 6 },
  { name: "Negociação", value: 4, color: "#a855f7", pct: 8 },
  { name: "Fechado", value: 1, color: "#10b981", pct: 6 },
];

const CHART = [
  { day: "Seg", v: 5 },
  { day: "Ter", v: 8 },
  { day: "Qua", v: 3 },
  { day: "Qui", v: 10 },
  { day: "Sex", v: 6 },
  { day: "Sáb", v: 2 },
  { day: "Dom", v: 4 },
];
const CHART_MAX = Math.max(...CHART.map(c => c.v));

const DashboardMockup = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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
        <div
          className="transition-all duration-700 ease-out"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(12px)",
          }}
        >
          <h3 className="text-lg font-extrabold text-white tracking-tight">Dashboard CRM</h3>
          <p className="text-[10px] text-white/40 mt-0.5">Visão geral do seu pipeline de vendas</p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-2.5">
          {/* Hero card */}
          <KpiHero visible={visible} />
          <KpiSmall
            visible={visible}
            delay={120}
            label="Conversas Ativas"
            value={8}
            sub="8 em andamento"
            icon={MessageSquareMore}
            iconBg="bg-emerald-500/15"
            iconColor="text-emerald-400"
            border="border-emerald-500/30"
            subColor="text-emerald-400"
          />
          <KpiSmall
            visible={visible}
            delay={200}
            label="Oportunidades"
            value={5}
            sub="5 qualificados"
            icon={Sparkles}
            iconBg="bg-purple-500/15"
            iconColor="text-purple-400"
            border="border-purple-500/30"
            subColor="text-purple-400"
          />
          <KpiSmall
            visible={visible}
            delay={280}
            label="Fechados"
            value={1}
            sub="1 negócios"
            icon={CheckCircle2}
            iconBg="bg-amber-500/15"
            iconColor="text-amber-400"
            border="border-amber-500/30"
            subColor="text-amber-400"
          />
        </div>

        {/* Funnel + Chart */}
        <div className="grid grid-cols-12 gap-2.5">
          {/* Funnel */}
          <div
            className="col-span-5 rounded-lg border border-white/5 bg-white/[0.02] p-3.5 transition-all duration-700 ease-out"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(20px)",
              transitionDelay: visible ? "360ms" : "0ms",
            }}
          >
            <h4 className="text-[11px] font-bold text-white mb-2.5">Funil de Vendas</h4>
            <div className="space-y-1.5">
              {FUNNEL.map((s, i) => (
                <div key={s.name} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-[9px] text-white/50 w-16 shrink-0 truncate font-medium">{s.name}</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: visible ? `${Math.max(s.pct, 6)}%` : "0%",
                        background: `linear-gradient(90deg, ${s.color}, ${s.color}cc)`,
                        transition: `width 1100ms cubic-bezier(0.4, 0, 0.2, 1) ${600 + i * 80}ms`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-extrabold text-white tabular-nums w-6 text-right">
                    {visible ? <AnimatedCounter value={s.value} duration={1200} /> : 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div
            className="col-span-7 rounded-lg border border-white/5 bg-white/[0.02] p-3.5 transition-all duration-700 ease-out"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(20px)",
              transitionDelay: visible ? "440ms" : "0ms",
            }}
          >
            <div className="flex items-start justify-between mb-2.5">
              <div>
                <h4 className="text-[11px] font-bold text-white">Novos Leads</h4>
                <p className="text-[9px] text-white/40 mt-0.5">Últimos 7 dias</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 text-[9px] font-bold">
                  <TrendingUp className="w-2.5 h-2.5" />+38
                </div>
                <div className="text-right">
                  <p className="text-base font-extrabold text-white leading-none">
                    {visible ? <AnimatedCounter value={38} duration={1400} /> : 0}
                  </p>
                  <p className="text-[8px] text-white/40 mt-0.5">esta semana</p>
                </div>
              </div>
            </div>
            <div className="flex items-end justify-between gap-1.5 h-[110px] pt-2">
              {CHART.map((c, i) => {
                const heightPct = (c.v / CHART_MAX) * 100;
                return (
                  <div key={c.day} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-sm"
                        style={{
                          height: visible ? `${heightPct}%` : "0%",
                          background: "linear-gradient(180deg, #3b82f6, #1d4ed8)",
                          transition: `height 900ms cubic-bezier(0.4, 0, 0.2, 1) ${700 + i * 70}ms`,
                          minHeight: visible ? "4px" : "0px",
                        }}
                      />
                    </div>
                    <span className="text-[8px] text-white/40 font-medium">{c.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Hero card (Total de Leads) ── */
function KpiHero({ visible }: { visible: boolean }) {
  return (
    <div
      className="relative rounded-lg p-3 overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700 shadow-lg shadow-blue-500/20 transition-all duration-700 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transitionDelay: visible ? "40ms" : "0ms",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="w-7 h-7 rounded-md bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <Users className="w-3.5 h-3.5 text-white" />
        </div>
        <ArrowUpRight className="w-3 h-3 text-white/60" />
      </div>
      <p className="text-[9px] text-white/80 font-medium mb-0.5">Total de Leads</p>
      <p className="text-2xl font-extrabold text-white tracking-tight leading-none">
        {visible ? <AnimatedCounter value={212} duration={1500} /> : 0}
      </p>
      <div className="flex items-center gap-1 mt-1.5">
        <TrendingUp className="w-2.5 h-2.5 text-white/90" />
        <p className="text-[8px] text-white/90 font-semibold">+38 esta semana</p>
      </div>
    </div>
  );
}

/* ── Small KPI card ── */
function KpiSmall({
  visible, delay, label, value, sub, icon: Icon, iconBg, iconColor, border, subColor,
}: {
  visible: boolean; delay: number; label: string; value: number; sub: string;
  icon: React.ElementType; iconBg: string; iconColor: string; border: string; subColor: string;
}) {
  return (
    <div
      className={`relative rounded-lg border ${border} p-3 bg-white/[0.02] transition-all duration-700 ease-out`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transitionDelay: visible ? `${delay}ms` : "0ms",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`w-7 h-7 rounded-md ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        </div>
        <ArrowUpRight className="w-3 h-3 text-white/30" />
      </div>
      <p className="text-[9px] text-white/50 font-medium mb-0.5">{label}</p>
      <p className="text-2xl font-extrabold text-white tracking-tight leading-none">
        {visible ? <AnimatedCounter value={value} duration={1300} /> : 0}
      </p>
      <div className="flex items-center gap-1 mt-1.5">
        <TrendingUp className={`w-2.5 h-2.5 ${subColor}`} />
        <p className={`text-[8px] font-semibold ${subColor}`}>{sub}</p>
      </div>
    </div>
  );
}

export default DashboardMockup;
