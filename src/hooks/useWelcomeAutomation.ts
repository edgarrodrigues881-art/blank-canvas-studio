import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface WelcomeAutomation {
  id: string;
  user_id: string;
  name: string;
  status: string;
  monitoring_device_id: string | null;
  message_type: string;
  message_content: string | null;
  buttons: any[];
  carousel_cards: any[];
  message_templates: any[];
  min_delay_seconds: number;
  max_delay_seconds: number;
  delay_between_accounts_seconds: number;
  pause_every_min: number;
  pause_every_max: number;
  pause_duration_min: number;
  pause_duration_max: number;
  max_per_account: number;
  max_retries: number;
  dedupe_rule: string;
  dedupe_window_days: number;
  send_start_hour: string;
  send_end_hour: string;
  active_days: number[];
  created_at: string;
  updated_at: string;
}

export interface WelcomeQueueItem {
  id: string;
  automation_id: string;
  participant_phone: string;
  participant_name: string | null;
  group_id: string;
  group_name: string | null;
  sender_device_id: string | null;
  status: string;
  attempts: number;
  detected_at: string;
  queued_at: string;
  processed_at: string | null;
  error_reason: string | null;
  message_used: string | null;
  dedupe_hash: string;
}

export function useWelcomeAutomations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["welcome-automations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("welcome_automations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WelcomeAutomation[];
    },
    enabled: !!user,
    refetchInterval: () => document.hidden ? false : 30_000,
  });
}

export function useWelcomeAutomation(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["welcome-automation", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("welcome_automations")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as WelcomeAutomation;
    },
    enabled: !!user && !!id,
    refetchInterval: 5_000,
  });
}

export function useWelcomeQueue(automationId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["welcome-queue", automationId],
    queryFn: async () => {
      if (!automationId) return [];
      const { data, error } = await supabase
        .from("welcome_queue")
        .select("*")
        .eq("automation_id", automationId)
        .order("detected_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as WelcomeQueueItem[];
    },
    enabled: !!user && !!automationId,
    refetchInterval: 5_000,
  });
}

export function useWelcomeQueueStats(automationId: string | undefined) {
  const { data: queue } = useWelcomeQueue(automationId);
  const stats = {
    total: 0,
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    ignored: 0,
    duplicate_blocked: 0,
  };
  if (queue) {
    stats.total = queue.length;
    for (const item of queue) {
      if (item.status === "pending" || item.status === "aguardando_pausa" || item.status === "aguardando_janela") stats.pending++;
      else if (item.status === "processing") stats.processing++;
      else if (item.status === "sent") stats.sent++;
      else if (item.status === "failed") stats.failed++;
      else if (item.status === "ignored") stats.ignored++;
      else if (item.status === "duplicate_blocked") stats.duplicate_blocked++;
    }
  }
  return stats;
}

export function useWelcomeGroups(automationId: string | undefined) {
  return useQuery({
    queryKey: ["welcome-groups", automationId],
    queryFn: async () => {
      if (!automationId) return [];
      const { data, error } = await supabase
        .from("welcome_automation_groups")
        .select("*")
        .eq("automation_id", automationId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!automationId,
  });
}

export function useWelcomeSenders(automationId: string | undefined) {
  return useQuery({
    queryKey: ["welcome-senders", automationId],
    queryFn: async () => {
      if (!automationId) return [];
      const { data, error } = await supabase
        .from("welcome_automation_senders")
        .select("*")
        .eq("automation_id", automationId)
        .order("priority_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!automationId,
  });
}

export function useCreateWelcomeAutomation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      monitoring_device_id: string;
      message_content: string;
      group_ids: { group_id: string; group_name: string }[];
      sender_device_ids: string[];
      settings?: Partial<WelcomeAutomation>;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data: automation, error } = await supabase
        .from("welcome_automations")
        .insert({
          user_id: user.id,
          name: input.name,
          monitoring_device_id: input.monitoring_device_id,
          message_content: input.message_content,
          ...(input.settings || {}),
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Insert groups
      if (input.group_ids.length > 0) {
        const { error: gErr } = await supabase
          .from("welcome_automation_groups")
          .insert(input.group_ids.map(g => ({
            automation_id: automation.id,
            group_id: g.group_id,
            group_name: g.group_name,
          })) as any);
        if (gErr) throw gErr;
      }

      // Insert senders
      if (input.sender_device_ids.length > 0) {
        const { error: sErr } = await supabase
          .from("welcome_automation_senders")
          .insert(input.sender_device_ids.map((did, i) => ({
            automation_id: automation.id,
            device_id: did,
            priority_order: i,
          })) as any);
        if (sErr) throw sErr;
      }

      return automation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["welcome-automations"] });
      toast.success("Automação criada com sucesso!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao criar automação");
    },
  });
}

export function useUpdateWelcomeAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<WelcomeAutomation>) => {
      const { error } = await supabase
        .from("welcome_automations")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["welcome-automations"] });
      qc.invalidateQueries({ queryKey: ["welcome-automation"] });
    },
  });
}

export function useDeleteWelcomeAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("welcome_automations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["welcome-automations"] });
      toast.success("Automação excluída!");
    },
  });
}

export function useUpdateQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("welcome_queue")
        .update({ status } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["welcome-queue"] });
    },
  });
}
