import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/dg-contingencia-avatar.png";

const WelcomeSplash = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("to") || "/dashboard";
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300);
    const t2 = setTimeout(() => setPhase(2), 800);
    const t3 = setTimeout(() => setPhase(3), 1300);
    const t4 = setTimeout(() => setPhase(4), 4300);
    const t5 = setTimeout(() => navigate(redirectTo, { replace: true }), 4800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, [navigate, redirectTo]);

  return (
    <AnimatePresence>
      {phase < 4 && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col items-center gap-2 px-6">

            <motion.div
              className="mt-4 sm:mt-5 relative"
              style={{ willChange: "opacity, transform" }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={phase >= 3 ? { opacity: 1, scale: 1 } : undefined}
              transition={{ duration: 0.5 }}
            >
              {/* Gold glow behind logo */}
              <div className="absolute -inset-6 bg-gradient-to-br from-amber-500/20 via-yellow-500/15 to-amber-600/20 blur-[40px] rounded-full" />
              <div className="absolute -inset-10 bg-amber-500/10 blur-[60px] rounded-full" />
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
              {/* Gold frame */}
              <div className="relative w-28 h-28 sm:w-40 sm:h-40 rounded-2xl overflow-hidden" style={{
                padding: '2px',
                background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706, #fbbf24)',
              }}>
                <div className="w-full h-full rounded-[14px] overflow-hidden bg-background">
                  <img
                    src={logo}
                    alt="DG Contingência Pro"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </motion.div>

            <motion.div
              className="mt-5 sm:mt-6 flex flex-col items-center gap-1.5"
              style={{ willChange: "opacity, transform" }}
              initial={{ opacity: 0, translateY: 16 }}
              animate={phase >= 3 ? { opacity: 1, translateY: 0 } : undefined}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <h1
                className="text-2xl sm:text-5xl font-black tracking-tight text-center text-black dark:text-foreground"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                <span className="text-primary">DG</span>{" "}
                CONTINGÊNCIA{" "}
                <span className="text-primary">PRO</span>
              </h1>
              <motion.span
                className="text-[10px] sm:text-xs tracking-[0.4em] uppercase text-slate-600 dark:text-muted-foreground/40 font-bold"
                style={{ willChange: "opacity" }}
                initial={{ opacity: 0 }}
                animate={phase >= 3 ? { opacity: 1 } : undefined}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                Plataforma de Automação
              </motion.span>
            </motion.div>

            <motion.div
              className="mt-8 sm:mt-10 w-48 sm:w-60 h-[5px] rounded-full bg-amber-500/10 overflow-hidden"
              style={{ willChange: "opacity" }}
              initial={{ opacity: 0 }}
              animate={phase >= 3 ? { opacity: 1 } : undefined}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-500"
                style={{
                  willChange: "transform",
                  transformOrigin: "left",
                  boxShadow: "0 0 12px rgba(245,158,11,0.4)",
                }}
                initial={{ scaleX: 0 }}
                animate={phase >= 3 ? { scaleX: 1 } : undefined}
                transition={{ duration: 2.5, ease: [0.4, 0, 0.2, 1] }}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeSplash;
