import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface CrmTemplate {
  id: string;
  name: string;
  content: string;
  message_type: string;
  media_url: string | null;
  buttons: any[];
  variables: any[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useCrmTemplates() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["crm_templates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_templates")
        .select("id, name, content, message_type, media_url, buttons, variables, is_active, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CrmTemplate[];
    },
    enabled: !!user,
    staleTime: 120_000,
  });
}

export function useCreateCrmTemplate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (template: { name: string; content: string; message_type: string; media_url?: string; buttons?: any[] }) => {
      const { data, error } = await supabase
        .from("crm_templates")
        .insert({ ...template, user_id: user!.id, buttons: template.buttons || [] })
        .select("id, name, content, message_type, media_url, buttons, variables, is_active, created_at, updated_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm_templates"] }),
  });
}

export function useUpdateCrmTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CrmTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from("crm_templates")
        .update(updates)
        .eq("id", id)
        .select("id, name, content, message_type, media_url, buttons, variables, is_active, created_at, updated_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm_templates"] }),
  });
}

export function useDeleteCrmTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm_templates"] }),
  });
}
