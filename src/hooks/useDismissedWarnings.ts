import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Tracks one-time disclaimer/warning dismissals **per user, persisted in the
 * database** (column `profiles.dismissed_warnings text[]`). Falls back to
 * `localStorage` so the UX still works while offline / before the profile row
 * loads. Once a key is marked dismissed it never resurfaces — even after the
 * user logs in from a different browser or clears cache.
 */
export function useDismissedWarnings() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("dg_dismissed_warnings");
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  });
  const [loaded, setLoaded] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);
  const dismissedRef = useRef<Set<string>>(dismissed);

  // Keep ref in sync with state for use inside callbacks (avoids stale closures
  // and the StrictMode double-invoke side-effect issue).
  useEffect(() => {
    dismissedRef.current = dismissed;
  }, [dismissed]);

  // Pull the canonical list from the profile on login
  useEffect(() => {
    if (!user?.id) {
      setLoaded(false);
      return;
    }
    if (lastUserIdRef.current === user.id) return;
    lastUserIdRef.current = user.id;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("dismissed_warnings")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const remote: string[] = (data?.dismissed_warnings as string[] | null) ?? [];
      const local = dismissedRef.current;
      const merged = new Set<string>([...local, ...remote]);
      dismissedRef.current = merged;
      setDismissed(merged);
      try {
        localStorage.setItem("dg_dismissed_warnings", JSON.stringify([...merged]));
      } catch {}
      // If localStorage had keys the DB didn't, sync them up
      const missing = [...local].filter((k) => !remote.includes(k));
      if (missing.length > 0) {
        const { error } = await supabase
          .from("profiles")
          .update({ dismissed_warnings: [...merged] })
          .eq("id", user.id);
        if (error) console.warn("[dismissed_warnings] sync failed", error);
      }
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const isDismissed = useCallback(
    (key: string) => dismissed.has(key),
    [dismissed]
  );

  const dismiss = useCallback(
    (key: string) => {
      const current = dismissedRef.current;
      if (current.has(key)) return;
      const next = new Set(current);
      next.add(key);
      dismissedRef.current = next;
      setDismissed(next);
      try {
        localStorage.setItem("dg_dismissed_warnings", JSON.stringify([...next]));
      } catch {}
      const uid = user?.id;
      if (uid) {
        // Fire-and-forget but log errors so we can debug persistence problems.
        supabase
          .from("profiles")
          .update({ dismissed_warnings: [...next] })
          .eq("id", uid)
          .then(({ error }) => {
            if (error) console.warn("[dismissed_warnings] persist failed", error);
          });
      }
    },
    [user?.id]
  );

  return { isDismissed, dismiss, loaded };
}
