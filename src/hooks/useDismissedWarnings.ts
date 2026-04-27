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
      setDismissed((prev) => {
        const merged = new Set<string>([...prev, ...remote]);
        try {
          localStorage.setItem("dg_dismissed_warnings", JSON.stringify([...merged]));
        } catch {}
        // If localStorage had keys the DB didn't, sync them up
        const missing = [...prev].filter((k) => !remote.includes(k));
        if (missing.length > 0) {
          void supabase
            .from("profiles")
            .update({ dismissed_warnings: [...merged] })
            .eq("id", user.id);
        }
        return merged;
      });
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
      setDismissed((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        try {
          localStorage.setItem("dg_dismissed_warnings", JSON.stringify([...next]));
        } catch {}
        if (user?.id) {
          void supabase
            .from("profiles")
            .update({ dismissed_warnings: [...next] })
            .eq("id", user.id);
        }
        return next;
      });
    },
    [user?.id]
  );

  return { isDismissed, dismiss, loaded };
}
