export type NotificationType = "info" | "success" | "warning" | "error";
export type NotificationSource = "system" | "chip" | "group" | "warmup";

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  source?: NotificationSource;
  synthetic?: boolean;
}