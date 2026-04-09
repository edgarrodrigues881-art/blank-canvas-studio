export interface ScheduledMessage {
  id: string;
  contact_name: string;
  contact_phone: string;
  message_content: string;
  scheduled_at: string;
  status: string;
  device_id: string | null;
  sent_at: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  next_retry_at: string | null;
  created_at: string;
}

export interface Device {
  id: string;
  name: string;
  number: string | null;
  status: string;
}

export const statusConfig: Record<string, { label: string; dot: string; className: string }> = {
  pending: { label: "Pendente", dot: "bg-amber-400", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  processing: { label: "Enviando...", dot: "bg-blue-400", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  retry: { label: "Retentando", dot: "bg-orange-400", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  sent: { label: "Enviado", dot: "bg-emerald-400", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled: { label: "Cancelado", dot: "bg-muted-foreground", className: "bg-muted text-muted-foreground border-muted" },
  failed: { label: "Falhou", dot: "bg-destructive", className: "bg-destructive/15 text-destructive border-destructive/30" },
};
