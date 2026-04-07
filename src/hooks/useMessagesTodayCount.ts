import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getBrazilDayBounds } from "@/lib/brazilTime";

/**
 * Aggregates today's message count from:
 * 1. warmup_daily_stats (aquecimento)
 * 2. chip_conversation_logs (conversa entre chips)
 * 3. group_interaction_logs (interação de grupos)
 */
export function useMessagesTodayCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["messages-today-count", user?.id],
    queryFn: async (): Promise<{ total: number; warmup: number; chip: number; group: number }> => {
      const { day: today, start: todayStart, end: todayEnd } = getBrazilDayBounds();

      const [warmupRes, chipRes, groupRes] = await Promise.all([
        supabase
          .from("warmup_daily_stats")
          .select("messages_sent")
          .eq("user_id", user!.id)
          .eq("stat_date", today),
        supabase
          .from("chip_conversation_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .gte("sent_at", todayStart)
          .lte("sent_at", todayEnd),
        supabase
          .from("group_interaction_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .gte("sent_at", todayStart)
          .lte("sent_at", todayEnd),
      ]);

      const warmup = (warmupRes.data || []).reduce((s, r) => s + (r.messages_sent || 0), 0);
      const chip = chipRes.count ?? 0;
      const group = groupRes.count ?? 0;

      return { total: warmup + chip + group, warmup, chip, group };
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
