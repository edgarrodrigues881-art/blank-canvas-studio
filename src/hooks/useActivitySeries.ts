import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { MessagesPeriod } from "@/hooks/useMessagesByPeriod";

export interface ActivityPoint {
  label: string;        // pretty label (e.g. "seg", "12/04")
  date: string;         // YYYY-MM-DD
  entregas: number;
  entregasPrev: number; // same offset shifted by one window — for comparison
}

/**
 * Builds a per-day activity series for the chosen period, with the previous
 * comparable window aligned for comparison on the chart.
 */
export function useActivitySeries(period: MessagesPeriod) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["activity-series", user?.id, period],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: () => (document.hidden ? false : 60_000),
    queryFn: async (): Promise<ActivityPoint[]> => {
      const days = period === "all" ? 90 : period; // cap at 90 days for "all"
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - (days - 1));

      const prevStart = new Date(start);
      prevStart.setDate(start.getDate() - days);
      const prevEnd = new Date(start);
      prevEnd.setDate(start.getDate() - 1);

      const fmt = (d: Date) => d.toLocaleDateString("en-CA");
      const startStr = fmt(start);
      const endStr = fmt(today);
      const prevStartStr = fmt(prevStart);
      const prevEndStr = fmt(prevEnd);

      const startISO = `${startStr}T00:00:00-03:00`;
      const endISO = `${endStr}T23:59:59.999-03:00`;
      const prevStartISO = `${prevStartStr}T00:00:00-03:00`;
      const prevEndISO = `${prevEndStr}T23:59:59.999-03:00`;

      const [warmupCur, warmupPrev, logsCur, logsPrev] = await Promise.all([
        supabase
          .from("warmup_daily_stats")
          .select("stat_date, messages_sent")
          .eq("user_id", user!.id)
          .gte("stat_date", startStr)
          .lte("stat_date", endStr),
        supabase
          .from("warmup_daily_stats")
          .select("stat_date, messages_sent")
          .eq("user_id", user!.id)
          .gte("stat_date", prevStartStr)
          .lte("stat_date", prevEndStr),
        supabase.rpc("get_daily_log_counts", {
          p_user_id: user!.id,
          p_start: startISO,
          p_end: endISO,
        }),
        supabase.rpc("get_daily_log_counts", {
          p_user_id: user!.id,
          p_start: prevStartISO,
          p_end: prevEndISO,
        }),
      ]);

      // Aggregate: { dateStr -> total messages } for current and previous window
      const curMap: Record<string, number> = {};
      const prevMap: Record<string, number> = {};

      ((warmupCur.data || []) as any[]).forEach((r) => {
        curMap[r.stat_date] = (curMap[r.stat_date] || 0) + (r.messages_sent || 0);
      });
      ((warmupPrev.data || []) as any[]).forEach((r) => {
        prevMap[r.stat_date] = (prevMap[r.stat_date] || 0) + (r.messages_sent || 0);
      });
      ((logsCur.data || []) as any[]).forEach((r) => {
        const k = typeof r.dt === "string" ? r.dt.slice(0, 10) : String(r.dt);
        curMap[k] = (curMap[k] || 0) + Number(r.cnt);
      });
      ((logsPrev.data || []) as any[]).forEach((r) => {
        const k = typeof r.dt === "string" ? r.dt.slice(0, 10) : String(r.dt);
        prevMap[k] = (prevMap[k] || 0) + Number(r.cnt);
      });

      // Build series: one point per day in the current window;
      // the comparison value is taken from the previous window at the same offset.
      const result: ActivityPoint[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = fmt(d);

        const dPrev = new Date(prevStart);
        dPrev.setDate(prevStart.getDate() + i);
        const keyPrev = fmt(dPrev);

        // Choose label format: short weekday for ≤7d, dd/mm otherwise
        const label =
          days <= 7
            ? d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
            : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

        result.push({
          label,
          date: key,
          entregas: curMap[key] || 0,
          entregasPrev: prevMap[keyPrev] || 0,
        });
      }
      return result;
    },
  });
}
