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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { WelcomeMessageBuilder, WelcomeWhatsAppPreview, WELCOME_TYPE_OPTIONS, DEFAULT_WELCOME_PAYLOAD, getUiModeFromPayload, deriveBackendMessageType, type WelcomeMessagePayload, type WelcomeMessageType, type WelcomeUiMode } from "@/components/welcome/WelcomeMessageEditor";
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

    const finalType = deriveBackendMessageType(payload);

    if (finalType === "carousel" && payload.carousel_cards.length === 0) {
      return toast.error("Adicione ao menos 1 card ao carrossel");
    }
    if (finalType !== "carousel" && !payload.message_content.trim() && !payload.media_url.trim()) {
      return toast.error("Escreva uma mensagem ou adicione uma mídia");
    }
    // If a button slot is open but empty, block (composable rule: button needs label)
    if (finalType === "buttons" && payload.buttons.some(b => !b.text.trim())) {
      return toast.error("Preencha o texto de todos os botões ou remova-os");
    }

    const created = await create.mutateAsync({
      name: name.trim(),
      monitoring_device_id: monitoringId,
      // When the message has media, the text becomes the caption; otherwise it's the body.
      message_content: finalType === "media" ? (payload.message_content || payload.media_caption) : payload.message_content,
      message_type: finalType,
      buttons: payload.buttons,
      carousel_cards: payload.carousel_cards,
      media_url: payload.media_url,
      media_caption: finalType === "media" ? (payload.message_content || payload.media_caption) : payload.media_caption,
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

  // ── Stepper state ──
  const [step, setStep] = useState<1 | 2 | 3>(1);
  useEffect(() => { if (!open) setStep(1); }, [open]);

  const step1Valid = name.trim().length > 0 && !!monitoringId && groupsValid;
  const step2Valid = (() => {
    const t = deriveBackendMessageType(payload);
    if (t === "carousel") return payload.carousel_cards.length > 0;
    return payload.message_content.trim().length > 0 || payload.media_url.trim().length > 0;
  })();
  const step3Valid = sendersValid;

  const steps = [
    { n: 1 as const, title: "Configuração", desc: "Nome, grupos e monitor", icon: SettingsIcon, valid: step1Valid },
    { n: 2 as const, title: "Mensagem", desc: "Construa o conteúdo", icon: MessageSquare, valid: step2Valid },
    { n: 3 as const, title: "Envio", desc: "Delays e remetentes", icon: Send, valid: step3Valid },
  ];

  const goNext = () => setStep(s => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  const goBack = () => setStep(s => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[960px] w-[95vw] h-[85vh] max-h-[85vh] p-0 overflow-hidden flex flex-col gap-0 bg-[hsl(0_0%_8%)] border-[hsl(0_0%_14%)] shadow-2xl">

        {/* ═══════ HEADER ═══════ */}
        <DialogHeader className="relative px-7 pt-6 pb-5 shrink-0 bg-[hsl(0_0%_8%)]">
          <DialogTitle className="text-[18px] font-semibold text-white leading-tight tracking-tight">
            Criar automação de boas-vindas
          </DialogTitle>
          <p className="text-[12.5px] text-[#aaa] mt-1 leading-relaxed">
            Mensagens automáticas com distribuição inteligente
          </p>

          {/* Flow concept — monochrome pills with arrow line */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[hsl(0_0%_18%)] bg-transparent">
              <UserPlus className="w-3 h-3 text-[#aaa]" />
              <span className="text-[10.5px] font-medium text-[#ccc]">Alguém entra no grupo</span>
            </span>
            <div className="flex items-center gap-1 text-[#555]">
              <span className="h-px w-4 bg-[hsl(0_0%_22%)]" />
              <ArrowRight className="w-3 h-3" />
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[hsl(0_0%_18%)] bg-transparent">
              <Send className="w-3 h-3 text-[#aaa]" />
              <span className="text-[10.5px] font-medium text-[#ccc]">Recebe mensagem no privado</span>
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[hsl(0_0%_18%)] text-[#888]">
              <Shield className="w-3 h-3" />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em]">Anti-bloqueio</span>
            </span>
          </div>
        </DialogHeader>

        {/* ═══════ BODY — 55% form / 45% preview, subtle divider ═══════ */}
        <div className="relative flex-1 grid grid-cols-1 lg:grid-cols-[55fr_45fr] min-h-0 overflow-hidden">

          {/* ═══ COL 1: Form panel ═══ */}
          <div className="min-w-0 flex flex-col min-h-0 overflow-hidden bg-[hsl(0_0%_9%)] lg:border-r lg:border-[hsl(0_0%_13%)]">
            {/* ─── Minimal numbered step indicator (top of form) ─── */}
            <div className="px-7 pt-5 pb-3 shrink-0">
              <nav aria-label="Progresso" className="flex items-center gap-2">
                {steps.map((s, idx) => {
                  const active = step === s.n;
                  const past = step > s.n;
                  return (
                    <div key={s.n} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setStep(s.n)}
                        aria-label={`Etapa ${s.n}: ${s.title}`}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10.5px] font-medium transition-all duration-200 focus:outline-none ${
                          active
                            ? "bg-[hsl(152_45%_42%)] text-white"
                            : past
                            ? "bg-transparent text-[#666] hover:text-[#999]"
                            : "bg-transparent text-[#555] border border-[hsl(0_0%_18%)] hover:border-[hsl(0_0%_28%)]"
                        }`}
                      >
                        {past ? <Check className="w-3 h-3" strokeWidth={2.5} /> : s.n}
                      </button>
                      {idx < steps.length - 1 && (
                        <div className={`h-px w-6 transition-colors ${past ? "bg-[hsl(0_0%_22%)]" : "bg-[hsl(0_0%_15%)]"}`} />
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>

            {/* ─── Scrollable content area ─── */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <div className="px-7 py-5 animate-in fade-in-50 slide-in-from-right-2 duration-300" key={step}>

                {/* Step header */}
                <div className="mb-6">
                  <h2 className="text-[17px] font-semibold text-white tracking-tight">{steps[step - 1].title}</h2>
                  <p className="text-[12px] text-[#888] mt-0.5">{steps[step - 1].desc}</p>
                </div>

              {/* ──────── STEP 1 ──────── */}
              {step === 1 && (
                <div className="space-y-8">
                  {/* Name — large, prominent, underline style */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Nome da automação
                    </Label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Boas-vindas VIP"
                      className="w-full bg-transparent border-0 border-b border-border/60 px-0 py-2.5 text-xl font-semibold text-foreground placeholder:text-muted-foreground/40 placeholder:font-normal focus:outline-none focus:border-emerald-500 transition-colors duration-200"
                    />
                  </div>

                  {/* Type selector — sleek pill toggle */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Tipo de mensagem
                    </Label>
                    <div className="inline-flex p-1 rounded-lg bg-muted/40 border border-border/40">
                      {WELCOME_TYPE_OPTIONS.map(opt => {
                        const currentMode = getUiModeFromPayload(payload);
                        const active = currentMode === opt.value;
                        const Icon = opt.icon;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPayload(p => {
                              if (opt.value === "carousel") return { ...p, message_type: "carousel" };
                              const derived = deriveBackendMessageType({ ...p, message_type: "text" });
                              return { ...p, message_type: derived };
                            })}
                            className={`relative inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-[12.5px] font-medium transition-all duration-200 ${
                              active
                                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Monitor — modern select, custom arrow */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
                      <Smartphone className="w-3 h-3" /> Dispositivo monitor
                    </Label>
                    <Select value={monitoringId} onValueChange={setMonitoringId}>
                      <SelectTrigger className="h-11 bg-transparent border-0 border-b border-border/60 rounded-none px-0 text-sm font-medium hover:border-foreground/40 focus:border-emerald-500 focus:ring-0 focus:ring-offset-0 transition-colors duration-200 [&>svg]:text-muted-foreground [&>svg]:opacity-100">
                        <SelectValue placeholder="Selecione o dispositivo nos grupos" />
                      </SelectTrigger>
                      <SelectContent>
                        {(devices || []).map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}{d.number ? ` · ${d.number}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                      Detecta novos membros entrando nos grupos selecionados.
                    </p>
                  </div>

                  {monitoringId && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
                          <Users className="w-3 h-3" /> Grupos monitorados
                        </Label>
                        <span className={`text-[10px] font-mono font-medium transition-colors ${groupsValid ? "text-emerald-500" : "text-muted-foreground"}`}>
                          {selectedGroups.length} selecionado{selectedGroups.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="border-b border-border/60">
                        <div className="relative">
                          <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            value={groupSearch}
                            onChange={e => setGroupSearch(e.target.value)}
                            placeholder="Buscar grupo..."
                            className="w-full pl-6 pr-2 py-2.5 bg-transparent border-0 text-sm placeholder:text-muted-foreground/50 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto -mx-1">
                        {loadingGroups ? (
                          <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                        ) : !filteredGroups.length ? (
                          <p className="text-[12px] text-muted-foreground p-6 text-center">Nenhum grupo encontrado.</p>
                        ) : (
                          filteredGroups.map((g: any) => {
                            const checked = !!selectedGroups.find(x => x.group_id === g.id);
                            return (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => toggleGroup({ group_id: g.id, group_name: g.name })}
                                className="w-full flex items-center gap-3 px-1 py-2 hover:bg-muted/30 rounded-md text-left text-xs transition-all duration-150 group"
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all duration-200 ${checked ? "bg-emerald-500 border-emerald-500" : "border-border group-hover:border-foreground/40 bg-transparent"}`}>
                                  {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                </div>
                                <span className="flex-1 truncate text-[13px] text-foreground/90">{g.name}</span>
                                {g.participants > 0 && <span className="text-[10px] text-muted-foreground font-mono">{g.participants}</span>}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ──────── STEP 2 ──────── */}
              {step === 2 && (
                <div className="space-y-3">
                  <WelcomeMessageBuilder
                    value={payload}
                    onChange={patch => setPayload(p => ({ ...p, ...patch }))}
                    hideTypeSelector
                    hidePreview
                  />
                  <p className="text-[10.5px] text-[#666]">
                    A pré-visualização ao lado atualiza em tempo real.
                  </p>
                </div>
              )}

              {/* ──────── STEP 3 ──────── */}
              {step === 3 && (
                <div className="space-y-8">
                  {/* Delay sliders */}
                  <div className="space-y-4">
                    <div>
                      <Label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888]">
                        Delay entre envios
                      </Label>
                      <p className="text-[11px] text-[#666] mt-1">Tempo aleatório aplicado entre cada mensagem.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <div className="flex items-baseline justify-between">
                          <Label className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#888]">Mínimo</Label>
                          <span className="text-base font-semibold tabular-nums text-white">
                            {payload.min_delay_seconds}<span className="text-[10px] text-[#666] font-normal ml-0.5">s</span>
                          </span>
                        </div>
                        <Slider
                          value={[payload.min_delay_seconds]}
                          onValueChange={v => setPayload(p => ({ ...p, min_delay_seconds: v[0] }))}
                          min={5} max={300} step={5}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-baseline justify-between">
                          <Label className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#888]">Máximo</Label>
                          <span className="text-base font-semibold tabular-nums text-white">
                            {payload.max_delay_seconds}<span className="text-[10px] text-[#666] font-normal ml-0.5">s</span>
                          </span>
                        </div>
                        <Slider
                          value={[payload.max_delay_seconds]}
                          onValueChange={v => setPayload(p => ({ ...p, max_delay_seconds: Math.max(v[0], payload.min_delay_seconds) }))}
                          min={5} max={600} step={5}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Senders */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888]">
                        Remetentes
                      </Label>
                      <span className={`text-[10px] font-mono ${sendersValid ? "text-[hsl(152_45%_52%)]" : "text-[#666]"}`}>
                        {senderIds.length} selecionado{senderIds.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="max-h-72 overflow-y-auto custom-scrollbar -mx-1">
                      {!devices?.length ? (
                        <p className="text-[12px] text-[#666] py-6 text-center">Nenhum dispositivo disponível.</p>
                      ) : (
                        devices.map((d: any) => {
                          const checked = senderIds.includes(d.id);
                          const online = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"].includes(d.status);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => toggleSender(d.id)}
                              className="w-full flex items-center gap-3 px-1 py-2.5 hover:bg-[hsl(0_0%_11%)] rounded-md text-left text-xs transition-colors group"
                            >
                              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-[hsl(152_45%_42%)] border-[hsl(152_45%_42%)]" : "border-[hsl(0_0%_22%)] group-hover:border-[hsl(0_0%_32%)]"}`}>
                                {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                              </div>
                              <span className="flex-1 truncate text-[12.5px] text-[#ddd]">{d.name}{d.number ? <span className="text-[#666]"> · {d.number}</span> : ""}</span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-[hsl(152_45%_52%)]" : "bg-[#444]"}`} />
                                <span className={`text-[10px] ${online ? "text-[hsl(152_45%_52%)]" : "text-[#666]"}`}>
                                  {online ? "Online" : "Offline"}
                                </span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Final summary — flat, monochrome */}
                  <div className="pt-4 border-t border-[hsl(0_0%_13%)]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888] mb-3">
                      Resumo
                    </p>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[12px]">
                      <div className="flex items-center justify-between">
                        <span className="text-[#888]">Modo</span>
                        <span className="font-medium text-white capitalize">{getUiModeFromPayload(payload)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#888]">Delay</span>
                        <span className="font-mono text-white">{payload.min_delay_seconds}–{payload.max_delay_seconds}s</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#888]">Grupos</span>
                        <span className="font-medium text-white">{selectedGroups.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#888]">Remetentes</span>
                        <span className="font-medium text-white">{senderIds.length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>

          {/* ═══ COL 2: Persistent preview ═══ */}
          <aside className="relative hidden lg:flex flex-col bg-[hsl(0_0%_5.5%)] px-6 py-6 overflow-hidden">
            {/* Soft green radial glow behind phone */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 60% 50% at 50% 45%, hsla(152, 60%, 45%, 0.15), transparent 70%)",
              }}
            />

            <div className="relative flex items-center justify-end mb-4">
              <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-[#9aa0a6]">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-[hsl(152_60%_50%)] opacity-75 animate-ping" />
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-[hsl(152_60%_50%)]" />
                </span>
                ao vivo
              </span>
            </div>

            <div className="relative flex-1 flex items-start justify-center pt-2">
              <div
                key={JSON.stringify({
                  t: payload.message_type,
                  c: payload.message_content,
                  m: payload.media_url,
                  cards: payload.carousel_cards?.length,
                })}
                className="animate-in fade-in-0 duration-300"
              >
                <MinimalPhonePreview payload={payload} height={540} />
              </div>
            </div>
          </aside>
        </div>

        {/* ═══════ FOOTER ═══════ */}
        <DialogFooter className="relative px-7 py-3.5 shrink-0 bg-[hsl(0_0%_8%)] border-t border-[hsl(0_0%_13%)] flex-row sm:justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-[12.5px] text-[#888] hover:text-white transition-colors px-1"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-4">
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1 text-[12.5px] text-[#888] hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
                className="px-5 h-9 rounded-full bg-[hsl(152_45%_42%)] hover:bg-[hsl(152_45%_48%)] text-white text-[12.5px] font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Continuar
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                disabled={create.isPending}
                className="px-5 h-9 rounded-full bg-[hsl(152_45%_42%)] hover:bg-[hsl(152_45%_48%)] text-white text-[12.5px] font-medium transition-colors disabled:opacity-30 inline-flex items-center gap-2"
              >
                {create.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Criar automação
              </button>
            )}
          </div>
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

  const saveMessage = () => {
    const finalType = deriveBackendMessageType(msgPayload);
    return update.mutateAsync({
      id,
      message_type: finalType,
      message_content: finalType === "media" ? (msgPayload.message_content || msgPayload.media_caption) : msgPayload.message_content,
      buttons: msgPayload.buttons,
      carousel_cards: msgPayload.carousel_cards,
      media_url: msgPayload.media_url,
      media_caption: finalType === "media" ? (msgPayload.message_content || msgPayload.media_caption) : msgPayload.media_caption,
      min_delay_seconds: msgPayload.min_delay_seconds,
      max_delay_seconds: Math.max(msgPayload.max_delay_seconds, msgPayload.min_delay_seconds),
    } as any).then(() => toast.success("Mensagem atualizada!"));
  };

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

// ══════════════════════════════════════════════════════════
// MINIMAL PHONE PREVIEW — sleek frame, WhatsApp dark chat
// ══════════════════════════════════════════════════════════
function MinimalPhonePreview({ payload, height = 540 }: { payload: WelcomeMessagePayload; height?: number }) {
  const screenH = height;
  const screenW = Math.round(height * 0.49);
  const radius = 40;

  // WhatsApp dark palette
  const waBg = "#0b141a";
  const waHeader = "#1f2c34";
  const waBubbleSent = "#005c4b";
  const waText = "#e9edef";
  const waSubtext = "#8696a0";

  const renderedHtml = (payload.message_content || "")
    .replace(/\*(.*?)\*/g, "<b>$1</b>")
    .replace(/_(.*?)_/g, "<i>$1</i>")
    .replace(/~(.*?)~/g, "<s>$1</s>")
    .replace(/\{\{(\w+)\}\}/g, '<span style="color:#6ee7b7">{{$1}}</span>');

  return (
    <div className="relative mx-auto select-none" style={{ width: screenW + 8 }}>
      {/* Phone chassis — thin dark bezel, no buttons */}
      <div
        className="relative mx-auto overflow-hidden"
        style={{
          width: screenW + 8,
          height: screenH + 8,
          borderRadius: radius,
          background: "#0a0a0c",
          boxShadow:
            "0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px hsla(0,0%,100%,0.05), inset 0 0 0 1px hsla(0,0%,100%,0.04)",
          padding: 4,
        }}
      >
        {/* Inner screen */}
        <div
          className="relative w-full h-full overflow-hidden"
          style={{ borderRadius: radius - 6, background: waBg }}
        >
          {/* Status bar — time + battery only */}
          <div
            className="relative z-20 flex items-center justify-between px-5 pt-2 pb-1"
            style={{ height: 26, color: waText }}
          >
            <span className="text-[11px] font-semibold tabular-nums tracking-tight">9:41</span>
            <div className="flex items-center">
              <div
                className="relative"
                style={{
                  width: 22,
                  height: 11,
                  border: "1px solid rgba(255,255,255,0.55)",
                  borderRadius: 3,
                }}
              >
                <div
                  className="absolute top-[1px] left-[1px] bottom-[1px] rounded-[1.5px]"
                  style={{ width: "82%", background: waText }}
                />
              </div>
              <div className="ml-[1px] w-[1.5px] h-[5px] rounded-r" style={{ background: "rgba(255,255,255,0.55)" }} />
            </div>
          </div>

          {/* WhatsApp header */}
          <div
            className="relative z-10 flex items-center gap-2.5 px-3 py-2"
            style={{ background: waHeader, color: waText }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #25d366, #128c7e)" }}
            >
              GV
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-[12.5px] font-semibold truncate" style={{ color: waText }}>
                Grupo VIP
              </p>
              <p className="text-[10px] truncate" style={{ color: waSubtext }}>
                online
              </p>
            </div>
          </div>

          {/* Chat area */}
          <div
            className="relative px-3 py-3"
            style={{
              height: `calc(100% - 26px - 44px)`,
              background: waBg,
              backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><g fill='%23182229' fill-opacity='0.45'><circle cx='30' cy='30' r='1.8'/><circle cx='110' cy='40' r='2'/><circle cx='160' cy='90' r='1.5'/><circle cx='40' cy='150' r='1.5'/><circle cx='130' cy='160' r='2'/><circle cx='90' cy='110' r='1.6'/></g></svg>")`,
              backgroundSize: "220px 220px",
            }}
          >
            <div className="flex justify-center mb-3">
              <div
                className="px-2.5 py-0.5 rounded-md text-[9.5px] font-medium"
                style={{ background: waHeader, color: waSubtext }}
              >
                HOJE
              </div>
            </div>

            <div className="flex flex-col items-end">
              {/* Sender name above bubble */}
              <span
                className="text-[10px] mb-0.5 mr-1 font-medium"
                style={{ color: waSubtext }}
              >
                Você
              </span>

              <div className="max-w-[85%]">
                <div
                  className="relative rounded-lg shadow-sm"
                  style={{
                    background: waBubbleSent,
                    color: waText,
                    borderTopRightRadius: 4,
                  }}
                >
                  <div className="px-2.5 py-1.5">
                    <div
                      className="text-[13px] leading-snug whitespace-pre-wrap break-words"
                      style={{ color: waText }}
                    >
                      {payload.message_content ? (
                        <span dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                      ) : (
                        <span style={{ color: "rgba(233,237,239,0.45)", fontStyle: "italic" }}>
                          Digite uma mensagem...
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      <span className="text-[10px]" style={{ color: "rgba(233,237,239,0.6)" }}>
                        9:41
                      </span>
                      {/* Double-check read receipt */}
                      <svg viewBox="0 0 16 11" className="w-[15px] h-[11px]" fill="#53bdeb">
                        <path d="M11.071.653a.457.457 0 00-.304-.102.493.493 0 00-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 00-.336-.146.47.47 0 00-.343.146l-.311.31a.445.445 0 00-.14.337c0 .136.047.25.14.343l2.996 2.996a.724.724 0 00.501.203.697.697 0 00.534-.229L11.2 1.292c.093-.118.14-.243.14-.375a.442.442 0 00-.269-.264z" />
                        <path d="M15.071.653a.457.457 0 00-.304-.102.493.493 0 00-.381.178l-6.19 7.636-1.2-1.134-.311.311a.39.39 0 00-.14.337c0 .136.047.25.14.343l1.791 1.791a.724.724 0 00.501.203.697.697 0 00.534-.229L15.2 1.292c.093-.118.14-.243.14-.375a.442.442 0 00-.269-.264z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
