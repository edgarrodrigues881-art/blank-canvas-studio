import { supabase } from "@/integrations/supabase/client";
import type { NotificationItem } from "./types";

const PER_SOURCE_LIMIT = 8;
const FEED_LIMIT = 18;
const WARMUP_EVENT_TYPES = [
  "autosave_msg_sent",
  "autosave_interaction",
  "group_msg_sent",
  "group_interaction",
  "community_msg_sent",
  "community_interaction",
  "community_turn_sent",
];

const trimMessage = (value: string | null | undefined, max = 110) => {
  const text = String(value ?? "").trim();
  if (!text) return "Atividade processada com sucesso.";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const sortByDateDesc = (items: NotificationItem[]) =>
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

export async function fetchActivityNotifications(userId: string): Promise<NotificationItem[]> {
  const [chipRes, groupRes, warmupRes] = await Promise.all([
    supabase
      .from("chip_conversation_logs")
      .select("id, sender_name, receiver_name, message_content, sent_at")
      .eq("user_id", userId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
    supabase
      .from("group_interaction_logs" as any)
      .select("id, group_name, group_id, message_content, sent_at")
      .eq("user_id", userId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
    supabase
      .from("warmup_audit_logs" as any)
      .select("id, event_type, message, created_at")
      .eq("user_id", userId)
      .in("event_type", WARMUP_EVENT_TYPES)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
  ]);

  const chipItems: NotificationItem[] = (chipRes.data || []).map((row: any) => ({
    id: `activity-chip-${row.id}`,
    user_id: userId,
    title: "Conversa entre chips",
    message: trimMessage(
      `${row.sender_name || "Instância"} → ${row.receiver_name || "Instância"}: ${row.message_content || "Mensagem enviada"}`,
    ),
    type: "success",
    read: true,
    created_at: row.sent_at,
    source: "chip",
    synthetic: true,
  }));

  const groupItems: NotificationItem[] = ((groupRes.data as any[]) || []).map((row: any) => ({
    id: `activity-group-${row.id}`,
    user_id: userId,
    title: "Interação de grupos",
    message: trimMessage(
      `${row.group_name || row.group_id || "Grupo"}: ${row.message_content || "Mensagem enviada"}`,
    ),
    type: "success",
    read: true,
    created_at: row.sent_at,
    source: "group",
    synthetic: true,
  }));

  const warmupItems: NotificationItem[] = ((warmupRes.data as any[]) || []).map((row: any) => ({
    id: `activity-warmup-${row.id}`,
    user_id: userId,
    title: "Aquecimento automático",
    message: trimMessage(row.message),
    type: "success",
    read: true,
    created_at: row.created_at,
    source: "warmup",
    synthetic: true,
  }));

  return sortByDateDesc([...chipItems, ...groupItems, ...warmupItems]).slice(0, FEED_LIMIT);
}