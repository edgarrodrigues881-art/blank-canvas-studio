import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isDark = theme === "dark";

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      duration={4000}
      visibleToasts={4}
      expand={true}
      gap={10}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: [
            "group toast pointer-events-auto",
            "rounded-xl border backdrop-blur-md",
            "shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)]",
            "px-4 py-3.5 gap-3",
            "data-[type=success]:!bg-white data-[type=success]:!text-emerald-900 data-[type=success]:!border-emerald-200",
            "data-[type=error]:!bg-white data-[type=error]:!text-rose-900 data-[type=error]:!border-rose-200",
            "data-[type=info]:!bg-white data-[type=info]:!text-blue-900 data-[type=info]:!border-blue-200",
            "data-[type=warning]:!bg-white data-[type=warning]:!text-amber-900 data-[type=warning]:!border-amber-200",
            isDark && "data-[type=success]:!bg-slate-900 data-[type=success]:!text-emerald-100 data-[type=success]:!border-emerald-500/30",
            isDark && "data-[type=error]:!bg-slate-900 data-[type=error]:!text-rose-100 data-[type=error]:!border-rose-500/30",
            isDark && "data-[type=info]:!bg-slate-900 data-[type=info]:!text-blue-100 data-[type=info]:!border-blue-500/30",
            isDark && "data-[type=warning]:!bg-slate-900 data-[type=warning]:!text-amber-100 data-[type=warning]:!border-amber-500/30",
          ].filter(Boolean).join(" "),
          title: "text-sm font-semibold leading-tight",
          description: "text-xs opacity-80 mt-0.5",
          icon: "shrink-0",
          actionButton:
            "group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground group-[.toast]:!rounded-md group-[.toast]:!text-xs",
          cancelButton:
            "group-[.toast]:!bg-muted group-[.toast]:!text-muted-foreground group-[.toast]:!rounded-md group-[.toast]:!text-xs",
        },
      }}
      style={
        {
          // Light defaults — clean white with subtle accent borders
          "--normal-bg": isDark ? "hsl(222 25% 11%)" : "hsl(0 0% 100%)",
          "--normal-text": isDark ? "hsl(210 20% 98%)" : "hsl(222 47% 11%)",
          "--normal-border": isDark ? "hsl(217 19% 22%)" : "hsl(214 32% 91%)",

          "--success-bg": isDark ? "hsl(222 25% 11%)" : "hsl(0 0% 100%)",
          "--success-text": isDark ? "hsl(152 76% 80%)" : "hsl(152 69% 22%)",
          "--success-border": isDark ? "hsl(152 69% 31% / 0.4)" : "hsl(152 69% 70% / 0.5)",

          "--error-bg": isDark ? "hsl(222 25% 11%)" : "hsl(0 0% 100%)",
          "--error-text": isDark ? "hsl(0 90% 85%)" : "hsl(346 80% 30%)",
          "--error-border": isDark ? "hsl(0 84% 60% / 0.4)" : "hsl(0 84% 80% / 0.6)",

          "--info-bg": isDark ? "hsl(222 25% 11%)" : "hsl(0 0% 100%)",
          "--info-text": isDark ? "hsl(217 91% 80%)" : "hsl(217 91% 30%)",
          "--info-border": isDark ? "hsl(217 91% 60% / 0.4)" : "hsl(217 91% 80% / 0.6)",

          "--warning-bg": isDark ? "hsl(222 25% 11%)" : "hsl(0 0% 100%)",
          "--warning-text": isDark ? "hsl(38 92% 80%)" : "hsl(32 81% 30%)",
          "--warning-border": isDark ? "hsl(38 92% 50% / 0.4)" : "hsl(38 92% 70% / 0.6)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster, toast };
