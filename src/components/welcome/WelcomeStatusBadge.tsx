import { Badge } from "@/components/ui/badge";
import {
  Clock, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Shield, Pause,
} from "lucide-react";

export const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pendente", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: Clock },
  processing: { label: "Processando", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: RefreshCw },
  sent: { label: "Enviado", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  failed: { label: "Falhou", color: "bg-red-500/15 text-red-400 border-red-500/30", icon: AlertTriangle },
  ignored: { label: "Ignorado", color: "bg-gray-500/15 text-gray-400 border-gray-500/30", icon: XCircle },
  duplicate_blocked: { label: "Duplicado", color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: Shield },
  aguardando_pausa: { label: "Aguardando Pausa", color: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: Pause },
  aguardando_janela: { label: "Fora do Horário", color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30", icon: Clock },
};

export const AUTOMATION_STATUS: Record<string, { label: string; color: string; dotColor: string }> = {
  paused: { label: "Pausada", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", dotColor: "bg-yellow-400" },
  active: { label: "Ativa", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dotColor: "bg-emerald-400" },
  completed: { label: "Finalizada", color: "bg-gray-500/15 text-gray-400 border-gray-500/30", dotColor: "bg-gray-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] || { label: status, color: "bg-muted text-muted-foreground", icon: Clock };
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.color} gap-1.5 text-[11px] font-medium border px-2.5 py-1`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

export function AutomationStatusBadge({ status }: { status: string }) {
  const st = AUTOMATION_STATUS[status] || AUTOMATION_STATUS.paused;
  return (
    <Badge variant="outline" className={`${st.color} text-[11px] border gap-1.5 px-2.5 py-1`}>
      <span className={`w-2 h-2 rounded-full ${st.dotColor} ${status === "active" ? "animate-pulse" : ""}`} />
      {st.label}
    </Badge>
  );
}
