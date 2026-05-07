import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface CarouselTemplate {
  id: string;
  name: string;
  message: string;
  cards: any[];
  source?: string;
  created_at: string;
  updated_at: string;
}

export type CarouselSource = "main" | "group";

export function useCarouselTemplates(source: CarouselSource = "main") {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["carousel_templates", user?.id, source],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carousel_templates")
        .select("id, name, message, cards, source, created_at, updated_at")
        .eq("source", source)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CarouselTemplate[];
    },
    enabled: !!user,
    staleTime: 120_000,
  });
}

export function useCreateCarouselTemplate(source: CarouselSource = "main") {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (t: { name: string; message: string; cards: any[] }) => {
      const { data, error } = await supabase
        .from("carousel_templates")
        .insert({ ...t, user_id: user!.id, source })
        .select("id, name, message, cards, source, created_at, updated_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carousel_templates"] }),
  });
}

export function useUpdateCarouselTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CarouselTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from("carousel_templates")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, name, message, cards, source, created_at, updated_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carousel_templates"] }),
  });
}

export function useDeleteCarouselTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("carousel_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carousel_templates"] }),
  });
}
