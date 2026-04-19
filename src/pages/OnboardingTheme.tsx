import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { Check } from "lucide-react";

type ThemeChoice = "dark" | "light";

const OnboardingTheme = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setTheme, resolvedTheme } = useTheme();
  const redirectTo = searchParams.get("to") || "/dashboard";
  const [selected, setSelected] = useState<ThemeChoice>(
    (resolvedTheme as ThemeChoice) || "dark"
  );

  // Sync with the actual resolved theme once next-themes hydrates
  useEffect(() => {
    if (resolvedTheme === "light" || resolvedTheme === "dark") {
      setSelected(resolvedTheme);
    }
  }, [resolvedTheme]);

  const handleSelect = (choice: ThemeChoice) => {
    setSelected(choice);
    // Apply theme instantly: next-themes updates localStorage + html class
    setTheme(choice);
    // Defensive: ensure class is applied immediately even before next-themes flushes
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(choice);
    try {
      localStorage.setItem("theme", choice);
    } catch {}
  };

  const handleContinue = () => {
    navigate(redirectTo, { replace: true });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0c0c0c] text-white px-6 py-10 overflow-hidden relative">
      {/* Subtle ambient gradient */}
      <div className="pointer-events-none absolute -top-40 left-1/3 w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 w-[500px] h-[500px] rounded-full bg-amber-500/5 blur-[140px]" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-3xl flex flex-col items-center"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-center mb-12 sm:mb-16"
        >
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Escolha seu estilo
          </h1>
          <p className="mt-3 text-sm sm:text-base text-white/45 font-normal">
            Você pode alterar isso depois nas configurações
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 w-full"
        >
          <ThemeCard
            label="Escuro"
            recommended
            selected={selected === "dark"}
            onClick={() => handleSelect("dark")}
            preview={<DarkPreview />}
          />
          <ThemeCard
            label="Claro"
            selected={selected === "light"}
            onClick={() => handleSelect("light")}
            preview={<LightPreview />}
          />
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          onClick={handleContinue}
          className="mt-12 sm:mt-14 px-10 py-3 rounded-full bg-white text-[#0c0c0c] text-sm font-semibold hover:bg-white/90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          Continuar
        </motion.button>
      </motion.div>
    </div>
  );
};

interface ThemeCardProps {
  label: string;
  recommended?: boolean;
  selected: boolean;
  onClick: () => void;
  preview: React.ReactNode;
}

const ThemeCard = ({ label, recommended, selected, onClick, preview }: ThemeCardProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative rounded-2xl p-3 transition-all duration-300 text-left ${
        selected
          ? "bg-white/[0.04] ring-1 ring-emerald-500/40 shadow-[0_0_0_4px_rgba(16,185,129,0.08),0_20px_40px_-20px_rgba(16,185,129,0.25)]"
          : "bg-white/[0.02] ring-1 ring-white/[0.06] hover:ring-white/[0.14] hover:bg-white/[0.035]"
      }`}
    >
      {/* Preview area */}
      <div className="relative aspect-[16/10] rounded-xl overflow-hidden">
        {preview}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-1 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/85">{label}</span>
          {recommended && (
            <span className="text-[10px] tracking-wide uppercase text-emerald-400/80 font-semibold">
              Recomendado
            </span>
          )}
        </div>
        <span
          className={`flex items-center justify-center w-5 h-5 rounded-full transition-all ${
            selected
              ? "bg-emerald-500 text-white"
              : "bg-white/[0.06] text-transparent group-hover:bg-white/[0.1]"
          }`}
        >
          <Check className="w-3 h-3" strokeWidth={3} />
        </span>
      </div>
    </button>
  );
};

const DarkPreview = () => (
  <div className="w-full h-full bg-[#0d0f12] flex">
    {/* Sidebar */}
    <div className="w-[28%] h-full bg-[#0a0c0f] border-r border-white/[0.04] p-2 flex flex-col gap-1.5">
      <div className="h-2 w-12 rounded-full bg-emerald-500/60" />
      <div className="mt-2 h-1.5 w-full rounded-full bg-white/[0.06]" />
      <div className="h-1.5 w-3/4 rounded-full bg-white/[0.06]" />
      <div className="h-1.5 w-2/3 rounded-full bg-white/[0.06]" />
      <div className="h-1.5 w-3/5 rounded-full bg-white/[0.06]" />
      <div className="h-1.5 w-2/3 rounded-full bg-white/[0.06]" />
    </div>
    {/* Main */}
    <div className="flex-1 p-2.5 flex flex-col gap-2">
      <div className="h-2 w-1/3 rounded-full bg-white/15" />
      <div className="grid grid-cols-3 gap-1.5 mt-1">
        <div className="h-7 rounded-md bg-white/[0.04] border border-white/[0.04]" />
        <div className="h-7 rounded-md bg-white/[0.04] border border-white/[0.04]" />
        <div className="h-7 rounded-md bg-white/[0.04] border border-white/[0.04]" />
      </div>
      <div className="flex-1 rounded-md bg-white/[0.03] border border-white/[0.04] mt-1 p-1.5 flex flex-col gap-1">
        <div className="h-1.5 w-2/3 rounded-full bg-white/[0.08]" />
        <div className="h-1.5 w-1/2 rounded-full bg-white/[0.08]" />
        <div className="h-1.5 w-3/5 rounded-full bg-white/[0.08]" />
      </div>
    </div>
  </div>
);

const LightPreview = () => (
  <div className="w-full h-full bg-[#F5F7FA] flex">
    {/* Sidebar */}
    <div className="w-[28%] h-full bg-white border-r border-black/[0.06] p-2 flex flex-col gap-1.5 shadow-[inset_-1px_0_0_rgba(0,0,0,0.02)]">
      <div className="h-2 w-12 rounded-full bg-emerald-500" />
      <div className="mt-2 h-1.5 w-full rounded-full bg-black/[0.08]" />
      <div className="h-1.5 w-3/4 rounded-full bg-black/[0.08]" />
      <div className="h-1.5 w-2/3 rounded-full bg-black/[0.08]" />
      <div className="h-1.5 w-3/5 rounded-full bg-black/[0.08]" />
      <div className="h-1.5 w-2/3 rounded-full bg-black/[0.08]" />
    </div>
    {/* Main */}
    <div className="flex-1 p-2.5 flex flex-col gap-2">
      <div className="h-2 w-1/3 rounded-full bg-black/30" />
      <div className="grid grid-cols-3 gap-1.5 mt-1">
        <div className="h-7 rounded-md bg-white border border-black/[0.05] shadow-sm" />
        <div className="h-7 rounded-md bg-white border border-black/[0.05] shadow-sm" />
        <div className="h-7 rounded-md bg-white border border-black/[0.05] shadow-sm" />
      </div>
      <div className="flex-1 rounded-md bg-white border border-black/[0.05] mt-1 p-1.5 flex flex-col gap-1 shadow-sm">
        <div className="h-1.5 w-2/3 rounded-full bg-black/[0.12]" />
        <div className="h-1.5 w-1/2 rounded-full bg-black/[0.12]" />
        <div className="h-1.5 w-3/5 rounded-full bg-black/[0.12]" />
      </div>
    </div>
  </div>
);

export default OnboardingTheme;
