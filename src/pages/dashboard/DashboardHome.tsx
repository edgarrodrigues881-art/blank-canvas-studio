import { Card, CardContent } from "@/components/ui/card";
import { Wifi, WifiOff, Flame, MessagesSquare, Users } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useMessagesTodayCount } from "@/hooks/useMessagesTodayCount";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";
import { GreetingHeader } from "@/components/dashboard/GreetingHeader";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { ActivityChart } from "@/components/dashboard/ActivityChart";


const DashboardHome = () => {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: liveMessagesToday } = useMessagesTodayCount();

  const chips = stats?.chips || [];
  const connectedCount = chips.filter((c) => c.connected).length;
  const warmingCount = chips.filter((c) => c.warmupStatus === "running").length;
  const disconnectedCount = chips.filter((c) => !c.connected).length;

  const topCards = [
    {
      label: "Conectadas",
      value: connectedCount,
      icon: Wifi,
      dotColor: "bg-emerald-400",
      iconClass: "text-emerald-400",
      bgClass: "bg-emerald-500/10",
    },
    {
      label: "Aquecendo",
      value: warmingCount,
      icon: Flame,
      dotColor: "bg-amber-400",
      iconClass: "text-amber-400",
      bgClass: "bg-amber-500/10",
    },
    {
      label: "Desconectadas",
      value: disconnectedCount,
      icon: WifiOff,
      dotColor: "bg-red-400",
      iconClass: "text-red-400",
      bgClass: "bg-red-500/10",
    },
  ];

  const messageCards = [
    {
      label: "Conversa entre Chips",
      value: liveMessagesToday?.chip ?? 0,
      icon: MessagesSquare,
      iconClass: "text-blue-400",
      bgClass: "bg-blue-500/10",
      dotColor: "bg-blue-400",
    },
    {
      label: "Interação de Grupos",
      value: liveMessagesToday?.group ?? 0,
      icon: Users,
      iconClass: "text-violet-400",
      bgClass: "bg-violet-500/10",
      dotColor: "bg-violet-400",
    },
    {
      label: "Aquecimento Automático",
      value: liveMessagesToday?.warmup ?? 0,
      icon: Flame,
      iconClass: "text-orange-400",
      bgClass: "bg-orange-500/10",
      dotColor: "bg-orange-400",
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
          <Card key={s.label} className="border-border bg-card shadow-sm hover:shadow-md transition-all">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full ${s.bgClass} flex items-center justify-center`}>
                  <s.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${s.iconClass}`} />
                </div>
                <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${s.dotColor}`} />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-foreground">
                {isLoading ? (
                  <span className="inline-block w-8 h-6 bg-muted/50 rounded animate-pulse" />
                ) : (
                  <AnimatedCounter value={s.value} />
                )}
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                {s.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {messageCards.map((s) => (
          <Card key={s.label} className="border-border bg-card shadow-sm hover:shadow-md transition-all">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full ${s.bgClass} flex items-center justify-center`}>
                  <s.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${s.iconClass}`} />
                </div>
                <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${s.dotColor}`} />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-foreground">
                <AnimatedCounter value={s.value} />
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                {s.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ActivityChart data={stats?.warmupEvolution || []} />
    </div>
  );
};

export default DashboardHome;
