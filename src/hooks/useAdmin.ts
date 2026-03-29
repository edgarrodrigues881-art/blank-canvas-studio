import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  document: string | null;
  avatar_url: string | null;
  status: string;
  risk_flag: boolean;
  admin_notes: string | null;
  roles: string[];
  devices_count: number;
  devices_connected: number;
  campaigns_count: number;
  created_at: string;
  last_sign_in_at: string | null;
  plan_name: string | null;
  plan_price: number;
  max_instances: number;
  instance_override: number;
  plan_expires_at: string | null;
  plan_started_at: string | null;
  signup_ip: string | null;
  last_ip: string | null;
  ip_shared_users: number;
}

export interface AdminDashboard {
  users: AdminUser[];
  devices: any[];
  cycles: any[];
  payments: any[];
  admin_logs: any[];
  costs: any[];
  stats: {
    total_users: number;
    total_devices: number;
    active_devices: number;
    total_campaigns: number;
    total_contacts: number;
    total_subscriptions: number;
  };
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-data?action=dashboard");
      if (error) {
        console.error("[admin-dashboard] Edge function error:", error);
        throw error;
      }
      return data as AdminDashboard;
    },
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}

export function useClientDetail(userId: string | null) {
  return useQuery({
    queryKey: ["admin-client-detail", userId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-data?action=client-detail", {
        body: { target_user_id: userId },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 120_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useAdminAction() {
  const queryClient = useQueryClient();

  const invalidateClient = useCallback((userId?: string) => {
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ["admin-client-detail", userId] });
    }
  }, [queryClient]);

  const invalidateDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
  }, [queryClient]);

  const mutation = useMutation({
    mutationFn: async ({ action, body }: { action: string; body: Record<string, any> }) => {
      const { data, error } = await supabase.functions.invoke(`admin-data?action=${action}`, { body });
      if (error) throw error;
      return data;
    },
    // Don't auto-invalidate everything — let callers decide
  });

  return {
    ...mutation,
    invalidateClient,
    invalidateDashboard,
  };
}

export function useSetUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetUserId, role, remove }: { targetUserId: string; role: string; remove?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("admin-data?action=set-role", {
        body: { target_user_id: targetUserId, role, remove: !!remove },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-client-detail", vars.targetUserId] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
  });
}
