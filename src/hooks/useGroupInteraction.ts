import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useEffect } from "react";

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
  start_hour_2?: string | null;
  end_hour_2?: string | null;
  active_days: string[];
  daily_limit_per_group: number;
  daily_limit_total: number;
  next_action_at?: string | null;
  content_types?: {
    text: boolean;
    image: boolean;
    audio: boolean;
    sticker: boolean;
  } | null;
  preset_name?: string | null;
  total_messages_sent: number;
  today_count: number;
  last_sent_at: string | null;
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

export function useGroupInteraction(selectedInteractionId: string | null = null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const normalizeOptionalTime = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const normalizeInteractionPayload = (data: Partial<GroupInteraction>) => {
    const cycleMin = Number(data.messages_per_cycle_min);
    const cycleMax = Number(data.messages_per_cycle_max);

    const safeCycleMin = Number.isFinite(cycleMin) && cycleMin > 0 ? Math.floor(cycleMin) : 1;
    const safeCycleMax = Number.isFinite(cycleMax) && cycleMax > 0 ? Math.max(Math.floor(cycleMax), safeCycleMin) : safeCycleMin;

    return {
      ...data,
      messages_per_cycle_min: safeCycleMin,
      messages_per_cycle_max: safeCycleMax,
    };
  };

  const { data: interactions = [], isLoading } = useQuery({
    queryKey: ["group-interactions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("group_interactions" as any)
        .select("id, user_id, name, status, group_ids, device_id, min_delay_seconds, max_delay_seconds, pause_after_messages_min, pause_after_messages_max, pause_duration_min, pause_duration_max, messages_per_cycle_min, messages_per_cycle_max, duration_hours, duration_minutes, start_hour, end_hour, start_hour_2, end_hour_2, active_days, daily_limit_per_group, daily_limit_total, content_types, preset_name, next_action_at, total_messages_sent, today_count, last_sent_at, started_at, completed_at, last_error, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as GroupInteraction[];
    },
    enabled: !!user,
    staleTime: 15_000,
    refetchInterval: () => document.hidden ? false : 30_000,
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("gi-realtime")
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "group_interactions", filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["group-interactions"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["group-interaction-logs", user?.id, selectedInteractionId],
    queryFn: async () => {
      if (!user) return [];
      let query: any = supabase
        .from("group_interaction_logs" as any)
        .select("id, interaction_id, group_id, group_name, message_content, message_category, status, error_message, pause_applied_seconds, sent_at")
        .eq("user_id", user.id);

      if (selectedInteractionId) {
        query = query.eq("interaction_id", selectedInteractionId);
      }

      const { data, error } = await query
        .order("sent_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data || []) as unknown as GroupInteractionLog[];
    },
    enabled: !!user,
    staleTime: 5_000,
    refetchInterval: () => document.hidden ? false : 5_000,
  });

  const createInteraction = useMutation({
    mutationFn: async (data: Partial<GroupInteraction> & { _silent?: boolean }) => {
      if (!user) throw new Error("Não autenticado");
      const { _silent, ...rest } = data;
      const payload = {
        ...normalizeInteractionPayload(rest),
        start_hour_2: normalizeOptionalTime((rest as any).start_hour_2),
        end_hour_2: normalizeOptionalTime((rest as any).end_hour_2),
        user_id: user.id,
        status: "idle",
        content_types: { text: true, image: true, audio: true, sticker: true },
      };
      const { data: inserted, error } = await (supabase
        .from("group_interactions" as any)
        .insert(payload as any)
        .select("id")
        .single() as any);
      if (error) throw error;
      return { id: (inserted as any).id, _silent } as { id: string; _silent?: boolean };
    },
    onSuccess: async (inserted) => {
      qc.invalidateQueries({ queryKey: ["group-interactions"] });
      if (!inserted?._silent) toast.success("Interação criada");
      if (inserted?.id) {
        try {
          await supabase.functions.invoke("group-interaction", {
            body: { interactionId: inserted.id, action: "start" },
          });
          qc.invalidateQueries({ queryKey: ["group-interactions"] });
          if (!inserted._silent) toast.success("Automação iniciada automaticamente");
        } catch { /* silent - user can start manually */ }
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateInteraction = useMutation({
    mutationFn: async ({ id, ...data }: Partial<GroupInteraction> & { id: string }) => {
      const normalized = normalizeInteractionPayload(data);
      const payload: Record<string, any> = {
        ...normalized,
        start_hour_2: normalizeOptionalTime((normalized as any).start_hour_2 ?? (data as any).start_hour_2),
        end_hour_2: normalizeOptionalTime((normalized as any).end_hour_2 ?? (data as any).end_hour_2),
        updated_at: new Date().toISOString(),
      };
      // Fix status: never send null, and normalize "active" → "idle"
      if (data.status != null) {
        payload.status = data.status === "active" ? "idle" : data.status;
      } else {
        delete payload.status; // don't touch status if not provided
      }
      // Auto-correct delay: min should never exceed max
      if (payload.min_delay_seconds != null && payload.max_delay_seconds != null) {
        const minD = Number(payload.min_delay_seconds);
        const maxD = Number(payload.max_delay_seconds);
        if (minD > maxD) {
          payload.max_delay_seconds = minD;
        }
      }
      // Remove undefined keys (Supabase ignores them but be safe)
      for (const k of Object.keys(payload)) {
        if (payload[k] === undefined) delete payload[k];
      }
      const { error } = await supabase
        .from("group_interactions" as any)
        .update(payload as any)
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
      if (data?.error) throw new Error(data.error);
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
