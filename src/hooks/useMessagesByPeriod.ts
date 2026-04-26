import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type MessagesPeriod = 7 | 15 | 30 | 60 | 90 | "all";

interface PeriodTotals {
  total: number;
  warmup: number;
  chip: number;
  group: number;
}

/**
 * Aggregates message totals for a chosen period (in days, or "all").
 * Pulls from:
 *   - warmup_daily_stats (filtered by stat_date)
 *   - chip_conversation_logs (filtered by created_at, status = sent)
 *   - group_interaction_logs (filtered by created_at, status = sent)
 */
export function useMessagesByPeriod(period: MessagesPeriod) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["messages-by-period", user?.id, period],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: () => (document.hidden ? false : 60_000),
    queryFn: async (): Promise<PeriodTotals> => {
      // Compute the lower bound (BRT-safe via ISO with -03:00 offset)
      let startISO: string | null = null;
      let startDateStr: string | null = null;
      if (period !== "all") {
        const now = new Date();
        now.setDate(now.getDate() - (period - 1));
        startDateStr = now.toLocaleDateString("en-CA"); // YYYY-MM-DD (local)
        startISO = `${startDateStr}T00:00:00-03:00`;
      }

      // Build the queries with optional period filter
      let warmupQuery = supabase
        .from("warmup_daily_stats")
        .select("messages_sent")
        .eq("user_id", user!.id);
      if (startDateStr) warmupQuery = warmupQuery.gte("stat_date", startDateStr);

      let chipQuery = supabase
        .from("chip_conversation_logs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("status", "sent");
      if (startISO) chipQuery = chipQuery.gte("created_at", startISO);

      let groupQuery = supabase
        .from("group_interaction_logs" as any)
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("status", "sent");
      if (startISO) groupQuery = (groupQuery as any).gte("created_at", startISO);

      const [warmupRes, chipRes, groupRes] = await Promise.all([
        warmupQuery,
        chipQuery,
        groupQuery,
      ]);

      const warmup = (warmupRes.data || []).reduce(
        (sum: number, row: any) => sum + (row.messages_sent || 0),
        0
      );
      const chip = (chipRes as any).count ?? 0;
      const group = (groupRes as any).count ?? 0;

      return { total: warmup + chip + group, warmup, chip, group };
    },
  });
}

export const PERIOD_OPTIONS: { value: MessagesPeriod; label: string; short: string }[] = [
  { value: 7, label: "Últimos 7 dias", short: "7d" },
  { value: 15, label: "Últimos 15 dias", short: "15d" },
  { value: 30, label: "Últimos 30 dias", short: "30d" },
  { value: 60, label: "Últimos 60 dias", short: "60d" },
  { value: 90, label: "Últimos 90 dias", short: "90d" },
  { value: "all", label: "Todo o período", short: "Tudo" },
];
