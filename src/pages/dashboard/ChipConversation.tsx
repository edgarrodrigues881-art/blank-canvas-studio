import { useState, useEffect } from "react";
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

function useDevices() {
  return useQuery({
    queryKey: ["devices_for_conversation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, instance_type")
        .order("name");
      if (error) throw error;
      const allowedStatuses = new Set(["connected", "ready", "active", "online", "authenticated", "open"]);
      const blockedTypes = new Set(["notificacao", "report", "report_wa"]);
      return (data || []).filter((d: any) => {
        const s = String(d.status || "").trim().toLowerCase();
        const t = String(d.instance_type || "").trim().toLowerCase();
        return allowedStatuses.has(s) && !blockedTypes.has(t);
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

  // Chips already in active/running/paused conversations are busy
  const busyDeviceIds = new Set(
    conversations
      .filter((c) => {
        const s = normalizeConversationStatus(c.status);
        return s === "running" || s === "paused";
      })
      .flatMap((c) => c.device_ids || [])
  );

  // Available devices = not busy (for creating new conversations)
  const availableDevices = devices.filter((d: any) => !busyDeviceIds.has(d.id));

  // For editing, include the conversation's own devices + available
  const getEditDevices = (conv: ChipConversation) => {
    const ownIds = new Set(conv.device_ids || []);
    return devices.filter((d: any) => ownIds.has(d.id) || !busyDeviceIds.has(d.id));
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
                  await actions.create.mutateAsync(data);
                  toast.success("Conversa criada com sucesso!");
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-5">
          {conversations.map((conv) => (
            <ConversationCard
              key={conv.id}
              conversation={conv}
              devices={devices}
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
  actions: ReturnType<typeof useChipConversationActions>;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelectLogs: () => void;
  showLogs: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const normalizedStatus = normalizeConversationStatus(conv.status);
  const status = STATUS_MAP[normalizedStatus];
  const StatusIcon = status.icon;
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

  const isRunning = normalizedStatus === "running";
  const isPaused = normalizedStatus === "paused";

  return (
    <div className={`relative rounded-2xl border bg-card overflow-hidden transition-all duration-150 hover:scale-[1.01] flex flex-col max-w-[420px] ${
      isRunning ? "border-emerald-500/25 shadow-[0_0_20px_-6px_hsl(142_71%_45%/0.12)]" :
      isPaused ? "border-amber-500/20" :
      "border-border/50"
    }`}>
      {/* Top accent */}
      {isRunning && (
        <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-emerald-500 to-transparent animate-pulse" />
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="p-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isRunning ? "bg-emerald-500/12" : isPaused ? "bg-amber-500/12" : "bg-muted/40"
          }`}>
            <ArrowRightLeft className={`w-5 h-5 ${
              isRunning ? "text-emerald-500" : isPaused ? "text-amber-500" : "text-muted-foreground"
            }`} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-foreground text-[15px] truncate">{conv.name}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              <Smartphone className="w-3 h-3 inline mr-1 -mt-px" />
              {chipCount} chip{chipCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] px-2 py-0 h-5 font-semibold rounded-full shrink-0 ${status.color}`}>
          {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />}
          {status.label}
        </Badge>
      </div>


      {/* ── INFO GRID ── */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2 flex-1">
        {[
          { icon: MessageCircle, label: "Mensagens", value: String(conv.total_messages_sent) },
          { icon: Timer, label: "Delay", value: `${conv.min_delay_seconds}s – ${conv.max_delay_seconds}s` },
          { icon: Clock, label: "Horário", value: timeWindows },
          { icon: CalendarDays, label: "Dias", value: activeDaysLabels },
        ].map((block) => (
          <div key={block.label} className="rounded-lg bg-muted/15 border border-border/25 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <block.icon className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-medium">{block.label}</span>
            </div>
            <p className="text-[13px] font-bold text-foreground truncate">{block.value}</p>
          </div>
        ))}
      </div>

      {/* Error Banner */}
      {conv.last_error && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-xs text-destructive font-medium truncate">{conv.last_error}</p>
        </div>
      )}

      {/* ── FOOTER: Actions ── */}
      <div className="px-4 py-3 border-t border-border/30 flex items-center gap-2">
        {normalizedStatus === "idle" || normalizedStatus === "completed" ? (
          <Button
            size="sm"
            onClick={() => handleAction("start")}
            disabled={isActionLoading}
            className="gap-1.5 h-8 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex-1"
          >
            {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Iniciar
          </Button>
        ) : normalizedStatus === "running" ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("pause")}
              disabled={isActionLoading}
              className="gap-1.5 h-8 px-3 border-amber-500/30 text-amber-500 dark:text-amber-400 hover:bg-amber-500/10 rounded-lg text-xs font-semibold flex-1"
            >
              <Pause className="w-3.5 h-3.5" />
              Pausar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isActionLoading}
                  className="gap-1.5 h-8 px-3 border-destructive/30 text-destructive hover:bg-destructive/10 rounded-lg text-xs font-semibold flex-1"
                >
                  <Square className="w-3.5 h-3.5" />
                  Parar
                </Button>
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
        ) : normalizedStatus === "paused" ? (
          <>
            <Button
              size="sm"
              onClick={() => handleAction("resume")}
              disabled={isActionLoading}
              className="gap-1.5 h-8 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retomar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("stop")}
              disabled={isActionLoading}
              className="gap-1.5 h-8 px-3 border-destructive/30 text-destructive hover:bg-destructive/10 rounded-lg text-xs font-semibold flex-1"
            >
              <Square className="w-3.5 h-3.5" />
              Parar
            </Button>
          </>
        ) : null}

        <div className="w-px h-6 bg-border/30" />

        <Button size="icon" variant="ghost" onClick={onEdit} className="w-8 h-8 text-muted-foreground/60 hover:text-foreground shrink-0">
          <Pencil className="w-3.5 h-3.5" />
        </Button>

        {(normalizedStatus === "idle" || normalizedStatus === "completed") && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground/40 hover:text-destructive shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
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
        )}

        <Button size="icon" variant="ghost" onClick={onToggleExpand} className="w-8 h-8 text-muted-foreground/50 hover:text-foreground shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <>
          <div className="mx-4 mb-3 rounded-xl border border-border/30 bg-muted/10 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-1">Chips participantes</p>
            <p className="text-sm text-foreground font-medium">{deviceNames || "Nenhum"}</p>
          </div>
          <div className="px-4 pb-3">
            <Button variant="ghost" size="sm" onClick={onSelectLogs} className="gap-2 w-full justify-center text-xs text-muted-foreground hover:text-foreground h-8">
              {showLogs ? "Ocultar logs" : "Ver logs"}
            </Button>
          </div>
          {showLogs && <ConversationLogs conversationId={conv.id} />}
        </>
      )}
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
              const isConnected = ["Connected", "Ready", "authenticated"].includes(device.status);
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => toggleDevice(device.id)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left ${
                    selected
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:border-border/80 hover:bg-muted/30"
                  }`}
                >
                  <Checkbox checked={selected} className="pointer-events-none" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{device.name}</p>
                    <p className="text-[11px] text-muted-foreground">{device.number || "Sem número"}</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
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
