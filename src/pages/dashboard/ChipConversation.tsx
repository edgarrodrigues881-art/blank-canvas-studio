import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useChipConversations,
  useChipConversationLogs,
  useChipConversationActions,
  type ChipConversation,
} from "@/hooks/useChipConversation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Play,
  Pause,
  Square,
  Plus,
  MessageCircle,
  Clock,
  Settings2,
  ChevronDown,
  ChevronUp,
  Smartphone,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  RotateCcw,
  Pencil,
  Timer,
  CalendarDays,
  MoreVertical,
  Activity,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const DAY_OPTIONS = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

const CONNECTED_DEVICE_STATUSES = new Set(["connected", "ready", "active", "online", "authenticated", "open"]);

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  idle: { label: "Parado", color: "bg-muted text-muted-foreground", icon: Square },
  running: { label: "Rodando", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: Play },
  paused: { label: "Pausado", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Pause },
  completed: { label: "Concluído", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: CheckCircle2 },
};

type ConversationVisualStatus = "idle" | "running" | "paused" | "completed";

function normalizeConversationStatus(status: string | null | undefined): ConversationVisualStatus {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "active") return "running";
  if (normalized === "canceled" || normalized === "cancelled" || normalized === "stopped") return "idle";
  if (normalized === "paused" || normalized === "completed" || normalized === "running" || normalized === "idle") {
    return normalized;
  }

  return "idle";
}

function isConversationDeviceConnected(device: any): boolean {
  const normalized = String(device?.status || "").trim().toLowerCase();
  return CONNECTED_DEVICE_STATUSES.has(normalized);
}

function getConversationInvalidReason(conversation: ChipConversation, deviceMap: Map<string, any>): string | null {
  const deviceIds = Array.from(new Set(conversation.device_ids || []));

  if (deviceIds.length < 2) return "Conecte pelo menos 2 chips para manter a conversa ativa.";

  const removedDevices: string[] = [];
  const offlineDevices: string[] = [];

  for (const deviceId of deviceIds) {
    const device = deviceMap.get(deviceId);
    if (!device) {
      removedDevices.push(deviceId);
    } else if (!isConversationDeviceConnected(device)) {
      offlineDevices.push(device.name || deviceId);
    }
  }

  if (removedDevices.length > 0) return `${removedDevices.length} instância(s) removida(s) do sistema.`;
  if (offlineDevices.length > 0) return `Instância offline: ${offlineDevices.join(", ")}`;

  // Count how many are actually connected
  const connectedCount = deviceIds.filter((id) => {
    const d = deviceMap.get(id);
    return d && isConversationDeviceConnected(d);
  }).length;

  if (connectedCount < 2) return "Menos de 2 chips conectados.";

  return null;
}

function useDevices() {
  return useQuery({
    queryKey: ["devices_for_conversation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, instance_type")
        .order("name");
      if (error) throw error;
      const blockedTypes = new Set(["notificacao", "report", "report_wa"]);
      return (data || []).filter((d: any) => {
        const t = String(d.instance_type || "").trim().toLowerCase();
        return !blockedTypes.has(t);
      });
    },
  });
}

export default function ChipConversation() {
  const { data: conversations = [], isLoading } = useChipConversations();
  const { data: devices = [] } = useDevices();
  const actions = useChipConversationActions();
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingConv, setEditingConv] = useState<ChipConversation | null>(null);
  const deviceMap = useMemo(() => new Map(devices.map((device: any) => [device.id, device])), [devices]);

  const busyDeviceIds = useMemo(
    () => new Set(
      conversations
        .filter((c) => {
          const s = normalizeConversationStatus(c.status);
          return s === "running" || s === "paused";
        })
        .flatMap((c) => c.device_ids || []),
    ),
    [conversations],
  );

  const availableDevices = useMemo(
    () => devices.filter((d: any) => isConversationDeviceConnected(d) && !busyDeviceIds.has(d.id)),
    [devices, busyDeviceIds],
  );

  const getEditDevices = (conv: ChipConversation) => {
    const ownIds = new Set(conv.device_ids || []);
    return devices.filter((d: any) => ownIds.has(d.id) || (isConversationDeviceConnected(d) && !busyDeviceIds.has(d.id)));
  };

  const handleDelete = async (id: string) => {
    try {
      await actions.remove.mutateAsync(id);
      toast.success("Conversa excluída");
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir");
    }
  };

  const handleEdit = async (data: any) => {
    if (!editingConv) return;
    try {
      await actions.update.mutateAsync({ conversation_id: editingConv.id, ...data });
      toast.success("Conversa atualizada!");
      setEditingConv(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar");
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-primary" />
            Conversa entre Chips
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automação de conversas naturais entre seus chips para aquecimento
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Conversa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Conversa Automática</DialogTitle>
            </DialogHeader>
            <CreateConversationForm
              devices={availableDevices}
              onSubmit={async (data) => {
                try {
                  const result = await actions.create.mutateAsync(data);
                  const newId = result?.id || result?.conversation_id;
                  if (newId) {
                    try {
                      await actions.start.mutateAsync(newId);
                      toast.success("Conversa criada e iniciada!");
                    } catch {
                      toast.success("Conversa criada! Inicie manualmente.");
                    }
                  } else {
                    toast.success("Conversa criada com sucesso!");
                  }
                  setShowCreateDialog(false);
                } catch (e: any) {
                  toast.error(e.message || "Erro ao criar conversa");
                }
              }}
              isLoading={actions.create.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingConv} onOpenChange={(open) => !open && setEditingConv(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Conversa</DialogTitle>
          </DialogHeader>
          {editingConv && (
            <CreateConversationForm
              devices={editingConv ? getEditDevices(editingConv) : devices}
              onSubmit={handleEdit}
              isLoading={actions.update.isPending}
              initialData={editingConv}
              submitLabel="Salvar Alterações"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Conversations List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : conversations.length === 0 ? (
        <Card className="p-12 text-center">
          <MessageCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma conversa configurada</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Crie uma conversa automática para começar a aquecer seus chips
          </p>
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Criar primeira conversa
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {conversations.map((conv) => (
            <ConversationCard
              key={conv.id}
              conversation={conv}
              devices={devices}
              invalidReason={getConversationInvalidReason(conv, deviceMap)}
              actions={actions}
              expanded={expandedId === conv.id}
              onToggleExpand={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
              onSelectLogs={() => setSelectedConv(selectedConv === conv.id ? null : conv.id)}
              showLogs={selectedConv === conv.id}
              onEdit={() => setEditingConv(conv)}
              onDelete={() => handleDelete(conv.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// CONVERSATION CARD
// ══════════════════════════════════════════════════════════

function ConversationCard({
  conversation: conv,
  devices,
  invalidReason,
  actions,
  expanded,
  onToggleExpand,
  onSelectLogs,
  showLogs,
  onEdit,
  onDelete,
}: {
  conversation: ChipConversation;
  devices: any[];
  invalidReason: string | null;
  actions: ReturnType<typeof useChipConversationActions>;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelectLogs: () => void;
  showLogs: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const normalizedStatus = normalizeConversationStatus(conv.status);
  const displayStatus = normalizedStatus;
  const status = STATUS_MAP[displayStatus];
  const deviceNames = (conv.device_ids || [])
    .map((id) => devices.find((d) => d.id === id)?.name || "???")
    .join(", ");
  const chipCount = (conv.device_ids || []).length;

  const activeDaysLabels = (conv.active_days || [])
    .map((d) => DAY_OPTIONS.find((o) => o.key === d)?.label || d)
    .join(", ");

  const timeWindows = (() => {
    const starts = String(conv.start_hour || "08:00").split(",");
    const ends = String(conv.end_hour || "18:00").split(",");
    return starts.map((s, i) => `${s.trim()} – ${(ends[i] || ends[0]).trim()}`).join("  •  ");
  })();

  const handleAction = async (action: "start" | "pause" | "resume" | "stop") => {
    try {
      if (action === "start") await actions.start.mutateAsync(conv.id);
      else if (action === "pause") await actions.pause.mutateAsync(conv.id);
      else if (action === "resume") await actions.resume.mutateAsync(conv.id);
      else if (action === "stop") await actions.stop.mutateAsync(conv.id);
      toast.success(
        action === "start" ? "Conversa iniciada!" :
        action === "pause" ? "Conversa pausada" :
        action === "resume" ? "Conversa retomada!" :
        "Conversa cancelada"
      );
    } catch (e: any) {
      console.error(`[ChipConversation] Action ${action} failed:`, e);
      toast.error(e.message || "Erro na operação");
    }
  };

  const isActionLoading = actions.start.isPending || actions.pause.isPending ||
    actions.resume.isPending || actions.stop.isPending;

  const isRunning = displayStatus === "running";
  const isPaused = displayStatus === "paused";

  const glowColor = isRunning
    ? "shadow-emerald-500/10 hover:shadow-emerald-500/20"
    : isPaused
    ? "shadow-amber-500/10 hover:shadow-amber-500/15"
    : "hover:shadow-primary/10";

  const topGradient = isRunning
    ? "from-emerald-500/15 via-emerald-500/5 to-transparent"
    : isPaused
    ? "from-amber-500/15 via-amber-500/5 to-transparent"
    : "from-muted/30 via-muted/10 to-transparent";

  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-border/30 bg-gradient-to-b from-card to-background/80 transition-all duration-300 shadow-lg ${glowColor} hover:scale-[1.01] hover:border-border/50 flex flex-col`}>
      {/* Top accent gradient */}
      <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${topGradient} pointer-events-none`} />

      <div className="relative p-5 flex flex-col flex-1">
        {/* Header: status badge */}
        <div className="flex items-center justify-between mb-4">
          <Badge className={`text-[10px] font-bold tracking-wider uppercase border px-2.5 py-1 ${status.color}`}>
            <span className={`w-2 h-2 rounded-full mr-2 ${isRunning ? "bg-emerald-400 animate-pulse" : isPaused ? "bg-amber-400" : "bg-muted-foreground/40"}`} />
            {status.label}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onEdit}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Device chip */}
        <div className="inline-flex items-center gap-1.5 bg-muted/40 backdrop-blur-sm border border-border/20 rounded-full px-2.5 py-1 mb-3 self-start">
          <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-emerald-400" : isPaused ? "bg-amber-400" : "bg-muted-foreground/40"}`} />
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide">
            <Smartphone className="w-3 h-3 inline mr-1 -mt-px" />
            {chipCount} chip{chipCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-bold text-[15px] text-foreground line-clamp-1 mb-4 tracking-tight">{conv.name}</h3>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4 flex-1">
          {[
            { label: "Mensagens", value: String(conv.total_messages_sent) },
            { label: "Delay", value: `${conv.min_delay_seconds}s – ${conv.max_delay_seconds}s` },
            { label: "Horário", value: timeWindows },
            { label: "Dias", value: activeDaysLabels },
          ].map((block) => (
            <div key={block.label} className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">{block.label}</span>
              <span className="text-sm font-bold text-foreground truncate">{block.value}</span>
            </div>
          ))}
        </div>

        {/* Error Banner — hide transient infrastructure errors from the user */}
        {(() => {
          const rawError = conv.last_error;
          const isTransient = rawError && /502|503|504|Bad Gateway|Service Unavailable|Gateway Timeout|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up/i.test(rawError);
          const visibleError = invalidReason || (rawError && !isTransient ? rawError : null);
          return visibleError ? (
            <div className="mb-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-xs text-destructive font-medium truncate">{visibleError}</p>
            </div>
          ) : null;
        })()}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-3 border-t border-border/10">
          {displayStatus === "idle" || displayStatus === "completed" ? (
            <>
              <button
                onClick={() => handleAction("start")}
                disabled={isActionLoading || Boolean(invalidReason)}
                className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-colors"
              >
                {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" strokeWidth={1.8} />}
                Iniciar
              </button>
              <div className="flex-1" />
              <button onClick={onToggleExpand} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1">
                {expanded ? <ChevronUp className="w-4 h-4" strokeWidth={1.5} /> : <ChevronDown className="w-4 h-4" strokeWidth={1.5} />}
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="text-muted-foreground/30 hover:text-destructive transition-colors p-1">
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
                    <AlertDialogDescription>A conversa e logs serão removidos.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : displayStatus === "running" ? (
            <>
              <button
                onClick={() => handleAction("pause")}
                disabled={isActionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30 disabled:opacity-40 text-xs font-medium transition-all"
              >
                <Pause className="w-3.5 h-3.5" strokeWidth={1.8} /> Pausar
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    disabled={isActionLoading}
                     className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive/50 disabled:opacity-40 text-xs font-medium transition-all"
                  >
                    <XCircle className="w-3.5 h-3.5" strokeWidth={1.8} /> Parar
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Parar conversa?</AlertDialogTitle>
                    <AlertDialogDescription>A conversa será encerrada.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Fechar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleAction("stop")}>Parar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : displayStatus === "paused" ? (
            <>
              <button
                onClick={() => handleAction("resume")}
                disabled={isActionLoading || Boolean(invalidReason)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.8} /> Retomar
              </button>
              <button
                onClick={() => handleAction("stop")}
                disabled={isActionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/20 bg-muted/5 text-muted-foreground/60 hover:border-destructive/30 hover:text-destructive/80 hover:bg-destructive/5 disabled:opacity-40 text-xs font-medium transition-all"
              >
                <XCircle className="w-3.5 h-3.5" strokeWidth={1.8} /> Parar
              </button>
              <div className="flex-1" />
              <button onClick={onToggleExpand} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1">
                {expanded ? <ChevronUp className="w-4 h-4" strokeWidth={1.5} /> : <ChevronDown className="w-4 h-4" strokeWidth={1.5} />}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Expanded Details — removed logs and chips (chips shown only in edit dialog) */}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// LOGS
// ══════════════════════════════════════════════════════════

function ConversationLogs({ conversationId }: { conversationId: string }) {
  const { data: logs = [], isLoading } = useChipConversationLogs(conversationId);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
        Carregando logs...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Nenhuma mensagem enviada ainda
      </div>
    );
  }

  const CATEGORY_LABELS: Record<string, string> = {
    abertura: "Abertura",
    resposta: "Resposta",
    continuacao: "Continuação",
    encerramento: "Encerramento",
  };

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="divide-y divide-border">
        {logs.map((log) => (
          <div key={log.id} className="px-4 py-3 flex items-start gap-3 text-sm">
            <div className="shrink-0 mt-0.5">
              {log.status === "sent" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-foreground text-xs">{log.sender_name || "???"}</span>
                <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                <span className="font-medium text-foreground text-xs">{log.receiver_name || "???"}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  {CATEGORY_LABELS[log.message_category] || log.message_category}
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs truncate">{log.message_content}</p>
              {log.error_message && (
                <p className="text-destructive text-[10px] mt-0.5">{log.error_message}</p>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              {format(new Date(log.sent_at), "HH:mm:ss", { locale: ptBR })}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ══════════════════════════════════════════════════════════
// CREATE FORM
// ══════════════════════════════════════════════════════════

function CreateConversationForm({
  devices,
  onSubmit,
  isLoading,
  initialData,
  submitLabel,
}: {
  devices: any[];
  onSubmit: (data: any) => void;
  isLoading: boolean;
  initialData?: ChipConversation;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialData?.name || "Conversa automática");
  const [selectedDevices, setSelectedDevices] = useState<string[]>(initialData?.device_ids || []);
  const [minDelay, setMinDelay] = useState(initialData?.min_delay_seconds ?? 15);
  const [maxDelay, setMaxDelay] = useState(initialData?.max_delay_seconds ?? 60);

  // Dual time windows: stored as "08:00,13:00" in start_hour and "12:00,19:00" in end_hour
  const initStarts = String(initialData?.start_hour || "08:00").split(",");
  const initEnds = String(initialData?.end_hour || "12:00").split(",");

  const [startHour1, setStartHour1] = useState(initStarts[0]?.trim() || "08:00");
  const [endHour1, setEndHour1] = useState(initEnds[0]?.trim() || "12:00");
  const [startHour2, setStartHour2] = useState(initStarts[1]?.trim() || "13:00");
  const [endHour2, setEndHour2] = useState(initEnds[1]?.trim() || "19:00");
  const [usePeriod2, setUsePeriod2] = useState(initStarts.length > 1);

  const [activeDays, setActiveDays] = useState(initialData?.active_days || ["mon", "tue", "wed", "thu", "fri"]);

  const toggleDevice = (id: string) => {
    setSelectedDevices((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const toggleDay = (key: string) => {
    setActiveDays((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
    );
  };

  const handleSubmit = () => {
    if (selectedDevices.length < 2) {
      toast.error("Selecione pelo menos 2 chips");
      return;
    }

    const startHour = usePeriod2 ? `${startHour1},${startHour2}` : startHour1;
    const endHour = usePeriod2 ? `${endHour1},${endHour2}` : endHour1;

    onSubmit({
      name,
      device_ids: selectedDevices,
      min_delay_seconds: minDelay,
      max_delay_seconds: maxDelay,
      start_hour: startHour,
      end_hour: endHour,
      active_days: activeDays,
    });
  };

  return (
    <div className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label>Nome da conversa</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Aquecimento chips A-B" />
      </div>

      {/* Device Selection */}
      <div className="space-y-2">
        <Label>Selecione os chips (mín. 2)</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto rounded-lg border border-border p-2">
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground col-span-2 text-center py-4">
              Nenhum dispositivo encontrado
            </p>
          ) : (
            devices.map((device) => {
              const selected = selectedDevices.includes(device.id);
              const isConnected = isConversationDeviceConnected(device);
              const isOffline = !isConnected;
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => {
                    if (isOffline && !selected) return; // block selecting offline devices
                    toggleDevice(device.id);
                  }}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left ${
                    isOffline && !selected
                      ? "border-border/30 bg-muted/10 opacity-50 cursor-not-allowed"
                      : selected
                        ? "border-primary/50 bg-primary/10"
                        : "border-border hover:border-border/80 hover:bg-muted/30"
                  }`}
                >
                  <Checkbox checked={selected} className="pointer-events-none" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{device.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {device.number || "Sem número"}
                      {isOffline && <span className="ml-1 text-destructive">(offline)</span>}
                    </p>
                  </div>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? "bg-emerald-400" : "bg-destructive/60"}`} />
                </button>
              );
            })
          )}
        </div>
        {selectedDevices.length > 0 && (
          <p className="text-xs text-muted-foreground">{selectedDevices.length} chip(s) selecionado(s)</p>
        )}
      </div>

      <Separator />

      {/* Timing */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          Configuração de Tempo
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Delay mínimo (segundos)</Label>
            <Input type="number" min={5} value={minDelay} onChange={(e) => setMinDelay(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Delay máximo (segundos)</Label>
            <Input type="number" min={10} value={maxDelay} onChange={(e) => setMaxDelay(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Schedule — Dual time windows */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          Agenda
        </h4>

        {/* Period 1 */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Período 1</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Início</Label>
              <Input type="time" value={startHour1} onChange={(e) => setStartHour1(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Término</Label>
              <Input type="time" value={endHour1} onChange={(e) => setEndHour1(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Toggle Period 2 */}
        <div className="flex items-center gap-3">
          <Switch checked={usePeriod2} onCheckedChange={setUsePeriod2} />
          <Label className="text-xs">Adicionar 2º período (ex: tarde)</Label>
        </div>

        {/* Period 2 */}
        {usePeriod2 && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Período 2</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Início</Label>
                <Input type="time" value={startHour2} onChange={(e) => setStartHour2(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Término</Label>
                <Input type="time" value={endHour2} onChange={(e) => setEndHour2(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Days of the week */}
        <div className="space-y-2">
          <Label className="text-xs">Dias ativos</Label>
          <div className="flex flex-wrap gap-2">
            {DAY_OPTIONS.map((day) => (
              <button
                key={day.key}
                type="button"
                onClick={() => toggleDay(day.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  activeDays.includes(day.key)
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted/30 text-muted-foreground border-border hover:border-border/80"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Separator />

      <Button onClick={handleSubmit} disabled={isLoading} className="w-full gap-2">
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : initialData ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {submitLabel || "Criar Conversa"}
      </Button>
    </div>
  );
}
