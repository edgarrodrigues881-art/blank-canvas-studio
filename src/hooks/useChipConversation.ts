import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ChipConversation {
  id: string;
  user_id: string;
  name: string;
  status: string;
  device_ids: string[];
  min_delay_seconds: number;
  max_delay_seconds: number;
  pause_after_messages_min: number;
  pause_after_messages_max: number;
  pause_duration_min: number;
  pause_duration_max: number;
  duration_hours: number;
  duration_minutes: number;
  start_hour: string;
  end_hour: string;
  messages_per_cycle_min: number;
  messages_per_cycle_max: number;
  active_days: string[];
  started_at: string | null;
  completed_at: string | null;
  total_messages_sent: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChipConversationLog {
  id: string;
  conversation_id: string;
  sender_device_id: string;
  receiver_device_id: string;
  sender_name: string | null;
  receiver_name: string | null;
  message_content: string;
  message_category: string;
  status: string;
  error_message: string | null;
  sent_at: string;
}

export function useChipConversations() {
  return useQuery({
    queryKey: ["chip_conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chip_conversations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ChipConversation[];
    },
  });
}

export function useChipConversationLogs(conversationId: string | null) {
  return useQuery({
    queryKey: ["chip_conversation_logs", conversationId],
    enabled: !!conversationId,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chip_conversation_logs")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("sent_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as ChipConversationLog[];
    },
  });
}

export function useChipConversationActions() {
  const qc = useQueryClient();

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("chip-conversation", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const create = useMutation({
    mutationFn: (params: Partial<ChipConversation>) => invoke({ action: "create", ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chip_conversations"] }),
  });

  const update = useMutation({
    mutationFn: (params: { conversation_id: string } & Partial<ChipConversation>) =>
      invoke({ action: "update", ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chip_conversations"] }),
  });

  const start = useMutation({
    mutationFn: (id: string) => invoke({ action: "start", conversation_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chip_conversations"] }),
  });

  const pause = useMutation({
    mutationFn: (id: string) => invoke({ action: "pause", conversation_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chip_conversations"] }),
  });

  const resume = useMutation({
    mutationFn: (id: string) => invoke({ action: "resume", conversation_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chip_conversations"] }),
  });

  const stop = useMutation({
    mutationFn: (id: string) => invoke({ action: "stop", conversation_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chip_conversations"] }),
  });

  return { create, update, start, pause, resume, stop };
}
