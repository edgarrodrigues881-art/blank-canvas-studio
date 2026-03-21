import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type CommunityWarmupConfig = {
  id: string;
  user_id: string;
  device_id: string;
  is_active: boolean;
  intensity: "low" | "medium" | "high";
  start_hour: string;
  end_hour: string;
  active_days: string[];
  daily_limit: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  pause_after_messages_min: number;
  pause_after_messages_max: number;
  pause_duration_min: number;
  pause_duration_max: number;
  interactions_today: number;
  last_interaction_at: string | null;
  status: string;
  status_message: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunityWarmupLog = {
  id: string;
  event_type: string;
  interaction_type: string | null;
  message_preview: string | null;
  intensity: string | null;
  delay_applied_seconds: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

const INTENSITY_PRESETS = {
  low: {
    daily_limit: 30,
    min_delay_seconds: 300,
    max_delay_seconds: 600,
    pause_after_messages_min: 3,
    pause_after_messages_max: 5,
    pause_duration_min: 600,
    pause_duration_max: 1200,
  },
  medium: {
    daily_limit: 60,
    min_delay_seconds: 120,
    max_delay_seconds: 300,
    pause_after_messages_min: 5,
    pause_after_messages_max: 10,
    pause_duration_min: 300,
    pause_duration_max: 600,
  },
  high: {
    daily_limit: 120,
    min_delay_seconds: 60,
    max_delay_seconds: 180,
    pause_after_messages_min: 8,
    pause_after_messages_max: 15,
    pause_duration_min: 180,
    pause_duration_max: 360,
  },
};

export function useCommunityWarmup() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Fetch user devices
  const devicesQuery = useQuery({
    queryKey: ["community_warmup_devices", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, profile_name")
        .eq("user_id", user!.id)
        .neq("login_type", "report_wa")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch all configs for user
  const configsQuery = useQuery({
    queryKey: ["community_warmup_configs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_warmup_configs")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []) as unknown as CommunityWarmupConfig[];
    },
    enabled: !!user,
  });

  // Fetch recent logs
  const logsQuery = useQuery({
    queryKey: ["community_warmup_logs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_warmup_logs")
        .select("id, event_type, interaction_type, message_preview, intensity, delay_applied_seconds, status, error_message, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as CommunityWarmupLog[];
    },
    enabled: !!user,
  });

  // Join community (create config for device)
  const joinMutation = useMutation({
    mutationFn: async (params: { device_id: string; intensity?: "low" | "medium" | "high" }) => {
      const intensity = params.intensity || "medium";
      const preset = INTENSITY_PRESETS[intensity];
      const { data, error } = await supabase
        .from("community_warmup_configs")
        .upsert({
          user_id: user!.id,
          device_id: params.device_id,
          is_active: true,
          intensity,
          status: "waiting",
          status_message: "Aguardando próxima rodada",
          ...preset,
        } as any, { onConflict: "user_id,device_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community_warmup_configs"] });
    },
  });

  // Leave community
  const leaveMutation = useMutation({
    mutationFn: async (config_id: string) => {
      const { error } = await supabase
        .from("community_warmup_configs")
        .delete()
        .eq("id", config_id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community_warmup_configs"] });
    },
  });

  // Toggle active
  const toggleMutation = useMutation({
    mutationFn: async (params: { config_id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("community_warmup_configs")
        .update({
          is_active: params.is_active,
          status: params.is_active ? "waiting" : "paused",
          status_message: params.is_active ? "Aguardando próxima rodada" : "Pausado manualmente",
        } as any)
        .eq("id", params.config_id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community_warmup_configs"] });
    },
  });

  // Update config
  const updateMutation = useMutation({
    mutationFn: async (params: {
      config_id: string;
      intensity?: "low" | "medium" | "high";
      start_hour?: string;
      end_hour?: string;
      active_days?: string[];
      daily_limit?: number;
      min_delay_seconds?: number;
      max_delay_seconds?: number;
    }) => {
      const { config_id, intensity, ...rest } = params;
      const updateData: any = { ...rest };
      if (intensity) {
        Object.assign(updateData, { intensity, ...INTENSITY_PRESETS[intensity] });
      }
      const { error } = await supabase
        .from("community_warmup_configs")
        .update(updateData)
        .eq("id", config_id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community_warmup_configs"] });
    },
  });

  return {
    devices: devicesQuery.data || [],
    configs: configsQuery.data || [],
    logs: logsQuery.data || [],
    isLoading: devicesQuery.isLoading || configsQuery.isLoading,
    logsLoading: logsQuery.isLoading,
    join: joinMutation,
    leave: leaveMutation,
    toggle: toggleMutation,
    update: updateMutation,
    INTENSITY_PRESETS,
  };
}
