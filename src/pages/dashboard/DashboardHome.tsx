import { useState } from "react";
import { Wifi, WifiOff, Flame, MessagesSquare, Users } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useMessagesByPeriod, MessagesPeriod, PERIOD_OPTIONS } from "@/hooks/useMessagesByPeriod";
import { useActivitySeries } from "@/hooks/useActivitySeries";
import { GreetingHeader } from "@/components/dashboard/GreetingHeader";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { StatCard } from "@/components/dashboard/StatCard";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";

const DashboardHome = () => {
  const { data: stats, isLoading } = useDashboardStats();

  const [period, setPeriod] = useState<MessagesPeriod>(7);
  const { data: periodTotals, isLoading: loadingPeriod } = useMessagesByPeriod(period);
  const { data: activityData } = useActivitySeries(period);

  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label || "7 dias";

  const chips = stats?.chips || [];
  const connectedCount = chips.filter((c) => c.connected).length;
  const warmingCount = chips.filter((c) => c.warmupStatus === "running").length;
  const disconnectedCount = chips.filter((c) => !c.connected).length;

  const topCards: Array<{
    label: string;
    value: number;
    icon: any;
    tone: "emerald" | "amber" | "red";
  }> = [
    { label: "Conectadas", value: connectedCount, icon: Wifi, tone: "emerald" },
    { label: "Aquecendo", value: warmingCount, icon: Flame, tone: "amber" },
    { label: "Desconectadas", value: disconnectedCount, icon: WifiOff, tone: "red" },
  ];

  const messageCards: Array<{
    label: string;
    value: number;
    icon: any;
    tone: "blue" | "violet" | "orange";
  }> = [
    {
      label: "Conversa entre Chips",
      value: periodTotals?.chip ?? 0,
      icon: MessagesSquare,
      tone: "blue",
    },
    {
      label: "Aquecimento Automático",
      value: periodTotals?.warmup ?? 0,
      icon: Flame,
      tone: "orange",
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
        <GreetingHeader />
        <QuickActions />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {topCards.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon}
            tone={s.tone}
            isLoading={isLoading}
          />
        ))}
      </div>

      {/* Section header for messages — minimal label + period filter on the right */}
      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-end justify-between px-0.5">
          <div>
            <h2 className="text-[13px] sm:text-sm font-semibold text-foreground tracking-tight">
              Volume de mensagens
            </h2>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground/70 mt-0.5">
              {periodLabel}
            </p>
          </div>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {messageCards.map((s) => (
            <StatCard
              key={s.label}
              label={s.label}
              value={s.value}
              icon={s.icon}
              tone={s.tone}
              isLoading={loadingPeriod}
              showStatusDot={false}
            />
          ))}
        </div>
      </div>

      <ActivityChart
        data={activityData || []}
        periodLabel={periodLabel.replace("Últimos ", "").replace("Todo o período", "90 dias")}
      />
    </div>
  );
};

export default DashboardHome;
