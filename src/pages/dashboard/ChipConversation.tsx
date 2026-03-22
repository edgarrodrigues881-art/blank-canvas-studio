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

function useDevices() {
  return useQuery({
    queryKey: ["devices_for_conversation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .order("name");
      if (error) throw error;
      return data || [];
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
              devices={devices}
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
        <div className="space-y-4">
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
}: {
  conversation: ChipConversation;
  devices: any[];
  actions: ReturnType<typeof useChipConversationActions>;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelectLogs: () => void;
  showLogs: boolean;
}) {
  const status = STATUS_MAP[conv.status] || STATUS_MAP.idle;
  const StatusIcon = status.icon;
  const deviceNames = (conv.device_ids || [])
    .map((id) => devices.find((d) => d.id === id)?.name || "???")
    .join(", ");

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
        "Conversa encerrada"
      );
    } catch (e: any) {
      toast.error(e.message || "Erro na operação");
    }
  };

  const isActionLoading = actions.start.isPending || actions.pause.isPending ||
    actions.resume.isPending || actions.stop.isPending;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground truncate">{conv.name}</h3>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${status.color}`}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {status.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Smartphone className="w-3 h-3" />
              {(conv.device_ids || []).length} chips
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />
              {conv.total_messages_sent} enviadas
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {conv.start_hour} - {conv.end_hour}
            </span>
          </div>
          {conv.last_error && (
            <p className="text-[11px] text-destructive mt-1 truncate">
              ⚠ {conv.last_error}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {conv.status === "idle" || conv.status === "completed" ? (
            <Button size="sm" onClick={() => handleAction("start")} disabled={isActionLoading} className="gap-1.5">
              {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Iniciar
            </Button>
          ) : conv.status === "running" ? (
            <>
              <Button size="sm" variant="outline" onClick={() => handleAction("pause")} disabled={isActionLoading} className="gap-1.5">
                <Pause className="w-3.5 h-3.5" />
                Pausar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={isActionLoading} className="gap-1.5">
                    <Square className="w-3.5 h-3.5" />
                    Parar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Parar conversa?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A conversa será encerrada e os chips pararão de trocar mensagens.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleAction("stop")}>Parar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : conv.status === "paused" ? (
            <>
              <Button size="sm" onClick={() => handleAction("resume")} disabled={isActionLoading} className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                Retomar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleAction("stop")} disabled={isActionLoading} className="gap-1.5">
                <Square className="w-3.5 h-3.5" />
                Parar
              </Button>
            </>
          ) : null}

          <Button size="icon" variant="ghost" onClick={onToggleExpand} className="w-8 h-8">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <>
          <Separator />
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-1">Chips participantes</p>
              <p className="text-foreground font-medium">{deviceNames || "Nenhum"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Delay entre mensagens</p>
              <p className="text-foreground font-medium">{conv.min_delay_seconds}s - {conv.max_delay_seconds}s</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Pausa após mensagens</p>
              <p className="text-foreground font-medium">
                A cada {conv.pause_after_messages_min}-{conv.pause_after_messages_max} msgs → pausa de {conv.pause_duration_min}s-{conv.pause_duration_max}s
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Duração total</p>
              <p className="text-foreground font-medium">{conv.duration_hours}h {conv.duration_minutes}min</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Msgs por ciclo</p>
              <p className="text-foreground font-medium">{conv.messages_per_cycle_min} - {conv.messages_per_cycle_max}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Dias ativos</p>
              <p className="text-foreground font-medium">
                {(conv.active_days || []).map((d) => DAY_OPTIONS.find((o) => o.key === d)?.label || d).join(", ")}
              </p>
            </div>
          </div>

          {/* Logs toggle */}
          <Separator />
          <div className="p-3">
            <Button variant="ghost" size="sm" onClick={onSelectLogs} className="gap-2 w-full justify-center">
              <ScrollArea className="w-4 h-4" />
              {showLogs ? "Ocultar logs" : "Ver logs de mensagens"}
            </Button>
          </div>

          {showLogs && <ConversationLogs conversationId={conv.id} />}
        </>
      )}
    </Card>
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
}: {
  devices: any[];
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("Conversa automática");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [minDelay, setMinDelay] = useState(15);
  const [maxDelay, setMaxDelay] = useState(60);
  const [pauseAfterMin, setPauseAfterMin] = useState(4);
  const [pauseAfterMax, setPauseAfterMax] = useState(8);
  const [pauseDurationMin, setPauseDurationMin] = useState(120);
  const [pauseDurationMax, setPauseDurationMax] = useState(300);
  const [durationHours, setDurationHours] = useState(1);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [startHour, setStartHour] = useState("08:00");
  const [endHour, setEndHour] = useState("18:00");
  const [msgsMin, setMsgsMin] = useState(10);
  const [msgsMax, setMsgsMax] = useState(30);
  const [activeDays, setActiveDays] = useState(["mon", "tue", "wed", "thu", "fri"]);

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
    onSubmit({
      name,
      device_ids: selectedDevices,
      min_delay_seconds: minDelay,
      max_delay_seconds: maxDelay,
      pause_after_messages_min: pauseAfterMin,
      pause_after_messages_max: pauseAfterMax,
      pause_duration_min: pauseDurationMin,
      pause_duration_max: pauseDurationMax,
      duration_hours: durationHours,
      duration_minutes: durationMinutes,
      start_hour: startHour,
      end_hour: endHour,
      messages_per_cycle_min: msgsMin,
      messages_per_cycle_max: msgsMax,
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Pausa após (mín msgs)</Label>
            <Input type="number" min={2} value={pauseAfterMin} onChange={(e) => setPauseAfterMin(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Pausa após (máx msgs)</Label>
            <Input type="number" min={3} value={pauseAfterMax} onChange={(e) => setPauseAfterMax(Number(e.target.value))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Duração da pausa mín (seg)</Label>
            <Input type="number" min={30} value={pauseDurationMin} onChange={(e) => setPauseDurationMin(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Duração da pausa máx (seg)</Label>
            <Input type="number" min={60} value={pauseDurationMax} onChange={(e) => setPauseDurationMax(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Duration & Schedule */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          Duração e Agenda
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Duração (horas)</Label>
            <Input type="number" min={0} value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Duração (minutos)</Label>
            <Input type="number" min={0} max={59} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Horário de início</Label>
            <Input type="time" value={startHour} onChange={(e) => setStartHour(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Horário de término</Label>
            <Input type="time" value={endHour} onChange={(e) => setEndHour(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Msgs por ciclo (mín)</Label>
            <Input type="number" min={5} value={msgsMin} onChange={(e) => setMsgsMin(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Msgs por ciclo (máx)</Label>
            <Input type="number" min={10} value={msgsMax} onChange={(e) => setMsgsMax(Number(e.target.value))} />
          </div>
        </div>

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
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Criar Conversa
      </Button>
    </div>
  );
}
