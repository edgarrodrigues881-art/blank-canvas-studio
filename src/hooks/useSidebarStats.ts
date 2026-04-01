import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface SidebarStats {
  onlineInstances: number;
  activeWarmupCycles: number;
  criticalAlerts: number;
  activeCampaigns: number;
  unreadNotifications: number;
}

export function useSidebarStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["sidebar-stats", user?.id],
    queryFn: async (): Promise<SidebarStats> => {
      if (!user?.id) return { onlineInstances: 0, activeWarmupCycles: 0, criticalAlerts: 0, activeCampaigns: 0, unreadNotifications: 0 };

      // Single RPC call instead of 5 separate count queries
      const { data, error } = await supabase.rpc("get_sidebar_stats", { p_user_id: user.id });

      if (error || !data) {
        console.warn("[sidebar-stats] RPC failed, returning zeros", error);
        return { onlineInstances: 0, activeWarmupCycles: 0, criticalAlerts: 0, activeCampaigns: 0, unreadNotifications: 0 };
      }

      const stats = data as Record<string, number>;
      return {
        onlineInstances: stats.online || 0,
        activeWarmupCycles: stats.warmup || 0,
        criticalAlerts: stats.disconnected || 0,
        activeCampaigns: stats.campaigns || 0,
        unreadNotifications: stats.unread || 0,
      };
    },
    enabled: !!user,
    refetchInterval: 600_000,   // 10min — economia máxima
    staleTime: 300_000,        // 5min
  });
}
