import { motion } from "framer-motion";
import { HERO_METRICS, HERO_BAR_SERIES, HERO_SPARKLINE } from "./heroMetrics";

/**
 * Animated "live data" visualization for the Hero background.
 * Pure SVG/CSS — no dependencies. Emerald green (matches logo).
 */
const HeroDataViz = () => {
  const bars = HERO_BAR_SERIES;
  const sparkline = HERO_SPARKLINE;

  const stats = [
    { label: "Mensagens enviadas hoje", ...HERO_METRICS.messagesToday },
    { label: "Chips ativos", ...HERO_METRICS.activeChips },
    { label: "Taxa de entrega", ...HERO_METRICS.deliveryRate },
  ];

  // Emerald palette (matches DG logo green)
  const GREEN = "rgb(16,185,129)";
  const GREEN_BRIGHT = "rgb(52,211,153)";


  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none hidden lg:block" aria-hidden="true">
      {/* Grid pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke={GREEN_BRIGHT} strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Glow halos — emerald */}
      <div className="absolute top-[8%] right-[5%] w-[750px] h-[750px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.18)_0%,transparent_60%)] blur-3xl" />
      <div className="absolute bottom-[5%] right-[22%] w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle,rgba(5,150,105,0.20)_0%,transparent_65%)] blur-3xl" />
      <div className="absolute top-[40%] right-[40%] w-[420px] h-[420px] rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.10)_0%,transparent_70%)] blur-3xl" />

      {/* Right zone — data widgets */}
      <div className="absolute top-1/2 right-[3%] -translate-y-1/2 w-[58%] h-[78%] hidden lg:block">
        {/* Floating stat cards */}
        <div className="absolute top-[6%] right-[2%] flex flex-col gap-3 w-[280px]">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-xl border border-emerald-400/15 bg-[hsl(222,28%,8%)]/85 backdrop-blur-sm px-4 py-3 shadow-[0_8px_32px_-8px_rgba(16,185,129,0.28)]"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">{s.label}</span>
                <span className="text-[10px] text-emerald-400 font-semibold">{s.trend}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[22px] font-semibold text-white tracking-tight tabular-nums">{s.value}</span>
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.3 }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bar chart panel */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="absolute bottom-[8%] right-[8%] w-[420px] h-[200px] rounded-xl border border-emerald-400/15 bg-[hsl(222,28%,8%)]/85 backdrop-blur-sm p-5 shadow-[0_12px_40px_-8px_rgba(16,185,129,0.32)]"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium">Volume últimas 24h</div>
              <div className="text-[18px] font-semibold text-white tabular-nums mt-0.5">
                12.847 <span className="text-emerald-400 text-[12px] font-medium">↑ 18%</span>
              </div>
            </div>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
              <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            </div>
          </div>
          <div className="flex items-end gap-1.5 h-[110px]">
            {bars.map((v, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{
                  height: [`${v}%`, `${Math.max(20, v - 15)}%`, `${v}%`],
                }}
                transition={{
                  height: {
                    duration: 3 + (i % 3),
                    repeat: Infinity,
                    delay: i * 0.1,
                    ease: "easeInOut",
                  },
                }}
                className="flex-1 rounded-t-sm bg-gradient-to-t from-emerald-600/80 via-emerald-500/90 to-emerald-300"
                style={{
                  boxShadow: "0 0 12px rgba(16,185,129,0.45)",
                }}
              />
            ))}
          </div>
        </motion.div>

        {/* Sparkline panel — top left of viz zone */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-[12%] left-[2%] w-[320px] h-[140px] rounded-xl border border-emerald-400/15 bg-[hsl(222,28%,8%)]/85 backdrop-blur-sm p-4 shadow-[0_8px_32px_-8px_rgba(52,211,153,0.28)]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">Taxa de entrega</span>
            <span className="text-[10px] text-emerald-400 font-semibold tabular-nums">98,4%</span>
          </div>
          <svg viewBox="0 0 400 100" className="w-full h-[90px]" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity="0.45" />
                <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              d={`${sparkline} L400,100 L0,100 Z`}
              fill="url(#sparkFill)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 1 }}
            />
            <motion.path
              d={sparkline}
              fill="none"
              stroke={GREEN}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.8, delay: 0.8, ease: "easeInOut" }}
              style={{ filter: "drop-shadow(0 0 4px rgba(16,185,129,0.65))" }}
            />
            <motion.circle
              cx="400"
              cy="10"
              r="4"
              fill={GREEN_BRIGHT}
              animate={{ opacity: [1, 0.3, 1], r: [4, 6, 4] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
          </svg>
        </motion.div>

        {/* Floating connection dots — abstract network */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {[
            { x1: "20%", y1: "30%", x2: "55%", y2: "20%" },
            { x1: "55%", y1: "20%", x2: "80%", y2: "45%" },
            { x1: "20%", y1: "30%", x2: "40%", y2: "60%" },
            { x1: "40%", y1: "60%", x2: "70%", y2: "75%" },
          ].map((line, i) => (
            <motion.line
              key={i}
              {...line}
              stroke={GREEN}
              strokeWidth="0.8"
              strokeOpacity="0.28"
              strokeDasharray="3 4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, delay: 1 + i * 0.2, ease: "easeOut" }}
            />
          ))}
        </svg>
      </div>

      {/* Left fade — keeps text readable */}
      <div
        className="absolute inset-0 hidden lg:block"
        style={{
          background:
            "linear-gradient(to right, hsl(222,22%,5%) 0%, hsl(222,22%,5%) 30%, hsla(222,22%,5%,0.85) 45%, hsla(222,22%,5%,0.4) 62%, transparent 80%)",
        }}
      />
      {/* Bottom fade for section transition */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[hsl(222,22%,5%)]" />
    </div>
  );
};

export default HeroDataViz;
