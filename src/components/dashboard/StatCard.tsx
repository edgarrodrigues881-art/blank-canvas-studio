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
    iconText: "text-emerald-300",
    iconBg: "bg-gradient-to-br from-emerald-500/20 to-emerald-500/5",
    iconRing: "ring-emerald-500/20",
    dot: "bg-emerald-400 shadow-[0_0_8px_hsl(152,69%,53%)]",
    glow: "group-hover:shadow-[0_0_24px_-4px_hsl(152,69%,53%/0.25)]",
  },
  amber: {
    bar: "bg-amber-400",
    iconText: "text-amber-300",
    iconBg: "bg-gradient-to-br from-amber-500/20 to-amber-500/5",
    iconRing: "ring-amber-500/20",
    dot: "bg-amber-400 shadow-[0_0_8px_hsl(43,96%,56%)]",
    glow: "group-hover:shadow-[0_0_24px_-4px_hsl(43,96%,56%/0.25)]",
  },
  red: {
    bar: "bg-red-400",
    iconText: "text-red-300",
    iconBg: "bg-gradient-to-br from-red-500/20 to-red-500/5",
    iconRing: "ring-red-500/20",
    dot: "bg-red-400 shadow-[0_0_8px_hsl(0,84%,60%)]",
    glow: "group-hover:shadow-[0_0_24px_-4px_hsl(0,84%,60%/0.25)]",
  },
  blue: {
    bar: "bg-blue-400",
    iconText: "text-blue-300",
    iconBg: "bg-gradient-to-br from-blue-500/20 to-blue-500/5",
    iconRing: "ring-blue-500/20",
    dot: "bg-blue-400 shadow-[0_0_8px_hsl(217,91%,60%)]",
    glow: "group-hover:shadow-[0_0_24px_-4px_hsl(217,91%,60%/0.25)]",
  },
  violet: {
    bar: "bg-violet-400",
    iconText: "text-violet-300",
    iconBg: "bg-gradient-to-br from-violet-500/20 to-violet-500/5",
    iconRing: "ring-violet-500/20",
    dot: "bg-violet-400 shadow-[0_0_8px_hsl(258,90%,66%)]",
    glow: "group-hover:shadow-[0_0_24px_-4px_hsl(258,90%,66%/0.25)]",
  },
  orange: {
    bar: "bg-orange-400",
    iconText: "text-orange-300",
    iconBg: "bg-gradient-to-br from-orange-500/20 to-orange-500/5",
    iconRing: "ring-orange-500/20",
    dot: "bg-orange-400 shadow-[0_0_8px_hsl(25,95%,55%)]",
    glow: "group-hover:shadow-[0_0_24px_-4px_hsl(25,95%,55%/0.25)]",
  },
  sky: {
    bar: "bg-sky-400",
    iconText: "text-sky-300",
    iconBg: "bg-gradient-to-br from-sky-500/20 to-sky-500/5",
    iconRing: "ring-sky-500/20",
    dot: "bg-sky-400 shadow-[0_0_8px_hsl(199,89%,55%)]",
    glow: "group-hover:shadow-[0_0_24px_-4px_hsl(199,89%,55%/0.25)]",
  },
  fuchsia: {
    bar: "bg-fuchsia-400",
    iconText: "text-fuchsia-300",
    iconBg: "bg-gradient-to-br from-fuchsia-500/20 to-fuchsia-500/5",
    iconRing: "ring-fuchsia-500/20",
    dot: "bg-fuchsia-400 shadow-[0_0_8px_hsl(292,84%,60%)]",
    glow: "group-hover:shadow-[0_0_24px_-4px_hsl(292,84%,60%/0.25)]",
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
      {/* Accent bar — left vertical gradient */}
      <span
        className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full ${t.bar} opacity-80 group-hover:opacity-100 transition-opacity`}
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
