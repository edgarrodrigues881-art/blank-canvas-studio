import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Lightweight hook that reads today's message count from the
 * pre-aggregated warmup_daily_stats table (populated by DB trigger).
 */
export function useMessagesTodayCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["messages-today-count", user?.id],
    queryFn: async (): Promise<number> => {
      const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local

      const { data } = await supabase
        .from("warmup_daily_stats")
        .select("messages_sent")
        .eq("user_id", user!.id)
        .eq("stat_date", today);

      if (!data || data.length === 0) return 0;
      return data.reduce((sum, row) => sum + (row.messages_sent || 0), 0);
    },
    enabled: !!user?.id,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}
