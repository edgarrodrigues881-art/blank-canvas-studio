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

const AUTO_SYNC_STARTUP_GRACE_MS = 60_000;
const AUTO_SYNC_VISIBILITY_GRACE_MS = 45_000;
const AUTO_SYNC_ONLINE_GRACE_MS = 60_000;
const AUTO_SYNC_MIN_GAP_MS = 15_000;
const AUTO_SYNC_POST_RESUME_INTERVAL_HOLD_MS = 75_000;

// Track recently deleted device IDs to filter from query results
const recentlyDeletedIds = new Set<string>();
const recentlyDeletedTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export function muteAutoSync(ms = 3000) {
  mutedUntil = Date.now() + ms;
}

export function trackDeletedDevice(id: string, ttlMs = 60000) {
  recentlyDeletedIds.add(id);
  const existingTimeout = recentlyDeletedTimeouts.get(id);
  if (existingTimeout) clearTimeout(existingTimeout);

  const timeout = setTimeout(() => {
    recentlyDeletedIds.delete(id);
    recentlyDeletedTimeouts.delete(id);
  }, ttlMs);

  recentlyDeletedTimeouts.set(id, timeout);
}

export function untrackDeletedDevice(id: string) {
  recentlyDeletedIds.delete(id);
  const existingTimeout = recentlyDeletedTimeouts.get(id);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    recentlyDeletedTimeouts.delete(id);
  }
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
 * 3. Delayed sync on startup/focus/network recovery to avoid false offline waves
 */
export function useAutoSyncDevices(intervalMs = 8_000) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const autoSyncBlockedUntilRef = useRef(Date.now() + AUTO_SYNC_STARTUP_GRACE_MS);
  const scheduledSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncStartedAtRef = useRef(0);

  const clearScheduledSync = useCallback(() => {
    if (scheduledSyncRef.current) {
      clearTimeout(scheduledSyncRef.current);
      scheduledSyncRef.current = null;
    }
  }, []);

  const shouldSkipSync = useCallback(() => {
    return Date.now() < mutedUntil
      || Date.now() < keepAlivePausedUntil
      || Date.now() < autoSyncBlockedUntilRef.current;
  }, []);

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
          if (recentlyDeletedIds.has(updated.id)) return;

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

          queryClient.invalidateQueries({ queryKey: ["sidebar-stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, queryClient, shouldSkipSync]);

  // ── Shared sync function exposed for manual trigger ──
  const doSync = useCallback(async (trigger: "interval" | "startup" | "visibility" | "online" = "interval") => {
    if (document.hidden || shouldSkipSync()) {
      queuedSync = false;
      return;
    }

    const now = Date.now();
    if (now - lastSyncStartedAtRef.current < AUTO_SYNC_MIN_GAP_MS) {
      return;
    }

    if (_isSyncing) {
      queuedSync = true;
      return;
    }

    let token: string | undefined;
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      token = currentSession?.access_token;
      if (!token) return;
    } catch {
      return;
    }

    lastSyncStartedAtRef.current = now;
    _isSyncing = true;
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-devices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(trigger === "interval" ? {} : { trigger }),
      });

      if (response.status === 401) {
        queuedSync = false;
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (!refreshed?.session) {
          await supabase.auth.signOut({ scope: "local" });
        }
        return;
      }

      if (!response.ok) return;

      if (!shouldSkipSync()) {
        await queryClient.refetchQueries({ queryKey: ["devices"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-stats"] });
      }
    } catch {
      // silent — network errors here must never derrubar a UI
    } finally {
      _isSyncing = false;

      const shouldRunFollowUp = queuedSync && !document.hidden && !shouldSkipSync();
      queuedSync = false;

      if (shouldRunFollowUp) {
        clearScheduledSync();
        scheduledSyncRef.current = setTimeout(() => {
          scheduledSyncRef.current = null;
          void doSync();
        }, AUTO_SYNC_MIN_GAP_MS);
      }
    }
  }, [clearScheduledSync, queryClient, shouldSkipSync]);

  // ── Periodic background sync + delayed sync on startup/focus/network recovery ──
  useEffect(() => {
    if (!session?.access_token) return;

    autoSyncBlockedUntilRef.current = Date.now() + AUTO_SYNC_STARTUP_GRACE_MS;

    const scheduleProtectedSync = (trigger: "startup" | "visibility" | "online", blockMs: number) => {
      autoSyncBlockedUntilRef.current = Math.max(autoSyncBlockedUntilRef.current, Date.now() + blockMs);
      clearScheduledSync();
      scheduledSyncRef.current = setTimeout(() => {
        scheduledSyncRef.current = null;
        if (!document.hidden) {
          void doSync(trigger);
        }
      }, blockMs + 250);
    };

    const onVisibilityChange = () => {
      if (document.hidden) return;
      scheduleProtectedSync("visibility", AUTO_SYNC_VISIBILITY_GRACE_MS);
    };

    const onOnline = () => {
      scheduleProtectedSync("online", AUTO_SYNC_ONLINE_GRACE_MS);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    const initialTimeout = setTimeout(() => {
      if (!document.hidden) {
        void doSync("startup");
      }
    }, AUTO_SYNC_STARTUP_GRACE_MS + 250);

    const interval = setInterval(() => {
      if (!document.hidden) {
        void doSync();
      }
    }, intervalMs);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      clearScheduledSync();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [session?.access_token, intervalMs, doSync, clearScheduledSync]);

  return { doSync };
}
