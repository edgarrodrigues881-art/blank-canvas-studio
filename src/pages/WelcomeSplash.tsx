import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/dg-contingencia-pro-logo.jpeg";

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
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "#0c0c0c" }}
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
              {/* Soft metallic ambient — restrained, warm gold */}
              <div className="absolute -inset-10 bg-[radial-gradient(circle_at_50%_45%,rgba(202,138,4,0.18)_0%,rgba(161,98,7,0.06)_45%,transparent_70%)] blur-2xl pointer-events-none" />
              {/* Tight directional sheen from top-left */}
              <div className="absolute -inset-2 bg-[radial-gradient(ellipse_at_30%_25%,rgba(234,179,8,0.14)_0%,transparent_55%)] blur-md pointer-events-none" />

              <div
                className="relative w-28 h-28 sm:w-40 sm:h-40 rounded-2xl overflow-hidden border border-amber-500/25 bg-[hsl(222,22%,7%)]"
                style={{
                  boxShadow:
                    "inset 0 1px 0 0 rgba(253,224,71,0.08), 0 0 0 1px rgba(202,138,4,0.12), 0 18px 40px -18px rgba(120,53,15,0.55), 0 6px 16px -6px rgba(0,0,0,0.6)",
                }}
              >
                <img
                  src={logo}
                  alt="DG Contingência Pro"
                  className="w-full h-full object-cover"
                />
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
                className="text-2xl sm:text-5xl font-semibold tracking-tight text-center text-white"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                <span style={{ color: "#2d8c3c" }}>DG</span>{" "}
                Contingência{" "}
                <span style={{ color: "#2d8c3c" }}>Pro</span>
              </h1>
              <motion.span
                className="text-[10px] sm:text-xs tracking-[0.4em] uppercase text-white/25 font-bold"
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
