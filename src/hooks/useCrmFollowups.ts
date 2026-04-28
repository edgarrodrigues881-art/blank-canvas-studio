import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface CrmFollowup {
  id: string;
  user_id: string;
  contact_id: string | null;
  contact_phone: string;
  contact_name: string | null;
  device_id: string | null;
  trigger_type: "manual" | "no_response" | "sequence";
  mode: "manual" | "auto" | "ai_hybrid";
  message: string | null;
  ai_prompt: string | null;
  media_url: string | null;
  media_type: string | null;
  scheduled_at: string;
  cancel_on_reply: boolean;
  sequence_id: string | null;
  sequence_step: number | null;
  status: "pending" | "processing" | "sent" | "cancelled" | "failed" | "done_manually";
  sent_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  error_message: string | null;
  attempt_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmFollowupSequence {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  steps: Array<{
    delay_hours: number;
    message: string;
    mode: "auto" | "manual" | "ai_hybrid";
    ai_prompt?: string;
  }>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useCrmFollowups(filters?: { status?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["crm-followups", user?.id, filters?.status],
    queryFn: async () => {
      if (!user) return [] as CrmFollowup[];
      let q = supabase
        .from("crm_followups")
        .select("*")
        .eq("user_id", user.id)
        .order("scheduled_at", { ascending: true });
      if (filters?.status) q = q.eq("status", filters.status);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data || []) as CrmFollowup[];
    },
    enabled: !!user,
    staleTime: 15_000,
  });

  const create = useMutation({
    mutationFn: async (payload: Partial<CrmFollowup>) => {
      if (!user) throw new Error("not authenticated");
      const { data, error } = await supabase
        .from("crm_followups")
        .insert({ ...payload, user_id: user.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-followups"] });
      toast.success("Follow-up agendado");
    },
    onError: (e: any) => toast.error("Erro ao agendar: " + (e?.message || "")),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmFollowup> & { id: string }) => {
      const { error } = await supabase.from("crm_followups").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-followups"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_followups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-followups"] });
      toast.success("Removido");
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("crm_followups")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_reason: "Cancelado pelo usuário" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-followups"] });
      toast.success("Follow-up cancelado");
    },
  });

  const markDone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("crm_followups")
        .update({ status: "done_manually", sent_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-followups"] });
      toast.success("Marcado como feito");
    },
  });

  return { ...list, create, update, remove, cancel, markDone };
}

export function useCrmFollowupSequences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["crm-followup-sequences", user?.id],
    queryFn: async () => {
      if (!user) return [] as CrmFollowupSequence[];
      const { data, error } = await supabase
        .from("crm_followup_sequences")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CrmFollowupSequence[];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async (payload: Partial<CrmFollowupSequence>) => {
      if (!user) throw new Error("not authenticated");
      const { data, error } = await supabase
        .from("crm_followup_sequences")
        .insert({ ...payload, user_id: user.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-followup-sequences"] });
      toast.success("Sequência criada");
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmFollowupSequence> & { id: string }) => {
      const { error } = await supabase.from("crm_followup_sequences").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-followup-sequences"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_followup_sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-followup-sequences"] }),
  });

  return { ...list, create, update, remove };
}
