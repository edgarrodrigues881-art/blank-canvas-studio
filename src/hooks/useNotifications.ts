import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

// Clean notification chime using Web Audio API
const playChime = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    // Two-tone chime: C6 → E6
    const frequencies = [1047, 1319];
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
  } catch {
    // Audio not available
  }
};

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const audioUnlockedRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const toastedIdsRef = useRef<Set<string>>(new Set());
  const recentToastsRef = useRef<Map<string, number>>(new Map());
  const initialLoadDoneRef = useRef(false);

  // Unlock AudioContext on first user gesture
  useEffect(() => {
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctx.resume().then(() => ctx.close()).catch(() => {});
      audioUnlockedRef.current = true;
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const showToastForNotif = useCallback((n: Notification) => {
    playChime();
    const toastFn = n.type === "error" ? toast.error
      : n.type === "warning" ? toast.warning
      : n.type === "success" ? toast.success
      : toast.info;
    toastFn(n.title, { description: n.message, duration: 4000 });
  }, []);

  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch notifications (no toasts — realtime handles toast display)
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, title, message, type, read, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) {
      // Mark all fetched IDs as known so realtime won't re-toast them
      for (const n of data) {
        toastedIdsRef.current.add(n.id);
        knownIdsRef.current.add(n.id);
      }
      initialLoadDoneRef.current = true;

      setNotifications(data as Notification[]);
      setUnreadCount(data.filter((n) => !n.read).length);
    }
    setLoading(false);
  }, [user]);
  // Mark single as read
  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, [user]);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
    setNotifications([]);
    setUnreadCount(0);
  }, [user]);

  // Initial fetch + light polling as safety net (realtime handles instant delivery)
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 120_000); // 2min — emergency mode
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          if (!toastedIdsRef.current.has(newNotif.id)) {
            toastedIdsRef.current.add(newNotif.id);
            knownIdsRef.current.add(newNotif.id);
            setNotifications((prev) => [newNotif, ...prev].slice(0, 20));
            setUnreadCount((c) => c + 1);

            // Dedup by title+message within 10s window to prevent duplicate toasts
            const dedupKey = `${newNotif.title}::${newNotif.message}`;
            const lastShown = recentToastsRef.current.get(dedupKey) || 0;
            if (Date.now() - lastShown > 10_000) {
              recentToastsRef.current.set(dedupKey, Date.now());
              showToastForNotif(newNotif);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearAll };
}
