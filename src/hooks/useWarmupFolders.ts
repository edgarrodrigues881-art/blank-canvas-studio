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
  const sortFolders = (folders: WarmupFolder[]) => folders
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

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
    staleTime: 120_000,
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
        return sortFolders(next);
      });
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
          const updates = (deviceAssocs as any[]).flatMap((assoc) => {
            const currentTags: FolderTag[] = Array.isArray(assoc.tags) ? assoc.tags : [];
            const filtered = currentTags.filter(t => validLabels.has(t.label));
            if (filtered.length === currentTags.length) return [];
            return [supabase
                .from("warmup_folder_devices" as any)
                .update({ tags: filtered } as any)
                .eq("id", assoc.id)];
          });

          if (updates.length > 0) {
            const results = await Promise.all(updates);
            const failed = results.find((result) => result.error);
            if (failed?.error) throw failed.error;
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
    },
  });

  const deleteFolder = useMutation({
    mutationFn: async (folderId: string) => {
      const { error: deleteLinksError } = await supabase
        .from("warmup_folder_devices" as any)
        .delete()
        .eq("folder_id", folderId)
        .eq("user_id", user!.id);
      if (deleteLinksError) throw deleteLinksError;

      const { error } = await supabase
        .from("warmup_folders" as any)
        .delete()
        .eq("id", folderId)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: async (_data, folderId) => {
      updateFoldersCache((current) => current.filter((folder) => folder.id !== folderId));
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
      const { error: cleanupError } = await supabase
        .from("warmup_folder_devices" as any)
        .delete()
        .in("device_id", params.deviceIds)
        .eq("user_id", user!.id)
        .neq("folder_id", params.folderId);
      if (cleanupError) throw cleanupError;

      const { error } = await supabase
        .from("warmup_folder_devices" as any)
        .upsert(rows as any, { onConflict: "device_id" });
      if (error) throw error;
    },
    onSuccess: async (_data, params) => {
      updateFoldersCache((current) => current.map((folder) => {
        const currentIds = folder.device_ids || [];

        if (folder.id === params.folderId) {
          const nextDeviceIds = Array.from(new Set([...currentIds, ...params.deviceIds]));
          return normalizeFolder({ ...folder, device_ids: nextDeviceIds });
        }

        const filteredIds = currentIds.filter((deviceId) => !params.deviceIds.includes(deviceId));
        if (filteredIds.length === currentIds.length) return folder;

        const deviceTags = new Map(folder.device_tags || new Map<string, FolderTag[]>());
        params.deviceIds.forEach((deviceId) => deviceTags.delete(deviceId));

        return normalizeFolder({ ...folder, device_ids: filteredIds, device_tags: deviceTags });
      }));
    },
  });

  const syncFolderDevices = useMutation({
    mutationFn: async (params: { folderId: string; deviceIds: string[]; previousDeviceIds: string[] }) => {
      const uniqueDeviceIds = Array.from(new Set(params.deviceIds));
      const previousIds = Array.from(new Set(params.previousDeviceIds));
      const removedIds = previousIds.filter((deviceId) => !uniqueDeviceIds.includes(deviceId));

      if (removedIds.length > 0) {
        const { error: removeError } = await supabase
          .from("warmup_folder_devices" as any)
          .delete()
          .eq("folder_id", params.folderId)
          .in("device_id", removedIds);
        if (removeError) throw removeError;
      }

      if (uniqueDeviceIds.length > 0) {
        const { error: cleanupError } = await supabase
          .from("warmup_folder_devices" as any)
          .delete()
          .in("device_id", uniqueDeviceIds)
          .eq("user_id", user!.id)
          .neq("folder_id", params.folderId);
        if (cleanupError) throw cleanupError;

        const rows = uniqueDeviceIds.map((deviceId) => ({
          folder_id: params.folderId,
          device_id: deviceId,
          user_id: user!.id,
        }));

        const { error: upsertError } = await supabase
          .from("warmup_folder_devices" as any)
          .upsert(rows as any, { onConflict: "device_id" });
        if (upsertError) throw upsertError;
      }
    },
    onSuccess: async (_data, params) => {
      const nextIds = new Set(params.deviceIds);
      updateFoldersCache((current) => current.map((folder) => {
        if (folder.id === params.folderId) {
          const nextTags = new Map<string, FolderTag[]>();
          (folder.device_ids || []).forEach((deviceId) => {
            if (nextIds.has(deviceId)) {
              nextTags.set(deviceId, folder.device_tags?.get(deviceId) || []);
            }
          });

          return normalizeFolder({
            ...folder,
            device_ids: params.deviceIds,
            device_tags: nextTags,
          });
        }

        const filteredIds = (folder.device_ids || []).filter((deviceId) => !nextIds.has(deviceId));
        if (filteredIds.length === (folder.device_ids || []).length) return folder;

        const filteredTags = new Map(folder.device_tags || new Map<string, FolderTag[]>());
        params.deviceIds.forEach((deviceId) => filteredTags.delete(deviceId));
        return normalizeFolder({ ...folder, device_ids: filteredIds, device_tags: filteredTags });
      }));
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
        const deviceTags = new Map(folder.device_tags || new Map<string, FolderTag[]>());
        deviceTags.delete(params.deviceId);
        return normalizeFolder({
          ...folder,
          device_ids: (folder.device_ids || []).filter((deviceId) => deviceId !== params.deviceId),
          device_tags: deviceTags,
        });
      }));
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
    },
  });
  return {
    folders: foldersQuery.data || [],
    isLoading: foldersQuery.isLoading,
    createFolder,
    updateFolder,
    deleteFolder,
    addDevices,
    syncFolderDevices,
    removeDevice,
    updateDeviceTags,
  };
}
