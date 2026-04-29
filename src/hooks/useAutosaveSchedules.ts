import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface AutosaveSchedule {
  id: string;
  user_id: string;
  name: string;
  device_ids: string[];
  weekdays: number[];
  time_of_day: string;
  min_delay_seconds: number;
  max_delay_seconds: number;
  between_contacts_min_seconds: number;
  between_contacts_max_seconds: number;
  pause_every_min: number;
  pause_every_max: number;
  pause_duration_min: number;
  pause_duration_max: number;
  messages_per_instance: number;
  initial_limit_per_instance: number;
  daily_increment: number;
  max_limit_per_instance: number;
  days_executed: number;
  status: "scheduled" | "running" | "completed" | "paused" | "failed";
  total_sent: number;
  total_failed: number;
  started_at: string | null;
  completed_at: string | null;
  last_run_date: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutosaveScheduleLog {
  id: string;
  schedule_id: string;
  device_id: string;
  device_name: string | null;
  contact_phone: string;
  contact_name: string | null;
  message_content: string;
  status: string;
  error_message: string | null;
  sent_at: string;
}

export function useAutosaveSchedules() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["autosave_schedules", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("autosave_schedules" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        weekdays: Array.isArray(r.weekdays) ? r.weekdays : [],
        device_ids: Array.isArray(r.device_ids) ? r.device_ids : [],
      })) as unknown as AutosaveSchedule[];
    },
    enabled: !!user,
    refetchInterval: 5_000,
  });
}

export function useAutosaveScheduleLogs(scheduleId: string | null) {
  return useQuery({
    queryKey: ["autosave_schedule_logs", scheduleId],
    queryFn: async () => {
      if (!scheduleId) return [];
      const { data, error } = await supabase
        .from("autosave_schedule_logs" as any)
        .select("*")
        .eq("schedule_id", scheduleId)
        .order("sent_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as AutosaveScheduleLog[];
    },
    enabled: !!scheduleId,
    refetchInterval: 4_000,
  });
}

export function useCreateAutosaveSchedule() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      device_ids: string[];
      weekdays: number[];
      time_of_day: string;
      min_delay_seconds: number;
      max_delay_seconds: number;
      between_contacts_min_seconds: number;
      between_contacts_max_seconds: number;
      pause_every_min: number;
      pause_every_max: number;
      pause_duration_min: number;
      pause_duration_max: number;
      messages_per_instance: number;
      initial_limit_per_instance: number;
      daily_increment: number;
      max_limit_per_instance: number;
    }) => {
      const { data, error } = await supabase
        .from("autosave_schedules" as any)
        .insert({ ...input, user_id: user!.id, status: "scheduled" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autosave_schedules"] }),
  });
}

export function useUpdateAutosaveSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      name: string;
      device_ids: string[];
      weekdays: number[];
      time_of_day: string;
      min_delay_seconds: number;
      max_delay_seconds: number;
      between_contacts_min_seconds: number;
      between_contacts_max_seconds: number;
      pause_every_min: number;
      pause_every_max: number;
      pause_duration_min: number;
      pause_duration_max: number;
      messages_per_instance: number;
      initial_limit_per_instance: number;
      daily_increment: number;
      max_limit_per_instance: number;
    }) => {
      const { data, error } = await supabase
        .from("autosave_schedules" as any)
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autosave_schedules"] }),
  });
}

export function useDeleteAutosaveSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("autosave_schedules" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autosave_schedules"] }),
  });
}

export function useTriggerAutosaveSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "start" | "pause" | "resume" | "stop" }) => {
      const { data, error } = await supabase.functions.invoke("autosave-schedule", {
        body: { schedule_id: id, action },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autosave_schedules"] }),
  });
}
