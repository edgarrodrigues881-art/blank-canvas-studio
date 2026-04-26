import { Card, CardContent } from "@/components/ui/card";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";
import { LucideIcon } from "lucide-react";

export interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Tailwind color name token used for accent bar, icon and glow (e.g. "emerald", "amber", "red", "blue", "violet", "orange") */
  tone:
    | "emerald"
    | "amber"
    | "red"
    | "blue"
    | "violet"
    | "orange"
    | "sky"
    | "fuchsia";
  isLoading?: boolean;
  /** Optional trailing dot status indicator (live ping) */
  showStatusDot?: boolean;
}

const TONES: Record<
  StatCardProps["tone"],
  {
    bar: string;
    iconText: string;
    iconBg: string;
    iconRing: string;
    dot: string;
    glow: string;
  }
> = {
  emerald: {
    bar: "bg-emerald-400",
    iconText: "text-emerald-200",
    iconBg: "bg-gradient-to-br from-emerald-500/40 to-emerald-500/10",
    iconRing: "ring-emerald-400/40",
    dot: "bg-emerald-400 shadow-[0_0_10px_hsl(152,69%,53%)]",
    glow: "group-hover:shadow-[0_0_28px_-4px_hsl(152,69%,53%/0.4)]",
  },
  amber: {
    bar: "bg-amber-400",
    iconText: "text-amber-200",
    iconBg: "bg-gradient-to-br from-amber-500/40 to-amber-500/10",
    iconRing: "ring-amber-400/40",
    dot: "bg-amber-400 shadow-[0_0_10px_hsl(43,96%,56%)]",
    glow: "group-hover:shadow-[0_0_28px_-4px_hsl(43,96%,56%/0.4)]",
  },
  red: {
    bar: "bg-red-400",
    iconText: "text-red-200",
    iconBg: "bg-gradient-to-br from-red-500/40 to-red-500/10",
    iconRing: "ring-red-400/40",
    dot: "bg-red-400 shadow-[0_0_10px_hsl(0,84%,60%)]",
    glow: "group-hover:shadow-[0_0_28px_-4px_hsl(0,84%,60%/0.4)]",
  },
  blue: {
    bar: "bg-blue-400",
    iconText: "text-blue-200",
    iconBg: "bg-gradient-to-br from-blue-500/40 to-blue-500/10",
    iconRing: "ring-blue-400/40",
    dot: "bg-blue-400 shadow-[0_0_10px_hsl(217,91%,60%)]",
    glow: "group-hover:shadow-[0_0_28px_-4px_hsl(217,91%,60%/0.4)]",
  },
  violet: {
    bar: "bg-violet-400",
    iconText: "text-violet-200",
    iconBg: "bg-gradient-to-br from-violet-500/40 to-violet-500/10",
    iconRing: "ring-violet-400/40",
    dot: "bg-violet-400 shadow-[0_0_10px_hsl(258,90%,66%)]",
    glow: "group-hover:shadow-[0_0_28px_-4px_hsl(258,90%,66%/0.4)]",
  },
  orange: {
    bar: "bg-orange-400",
    iconText: "text-orange-200",
    iconBg: "bg-gradient-to-br from-orange-500/40 to-orange-500/10",
    iconRing: "ring-orange-400/40",
    dot: "bg-orange-400 shadow-[0_0_10px_hsl(25,95%,55%)]",
    glow: "group-hover:shadow-[0_0_28px_-4px_hsl(25,95%,55%/0.4)]",
  },
  sky: {
    bar: "bg-sky-400",
    iconText: "text-sky-200",
    iconBg: "bg-gradient-to-br from-sky-500/40 to-sky-500/10",
    iconRing: "ring-sky-400/40",
    dot: "bg-sky-400 shadow-[0_0_10px_hsl(199,89%,55%)]",
    glow: "group-hover:shadow-[0_0_28px_-4px_hsl(199,89%,55%/0.4)]",
  },
  fuchsia: {
    bar: "bg-fuchsia-400",
    iconText: "text-fuchsia-200",
    iconBg: "bg-gradient-to-br from-fuchsia-500/40 to-fuchsia-500/10",
    iconRing: "ring-fuchsia-400/40",
    dot: "bg-fuchsia-400 shadow-[0_0_10px_hsl(292,84%,60%)]",
    glow: "group-hover:shadow-[0_0_28px_-4px_hsl(292,84%,60%/0.4)]",
  },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  isLoading,
  showStatusDot = true,
}: StatCardProps) {
  const t = TONES[tone];

  return (
    <Card
      className={`group relative border-border/50 bg-card shadow-sm transition-all duration-300 hover:border-border overflow-hidden ${t.glow}`}
    >
      {/* Accent bar — left vertical */}
      <span
        className={`absolute left-0 top-2.5 bottom-2.5 w-[4px] rounded-r-full ${t.bar}`}
      />

      <CardContent className="p-3 sm:p-5 pl-4 sm:pl-6">
        <div className="flex items-start justify-between mb-2 sm:mb-3">
          <div
            className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl ${t.iconBg} ring-1 ${t.iconRing} flex items-center justify-center shadow-inner`}
          >
            <Icon
              className={`w-[18px] h-[18px] sm:w-5 sm:h-5 ${t.iconText}`}
              strokeWidth={2}
            />
          </div>
          {showStatusDot && (
            <span className="relative flex">
              <span
                className={`absolute inline-flex h-full w-full rounded-full ${t.dot} opacity-40 animate-ping`}
              />
              <span
                className={`relative inline-flex w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${t.dot}`}
              />
            </span>
          )}
        </div>
        <div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight tabular-nums leading-none">
          {isLoading ? (
            <span className="inline-block w-10 h-7 bg-muted/50 rounded animate-pulse" />
          ) : (
            <AnimatedCounter value={value} />
          )}
        </div>
        <p className="text-[11px] sm:text-xs text-muted-foreground/80 mt-1.5 sm:mt-2 font-medium tracking-wide">
          {label}
        </p>
      </CardContent>
    </Card>
  );
}

export default StatCard;
