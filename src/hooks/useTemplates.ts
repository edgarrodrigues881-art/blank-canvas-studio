import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface Template {
  id: string;
  name: string;
  content: string;
  type: string;
  media_url: string | null;
  buttons: any[];
  created_at: string;
  updated_at: string;
}

export function useTemplates() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["templates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("id, name, content, type, media_url, buttons, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Template[];
    },
    enabled: !!user,
    staleTime: 120_000,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (template: { name: string; content: string; type: string; media_url?: string; buttons?: any[] }) => {
      const { data, error } = await supabase
        .from("templates")
        .insert({ ...template, user_id: user!.id, buttons: template.buttons || [] })
        .select("id, name, content, type, media_url, buttons, created_at, updated_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Template> & { id: string }) => {
      const { data, error } = await supabase
        .from("templates")
        .update(updates)
        .eq("id", id)
        .select("id, name, content, type, media_url, buttons, created_at, updated_at")
        .single();
      if (error) throw error;

      // Sync all autoreply flows that reference this template
      try {
        const { data: flows } = await supabase
          .from("autoreply_flows")
          .select("id, nodes");

        if (flows) {
          for (const flow of flows) {
            const nodes = flow.nodes as any[];
            let changed = false;

            const updatedNodes = nodes.map((node: any) => {
              if (node.data?.templateId === id) {
                changed = true;
                return {
                  ...node,
                  data: {
                    ...node.data,
                    text: data.content,
                    imageUrl: data.media_url || "",
                    label: node.type === "startNode" ? data.name : node.data.label,
                    templateName: data.name,
                    buttons: (Array.isArray(data.buttons) ? data.buttons : []).map((btn: any, i: number) => ({
                      id: node.data.buttons?.[i]?.id || `btn-sync-${Date.now()}-${i}`,
                      label: typeof btn === "string" ? btn : btn.label || btn.text || btn.title || `Botão ${i + 1}`,
                      targetNodeId: node.data.buttons?.[i]?.targetNodeId || "",
                    })),
                  },
                };
              }
              return node;
            });

            if (changed) {
              await supabase
                .from("autoreply_flows")
                .update({ nodes: updatedNodes })
                .eq("id", flow.id);
            }
          }
        }
      } catch (syncErr) {
        console.warn("Template sync to flows failed:", syncErr);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["autoreply_flows"] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}
