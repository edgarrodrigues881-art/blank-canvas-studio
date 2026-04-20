import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { Check, Moon, Sun } from "lucide-react";

type ThemeChoice = "dark" | "light";

const OnboardingTheme = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setTheme, resolvedTheme } = useTheme();
  const redirectTo = searchParams.get("to") || "/dashboard";
  const [selected, setSelected] = useState<ThemeChoice>(
    (resolvedTheme as ThemeChoice) || "dark"
  );

  useEffect(() => {
    if (resolvedTheme === "light" || resolvedTheme === "dark") {
      setSelected(resolvedTheme);
    }
  }, [resolvedTheme]);

  const handleSelect = (choice: ThemeChoice) => {
    setSelected(choice);
    setTheme(choice);
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
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground px-5 py-8 sm:py-12 relative overflow-hidden transition-colors duration-300">
      {/* Soft ambient gradients */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-emerald-500/[0.06] blur-[160px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 w-[500px] h-[500px] rounded-full bg-primary/[0.04] blur-[140px]" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md flex flex-col"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="text-center mb-8 sm:mb-10"
        >
          <h1 className="text-[26px] sm:text-3xl font-semibold tracking-tight text-foreground">
            Escolha seu estilo
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você pode alterar isso depois nas configurações
          </p>
        </motion.div>

        {/* Theme cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex flex-col sm:grid sm:grid-cols-2 gap-3 sm:gap-4 w-full"
        >
          <ThemeCard
            label="Escuro"
            description="Confortável para baixa luz"
            icon={<Moon className="w-5 h-5" strokeWidth={1.75} />}
            selected={selected === "dark"}
            onClick={() => handleSelect("dark")}
            preview={<DarkPreview />}
          />
          <ThemeCard
            label="Claro"
            description="Limpo e luminoso"
            icon={<Sun className="w-5 h-5" strokeWidth={1.75} />}
            selected={selected === "light"}
            onClick={() => handleSelect("light")}
            preview={<LightPreview />}
          />
        </motion.div>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          onClick={handleContinue}
          className="mt-8 sm:mt-10 w-full h-12 rounded-full bg-emerald-500 hover:bg-emerald-500/95 text-white text-[15px] font-semibold shadow-[0_8px_24px_-10px_rgba(16,185,129,0.55)] transition-all duration-200 active:scale-[0.99]"
        >
          Continuar
        </motion.button>
      </motion.div>
    </div>
  );
};

interface ThemeCardProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  preview: React.ReactNode;
}

const ThemeCard = ({ label, description, icon, selected, onClick, preview }: ThemeCardProps) => {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.18 }}
      className={`group relative rounded-2xl p-3 sm:p-4 text-left transition-all duration-300 flex sm:flex-col items-center sm:items-stretch gap-3 sm:gap-3 ${
        selected
          ? "bg-emerald-500/[0.06] ring-1 ring-emerald-500/40"
          : "bg-card/40 ring-1 ring-border/60 hover:bg-card/70 hover:ring-border"
      }`}
    >
      {/* Preview */}
      <div className="relative w-24 sm:w-full aspect-[16/10] rounded-xl overflow-hidden shrink-0 ring-1 ring-border/40">
        {preview}
      </div>

      {/* Info */}
      <div className="flex-1 flex items-center justify-between gap-3 sm:px-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors ${
              selected
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-foreground/[0.04] text-muted-foreground"
            }`}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate">{label}</div>
            <div className="text-[11px] text-muted-foreground truncate">{description}</div>
          </div>
        </div>

        <motion.span
          initial={false}
          animate={{ scale: selected ? 1 : 0.6, opacity: selected ? 1 : 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white shrink-0"
        >
          <Check className="w-3 h-3" strokeWidth={3} />
        </motion.span>
      </div>
    </motion.button>
  );
};

const DarkPreview = () => (
  <div className="w-full h-full bg-[#0d0f12] flex">
    <div className="w-[28%] h-full bg-[#0a0c0f] border-r border-white/[0.04] p-2 flex flex-col gap-1.5">
      <div className="h-2 w-12 rounded-full bg-emerald-500/60" />
      <div className="mt-2 h-1.5 w-full rounded-full bg-white/[0.06]" />
      <div className="h-1.5 w-3/4 rounded-full bg-white/[0.06]" />
      <div className="h-1.5 w-2/3 rounded-full bg-white/[0.06]" />
      <div className="h-1.5 w-3/5 rounded-full bg-white/[0.06]" />
    </div>
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
      </div>
    </div>
  </div>
);

const LightPreview = () => (
  <div className="w-full h-full bg-[#F5F7FA] flex">
    <div className="w-[28%] h-full bg-white border-r border-black/[0.06] p-2 flex flex-col gap-1.5">
      <div className="h-2 w-12 rounded-full bg-emerald-500" />
      <div className="mt-2 h-1.5 w-full rounded-full bg-black/[0.08]" />
      <div className="h-1.5 w-3/4 rounded-full bg-black/[0.08]" />
      <div className="h-1.5 w-2/3 rounded-full bg-black/[0.08]" />
      <div className="h-1.5 w-3/5 rounded-full bg-black/[0.08]" />
    </div>
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
      </div>
    </div>
  </div>
);

export default OnboardingTheme;
