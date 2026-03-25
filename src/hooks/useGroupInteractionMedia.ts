import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface GroupInteractionMedia {
  id: string;
  user_id: string;
  interaction_id: string | null;
  media_type: "text" | "image" | "video" | "file" | "sticker";
  content: string;
  file_url: string | null;
  file_name: string | null;
  category: string;
  is_active: boolean;
  is_favorite: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useGroupInteractionMedia(interactionId?: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const qk = ["gi-media", user?.id, interactionId];

  const { data: media = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from("group_interaction_media" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (interactionId) {
        q = q.or(`interaction_id.eq.${interactionId},interaction_id.is.null`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as GroupInteractionMedia[];
    },
    enabled: !!user,
    staleTime: 120_000,
  });

  const addMedia = useMutation({
    mutationFn: async (item: Partial<GroupInteractionMedia>) => {
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("group_interaction_media" as any)
        .insert({ ...item, user_id: user.id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gi-media"] });
      toast.success("Conteúdo adicionado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMedia = useMutation({
    mutationFn: async ({ id, ...data }: Partial<GroupInteractionMedia> & { id: string }) => {
      const { error } = await supabase
        .from("group_interaction_media" as any)
        .update({ ...data, updated_at: new Date().toISOString() } as any)
        .eq("id", id) as any;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gi-media"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMedia = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("group_interaction_media" as any)
        .delete()
        .eq("id", id) as any;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gi-media"] });
      toast.success("Conteúdo removido");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const uploadFile = async (file: File, mediaType: string): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `group-interaction/${user!.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return data.publicUrl;
  };

  return { media, isLoading, addMedia, updateMedia, deleteMedia, uploadFile };
}
