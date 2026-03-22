import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// Global mute flag: when set, realtime + auto-sync skip invalidation
let mutedUntil = 0;
// Global flag: pause keepAlive while user is in connection flow
let keepAlivePaused = false;
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

export function pauseKeepAlive() {
  keepAlivePaused = true;
}

export function resumeKeepAlive() {
  keepAlivePaused = false;
}

/**
 * Auto-syncs device statuses.
 * - Scales to 10k+ instances via sharding (splits sync across parallel calls).
 * - Pauses sync when tab is hidden.
 */
export function useAutoSyncDevices(intervalMs = 300_000) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const syncingRef = useRef(false);
  const deviceCountRef = useRef(0);

  // Track device count for sharding decisions
  useEffect(() => {
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query?.queryKey?.[0] === "devices" && event?.query?.state?.data) {
        deviceCountRef.current = (event.query.state.data as any[])?.length || 0;
      }
    });
    return () => unsub();
  }, [queryClient]);

  // ── Periodic sync ──
  useEffect(() => {
    if (!session?.access_token) return;

    const doSync = async () => {
      if (syncingRef.current || document.hidden) return;
      if (Date.now() < mutedUntil) return;
      syncingRef.current = true;
      try {
        const count = deviceCountRef.current;
        // Shard when device count exceeds 2000
        if (count > 2000) {
          const shards = Math.min(5, Math.ceil(count / 2000));
          await Promise.all(
            Array.from({ length: shards }, (_, i) =>
              supabase.functions.invoke("sync-devices", {
                body: { shard: i, shards },
              })
            )
          );
        } else {
          await supabase.functions.invoke("sync-devices");
        }
        if (Date.now() >= mutedUntil) {
          queryClient.invalidateQueries({ queryKey: ["devices"] });
        }
      } catch {
        // silent
      } finally {
        syncingRef.current = false;
      }
    };

    // Delay initial sync by 3s to not block page load
    // EMERGENCY: sync disabled to relieve backend load
    const initialTimeout: ReturnType<typeof setTimeout> | null = null;
    const interval: ReturnType<typeof setInterval> | null = null;

    return () => {
      if (initialTimeout) clearTimeout(initialTimeout);
      if (interval) clearInterval(interval);
    };
  }, [session?.access_token, intervalMs, queryClient]);

  // Keep-alive removed: sync-devices already handles status checks for all devices
  // This eliminates ~24 concurrent Edge Function calls that were overwhelming the runtime

  // ── Realtime DESATIVADO para reduzir consumo do banco ──
  // A subscription realtime gera carga constante no banco.
  // Reativar quando a infraestrutura estiver estável.
}
