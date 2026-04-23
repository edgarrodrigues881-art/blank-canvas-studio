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
      <DialogContent className="max-w-[1440px] w-[97vw] h-[95vh] p-0 overflow-hidden flex flex-col gap-0 bg-background border-border/40 shadow-2xl">

        {/* Decorative ambient glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
          <div className="absolute -top-40 -left-32 w-[460px] h-[460px] rounded-full bg-pink-500/10 blur-3xl" />
          <div className="absolute -top-32 right-0 w-[420px] h-[420px] rounded-full bg-fuchsia-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-[520px] h-[300px] rounded-full bg-emerald-500/[0.06] blur-3xl" />
        </div>

        {/* ═══════ HEADER ═══════ */}
        <DialogHeader className="relative px-8 pt-6 pb-5 border-b border-border/40 shrink-0 backdrop-blur-xl bg-background/70">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-pink-500 to-fuchsia-600 blur-md opacity-60" />
              <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-fuchsia-600 flex items-center justify-center shadow-xl shadow-pink-500/30 ring-1 ring-white/10">
                <Heart className="w-5 h-5 text-white fill-white/30" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-[22px] font-bold text-foreground leading-tight tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                Criar automação de boas-vindas
              </DialogTitle>
              <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed max-w-2xl">
                Envie mensagens automáticas com distribuição inteligente e proteção anti-bloqueio
              </p>

              {/* Flow concept — interactive pills */}
              <div className="flex items-center gap-2.5 mt-4 flex-wrap">
                <div className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/60 backdrop-blur-md border border-border/60 shadow-sm transition-all hover:border-emerald-500/40 hover:shadow-emerald-500/10">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 ring-1 ring-emerald-500/30 flex items-center justify-center">
                    <UserPlus className="w-3 h-3 text-emerald-500" />
                  </div>
                  <span className="text-[11px] font-medium text-foreground">Alguém entra no grupo</span>
                </div>
                <div className="flex items-center">
                  <div className="h-px w-6 bg-gradient-to-r from-emerald-500/40 to-pink-500/40" />
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/70 -ml-1" />
                </div>
                <div className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/60 backdrop-blur-md border border-border/60 shadow-sm transition-all hover:border-pink-500/40 hover:shadow-pink-500/10">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-pink-400/20 to-fuchsia-600/20 ring-1 ring-pink-500/30 flex items-center justify-center">
                    <Send className="w-3 h-3 text-pink-500" />
                  </div>
                  <span className="text-[11px] font-medium text-foreground">Recebe mensagem no privado</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 ml-auto shadow-sm shadow-emerald-500/10">
                  <Shield className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Anti-bloqueio</span>
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* ═══════ BODY — 2-col: Content · Preview ═══════ */}
        <div className="relative flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] min-h-0 overflow-hidden">

          {/* ═══ COL 1: Step content ═══ */}
          <div className="min-w-0 overflow-y-auto">
            {/* ─── Horizontal Stepper (Linear.app inspired) ─── */}
            <div className="px-8 pt-7 pb-2 max-w-[760px] mx-auto w-full">
              <nav aria-label="Progresso" className="flex items-start justify-between gap-2">
                {steps.map((s, idx) => {
                  const Icon = s.icon;
                  const active = step === s.n;
                  const past = step > s.n;
                  const isLast = idx === steps.length - 1;
                  return (
                    <div key={s.n} className="flex items-start flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => setStep(s.n)}
                        className="flex flex-col items-center gap-2 group focus:outline-none"
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                            active
                              ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                              : past
                              ? "bg-transparent text-muted-foreground"
                              : "bg-transparent text-muted-foreground/60 border border-border"
                          }`}
                        >
                          {past ? (
                            <Check className="w-4 h-4" strokeWidth={2.5} />
                          ) : (
                            <Icon className="w-3.5 h-3.5" strokeWidth={active ? 2.5 : 2} />
                          )}
                        </div>
                        <span
                          className={`text-[11px] tracking-tight whitespace-nowrap transition-colors ${
                            active
                              ? "font-semibold text-foreground"
                              : past
                              ? "font-medium text-muted-foreground"
                              : "font-normal text-muted-foreground/70"
                          }`}
                        >
                          {s.title}
                        </span>
                      </button>
                      {!isLast && (
                        <div className="flex-1 h-px bg-border mt-4 mx-2" />
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>

            <div className="px-8 py-6 max-w-[760px] mx-auto animate-in fade-in-50 slide-in-from-bottom-2 duration-300" key={step}>

              {/* Step header */}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-foreground tracking-tight">{steps[step - 1].title}</h2>
                <p className="text-[12.5px] text-muted-foreground mt-1">{steps[step - 1].desc}</p>
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
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-md p-5 shadow-lg shadow-black/[0.04] dark:shadow-black/20 ring-1 ring-white/[0.02]">
                    <WelcomeMessageBuilder
                      value={payload}
                      onChange={patch => setPayload(p => ({ ...p, ...patch }))}
                      hideTypeSelector
                      hidePreview
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 px-1">
                    <Zap className="w-3 h-3 text-amber-500" />
                    A pré-visualização ao lado atualiza em tempo real conforme você edita.
                  </p>
                </div>
              )}

              {/* ──────── STEP 3 ──────── */}
              {step === 3 && (
                <div className="space-y-6">
                  {/* Delay sliders */}
                  <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-md p-5 space-y-5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-amber-500" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-foreground">Delay entre envios</h4>
                        <p className="text-[11px] text-muted-foreground">Tempo aleatório entre cada mensagem (anti-bloqueio)</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-3">
                        <div className="flex items-baseline justify-between">
                          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Mínimo</Label>
                          <span className="text-2xl font-black tabular-nums bg-gradient-to-br from-pink-500 to-fuchsia-600 bg-clip-text text-transparent">{payload.min_delay_seconds}<span className="text-xs text-muted-foreground font-medium ml-0.5">s</span></span>
                        </div>
                        <Slider
                          value={[payload.min_delay_seconds]}
                          onValueChange={v => setPayload(p => ({ ...p, min_delay_seconds: v[0] }))}
                          min={5} max={300} step={5}
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-baseline justify-between">
                          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Máximo</Label>
                          <span className="text-2xl font-black tabular-nums bg-gradient-to-br from-pink-500 to-fuchsia-600 bg-clip-text text-transparent">{payload.max_delay_seconds}<span className="text-xs text-muted-foreground font-medium ml-0.5">s</span></span>
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
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5" /> Remetentes
                      </Label>
                      <Badge variant="outline" className={`h-5 text-[10px] font-mono ${sendersValid ? "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30" : ""}`}>
                        {senderIds.length} selecionado{senderIds.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Estes dispositivos enviam as mensagens privadas em rodízio inteligente.
                    </p>
                    <div className="rounded-xl border border-border/50 bg-background/60 backdrop-blur overflow-hidden">
                      <div className="max-h-72 overflow-y-auto">
                        {!devices?.length ? (
                          <p className="text-[12px] text-muted-foreground p-6 text-center">Nenhum dispositivo disponível.</p>
                        ) : (
                          devices.map((d: any) => {
                            const checked = senderIds.includes(d.id);
                            const online = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"].includes(d.status);
                            return (
                              <button
                                key={d.id}
                                type="button"
                                onClick={() => toggleSender(d.id)}
                                className="w-full flex items-center gap-3 px-3 py-3 hover:bg-muted/40 text-left text-xs transition-colors border-b border-border/20 last:border-0"
                              >
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${checked ? "bg-gradient-to-br from-pink-500 to-fuchsia-600 border-pink-500 shadow shadow-pink-500/30" : "border-border bg-background"}`}>
                                  {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                </div>
                                <span className="flex-1 truncate text-[12.5px] font-medium">{d.name}{d.number ? ` · ${d.number}` : ""}</span>
                                <span className="relative flex shrink-0 items-center gap-1.5">
                                  <span className="relative flex">
                                    {online && <span className="absolute inset-0 rounded-full bg-emerald-400/60 animate-ping" />}
                                    <span className={`relative w-2 h-2 rounded-full ${online ? "bg-emerald-400 shadow shadow-emerald-400/50" : "bg-muted-foreground/40"}`} />
                                  </span>
                                  <span className={`text-[10px] font-medium ${online ? "text-emerald-500" : "text-muted-foreground"}`}>
                                    {online ? "Online" : "Offline"}
                                  </span>
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Final summary */}
                  <div className="relative rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-500/[0.10] via-fuchsia-500/[0.04] to-transparent p-5 overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-pink-500/15 blur-2xl" />
                    <p className="relative text-[10px] font-bold uppercase tracking-[0.14em] text-pink-600 dark:text-pink-400 flex items-center gap-1.5 mb-3">
                      <Sparkles className="w-3 h-3" /> Resumo da automação
                    </p>
                    <div className="relative grid grid-cols-2 gap-3 text-[12px]">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Modo:</span>
                        <span className="font-semibold text-foreground capitalize">{getUiModeFromPayload(payload)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Delay:</span>
                        <span className="font-mono font-semibold text-foreground">{payload.min_delay_seconds}–{payload.max_delay_seconds}s</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Grupos:</span>
                        <span className="font-semibold text-foreground">{selectedGroups.length}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Send className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Remetentes:</span>
                        <span className="font-semibold text-foreground">{senderIds.length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ═══ COL 3: Persistent preview ═══ */}
          <aside className="hidden lg:flex flex-col border-l border-border/40 bg-gradient-to-b from-card/30 to-card/10 backdrop-blur-xl px-6 py-7">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Pré-visualização
              </p>
              <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Ao vivo
              </span>
            </div>
            <div className="flex-1 flex items-start justify-center pt-2">
              <WelcomeWhatsAppPreview payload={payload} height={560} />
            </div>
          </aside>
        </div>

        {/* ═══════ FOOTER — stepper navigation ═══════ */}
        <DialogFooter className="relative border-t border-border/40 px-8 py-4 shrink-0 bg-background/80 backdrop-blur-xl flex-row sm:justify-between gap-2">
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            Cancelar
          </Button>

          <div className="flex items-center gap-2">
            {/* Step pips */}
            <div className="hidden sm:flex items-center gap-1.5 mr-2">
              {[1, 2, 3].map(n => (
                <div
                  key={n}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    step === n ? "w-8 bg-gradient-to-r from-pink-500 to-fuchsia-600" : step > n ? "w-1.5 bg-emerald-500" : "w-1.5 bg-border"
                  }`}
                />
              ))}
            </div>

            {step > 1 && (
              <Button variant="outline" onClick={goBack} className="gap-1.5 border-border/60">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </Button>
            )}

            {step < 3 ? (
              <Button
                onClick={goNext}
                disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
                className="group gap-2 min-w-[140px] h-11 bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-600 hover:from-pink-600 hover:via-rose-600 hover:to-fuchsia-700 text-white shadow-xl shadow-pink-500/30 hover:shadow-pink-500/50 hover:-translate-y-0.5 transition-all duration-200 font-semibold ring-1 ring-white/10 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                Continuar
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            ) : (
              <Button
                onClick={handleCreate}
                disabled={create.isPending}
                className="group gap-2 min-w-[200px] h-11 bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-600 hover:from-pink-600 hover:via-rose-600 hover:to-fuchsia-700 text-white shadow-xl shadow-pink-500/30 hover:shadow-pink-500/50 hover:-translate-y-0.5 transition-all duration-200 font-semibold ring-1 ring-white/10"
              >
                {create.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 transition-transform group-hover:rotate-12 group-hover:scale-110" />
                )}
                Criar automação
              </Button>
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
