import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  useWelcomeAutomations,
  useWelcomeAutomation,
  useCreateWelcomeAutomation,
  useUpdateWelcomeAutomation,
  useDeleteWelcomeAutomation,
  useWelcomeQueueStats,
  useWelcomeGroups,
  useWelcomeSenders,
} from "@/hooks/useWelcomeAutomation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { WelcomeMessageBuilder, WelcomeWhatsAppPreview, WELCOME_TYPE_OPTIONS, DEFAULT_WELCOME_PAYLOAD, type WelcomeMessagePayload, type WelcomeMessageType } from "@/components/welcome/WelcomeMessageEditor";
import { WelcomeStatsCards } from "@/components/welcome/WelcomeStatsCards";
import { WelcomeQueueTable } from "@/components/welcome/WelcomeQueueTable";
import { AutomationStatusBadge } from "@/components/welcome/WelcomeStatusBadge";
import { WelcomePerformanceDashboard } from "@/components/welcome/WelcomePerformanceDashboard";
import { WelcomeDeviceUsage } from "@/components/welcome/WelcomeDeviceUsage";
import { WelcomeSystemInfo } from "@/components/welcome/WelcomeSystemInfo";
import {
  Heart, Plus, Smartphone, Users, Send, Loader2, Trash2, ArrowLeft,
  Play, Pause, MessageSquare, Settings as SettingsIcon, Search, Check,
  UserPlus, ArrowRight, Sparkles, Shield, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Hook: load user devices ──
function useUserDevices() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["devices-for-welcome", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, profile_picture")
        .eq("user_id", user!.id)
        .neq("login_type", "report_wa")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

// ── Hook: load groups for monitoring device via UAZAPI ──
function useDeviceGroups(deviceId: string | undefined) {
  return useQuery({
    queryKey: ["device-groups-welcome", deviceId],
    queryFn: async () => {
      if (!deviceId) return [];
      const { data: device } = await supabase
        .from("devices")
        .select("uazapi_token, uazapi_base_url")
        .eq("id", deviceId)
        .single();
      if (!device?.uazapi_token || !device?.uazapi_base_url) return [];
      try {
        const res = await fetch(`${device.uazapi_base_url}/group/list?GetParticipants=false`, {
          headers: { token: device.uazapi_token, Accept: "application/json" },
        });
        if (!res.ok) return [];
        const body = await res.json();
        const groups = Array.isArray(body) ? body : body?.groups || body?.data || [];
        return groups
          .map((g: any) => ({
            id: g?.JID || g?.jid || g?.id || "",
            name: g?.Name || g?.name || g?.subject || g?.JID || "Grupo sem nome",
            participants: g?.ParticipantsCount || g?.participantsCount || 0,
          }))
          .filter((g: any) => g.id);
      } catch {
        return [];
      }
    },
    enabled: !!deviceId,
    staleTime: 60_000,
  });
}

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  active: { label: "Ativa", tone: "text-emerald-400" },
  paused: { label: "Pausada", tone: "text-yellow-400" },
};

// ══════════════════════════════════════════════════════════
// LIST VIEW
// ══════════════════════════════════════════════════════════
function AutomationsList({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void }) {
  const { data: automations, isLoading } = useWelcomeAutomations();
  const updateAutomation = useUpdateWelcomeAutomation();
  const deleteAutomation = useDeleteWelcomeAutomation();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500/20 to-rose-500/10 flex items-center justify-center border border-pink-500/20">
            <Heart className="w-5 h-5 text-pink-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Boas-vindas</h1>
            <p className="text-sm text-muted-foreground">Mensagem automática no privado para novos membros do grupo</p>
          </div>
        </div>
        <Button onClick={onCreate} className="gap-2 rounded-xl">
          <Plus className="w-4 h-4" /> Nova automação
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !automations?.length ? (
        <Card className="border-dashed border-border/50">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-pink-500/10 flex items-center justify-center">
              <Heart className="w-6 h-6 text-pink-400" />
            </div>
            <div className="max-w-sm space-y-1">
              <p className="text-base font-semibold">Nenhuma automação criada</p>
              <p className="text-sm text-muted-foreground">
                Crie sua primeira automação para enviar uma mensagem de boas-vindas no privado de cada pessoa que entrar no seu grupo.
              </p>
            </div>
            <Button onClick={onCreate} className="gap-2 rounded-xl">
              <Plus className="w-4 h-4" /> Criar automação
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {automations.map(a => {
            const isActive = a.status === "active";
            return (
              <Card key={a.id} className="border-border/40 hover:border-primary/40 transition-colors group">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => onOpen(a.id)} className="text-left flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{a.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Criada em {format(new Date(a.created_at), "dd/MM/yyyy")}
                      </p>
                    </button>
                    <AutomationStatusBadge status={a.status} />
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <MessageSquare className="w-3 h-3" />
                    <span className="truncate">{a.message_content?.slice(0, 60) || "Sem mensagem definida"}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={isActive}
                        onCheckedChange={v => updateAutomation.mutateAsync({ id: a.id, status: v ? "active" : "paused" }).then(() => toast.success(v ? "Ativada!" : "Pausada"))}
                      />
                      <span className="text-[11px] text-muted-foreground">{isActive ? "Ativa" : "Pausada"}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onOpen(a.id)}>
                        Abrir
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(a.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir automação?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita. Todo o histórico da fila será removido.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteAutomation.mutateAsync(confirmDelete).then(() => setConfirmDelete(null))}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// CREATE DIALOG
// ══════════════════════════════════════════════════════════
function CreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateWelcomeAutomation();
  const { data: devices } = useUserDevices();
  const [name, setName] = useState("");
  const [monitoringId, setMonitoringId] = useState<string>("");
  const [selectedGroups, setSelectedGroups] = useState<{ group_id: string; group_name: string }[]>([]);
  const [senderIds, setSenderIds] = useState<string[]>([]);
  const [payload, setPayload] = useState<WelcomeMessagePayload>(DEFAULT_WELCOME_PAYLOAD);
  const [groupSearch, setGroupSearch] = useState("");

  const { data: groups, isFetching: loadingGroups } = useDeviceGroups(monitoringId);

  const filteredGroups = useMemo(() => {
    const list = groups || [];
    if (!groupSearch) return list;
    const s = groupSearch.toLowerCase();
    return list.filter((g: any) => g.name.toLowerCase().includes(s));
  }, [groups, groupSearch]);

  useEffect(() => {
    if (!open) {
      setName(""); setMonitoringId(""); setSelectedGroups([]); setSenderIds([]);
      setPayload(DEFAULT_WELCOME_PAYLOAD); setGroupSearch("");
    }
  }, [open]);

  const toggleGroup = (g: { group_id: string; group_name: string }) => {
    setSelectedGroups(prev => prev.find(x => x.group_id === g.group_id)
      ? prev.filter(x => x.group_id !== g.group_id)
      : [...prev, g]);
  };

  const toggleSender = (id: string) => {
    setSenderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreate = async () => {
    if (!name.trim()) return toast.error("Dê um nome à automação");
    if (!monitoringId) return toast.error("Escolha o dispositivo monitor (que está nos grupos)");
    if (!selectedGroups.length) return toast.error("Selecione pelo menos 1 grupo");
    if (!senderIds.length) return toast.error("Selecione pelo menos 1 remetente para enviar no PV");

    if (payload.message_type === "media" && !payload.media_url.trim()) {
      return toast.error("Informe a URL da mídia");
    }
    if (payload.message_type === "carousel" && payload.carousel_cards.length === 0) {
      return toast.error("Adicione ao menos 1 card ao carrossel");
    }
    if (payload.message_type === "buttons" && payload.buttons.length === 0) {
      return toast.error("Adicione ao menos 1 botão");
    }
    if (payload.message_type !== "media" && !payload.message_content.trim()) {
      return toast.error("Escreva a mensagem de boas-vindas");
    }

    const created = await create.mutateAsync({
      name: name.trim(),
      monitoring_device_id: monitoringId,
      message_content: payload.message_type === "media" ? payload.media_caption : payload.message_content,
      message_type: payload.message_type,
      buttons: payload.buttons,
      carousel_cards: payload.carousel_cards,
      media_url: payload.media_url,
      media_caption: payload.media_caption,
      min_delay_seconds: payload.min_delay_seconds,
      max_delay_seconds: payload.max_delay_seconds,
      group_ids: selectedGroups,
      sender_device_ids: senderIds,
      settings: { status: "active" } as any,
    });
    if (created?.id) onCreated(created.id);
    onClose();
  };

  const monitorDevice = (devices || []).find((d: any) => d.id === monitoringId);
  const sendersValid = senderIds.length > 0;
  const groupsValid = selectedGroups.length > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[1200px] w-[95vw] h-[92vh] p-0 overflow-hidden flex flex-col gap-0 bg-background">
        {/* ── Header ── */}
        <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-center gap-3 text-base font-semibold">
            <div className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center">
              <Heart className="w-4 h-4 text-pink-500" />
            </div>
            <div className="flex flex-col">
              <span>Nova automação de Boas-vindas</span>
              <span className="text-[11px] font-normal text-muted-foreground">Configure a mensagem que será enviada para novos membros do grupo</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* ── Body: 2-column layout ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] min-h-0 overflow-hidden">

          {/* ═══ LEFT: Builder (main focus) ═══ */}
          <div className="min-w-0 overflow-y-auto px-8 py-6 border-r border-border/40">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full bg-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wider">Mensagem de boas-vindas</h3>
              </div>
              <WelcomeMessageBuilder value={payload} onChange={patch => setPayload(p => ({ ...p, ...patch }))} />
            </div>
          </div>

          {/* ═══ RIGHT: Settings sidebar ═══ */}
          <div className="min-w-0 overflow-y-auto bg-muted/20 px-5 py-6 space-y-5">

            {/* Name */}
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nome da automação</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Boas-vindas VIP"
                className="h-10 bg-background"
              />
            </div>

            {/* Monitor */}
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Smartphone className="w-3 h-3" /> Dispositivo monitor
              </Label>
              <Select value={monitoringId} onValueChange={setMonitoringId}>
                <SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Selecione um dispositivo" /></SelectTrigger>
                <SelectContent>
                  {(devices || []).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}{d.number ? ` · ${d.number}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Instância que está dentro dos grupos para detectar novos membros.
              </p>
            </div>

            {/* Groups (collapsible) */}
            {monitoringId && (
              <details className="group rounded-xl border border-border/40 bg-background overflow-hidden" open={!groupsValid}>
                <summary className="flex items-center gap-2 px-3 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold flex-1">Grupos monitorados</span>
                  <Badge variant={groupsValid ? "default" : "outline"} className="h-5 text-[10px] font-mono">
                    {selectedGroups.length}
                  </Badge>
                  <Plus className="w-3.5 h-3.5 text-muted-foreground transition-transform group-open:rotate-45" />
                </summary>
                <div className="border-t border-border/30 p-2 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={groupSearch}
                      onChange={e => setGroupSearch(e.target.value)}
                      placeholder="Buscar grupo..."
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/20">
                    {loadingGroups ? (
                      <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                    ) : !filteredGroups.length ? (
                      <p className="text-[11px] text-muted-foreground p-4 text-center">Nenhum grupo encontrado.</p>
                    ) : (
                      filteredGroups.map((g: any) => {
                        const checked = !!selectedGroups.find(x => x.group_id === g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => toggleGroup({ group_id: g.id, group_name: g.name })}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-muted/40 text-left text-xs"
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-border"}`}>
                              {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                            </div>
                            <span className="flex-1 truncate">{g.name}</span>
                            {g.participants > 0 && <span className="text-[9px] text-muted-foreground">{g.participants}</span>}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </details>
            )}

            {/* Senders (collapsible) */}
            <details className="group rounded-xl border border-border/40 bg-background overflow-hidden" open={!sendersValid}>
              <summary className="flex items-center gap-2 px-3 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors">
                <Send className="w-3.5 h-3.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">Remetentes</p>
                  {sendersValid && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {senderIds.length} dispositivo{senderIds.length !== 1 ? "s" : ""} selecionado{senderIds.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                <Badge variant={sendersValid ? "default" : "outline"} className="h-5 text-[10px] font-mono">
                  {senderIds.length}
                </Badge>
                <Plus className="w-3.5 h-3.5 text-muted-foreground transition-transform group-open:rotate-45" />
              </summary>
              <div className="border-t border-border/30 p-2 space-y-2">
                <p className="text-[10px] text-muted-foreground px-1 leading-relaxed">
                  Dispositivos que enviarão a mensagem no privado, em rodízio.
                </p>
                <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/20">
                  {!devices?.length ? (
                    <p className="text-[11px] text-muted-foreground p-4 text-center">Nenhum dispositivo disponível.</p>
                  ) : (
                    devices.map((d: any) => {
                      const checked = senderIds.includes(d.id);
                      const online = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"].includes(d.status);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => toggleSender(d.id)}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-muted/40 text-left text-xs"
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-border"}`}>
                            {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <span className="flex-1 truncate">{d.name}{d.number ? ` · ${d.number}` : ""}</span>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </details>

            {/* Status summary */}
            <div className="rounded-xl border border-border/40 bg-background p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resumo</p>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tipo</span>
                  <Badge variant="outline" className="h-5 text-[10px] font-mono uppercase">{payload.message_type}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Delay</span>
                  <span className="font-mono">{payload.min_delay_seconds}–{payload.max_delay_seconds}s</span>
                </div>
                {monitorDevice && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Monitor</span>
                    <span className="truncate max-w-[160px] text-right">{monitorDevice.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <DialogFooter className="border-t border-border/40 px-6 py-3 shrink-0 bg-muted/10">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={create.isPending} className="gap-2 min-w-[140px]">
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Criar automação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════
// DETAIL VIEW
// ══════════════════════════════════════════════════════════
function AutomationDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: automation, isLoading } = useWelcomeAutomation(id);
  const update = useUpdateWelcomeAutomation();
  const stats = useWelcomeQueueStats(id);
  const { data: groups } = useWelcomeGroups(id);
  const { data: senders } = useWelcomeSenders(id);

  const [msgPayload, setMsgPayload] = useState<WelcomeMessagePayload>(DEFAULT_WELCOME_PAYLOAD);
  const [minDelay, setMinDelay] = useState(30);
  const [maxDelay, setMaxDelay] = useState(60);
  const [startHour, setStartHour] = useState("08:00");
  const [endHour, setEndHour] = useState("20:00");

  useEffect(() => {
    if (automation) {
      const a: any = automation;
      setMsgPayload({
        message_type: (a.message_type as any) || "text",
        message_content: a.message_content || "",
        buttons: Array.isArray(a.buttons) ? a.buttons : [],
        carousel_cards: Array.isArray(a.carousel_cards) ? a.carousel_cards : [],
        media_url: a.media_url || "",
        media_caption: a.media_caption || "",
        media_kind: null,
        min_delay_seconds: a.min_delay_seconds ?? 30,
        max_delay_seconds: a.max_delay_seconds ?? 60,
      });
      setMinDelay(automation.min_delay_seconds);
      setMaxDelay(automation.max_delay_seconds);
      setStartHour((automation.send_start_hour || "08:00").slice(0, 5));
      setEndHour((automation.send_end_hour || "20:00").slice(0, 5));
    }
  }, [automation]);

  if (isLoading || !automation) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const isActive = automation.status === "active";

  const saveMessage = () =>
    update.mutateAsync({
      id,
      message_type: msgPayload.message_type,
      message_content: msgPayload.message_type === "media" ? msgPayload.media_caption : msgPayload.message_content,
      buttons: msgPayload.buttons,
      carousel_cards: msgPayload.carousel_cards,
      media_url: msgPayload.media_url,
      media_caption: msgPayload.media_caption,
      min_delay_seconds: msgPayload.min_delay_seconds,
      max_delay_seconds: Math.max(msgPayload.max_delay_seconds, msgPayload.min_delay_seconds),
    } as any).then(() => toast.success("Mensagem atualizada!"));

  const saveSchedule = () => update.mutateAsync({
    id,
    min_delay_seconds: minDelay,
    max_delay_seconds: Math.max(maxDelay, minDelay),
    send_start_hour: `${startHour}:00`,
    send_end_hour: `${endHour}:00`,
  } as any).then(() => toast.success("Agenda atualizada!"));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Voltar</Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{automation.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <AutomationStatusBadge status={automation.status} />
              <span className="text-[11px] text-muted-foreground">
                {(groups || []).length} grupo(s) · {(senders || []).length} remetente(s)
              </span>
            </div>
          </div>
        </div>
        <Button
          variant={isActive ? "outline" : "default"}
          onClick={() => update.mutateAsync({ id, status: isActive ? "paused" : "active" }).then(() => toast.success(isActive ? "Pausada" : "Ativada!"))}
          className="gap-2"
        >
          {isActive ? <><Pause className="w-4 h-4" /> Pausar</> : <><Play className="w-4 h-4" /> Ativar</>}
        </Button>
      </div>

      {/* Performance dashboard */}
      <WelcomePerformanceDashboard automationId={id} />

      {/* Stats */}
      <WelcomeStatsCards stats={stats} />

      {/* System info — explains intelligence to the user */}
      <WelcomeSystemInfo />

      {/* Tabs */}
      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Fila</TabsTrigger>
          <TabsTrigger value="devices" className="gap-1.5"><Smartphone className="w-3.5 h-3.5" /> Dispositivos</TabsTrigger>
          <TabsTrigger value="message" className="gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Mensagem</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><SettingsIcon className="w-3.5 h-3.5" /> Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <WelcomeQueueTable automationId={id} maxRetries={automation.max_retries || 3} />
        </TabsContent>

        <TabsContent value="devices" className="space-y-4">
          <WelcomeDeviceUsage automationId={id} maxPerAccount={automation.max_per_account || 200} />
        </TabsContent>

        <TabsContent value="message" className="space-y-4">
          <Card className="border-border/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" /> Mensagem enviada no PV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <WelcomeMessageBuilder value={msgPayload} onChange={patch => setMsgPayload(p => ({ ...p, ...patch }))} />
              <div className="flex justify-end">
                <Button onClick={saveMessage} disabled={update.isPending} className="gap-2">
                  {update.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar mensagem
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card className="border-border/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <SettingsIcon className="w-4 h-4 text-primary" /> Delays e janela de envio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Delay mínimo entre envios: <span className="text-primary font-semibold">{minDelay}s</span></Label>
                  <Slider value={[minDelay]} onValueChange={v => setMinDelay(v[0])} min={5} max={300} step={5} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Delay máximo entre envios: <span className="text-primary font-semibold">{maxDelay}s</span></Label>
                  <Slider value={[maxDelay]} onValueChange={v => setMaxDelay(v[0])} min={5} max={600} step={5} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Início do envio (BRT)</Label>
                  <Input type="time" value={startHour} onChange={e => setStartHour(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Fim do envio (BRT)</Label>
                  <Input type="time" value={endHour} onChange={e => setEndHour(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveSchedule} disabled={update.isPending} className="gap-2">
                  {update.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar configurações
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Grupos monitorados ({(groups || []).length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!groups?.length ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Nenhum grupo configurado.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {groups.map((g: any) => (
                    <Badge key={g.id} variant="outline" className="text-[11px] gap-1.5">
                      <Users className="w-3 h-3" /> {g.group_name || g.group_id.slice(0, 12)}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" /> Remetentes ({(senders || []).length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!senders?.length ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Nenhum remetente configurado.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {senders.map((s: any) => (
                    <Badge key={s.id} variant="outline" className="text-[11px] gap-1.5">
                      <Smartphone className="w-3 h-3" /> {s.device_id.slice(0, 8)}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════
export default function WelcomeAutomationPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  if (openId) {
    return <AutomationDetail id={openId} onBack={() => setOpenId(null)} />;
  }

  return (
    <>
      <AutomationsList onOpen={setOpenId} onCreate={() => setCreateOpen(true)} />
      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={id => setOpenId(id)} />
    </>
  );
}
