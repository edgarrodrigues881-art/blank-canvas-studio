import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// ── Global sync semaphore: shared across hook + manual button ──
let _isSyncing = false;
export function isSyncingDevices() { return _isSyncing; }

// Global mute flag: when set, realtime + auto-sync skip invalidation
let mutedUntil = 0;
// Track recently deleted device IDs to filter from query results
const recentlyDeletedIds = new Set<string>();

export function muteAutoSync(ms = 3000) {
  mutedUntil = Date.now() + ms;
}

export function trackDeletedDevice(id: string) {
  recentlyDeletedIds.add(id);
  setTimeout(() => recentlyDeletedIds.delete(id), 60000);
}

export function getRecentlyDeletedIds(): Set<string> {
  return recentlyDeletedIds;
}

// Keep-alive pause/resume (kept for backward compat but no-op now)
export function pauseKeepAlive() {}
export function resumeKeepAlive() {}

/**
 * Auto-syncs device statuses via:
 * 1. Realtime subscription on the `devices` table for instant updates
 * 2. Periodic sync every 10s as fallback
 * 3. Immediate sync on tab focus
 */
export function useAutoSyncDevices(intervalMs = 10_000) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const syncingRef = useRef(false);

  // ── Realtime subscription for instant status changes ──
  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel("devices-status-sync")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "devices",
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          if (Date.now() < mutedUntil) return;
          const updated = payload.new as any;
          if (!updated?.id) return;

          // Surgically update just the changed device in cache
          queryClient.setQueryData(["devices"], (old: any[] | undefined) => {
            if (!old) return old;
            return old.map((d: any) =>
              d.id === updated.id
                ? {
                    ...d,
                    status: updated.status,
                    number: updated.number || d.number,
                    profile_picture: updated.profile_picture ?? d.profile_picture,
                    profile_name: updated.profile_name ?? d.profile_name,
                    updated_at: updated.updated_at || d.updated_at,
                  }
                : d
            );
          });
          // Also invalidate sidebar stats
          queryClient.invalidateQueries({ queryKey: ["sidebar-stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, queryClient]);

  // ── Periodic background sync + immediate sync on tab focus ──
  useEffect(() => {
    if (!session?.access_token) return;

    const doSync = async () => {
      if (syncingRef.current) return;
      if (Date.now() < mutedUntil) return;
      syncingRef.current = true;
      try {
        await supabase.functions.invoke("sync-devices");
        if (Date.now() >= mutedUntil) {
          // Force refetch from DB (bypass staleTime) to reflect API changes immediately
          await queryClient.refetchQueries({ queryKey: ["devices"] });
          queryClient.invalidateQueries({ queryKey: ["sidebar-stats"] });
        }
      } catch {
        // silent — don't change state on error
      } finally {
        syncingRef.current = false;
      }
    };

    // Sync on tab becoming visible (instant update when user returns)
    const onVisibilityChange = () => {
      if (!document.hidden) {
        doSync();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    const initialTimeout = setTimeout(doSync, 1000);
    const interval = setInterval(() => {
      if (!document.hidden) doSync();
    }, intervalMs);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [session?.access_token, intervalMs, queryClient]);
}
