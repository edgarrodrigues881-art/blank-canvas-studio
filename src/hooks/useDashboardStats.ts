import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface ChipInfo {
  id: string;
  name: string;
  number: string | null;
  status: string;
  connected: boolean;
  volumeToday: number;
  lastActivity: string | null;
  proxyHost: string | null;
  warmupStatus: string | null;
  warmupDay: number | null;
  warmupTotal: number | null;
  profilePicture: string | null;
}

export interface WarmupEvolutionPoint {
  label: string;
  volume: number;
  entregas: number;
  crescimento: number;
}

export interface PerformanceMetrics {
  avgDeliveryRate: number;
  avgFailRate: number;
  avgDailyVolume: number;
  growthLast7Days: number;
}

export interface DashboardStats {
  chipsOnline: number;
  chipsActive: number;
  chipsInactive: number;
  avgMessagesPerDay: number;
  avgDeliveryRate: number;
  performance: PerformanceMetrics;
  chips: ChipInfo[];
  warmupEvolution: WarmupEvolutionPoint[];
}

export function useDashboardStats() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Realtime DESATIVADO para reduzir consumo do banco
  // useEffect(() => {
  //   if (!user?.id) return;
  //   const channel = supabase.channel("dashboard-rt")...
  //   return () => { supabase.removeChannel(channel); };
  // }, [user?.id, queryClient]);

  return useQuery({
    queryKey: ["dashboard-stats", user?.id],
    queryFn: async (): Promise<DashboardStats> => {
      // Calculate date range for the week (Monday-Sunday)
      const now = new Date();
      const todayDow = now.getDay();
      const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);
      const mondayStr = monday.toLocaleDateString("en-CA"); // YYYY-MM-DD

      const [devicesRes, cyclesRes, dailyStatsRes, proxiesRes] = await Promise.all([
        supabase.from("devices").select("id, name, number, status, proxy_id, profile_picture").eq("user_id", user!.id).neq("login_type", "report_wa"),
        supabase.from("warmup_cycles").select("id, device_id, is_running, phase, day_index, days_total, daily_interaction_budget_used, daily_interaction_budget_target, updated_at").eq("user_id", user!.id),
        supabase.from("warmup_daily_stats").select("device_id, stat_date, messages_sent, messages_failed, messages_total").eq("user_id", user!.id).gte("stat_date", mondayStr),
        supabase.from("proxies").select("id, host"),
      ]);

      const devices = devicesRes.data || [];
      const cycles = cyclesRes.data || [];
      const dailyStats = dailyStatsRes.data || [];
      const proxies = proxiesRes.data || [];

      const proxyMap: Record<string, string> = {};
      proxies.forEach((p) => { proxyMap[p.id] = p.host; });

      // Only count stats from non-report_wa devices
      const validDeviceIds = new Set(devices.map((d) => d.id));

      // Aggregate totals from the daily stats table
      let totalSent = 0;
      let totalFailed = 0;

      // Group daily stats by date for the evolution chart
      const dayStatsMap: Record<string, { sent: number; failed: number; total: number }> = {};

      dailyStats.forEach((s) => {
        totalSent += s.messages_sent || 0;
        totalFailed += s.messages_failed || 0;

        const dateKey = s.stat_date;
        if (!dayStatsMap[dateKey]) dayStatsMap[dateKey] = { sent: 0, failed: 0, total: 0 };
        dayStatsMap[dateKey].sent += s.messages_sent || 0;
        dayStatsMap[dateKey].failed += s.messages_failed || 0;
        dayStatsMap[dateKey].total += s.messages_total || 0;
      });

      const totalMessages = totalSent + totalFailed;

      // Build chips
      const chips: ChipInfo[] = devices.map((d) => {
        const cycle = cycles.find((c) => c.device_id === d.id && c.is_running);
        const activeCycle = cycle || cycles.find((c) => c.device_id === d.id && c.phase === "paused");

        return {
          id: d.id,
          name: d.name,
          number: d.number,
          status: d.status,
          connected: d.status === "Ready",
          volumeToday: activeCycle?.daily_interaction_budget_used || 0,
          lastActivity: activeCycle?.updated_at || null,
          proxyHost: d.proxy_id ? (proxyMap[d.proxy_id] || "Configurado") : null,
          warmupStatus: activeCycle ? (activeCycle.is_running ? "running" : "paused") : null,
          warmupDay: activeCycle?.day_index || null,
          warmupTotal: activeCycle?.days_total || null,
          profilePicture: d.profile_picture,
        };
      });

      const chipsOnline = chips.filter((c) => c.connected).length;
      const chipsActive = chips.filter((c) => c.warmupStatus === "running" || c.volumeToday > 0).length;
      const chipsInactive = chips.filter((c) => !c.connected && !c.warmupStatus).length;

      const runningCycles = cycles.filter((c) => c.is_running);
      const totalDailyVolume = runningCycles.reduce((a, c) => a + (c.daily_interaction_budget_used || 0), 0);
      const avgMessagesPerDay = runningCycles.length > 0 ? Math.round(totalDailyVolume / runningCycles.length) : 0;

      const avgDeliveryRate = totalMessages > 0 ? Math.round((totalSent / totalMessages) * 100) : 100;
      const avgFailRate = totalMessages > 0 ? Math.round((totalFailed / totalMessages) * 100) : 0;

      // Warmup evolution — week Monday to Sunday using aggregated stats
      const warmupEvolution: WarmupEvolutionPoint[] = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = d.toLocaleDateString("en-CA");
        const dayLabel = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");

        const dayData = dayStatsMap[dateStr] || { sent: 0, failed: 0, total: 0 };

        return { label: dayLabel, volume: dayData.total, entregas: dayData.sent, crescimento: 0 };
      });

      for (let i = 1; i < warmupEvolution.length; i++) {
        const prev = warmupEvolution[i - 1].volume;
        const curr = warmupEvolution[i].volume;
        const raw = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : (curr > 0 ? 100 : 0);
        warmupEvolution[i].crescimento = Math.max(-100, Math.min(raw, 500));
      }

      const firstDayVol = warmupEvolution[0]?.volume || 0;
      const lastDayVol = warmupEvolution[6]?.volume || 0;
      const growthLast7Days = firstDayVol > 0 ? Math.round(((lastDayVol - firstDayVol) / firstDayVol) * 100) : 0;
      const activeChipCount = runningCycles.length || 1;
      const avgDailyVolume = Math.round(totalDailyVolume / activeChipCount);

      return {
        chipsOnline,
        chipsActive,
        chipsInactive,
        avgMessagesPerDay,
        avgDeliveryRate,
        performance: {
          avgDeliveryRate,
          avgFailRate,
          avgDailyVolume,
          growthLast7Days,
        },
        chips,
        warmupEvolution,
      };
    },
    refetchInterval: 300_000,  // 5min — economia máxima
    staleTime: 180_000,       // 3min
  });
}
