import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface QuickReply {
  id: string;
  label: string;
  content: string;
  category: string;
  sort_order: number;
}

export const QUICK_REPLY_CATEGORIES = [
  { value: "geral", label: "Geral", color: "bg-muted text-muted-foreground border-border/50" },
  { value: "vendas", label: "Vendas", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  { value: "suporte", label: "Suporte", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { value: "financeiro", label: "Financeiro", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  { value: "boas-vindas", label: "Boas-vindas", color: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
];

/** Replace variable placeholders with actual values */
export function resolveVariables(
  content: string,
  vars: { nome?: string; telefone?: string }
): string {
  let result = content;
  if (vars.nome) result = result.replace(/\{nome\}/gi, vars.nome);
  if (vars.telefone) result = result.replace(/\{telefone\}/gi, vars.telefone);
  return result;
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
        .select("id, label, content, category, sort_order")
        .eq("user_id", user!.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as any[]).map((d) => ({
        ...d,
        category: d.category || "geral",
      })) as QuickReply[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (r: { id?: string; label: string; content: string; category?: string; sort_order?: number }) => {
      if (r.id) {
        const { error } = await supabase
          .from("quick_replies")
          .update({ label: r.label, content: r.content, category: r.category || "geral" } as any)
          .eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("quick_replies").insert({
          user_id: user!.id,
          label: r.label,
          content: r.content,
          category: r.category || "geral",
          sort_order: r.sort_order ?? replies.length,
        } as any);
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
