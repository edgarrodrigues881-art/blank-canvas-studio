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

      const [onlineRes, disconnectedRes, warmupsRes, campaignsRes, notificationsRes] = await Promise.all([
        supabase
          .from("devices")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .neq("login_type", "report_wa")
          .in("status", ["Ready", "Connected", "authenticated"]),
        supabase
          .from("devices")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .neq("login_type", "report_wa")
          .in("status", ["Disconnected", "disconnected"]),
        supabase
          .from("warmup_cycles")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_running", true),
        supabase
          .from("campaigns")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .in("status", ["processing", "pending", "scheduled", "running"]),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("read", false),
      ]);

      return {
        onlineInstances: onlineRes.count || 0,
        activeWarmupCycles: warmupsRes.count || 0,
        criticalAlerts: disconnectedRes.count || 0,
        activeCampaigns: campaignsRes.count || 0,
        unreadNotifications: notificationsRes.count || 0,
      };
    },
    enabled: !!user,
    refetchInterval: 600_000,   // 10min — economia máxima
    staleTime: 300_000,        // 5min
  });
}
