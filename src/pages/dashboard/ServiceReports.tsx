import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  MessageSquare,
  Send,
  ArrowDownLeft,
  Bot,
  Clock,
  Users,
  TrendingUp,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

type Period = "today" | "7d" | "30d" | "all";

function usePeriodRange(period: Period) {
  return useMemo(() => {
    const now = new Date();
    switch (period) {
      case "today":
        return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
      case "7d":
        return { from: startOfDay(subDays(now, 7)).toISOString(), to: endOfDay(now).toISOString() };
      case "30d":
        return { from: startOfDay(subDays(now, 30)).toISOString(), to: endOfDay(now).toISOString() };
      case "all":
        return { from: "2020-01-01T00:00:00Z", to: endOfDay(now).toISOString() };
    }
  }, [period]);
}

export default function ServiceReports() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("7d");
  const { from, to } = usePeriodRange(period);

  // Fetch conversations stats
  const { data: convStats, isLoading: loadingConv } = useQuery({
    queryKey: ["service-report-conversations", user?.id, from, to],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("conversations")
        .select("id, attending_status, created_at, unread_count")
        .eq("user_id", user.id)
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;
      
      const total = data?.length || 0;
      const byStatus: Record<string, number> = {};
      for (const c of data || []) {
        const s = c.attending_status || "sem_status";
        byStatus[s] = (byStatus[s] || 0) + 1;
      }
      return { total, byStatus };
    },
    enabled: !!user,
  });

  // Fetch messages stats
  const { data: msgStats, isLoading: loadingMsg } = useQuery({
    queryKey: ["service-report-messages", user?.id, from, to],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("id, direction, is_ai_response, created_at")
        .eq("user_id", user.id)
        .neq("origin", "warmup")
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;

      let sent = 0;
      let received = 0;
      let aiResponses = 0;
      const byDay: Record<string, { sent: number; received: number }> = {};

      for (const m of data || []) {
        const day = format(new Date(m.created_at), "dd/MM", { locale: ptBR });
        if (!byDay[day]) byDay[day] = { sent: 0, received: 0 };

        if (m.direction === "outgoing") {
          sent++;
          byDay[day].sent++;
        } else {
          received++;
          byDay[day].received++;
        }
        if (m.is_ai_response) aiResponses++;
      }

      return { total: (data?.length || 0), sent, received, aiResponses, byDay };
    },
    enabled: !!user,
  });

  // Fetch campaign dispatch stats
  const { data: campaignStats, isLoading: loadingCamp } = useQuery({
    queryKey: ["service-report-campaigns", user?.id, from, to],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, status, sent_count, failed_count, delivered_count, total_contacts")
        .eq("user_id", user.id)
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;

      let totalSent = 0;
      let totalFailed = 0;
      let totalDelivered = 0;
      let totalContacts = 0;

      for (const c of data || []) {
        totalSent += c.sent_count || 0;
        totalFailed += c.failed_count || 0;
        totalDelivered += c.delivered_count || 0;
        totalContacts += c.total_contacts || 0;
      }

      return {
        campaigns: data?.length || 0,
        totalSent,
        totalFailed,
        totalDelivered,
        totalContacts,
      };
    },
    enabled: !!user,
  });

  const isLoading = loadingConv || loadingMsg || loadingCamp;

  const statCards = [
    {
      title: "Conversas",
      value: convStats?.total ?? 0,
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      title: "Mensagens Enviadas",
      value: msgStats?.sent ?? 0,
      icon: Send,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      title: "Mensagens Recebidas",
      value: msgStats?.received ?? 0,
      icon: ArrowDownLeft,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      title: "Respostas IA",
      value: msgStats?.aiResponses ?? 0,
      icon: Bot,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
    },
    {
      title: "Campanhas",
      value: campaignStats?.campaigns ?? 0,
      icon: BarChart3,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    {
      title: "Disparos Enviados",
      value: campaignStats?.totalSent ?? 0,
      icon: TrendingUp,
      color: "text-green-400",
      bg: "bg-green-500/10",
    },
    {
      title: "Disparos Falhados",
      value: campaignStats?.totalFailed ?? 0,
      icon: Clock,
      color: "text-red-400",
      bg: "bg-red-500/10",
    },
    {
      title: "Total de Mensagens",
      value: msgStats?.total ?? 0,
      icon: MessageSquare,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
    },
  ];

  const statusLabels: Record<string, string> = {
    new: "Nova",
    attending: "Em atendimento",
    waiting: "Aguardando",
    finished: "Finalizado",
    paused: "Pausado",
    sem_status: "Sem status",
  };

  const statusColors: Record<string, string> = {
    new: "bg-blue-500/20 text-blue-300",
    attending: "bg-emerald-500/20 text-emerald-300",
    waiting: "bg-amber-500/20 text-amber-300",
    finished: "bg-zinc-500/20 text-zinc-300",
    paused: "bg-red-500/20 text-red-300",
    sem_status: "bg-zinc-500/20 text-zinc-400",
  };

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatório de Atendimento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe disparos, respostas e métricas do atendimento
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title} className="border-border/40 bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{card.title}</p>
                  {isLoading ? (
                    <Skeleton className="h-7 w-16 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold">{card.value.toLocaleString("pt-BR")}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Details Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Conversations by Status */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Conversas por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(convStats?.byStatus || {}).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/30">
                    <Badge variant="secondary" className={statusColors[status] || "bg-zinc-500/20 text-zinc-300"}>
                      {statusLabels[status] || status}
                    </Badge>
                    <span className="font-semibold text-sm">{count}</span>
                  </div>
                ))}
                {Object.keys(convStats?.byStatus || {}).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conversa no período</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Messages by Day */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Mensagens por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {Object.entries(msgStats?.byDay || {})
                  .reverse()
                  .map(([day, counts]) => (
                    <div key={day} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/30">
                      <span className="text-sm font-medium">{day}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Send className="h-3 w-3" /> {counts.sent}
                        </span>
                        <span className="flex items-center gap-1 text-amber-400">
                          <ArrowDownLeft className="h-3 w-3" /> {counts.received}
                        </span>
                      </div>
                    </div>
                  ))}
                {Object.keys(msgStats?.byDay || {}).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma mensagem no período</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Details */}
      {(campaignStats?.campaigns ?? 0) > 0 && (
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Resumo de Campanhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-2xl font-bold text-emerald-400">{campaignStats?.totalSent?.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-muted-foreground mt-1">Enviados</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-2xl font-bold text-blue-400">{campaignStats?.totalDelivered?.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-muted-foreground mt-1">Entregues</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-2xl font-bold text-red-400">{campaignStats?.totalFailed?.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-muted-foreground mt-1">Falharam</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-2xl font-bold text-zinc-300">{campaignStats?.totalContacts?.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-muted-foreground mt-1">Contatos Totais</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
