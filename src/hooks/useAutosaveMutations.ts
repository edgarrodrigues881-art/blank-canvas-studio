import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function useAutosaveMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const createContact = useMutation({
    mutationFn: async (params: { contact_name: string; phone_e164: string; tags?: string }) => {
      const { data, error } = await supabase
        .from("warmup_autosave_contacts" as any)
        .insert({ ...params, contact_status: "new", user_id: user!.id })
        .select("id, phone_e164, contact_name, is_active, tags, created_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warmup_autosave_contacts"] }),
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; contact_name?: string; tags?: string; is_active?: boolean }) => {
      const { error } = await supabase
        .from("warmup_autosave_contacts" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warmup_autosave_contacts"] }),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("warmup_autosave_contacts" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warmup_autosave_contacts"] }),
  });

  const bulkCreate = useMutation({
    mutationFn: async (contacts: { contact_name: string; phone_e164: string; tags?: string }[]) => {
      const rows = contacts.map(c => ({ ...c, user_id: user!.id }));
      // Insert in batches of 50
      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase
          .from("warmup_autosave_contacts" as any)
          .insert(batch);
        if (error) throw error;
      }

      // Log the import
      await supabase.from("warmup_audit_logs" as any).insert({
        user_id: user!.id,
        device_id: "00000000-0000-0000-0000-000000000000", // system-level
        level: "info",
        event_type: "autosave_imported",
        message: `Importados ${contacts.length} contatos Auto Save`,
        meta: { count: contacts.length },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warmup_autosave_contacts"] }),
  });

  return { createContact, updateContact, deleteContact, bulkCreate };
}
