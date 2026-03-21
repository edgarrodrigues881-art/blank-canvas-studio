import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface GroupInteraction {
  id: string;
  user_id: string;
  name: string;
  status: string;
  group_ids: string[];
  device_id: string | null;
  min_delay_seconds: number;
  max_delay_seconds: number;
  pause_after_messages_min: number;
  pause_after_messages_max: number;
  pause_duration_min: number;
  pause_duration_max: number;
  messages_per_cycle_min: number;
  messages_per_cycle_max: number;
  duration_hours: number;
  duration_minutes: number;
  start_hour: string;
  end_hour: string;
  active_days: string[];
  daily_limit_per_group: number;
  daily_limit_total: number;
  total_messages_sent: number;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupInteractionLog {
  id: string;
  interaction_id: string;
  group_id: string;
  group_name: string;
  message_content: string;
  message_category: string;
  status: string;
  error_message: string | null;
  pause_applied_seconds: number;
  sent_at: string;
}

export function useGroupInteraction() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: interactions = [], isLoading } = useQuery({
    queryKey: ["group-interactions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("group_interactions" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as GroupInteraction[];
    },
    enabled: !!user,
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["group-interaction-logs", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("group_interaction_logs" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("sent_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as GroupInteractionLog[];
    },
    enabled: !!user,
    refetchInterval: 120_000,
  });

  const createInteraction = useMutation({
    mutationFn: async (data: Partial<GroupInteraction>) => {
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("group_interactions" as any)
        .insert({ ...data, user_id: user.id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-interactions"] });
      toast.success("Interação criada");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateInteraction = useMutation({
    mutationFn: async ({ id, ...data }: Partial<GroupInteraction> & { id: string }) => {
      const { error } = await supabase
        .from("group_interactions" as any)
        .update({ ...data, updated_at: new Date().toISOString() } as any)
        .eq("id", id) as any;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-interactions"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteInteraction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("group_interactions" as any)
        .delete()
        .eq("id", id) as any;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-interactions"] });
      toast.success("Interação removida");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const invokeAction = useMutation({
    mutationFn: async ({ interactionId, action }: { interactionId: string; action: string }) => {
      const { data, error } = await supabase.functions.invoke("group-interaction", {
        body: { interactionId, action },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["group-interactions"] });
      qc.invalidateQueries({ queryKey: ["group-interaction-logs"] });
      const labels: Record<string, string> = { start: "Iniciada", pause: "Pausada", stop: "Parada" };
      toast.success(`Automação ${labels[vars.action] || vars.action}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  return {
    interactions,
    isLoading,
    logs,
    logsLoading,
    createInteraction,
    updateInteraction,
    deleteInteraction,
    invokeAction,
  };
}
