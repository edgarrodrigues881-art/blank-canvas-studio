import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Aggregates accumulated message totals from:
 * 1. warmup_daily_stats (aquecimento automático)
 * 2. chip_conversations (conversa entre chips)
 * 3. group_interactions (interação de grupos)
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
          .from("chip_conversations")
          .select("total_messages_sent")
          .eq("user_id", user!.id),
        supabase
          .from("group_interactions")
          .select("total_messages_sent")
          .eq("user_id", user!.id),
      ]);

      const warmup = (warmupRes.data || []).reduce((sum, row) => sum + (row.messages_sent || 0), 0);
      const chip = (chipRes.data || []).reduce((sum, row) => sum + (row.total_messages_sent || 0), 0);
      const group = (groupRes.data || []).reduce((sum, row) => sum + (row.total_messages_sent || 0), 0);

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
