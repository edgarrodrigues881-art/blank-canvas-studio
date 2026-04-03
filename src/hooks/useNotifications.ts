import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const NOTIFICATION_DEDUP_WINDOW_MS = 8_000;
const globalKnownIds = new Set<string>();
const globalToastedIds = new Set<string>();
const globalRecentToastTimestamps = new Map<string, number>();

// Clean notification chime using Web Audio API
let _audioCtxReady = false;
let _sharedCtx: AudioContext | null = null;

const getAudioCtx = (): AudioContext | null => {
  try {
    if (!_sharedCtx || _sharedCtx.state === "closed") {
      _sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (_sharedCtx.state === "suspended") {
      _sharedCtx.resume().catch(() => {});
    }
    _audioCtxReady = true;
    return _sharedCtx;
  } catch {
    return null;
  }
};

const playChime = () => {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Two-tone chime: C6 → E6
    const frequencies = [1047, 1319];
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.35);
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

const getNotificationDedupKey = (n: Pick<Notification, "title" | "message" | "type">) =>
  `${n.type}::${n.title}::${n.message}`;

const isEquivalentNotification = (a: Notification, b: Notification) => {
  if (getNotificationDedupKey(a) !== getNotificationDedupKey(b)) return false;
  const timeA = new Date(a.created_at).getTime();
  const timeB = new Date(b.created_at).getTime();
  return Math.abs(timeA - timeB) <= NOTIFICATION_DEDUP_WINDOW_MS;
};

const dedupeNotifications = (items: Notification[]) => {
  const unique: Notification[] = [];

  for (const item of items) {
    const alreadyIncluded = unique.some(
      (existing) => existing.id === item.id || isEquivalentNotification(existing, item),
    );

    if (!alreadyIncluded) {
      unique.push(item);
    }
  }

  return unique.slice(0, 20);
};

export function useNotifications() {
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const audioUnlockedRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

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
    const dedupKey = getNotificationDedupKey(n);
    const lastShown = globalRecentToastTimestamps.get(dedupKey) || 0;
    if (Date.now() - lastShown <= NOTIFICATION_DEDUP_WINDOW_MS) return;

    globalRecentToastTimestamps.set(dedupKey, Date.now());
    playChime();

    const toastFn = n.type === "error"
      ? toast.error
      : n.type === "warning"
        ? toast.warning
        : n.type === "success"
          ? toast.success
          : toast.info;

    toastFn(n.title, {
      description: n.message,
      duration: 4000,
      id: `notif-${dedupKey}`,
    });
  }, []);

  // Fetch notifications (no toasts — realtime handles toast display)
  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from("notifications")
      .select("id, title, message, type, read, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) {
      const deduped = dedupeNotifications(data as Notification[]);
      for (const n of deduped) {
        globalKnownIds.add(n.id);
        globalToastedIds.add(n.id);
      }

      initialLoadDoneRef.current = true;
      setNotifications(deduped);
      setUnreadCount(deduped.filter((n) => !n.read).length);
    }

    setLoading(false);
  }, [user]);

  // Mark single as read
  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
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

  // Initial fetch + light polling (only when tab visible, realtime handles instant delivery)
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      if (!document.hidden) fetchNotifications();
    }, 300_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-realtime-${Date.now()}`)
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
          if (globalKnownIds.has(newNotif.id)) return;

          globalKnownIds.add(newNotif.id);

          setNotifications((prev) => {
            const next = dedupeNotifications([newNotif, ...prev]);
            setUnreadCount(next.filter((n) => !n.read).length);
            return next;
          });

          if (!globalToastedIds.has(newNotif.id) && initialLoadDoneRef.current) {
            globalToastedIds.add(newNotif.id);
            showToastForNotif(newNotif);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, showToastForNotif]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearAll };
}
