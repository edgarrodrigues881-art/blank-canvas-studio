import { Wifi, WifiOff, Flame, MessagesSquare, Users } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useMessagesTodayCount } from "@/hooks/useMessagesTodayCount";
import { GreetingHeader } from "@/components/dashboard/GreetingHeader";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { StatCard } from "@/components/dashboard/StatCard";

const DashboardHome = () => {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: liveMessagesToday } = useMessagesTodayCount();

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
      value: liveMessagesToday?.chip ?? 0,
      icon: MessagesSquare,
      tone: "blue",
    },
    {
      label: "Interação de Grupos",
      value: liveMessagesToday?.group ?? 0,
      icon: Users,
      tone: "violet",
    },
    {
      label: "Aquecimento Automático",
      value: liveMessagesToday?.warmup ?? 0,
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

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {messageCards.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon}
            tone={s.tone}
            showStatusDot={false}
          />
        ))}
      </div>

      <ActivityChart data={stats?.warmupEvolution || []} />
    </div>
  );
};

export default DashboardHome;
