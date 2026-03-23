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
  const foldersQueryKey = ["warmup_folders", user?.id] as const;

  const normalizeTags = (value: unknown): FolderTag[] => Array.isArray(value) ? (value as FolderTag[]) : [];

  const normalizeFolder = (folder: any): WarmupFolder => ({
    ...folder,
    tags: normalizeTags(folder?.tags),
    device_ids: Array.isArray(folder?.device_ids) ? folder.device_ids : [],
    device_tags: folder?.device_tags instanceof Map ? folder.device_tags : new Map<string, FolderTag[]>(),
  });

  const updateFoldersCache = (updater: (current: WarmupFolder[]) => WarmupFolder[]) => {
    if (!user?.id) return;
    qc.setQueryData(foldersQueryKey, (current: WarmupFolder[] | undefined) => updater(current || []));
  };

  const foldersQuery = useQuery({
    queryKey: foldersQueryKey,
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
        tags: normalizeTags(f.tags),
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
      return data as any;
    },
    onSuccess: async (data: any) => {
      updateFoldersCache((current) => {
        const next = [...current.filter((folder) => folder.id !== data.id), normalizeFolder(data)];
        return next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
      await qc.invalidateQueries({ queryKey: foldersQueryKey });
    },
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
    onSuccess: async (_data, variables) => {
      updateFoldersCache((current) => current.map((folder) => (
        folder.id === variables.id
          ? normalizeFolder({ ...folder, ...variables, tags: variables.tags ?? folder.tags })
          : folder
      )));
      await qc.invalidateQueries({ queryKey: foldersQueryKey });
    },
  });

  const deleteFolder = useMutation({
    mutationFn: async (folderId: string) => {
      const { error } = await supabase
        .from("warmup_folders" as any)
        .delete()
        .eq("id", folderId);
      if (error) throw error;
    },
    onSuccess: async (_data, folderId) => {
      updateFoldersCache((current) => current.filter((folder) => folder.id !== folderId));
      await qc.invalidateQueries({ queryKey: foldersQueryKey });
    },
  });

  const addDevices = useMutation({
    mutationFn: async (params: { folderId: string; deviceIds: string[] }) => {
      const rows = params.deviceIds.map((did) => ({
        folder_id: params.folderId,
        device_id: did,
        user_id: user!.id,
      }));
      // First remove device from any other folder (one device = one folder)
      for (const did of params.deviceIds) {
        await supabase
          .from("warmup_folder_devices" as any)
          .delete()
          .eq("device_id", did)
          .neq("folder_id", params.folderId);
      }
      const { error } = await supabase
        .from("warmup_folder_devices" as any)
        .upsert(rows as any, { onConflict: "device_id" });
      if (error) throw error;
    },
    onSuccess: async (_data, params) => {
      updateFoldersCache((current) => current.map((folder) => {
        if (folder.id !== params.folderId) return folder;
        const nextDeviceIds = Array.from(new Set([...(folder.device_ids || []), ...params.deviceIds]));
        return normalizeFolder({ ...folder, device_ids: nextDeviceIds });
      }));
      await qc.invalidateQueries({ queryKey: foldersQueryKey });
    },
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
    onSuccess: async (_data, params) => {
      updateFoldersCache((current) => current.map((folder) => {
        if (folder.id !== params.folderId) return folder;
        return normalizeFolder({
          ...folder,
          device_ids: (folder.device_ids || []).filter((deviceId) => deviceId !== params.deviceId),
        });
      }));
      await qc.invalidateQueries({ queryKey: foldersQueryKey });
    },
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
    onSuccess: async (_data, params) => {
      updateFoldersCache((current) => current.map((folder) => {
        if (folder.id !== params.folderId) return folder;
        const deviceTags = new Map(folder.device_tags || new Map<string, FolderTag[]>());
        deviceTags.set(params.deviceId, params.tags);
        return normalizeFolder({ ...folder, device_tags: deviceTags });
      }));
      await qc.invalidateQueries({ queryKey: foldersQueryKey });
    },
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
