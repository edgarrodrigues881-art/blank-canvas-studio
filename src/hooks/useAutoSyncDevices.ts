import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// ── Global sync semaphore: shared across hook + manual button ──
let _isSyncing = false;
export function isSyncingDevices() { return _isSyncing; }

// Global mute flag: when set, realtime + auto-sync skip invalidation
let mutedUntil = 0;
let keepAlivePausedUntil = 0;
let queuedSync = false;
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

// Keep-alive pause/resume used during QR/pairing flows to avoid sync collisions
export function pauseKeepAlive(ms = 45_000) {
  keepAlivePausedUntil = Math.max(keepAlivePausedUntil, Date.now() + ms);
}

export function resumeKeepAlive() {
  keepAlivePausedUntil = 0;
}

/**
 * Auto-syncs device statuses via:
 * 1. Realtime subscription on the `devices` table for instant updates
 * 2. Periodic sync every 10s as fallback
 * 3. Immediate sync on tab focus
 */
export function useAutoSyncDevices(intervalMs = 3_000) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const shouldSkipSync = () => Date.now() < mutedUntil || Date.now() < keepAlivePausedUntil;

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
          if (shouldSkipSync()) return;
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

  // ── Shared sync function exposed for manual trigger ──
  const doSync = useCallback(async () => {
    if (shouldSkipSync()) return;
    if (_isSyncing) {
      queuedSync = true;
      return;
    }

    // Guard: skip if no valid session
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) return;
    } catch {
      return; // Auth not ready
    }

    _isSyncing = true;
    try {
      await supabase.functions.invoke("sync-devices");
      if (!shouldSkipSync()) {
        await queryClient.refetchQueries({ queryKey: ["devices"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-stats"] });
      }
    } catch {
      // silent — 401 or network errors are non-fatal
    } finally {
      _isSyncing = false;

      if (queuedSync && !shouldSkipSync()) {
        queuedSync = false;
        void Promise.resolve().then(() => doSync());
      } else if (!shouldSkipSync()) {
        queuedSync = false;
      }
    }
  }, [queryClient]);

  // ── Periodic background sync + immediate sync on tab focus ──
  useEffect(() => {
    if (!session?.access_token) return;

    const onVisibilityChange = () => {
      if (!document.hidden) doSync();
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
  }, [session?.access_token, intervalMs, doSync]);

  return { doSync };
}
