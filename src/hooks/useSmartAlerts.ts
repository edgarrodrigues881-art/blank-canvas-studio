import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface SmartAlert {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string;
  alert_type: "human_request" | "closing_opportunity" | "dispatch_event" | "task_reminder" | "appointment_reminder" | "followup_event";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  context_message: string | null;
  ai_reasoning: string | null;
  status: "unread" | "read" | "resolved" | "dismissed";
  whatsapp_sent: boolean;
  created_at: string;
}

export function useSmartAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_smart_alerts" as any)
      .select("*")
      .eq("user_id", user.id)
      .neq("status", "dismissed")
      .order("created_at", { ascending: false })
      .limit(100);
    const list = (data as any[]) || [];
    setAlerts(list as SmartAlert[]);
    setUnreadCount(list.filter((a) => a.status === "unread").length);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
    if (!user) return;
    const channel = supabase
      .channel(`smart_alerts_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_smart_alerts", filter: `user_id=eq.${user.id}` },
        () => refresh()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refresh]);

  const markRead = async (id: string) => {
    await supabase.from("ai_smart_alerts" as any).update({ status: "read" }).eq("id", id);
  };
  const markResolved = async (id: string) => {
    await supabase.from("ai_smart_alerts" as any).update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
  };
  const dismiss = async (id: string) => {
    await supabase.from("ai_smart_alerts" as any).update({ status: "dismissed" }).eq("id", id);
  };
  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("ai_smart_alerts" as any).update({ status: "read" }).eq("user_id", user.id).eq("status", "unread");
  };

  return { alerts, unreadCount, loading, refresh, markRead, markResolved, dismiss, markAllRead };
}
