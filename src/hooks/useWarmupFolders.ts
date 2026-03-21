import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

import type { FolderTag } from "@/components/warmup/TagManagerDialog";

export interface WarmupFolder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  created_at: string;
  tags: FolderTag[];
  device_ids?: string[];
  device_tags?: Map<string, FolderTag[]>;
}

export function useWarmupFolders() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const foldersQuery = useQuery({
    queryKey: ["warmup_folders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: folders, error } = await supabase
        .from("warmup_folders" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const { data: assocs } = await supabase
        .from("warmup_folder_devices" as any)
        .select("folder_id, device_id, tags")
        .eq("user_id", user!.id);

      const folderDevices = new Map<string, string[]>();
      const folderDeviceTags = new Map<string, Map<string, FolderTag[]>>();
      (assocs || []).forEach((a: any) => {
        const arr = folderDevices.get(a.folder_id) || [];
        arr.push(a.device_id);
        folderDevices.set(a.folder_id, arr);

        if (!folderDeviceTags.has(a.folder_id)) folderDeviceTags.set(a.folder_id, new Map());
        const dtMap = folderDeviceTags.get(a.folder_id)!;
        dtMap.set(a.device_id, Array.isArray(a.tags) ? a.tags : []);
      });

      return (folders as any[]).map((f) => ({
        ...f,
        tags: Array.isArray(f.tags) ? f.tags : [],
        device_ids: folderDevices.get(f.id) || [],
        device_tags: folderDeviceTags.get(f.id) || new Map<string, FolderTag[]>(),
      })) as WarmupFolder[];
    },
  });

  const createFolder = useMutation({
    mutationFn: async (params: { name: string; color: string; icon?: string; tags?: FolderTag[] }) => {
      const { data, error } = await supabase
        .from("warmup_folders" as any)
        .insert({ user_id: user!.id, name: params.name, color: params.color, icon: params.icon || "folder", tags: params.tags || [] } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warmup_folders"] }),
  });

  const updateFolder = useMutation({
    mutationFn: async (params: { id: string; name?: string; color?: string; icon?: string; tags?: FolderTag[] }) => {
      const { id, tags, ...rest } = params;
      const updates: any = { ...rest };
      if (tags !== undefined) updates.tags = tags;
      const { error } = await supabase
        .from("warmup_folders" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;

      // When tags are updated, clean up device-level tags that no longer exist in the folder
      if (tags !== undefined) {
        const validLabels = new Set(tags.map(t => t.label));
        const { data: deviceAssocs } = await supabase
          .from("warmup_folder_devices" as any)
          .select("id, tags")
          .eq("folder_id", id);
        
        if (deviceAssocs) {
          for (const assoc of deviceAssocs as any[]) {
            const currentTags: FolderTag[] = Array.isArray(assoc.tags) ? assoc.tags : [];
            const filtered = currentTags.filter(t => validLabels.has(t.label));
            if (filtered.length !== currentTags.length) {
              await supabase
                .from("warmup_folder_devices" as any)
                .update({ tags: filtered } as any)
                .eq("id", assoc.id);
            }
          }
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warmup_folders"] }),
  });

  const deleteFolder = useMutation({
    mutationFn: async (folderId: string) => {
      const { error } = await supabase
        .from("warmup_folders" as any)
        .delete()
        .eq("id", folderId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warmup_folders"] }),
  });

  const addDevices = useMutation({
    mutationFn: async (params: { folderId: string; deviceIds: string[] }) => {
      const rows = params.deviceIds.map((did) => ({
        folder_id: params.folderId,
        device_id: did,
        user_id: user!.id,
      }));
      const { error } = await supabase
        .from("warmup_folder_devices" as any)
        .upsert(rows as any, { onConflict: "folder_id,device_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warmup_folders"] }),
  });

  const removeDevice = useMutation({
    mutationFn: async (params: { folderId: string; deviceId: string }) => {
      const { error } = await supabase
        .from("warmup_folder_devices" as any)
        .delete()
        .eq("folder_id", params.folderId)
        .eq("device_id", params.deviceId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warmup_folders"] }),
  });

  const updateDeviceTags = useMutation({
    mutationFn: async (params: { folderId: string; deviceId: string; tags: FolderTag[] }) => {
      const { error } = await supabase
        .from("warmup_folder_devices" as any)
        .update({ tags: params.tags } as any)
        .eq("folder_id", params.folderId)
        .eq("device_id", params.deviceId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warmup_folders"] }),
  });
  return {
    folders: foldersQuery.data || [],
    isLoading: foldersQuery.isLoading,
    createFolder,
    updateFolder,
    deleteFolder,
    addDevices,
    removeDevice,
    updateDeviceTags,
  };
}
