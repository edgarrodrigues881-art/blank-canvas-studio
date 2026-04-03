import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  tags: string[];
  notes: string | null;
  var1: string;
  var2: string;
  var3: string;
  var4: string;
  var5: string;
  var6: string;
  var7: string;
  var8: string;
  var9: string;
  var10: string;
  created_at: string;
  updated_at: string;
}

export function useContacts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["contacts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, phone, email, tags, notes, var1, var2, var3, var4, var5, var6, var7, var8, var9, var10, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Contact[];
    },
    enabled: !!user,
    staleTime: 120_000,
  });
}

export function useBulkUpdateContacts() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (updates: { id: string; tags: string[] }[]) => {
      // Batch updates in chunks of 50 to avoid overwhelming the API
      const BATCH = 50;
      for (let i = 0; i < updates.length; i += BATCH) {
        const chunk = updates.slice(i, i + BATCH);
        await Promise.all(
          chunk.map(({ id, tags }) =>
            supabase.from("contacts").update({ tags }).eq("id", id)
          )
        );
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (contact: { name: string; phone: string; email?: string; tags?: string[]; notes?: string; var1?: string; var2?: string; var3?: string; var4?: string; var5?: string; var6?: string; var7?: string; var8?: string; var9?: string; var10?: string }) => {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ var1: "", var2: "", var3: "", var4: "", var5: "", var6: "", var7: "", var8: "", var9: "", var10: "", ...contact, user_id: user!.id, tags: contact.tags || [] })
        .select("id, name, phone, email, tags, notes, var1, var2, var3, var4, var5, var6, var7, var8, var9, var10, created_at, updated_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (newContact) => {
      queryClient.setQueryData(["contacts", user!.id], (old: Contact[] | undefined) =>
        old ? [newContact as Contact, ...old] : [newContact as Contact]
      );
    },
  });
}

export function useCreateContacts() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (contacts: { name: string; phone: string; tags?: string[]; [key: string]: any }[]) => {
      const rows = contacts.map(c => ({ var1: "", var2: "", var3: "", var4: "", var5: "", var6: "", var7: "", var8: "", var9: "", var10: "", ...c, user_id: user!.id, tags: c.tags || [] }));
      const BATCH = 500;
      const results: any[] = [];
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const { data, error } = await supabase.from("contacts").insert(chunk).select("id");
        if (error) throw error;
        if (data) results.push(...data);
      }
      return results;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contact> & { id: string }) => {
      const { data, error } = await supabase
        .from("contacts")
        .update(updates)
        .eq("id", id)
        .select("id, name, phone, email, tags, notes, var1, var2, var3, var4, var5, var6, var7, var8, var9, var10, created_at, updated_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useDeleteContacts() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      // Delete in batches of 500 to avoid query size limits
      const BATCH = 500;
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const { error } = await supabase.from("contacts").delete().in("id", chunk);
        if (error) throw error;
      }
      return ids;
    },
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: ["contacts"] });
      const previous = queryClient.getQueryData(["contacts", user?.id]);
      const idSet = new Set(ids);
      queryClient.setQueryData(["contacts", user?.id], (old: Contact[] | undefined) =>
        old ? old.filter(c => !idSet.has(c.id)) : old
      );
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(["contacts", user?.id], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });
}
