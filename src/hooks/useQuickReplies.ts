import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface QuickReply {
  id: string;
  label: string;
  content: string;
  sort_order: number;
}

export function useQuickReplies() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["quick_replies", user?.id];

  const { data: replies = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_replies")
        .select("id, label, content, sort_order")
        .eq("user_id", user!.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as QuickReply[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (r: { id?: string; label: string; content: string; sort_order?: number }) => {
      if (r.id) {
        const { error } = await supabase
          .from("quick_replies")
          .update({ label: r.label, content: r.content })
          .eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("quick_replies").insert({
          user_id: user!.id,
          label: r.label,
          content: r.content,
          sort_order: r.sort_order ?? replies.length,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { replies, isLoading, upsert, remove };
}
