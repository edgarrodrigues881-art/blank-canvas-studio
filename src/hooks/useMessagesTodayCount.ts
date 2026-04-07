import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Aggregates accumulated historical message totals from:
 * 1. warmup_daily_stats (aquecimento automático)
 * 2. chip_conversation_logs (conversa entre chips)
 * 3. group_interaction_logs (interação de grupos)
 *
 * Important: chip/group totals must come from logs, not automation rows,
 * so deleting an automation does not erase the historical counters.
 */
export function useMessagesTodayCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["messages-total-count", user?.id],
    queryFn: async (): Promise<{ total: number; warmup: number; chip: number; group: number }> => {
      const [warmupRes, chipRes, groupRes] = await Promise.all([
        supabase
          .from("warmup_daily_stats")
          .select("messages_sent")
          .eq("user_id", user!.id),
        supabase
          .from("chip_conversation_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .eq("status", "sent"),
        supabase
          .from("group_interaction_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .eq("status", "sent"),
      ]);

      const warmup = (warmupRes.data || []).reduce((sum, row) => sum + (row.messages_sent || 0), 0);
      const chip = chipRes.count || 0;
      const group = groupRes.count || 0;

      return {
        total: warmup + chip + group,
        warmup,
        chip,
        group,
      };
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
