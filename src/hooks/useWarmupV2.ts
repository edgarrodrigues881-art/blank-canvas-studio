import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// ── Types ──
export interface WarmupCycle {
  id: string;
  user_id: string;
  device_id: string;
  plan_id: string | null;
  chip_state: "new" | "recovered" | "unstable";
  days_total: number;
  started_at: string;
  day_index: number;
  phase: "pre_24h" | "groups_only" | "autosave_enabled" | "community_enabled" | "completed" | "paused" | "error";
  is_running: boolean;
  first_24h_ends_at: string;
  daily_interaction_budget_min: number;
  daily_interaction_budget_max: number;
  daily_interaction_budget_target: number;
  daily_interaction_budget_used: number;
  daily_unique_recipients_cap: number;
  daily_unique_recipients_used: number;
  last_daily_reset_at: string;
  next_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarmupAuditLog {
  id: string;
  user_id: string;
  device_id: string;
  cycle_id: string | null;
  level: "info" | "warn" | "error";
  event_type: string;
  message: string;
  meta: Record<string, any>;
  created_at: string;
}

export interface WarmupInstanceGroup {
  id: string;
  user_id: string;
  device_id: string;
  group_id: string;
  cycle_id: string | null;
  join_status: "pending" | "joined" | "failed" | "left";
  joined_at: string | null;
  last_error: string | null;
  created_at: string;
  group_jid?: string | null;
  warmup_groups_pool?: { name: string; external_group_ref?: string | null } | null;
}

export interface WarmupPlan {
  id: string;
  name: string;
  days_total: number;
  is_active: boolean;
  created_at: string;
}

export interface WarmupAutosaveContact {
  id: string;
  user_id: string;
  contact_name: string;
  phone_e164: string;
  tags: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  use_count: number;
  contact_status: string;
}

export interface WarmupCommunityMembership {
  id: string;
  user_id: string;
  device_id: string;
  cycle_id: string | null;
  is_enabled: boolean;
  enabled_at: string | null;
  disabled_at: string | null;
}

// ── Plans ──
export function useWarmupPlans() {
  return useQuery({
    queryKey: ["warmup_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_plans" as any)
        .select("id, name, days_total, is_active, created_at")
        .eq("is_active", true)
        .order("days_total", { ascending: true });
      if (error) throw error;
      return data as unknown as WarmupPlan[];
    },
  });
}

// ── Cycles ──
export function useWarmupCycles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["warmup_cycles", user?.id],
    queryFn: async () => {
      // Paginated fetch for 10k+ scale — only fetch active cycles (not completed/error)
      let all: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("warmup_cycles" as any)
          .select("id, user_id, device_id, plan_id, chip_state, days_total, started_at, day_index, phase, is_running, first_24h_ends_at, daily_interaction_budget_min, daily_interaction_budget_max, daily_interaction_budget_target, daily_interaction_budget_used, daily_unique_recipients_cap, daily_unique_recipients_used, last_daily_reset_at, next_run_at, last_error, created_at, updated_at")
          .not("phase", "in", '("completed","error")')
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all as unknown as WarmupCycle[];
    },
    enabled: !!user,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}

export function useDeviceCycle(deviceId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["warmup_cycle_device", deviceId],
    queryFn: async () => {
      // First try to get an active (non-completed) cycle
      const { data: activeCycles, error: activeErr } = await supabase
        .from("warmup_cycles" as any)
        .select("id, user_id, device_id, plan_id, chip_state, days_total, started_at, day_index, phase, is_running, first_24h_ends_at, daily_interaction_budget_min, daily_interaction_budget_max, daily_interaction_budget_target, daily_interaction_budget_used, daily_unique_recipients_cap, daily_unique_recipients_used, last_daily_reset_at, next_run_at, last_error, created_at, updated_at")
        .eq("device_id", deviceId)
        .neq("phase", "completed")
        .order("created_at", { ascending: false })
        .limit(1);
      if (activeErr) throw activeErr;
      if ((activeCycles as any[])?.length > 0) {
        return (activeCycles as unknown as WarmupCycle[])[0];
      }
      // No active cycle — return null (completed cycles are deleted on stop)
      return null;
    },
    enabled: !!user && !!deviceId,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}

export function useCreateCycle() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (params: {
      device_id: string;
      chip_state: "new" | "recovered" | "unstable";
      days_total: number;
      plan_id?: string;
    }) => {
      const budgetTarget = 20 + Math.floor(Math.random() * 11); // 20-30
      const { data, error } = await supabase
        .from("warmup_cycles" as any)
        .insert({
          user_id: user!.id,
          device_id: params.device_id,
          chip_state: params.chip_state,
          days_total: params.days_total,
          plan_id: params.plan_id || null,
          daily_interaction_budget_target: budgetTarget,
          first_24h_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id, user_id, device_id, chip_state, days_total, plan_id, phase, is_running, day_index, started_at, first_24h_ends_at, daily_interaction_budget_min, daily_interaction_budget_max, daily_interaction_budget_target, daily_interaction_budget_used, daily_unique_recipients_cap, daily_unique_recipients_used, next_run_at, last_error, created_at, updated_at")
        .single();
      if (error) throw error;
      return data as unknown as WarmupCycle;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warmup_cycles"] });
      qc.invalidateQueries({ queryKey: ["warmup_cycle_device"] });
    },
  });
}

export function useUpdateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<WarmupCycle>) => {
      const { error } = await supabase
        .from("warmup_cycles" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warmup_cycles"] });
      qc.invalidateQueries({ queryKey: ["warmup_cycle_device"] });
    },
  });
}

// ── Instance Groups ──
export function useInstanceGroups(deviceId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["warmup_instance_groups", deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_instance_groups" as any)
        .select("id, user_id, device_id, group_id, cycle_id, join_status, joined_at, last_error, created_at, group_jid, warmup_groups_pool(name, external_group_ref)")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as WarmupInstanceGroup[];
    },
    enabled: !!user && !!deviceId,
    refetchInterval: 120_000,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

// ── Autosave Contacts ──
export function useAutosaveContacts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["warmup_autosave_contacts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_autosave_contacts" as any)
        .select("id, contact_name, phone_e164, tags, is_active, created_at, last_used_at, use_count, contact_status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as WarmupAutosaveContact[];
    },
    enabled: !!user,
  });
}

// ── Community Membership ──
export function useCommunityMembership(deviceId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["warmup_community", deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_community_membership" as any)
        .select("id, user_id, device_id, cycle_id, is_enabled, enabled_at, disabled_at")
        .eq("device_id", deviceId)
        .limit(1);
      if (error) throw error;
      return (data as unknown as WarmupCommunityMembership[])?.[0] || null;
    },
    enabled: !!user && !!deviceId,
  });
}

// ── Toggle Community ──
export function useToggleCommunity() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ deviceId, cycleId, enable }: { deviceId: string; cycleId: string | null; enable: boolean }) => {
      // Upsert membership
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from("warmup_community_membership" as any)
        .select("id")
        .eq("device_id", deviceId)
        .limit(1);

      if ((existing as any[])?.length) {
        await supabase
          .from("warmup_community_membership" as any)
          .update({
            is_enabled: enable,
            cycle_id: cycleId,
            ...(enable ? { enabled_at: now } : { disabled_at: now }),
          })
          .eq("id", (existing as any[])[0].id);
      } else {
        await supabase
          .from("warmup_community_membership" as any)
          .insert({
            user_id: user!.id,
            device_id: deviceId,
            cycle_id: cycleId,
            is_enabled: enable,
            ...(enable ? { enabled_at: now } : {}),
          });
      }

      // Audit log
      await supabase.from("warmup_audit_logs" as any).insert({
        user_id: user!.id,
        device_id: deviceId,
        cycle_id: cycleId,
        event_type: enable ? "community_enabled" : "community_disabled",
        level: "info",
        message: enable ? "Comunidade habilitada pelo usuário" : "Comunidade desabilitada pelo usuário",
        meta: { toggled_at: now },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warmup_community"] });
      qc.invalidateQueries({ queryKey: ["warmup_audit_logs"] });
    },
  });
}

// ── Toggle Autosave ──
export function useToggleAutosave() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ deviceId, cycleId, enable }: { deviceId: string; cycleId: string | null; enable: boolean }) => {
      const now = new Date().toISOString();
      // Update cycle phase based on toggle
      if (cycleId) {
        const newPhase = enable ? "autosave_enabled" : "groups_only";
        await supabase
          .from("warmup_cycles")
          .update({ phase: newPhase, updated_at: now })
          .eq("id", cycleId);
      }
      // Audit log
      await supabase.from("warmup_audit_logs" as any).insert({
        user_id: user!.id,
        device_id: deviceId,
        cycle_id: cycleId,
        event_type: enable ? "autosave_enabled" : "autosave_disabled",
        level: "info",
        message: enable ? "Auto Save habilitado pelo usuário" : "Auto Save desabilitado pelo usuário",
        meta: { toggled_at: now },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warmup_cycle"] });
      qc.invalidateQueries({ queryKey: ["warmup_audit_logs"] });
    },
  });
}


// ── Audit Logs ──
export function useWarmupAuditLogs(cycleId?: string, limit = 200) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["warmup_audit_logs", cycleId, limit],
    queryFn: async () => {
      let query = supabase
        .from("warmup_audit_logs" as any)
        .select("id, device_id, cycle_id, level, event_type, message, meta, created_at")
        .order("created_at", { ascending: true })
        .limit(limit);
      if (cycleId) query = query.eq("cycle_id", cycleId);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as WarmupAuditLog[];
    },
    enabled: !!user,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}
