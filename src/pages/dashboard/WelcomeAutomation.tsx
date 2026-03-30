import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useWelcomeAutomations,
  useWelcomeQueueStats,
  useUpdateWelcomeAutomation,
  useDeleteWelcomeAutomation,
  useWelcomeGroups,
  useWelcomeSenders,
  WelcomeAutomation,
} from "@/hooks/useWelcomeAutomation";
import { WelcomeStatsCards } from "@/components/welcome/WelcomeStatsCards";
import { WelcomeQueueTable } from "@/components/welcome/WelcomeQueueTable";
import { WelcomeMessageEditor } from "@/components/welcome/WelcomeMessageEditor";
import { AutomationStatusBadge } from "@/components/welcome/WelcomeStatusBadge";
import {
  Heart, Plus, Play, Pause, Square, Trash2, RefreshCw,
  CheckCircle2, Clock, Users, Send, Search,
  ArrowLeft, Settings, ListChecks, Radio, Zap, Eye,
} from "lucide-react";
import { format } from "date-fns";

/* ───────── helpers ───────── */
const CONNECTED_STATUSES = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"];

function useConnectedDevices(enabled = true) {
  return useQuery({
    queryKey: ["devices-connected-welcome"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, name, status, number, instance_type")
        .in("status", CONNECTED_STATUSES)
        .not("number", "is", null)
        .order("name");
      return (data || []).filter(d => d.number && !["notificacao", "report"].includes(d.instance_type)).sort((a, b) => {
        const na = a.name.replace(/\d+/, m => m.padStart(6, "0"));
        const nb = b.name.replace(/\d+/, m => m.padStart(6, "0"));
        return na.localeCompare(nb);
      });
    },
    enabled,
    staleTime: 30_000,
  });
}

/* ───────── MAIN PAGE ───────── */
export default function WelcomeAutomationPage() {
  const { data: automations, isLoading } = useWelcomeAutomations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const selected = automations?.find(a => a.id === selectedId);

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 w-full">
      {/* Header */}
      {!selectedId && (
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
              <Heart className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Boas-vindas</h1>
              <p className="text-sm text-muted-foreground">Envio automático para novos participantes</p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2 h-11 px-5 rounded-xl text-sm font-semibold">
            <Plus className="w-4 h-4" /> Nova Automação
          </Button>
        </div>
      )}

      {/* LIST VIEW */}
      {!selectedId && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && <p className="text-muted-foreground text-sm col-span-full">Carregando...</p>}
          {automations?.length === 0 && !isLoading && (
            <Card className="col-span-full border-dashed border-2 border-border/30">
              <CardContent className="py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <p className="text-lg font-semibold text-foreground mb-1">Nenhuma automação</p>
                <p className="text-sm text-muted-foreground mb-5">Crie sua primeira automação de boas-vindas</p>
                <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl" size="lg">
                  <Plus className="w-4 h-4" /> Criar Automação
                </Button>
              </CardContent>
            </Card>
          )}
          {automations?.map(a => (
            <AutomationCard key={a.id} automation={a} onClick={() => setSelectedId(a.id)} />
          ))}
        </div>
      )}

      {/* DETAIL VIEW */}
      {selected && <AutomationDetailView automation={selected} onBack={() => setSelectedId(null)} />}

      <CreateAutomationDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}

/* ───────── Automation Card (list item) ───────── */
function AutomationCard({ automation, onClick }: { automation: WelcomeAutomation; onClick: () => void }) {
  const stats = useWelcomeQueueStats(automation.id);

  return (
    <Card
      className="cursor-pointer hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 group relative overflow-hidden"
      onClick={onClick}
    >
      {automation.status === "active" && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 via-primary to-emerald-500 animate-pulse" />
      )}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold truncate">{automation.name}</CardTitle>
          <AutomationStatusBadge status={automation.status} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Criada em {format(new Date(automation.created_at), "dd/MM/yyyy 'às' HH:mm")}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/30 rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold text-emerald-400">{stats.sent}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Enviados</p>
          </div>
          <div className="bg-muted/30 rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold text-yellow-400">{stats.pending}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Pendentes</p>
          </div>
          <div className="bg-muted/30 rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold text-red-400">{stats.failed}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Falhas</p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/20 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {automation.min_delay_seconds}–{automation.max_delay_seconds}s</span>
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Max {automation.max_per_account}/conta</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ───────── Create Dialog ───────── */
function CreateAutomationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Digite um nome para a automação"); return; }
    setCreating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("welcome_automations")
        .insert({
          user_id: userData.user?.id,
          name: name.trim(),
          monitoring_device_id: null,
          message_content: "Olá {nome}! Seja bem-vindo(a) ao grupo {grupo}! 🎉",
        } as any)
        .select()
        .single();
      if (error) { toast.error(error.message); return; }
      qc.invalidateQueries({ queryKey: ["welcome-automations"] });
      toast.success("Automação criada com sucesso!");
      onOpenChange(false);
      setName("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar automação");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary" />
            </div>
            Nova Automação
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label className="text-xs font-medium">Nome da automação</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: Boas-vindas Grupo VIP"
            className="h-11 rounded-xl"
            autoFocus
            onKeyDown={e => e.key === "Enter" && handleCreate()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim()} className="gap-2 rounded-xl">
            {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar Automação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── Detail View ───────── */
function AutomationDetailView({ automation, onBack }: { automation: WelcomeAutomation; onBack: () => void }) {
  const [tab, setTab] = useState("config");
  const stats = useWelcomeQueueStats(automation.id);
  const updateAutomation = useUpdateWelcomeAutomation();
  const deleteAutomation = useDeleteWelcomeAutomation();

  const handleToggleStatus = async () => {
    const newStatus = automation.status === "active" ? "paused" : "active";
    await updateAutomation.mutateAsync({ id: automation.id, status: newStatus } as any);
    toast.success(newStatus === "active" ? "Automação iniciada!" : "Automação pausada!");
  };

  const handleFinalize = async () => {
    await updateAutomation.mutateAsync({ id: automation.id, status: "completed" } as any);
    toast.success("Automação finalizada!");
  };

  const handleDelete = async () => {
    await deleteAutomation.mutateAsync(automation.id);
    onBack();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 rounded-xl h-9">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <div className="w-px h-6 bg-border/50" />
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground">{automation.name}</h2>
            <AutomationStatusBadge status={automation.status} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {automation.status !== "completed" && (
            <Button
              size="sm"
              variant={automation.status === "active" ? "outline" : "default"}
              onClick={handleToggleStatus}
              className="gap-2 rounded-xl h-9 px-4"
            >
              {automation.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {automation.status === "active" ? "Pausar" : "Iniciar"}
            </Button>
          )}
          {automation.status !== "completed" && (
            <Button size="sm" variant="outline" onClick={handleFinalize} className="gap-2 rounded-xl h-9 px-4">
              <Square className="w-4 h-4" /> Finalizar
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={handleDelete} className="gap-2 rounded-xl h-9 px-4">
            <Trash2 className="w-4 h-4" /> Excluir
          </Button>
        </div>
      </div>

      {/* Active Indicator */}
      {automation.status === "active" && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-3">
          <div className="relative">
            <Radio className="w-5 h-5 text-emerald-400" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-400">Automação ativa</p>
            <p className="text-[11px] text-emerald-400/70">Monitorando grupos e enviando mensagens automaticamente</p>
          </div>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="text-emerald-400 font-bold">{stats.sent} enviados</span>
            <span className="text-yellow-400 font-bold">{stats.pending} na fila</span>
          </div>
        </div>
      )}

      {/* Stats */}
      <WelcomeStatsCards stats={stats} />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl bg-muted/30 p-1 h-auto">
          <TabsTrigger value="config" className="gap-2 rounded-lg px-4 py-2.5 text-sm data-[state=active]:shadow-md">
            <Settings className="w-4 h-4" /> Configuração
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2 rounded-lg px-4 py-2.5 text-sm data-[state=active]:shadow-md">
            <ListChecks className="w-4 h-4" /> Fila <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 ml-1">{stats.total}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <AutomationConfig automation={automation} />
        </TabsContent>

        <TabsContent value="queue" className="mt-4">
          <WelcomeQueueTable automationId={automation.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────── Automation Config ───────── */
function AutomationConfig({ automation }: { automation: WelcomeAutomation }) {
  const update = useUpdateWelcomeAutomation();
  const { data: devices } = useConnectedDevices();
  const { data: savedGroups } = useWelcomeGroups(automation.id);
  const { data: savedSenders } = useWelcomeSenders(automation.id);

  const [monitoringDevice, setMonitoringDevice] = useState(automation.monitoring_device_id || "");
  const [minDelay, setMinDelay] = useState(automation.min_delay_seconds);
  const [maxDelay, setMaxDelay] = useState(automation.max_delay_seconds);
  const [maxPerAccount, setMaxPerAccount] = useState(automation.max_per_account);
  const [messageContent, setMessageContent] = useState(automation.message_content || "");
  const [messageType, setMessageType] = useState<string>((automation as any).message_type || "text");
  const [buttons, setButtons] = useState<{ text: string; url: string; action: string }[]>(() => {
    try {
      const b = (automation as any).buttons;
      return Array.isArray(b)
        ? b.map((x: any) => ({
            text: x?.text || x?.label || "",
            url: x?.url || x?.value || "",
            action: x?.action || x?.type || "link",
          }))
        : [];
    } catch {
      return [];
    }
  });
  const [carouselCards, setCarouselCards] = useState<{
    title: string;
    description: string;
    image_url: string;
    buttons: { text: string; url: string; action?: string }[];
  }[]>(() => {
    try {
      const c = (automation as any).carousel_cards;
      return Array.isArray(c)
        ? c.map((card: any) => ({
            title: card?.title || "",
            description: card?.description || card?.text || "",
            image_url: card?.image_url || card?.image || card?.media_url || "",
            buttons: Array.isArray(card?.buttons)
              ? card.buttons.map((btn: any) => ({
                  text: btn?.text || btn?.label || "",
                  url: btn?.url || btn?.value || "",
                  action: btn?.action || btn?.type || "link",
                }))
              : [],
          }))
        : [];
    } catch {
      return [];
    }
  });
  const [selectedSenders, setSelectedSenders] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<{ group_id: string; group_name: string }[]>([]);
  const [availableGroups, setAvailableGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  useEffect(() => {
    if (savedSenders) setSelectedSenders(savedSenders.map((s: any) => s.device_id));
  }, [savedSenders]);

  useEffect(() => {
    if (savedGroups) setSelectedGroups(savedGroups.map((g: any) => ({ group_id: g.group_id, group_name: g.group_name })));
  }, [savedGroups]);

  const loadGroups = async (deviceId?: string) => {
    const target = deviceId || monitoringDevice;
    if (!target) return;
    setGroupsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(`whapi-chats?device_id=${target}&action=list_chats`, { method: "GET" });
      if (error) throw error;
      const groups = (data?.chats || data?.groups || []).filter((g: any) => g.id?.includes("@g.us")).map((g: any) => ({ id: g.id, name: g.name || g.subject || g.id }));
      if (groups.length === 0) toast.info("Nenhum grupo encontrado nesta conta");
      setAvailableGroups(groups);
    } catch (err: any) {
      toast.error("Erro ao carregar grupos: " + (err.message || "desconhecido"));
    } finally {
      setGroupsLoading(false);
    }
  };

  const toggleGroup = (g: { id: string; name: string }) => {
    setSelectedGroups(prev => prev.some(sg => sg.group_id === g.id) ? prev.filter(sg => sg.group_id !== g.id) : [...prev, { group_id: g.id, group_name: g.name }]);
  };

  const toggleSender = (id: string) => {
    setSelectedSenders(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const handleImportTemplate = (payload: {
    type: "text" | "buttons" | "carousel";
    content: string;
    buttons?: { text: string; url?: string; action?: string }[];
    carouselCards?: { title: string; description: string; image_url?: string; buttons?: { text: string; url?: string; action?: string }[] }[];
  }) => {
    setMessageType(payload.type);
    setMessageContent(payload.content || "");

    if (payload.type === "buttons") {
      const importedButtons = (payload.buttons || []).slice(0, 3).map((btn, i) => ({
        text: btn?.text || `Botão ${i + 1}`,
        url: btn?.url || "",
        action: btn?.action || "link",
      }));
      setButtons(importedButtons);
      setCarouselCards([]);
      return;
    }

    if (payload.type === "carousel") {
      const importedCards = (payload.carouselCards || []).slice(0, 10).map((card, i) => ({
        title: card?.title || `Card ${i + 1}`,
        description: card?.description || "",
        image_url: card?.image_url || "",
        buttons: (card?.buttons || []).slice(0, 2).map((btn, j) => ({
          text: btn?.text || `Botão ${j + 1}`,
          url: btn?.url || "",
          action: btn?.action || "link",
        })),
      }));
      setCarouselCards(importedCards);
      setButtons([]);
      return;
    }

    setButtons([]);
    setCarouselCards([]);
  };

  const save = async () => {
    await update.mutateAsync({
      id: automation.id,
      monitoring_device_id: monitoringDevice || null,
      min_delay_seconds: minDelay,
      max_delay_seconds: Math.max(maxDelay, minDelay),
      max_per_account: maxPerAccount,
      message_content: messageContent,
      message_type: messageType,
      buttons: messageType === "buttons" ? buttons : [],
      carousel_cards: messageType === "carousel" ? carouselCards : [],
    } as any);

    await supabase.from("welcome_automation_groups").delete().eq("automation_id", automation.id);
    if (selectedGroups.length > 0) {
      await supabase.from("welcome_automation_groups").insert(
        selectedGroups.map(g => ({ automation_id: automation.id, group_id: g.group_id, group_name: g.group_name })) as any
      );
    }

    await supabase.from("welcome_automation_senders").delete().eq("automation_id", automation.id);
    if (selectedSenders.length > 0) {
      await supabase.from("welcome_automation_senders").insert(
        selectedSenders.map((did, i) => ({ automation_id: automation.id, device_id: did, priority_order: i })) as any
      );
    }

    toast.success("Configuração salva!");
  };

  return (
    <div className="space-y-5">
      {/* ── STEP 1: MONITORING ── */}
      <Card className="border-border/40 overflow-hidden">
        <CardHeader className="pb-4 bg-gradient-to-r from-blue-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Eye className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Monitoramento</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">Conta e grupos que serão monitorados</p>
            </div>
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full">Etapa 1</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Conta de Monitoramento</Label>
            <Select value={monitoringDevice} onValueChange={v => { setMonitoringDevice(v); setAvailableGroups([]); loadGroups(v); }}>
              <SelectTrigger className="h-11 rounded-xl border-border/50"><SelectValue placeholder="Selecione uma conta conectada..." /></SelectTrigger>
              <SelectContent>
                {devices?.map(d => (<SelectItem key={d.id} value={d.id}>{d.name} ({d.number})</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {monitoringDevice && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Grupos Monitorados</Label>
                <Button size="sm" variant="outline" onClick={() => loadGroups()} disabled={groupsLoading} className="h-8 text-[11px] gap-1.5 rounded-lg">
                  {groupsLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Carregar Grupos
                </Button>
              </div>
              {availableGroups.length > 0 && (
                <ScrollArea className="h-[180px] border border-border/40 rounded-xl p-2">
                  <div className="space-y-0.5">
                    {availableGroups.map(g => (
                      <label key={g.id} className="flex items-center gap-2.5 py-2 px-3 hover:bg-muted/40 rounded-lg cursor-pointer text-xs transition-colors">
                        <Checkbox checked={selectedGroups.some(sg => sg.group_id === g.id)} onCheckedChange={() => toggleGroup(g)} />
                        <span className="truncate">{g.name}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
              {selectedGroups.length > 0 && (
                <p className="text-xs text-emerald-400 font-medium">{selectedGroups.length} grupo(s) selecionado(s)</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── STEP 2: SENDER ACCOUNTS ── */}
      <Card className="border-border/40 overflow-hidden">
        <CardHeader className="pb-4 bg-gradient-to-r from-emerald-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-base">Contas Remetentes</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">Contas que enviarão as mensagens de boas-vindas</p>
            </div>
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">Etapa 2</span>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {devices?.map(d => {
              const isSelected = selectedSenders.includes(d.id);
              return (
                <div
                  key={d.id}
                  onClick={() => toggleSender(d.id)}
                  className={`
                    relative cursor-pointer rounded-xl border-2 p-4 transition-all duration-200
                    ${isSelected
                      ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                      : "border-border/30 hover:border-border/60 hover:bg-muted/20"
                    }
                  `}
                >
                  {isSelected && (
                    <div className="absolute top-2.5 right-2.5">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${isSelected ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"}`}>
                      {d.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{d.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{d.number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-[10px] text-muted-foreground">Online</span>
                  </div>
                </div>
              );
            })}
          </div>
          {(!devices || devices.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma conta conectada encontrada</p>
          )}
          {selectedSenders.length > 0 && (
            <p className="text-xs text-emerald-400 font-medium mt-3">{selectedSenders.length} conta(s) selecionada(s) para envio</p>
          )}
        </CardContent>
      </Card>

      {/* ── STEP 3: RULES ── */}
      <Card className="border-border/40 overflow-hidden">
        <CardHeader className="pb-4 bg-gradient-to-r from-orange-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-base">Regras de Envio</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">Delays e limites por conta</p>
            </div>
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-full">Etapa 3</span>
          </div>
        </CardHeader>
        <CardContent className="pt-2 space-y-5">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Delay mínimo (s)</Label>
              <Input type="number" value={minDelay} onChange={e => setMinDelay(Number(e.target.value))} className="h-10 rounded-xl border-border/50 bg-muted/10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Delay máximo (s)</Label>
              <Input type="number" value={maxDelay} onChange={e => setMaxDelay(Number(e.target.value))} className="h-10 rounded-xl border-border/50 bg-muted/10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Máx. por conta</Label>
              <Input type="number" value={maxPerAccount} onChange={e => setMaxPerAccount(Number(e.target.value))} className="h-10 rounded-xl border-border/50 bg-muted/10" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── STEP 4: MESSAGE ── */}
      <Card className="border-border/40 overflow-hidden">
        <CardHeader className="pb-4 bg-gradient-to-r from-purple-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Send className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-base">Mensagem de Boas-vindas</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">Conteúdo com variáveis dinâmicas e preview</p>
            </div>
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full">Etapa 4</span>
          </div>
        </CardHeader>
        <CardContent className="pt-2 space-y-4">
          {/* Type selector */}
          <div className="flex items-center gap-2">
            {[
              { value: "text", label: "Texto simples" },
              { value: "buttons", label: "Botões" },
              { value: "carousel", label: "Carrossel" },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setMessageType(opt.value)}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-all border ${
                  messageType === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/20 text-muted-foreground border-border/50 hover:bg-muted/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <WelcomeMessageEditor value={messageContent} onChange={setMessageContent} buttons={messageType === "buttons" ? buttons : undefined} carouselCards={messageType === "carousel" ? carouselCards : undefined} onImportTemplate={handleImportTemplate} />

          {/* Buttons editor */}
          {messageType === "buttons" && (
            <div className="space-y-3 border-t border-border/20 pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Botões (máx. 10)</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-lg" onClick={() => setButtons(prev => [...prev, { text: "", url: "", action: "link" }])} disabled={buttons.length >= 10}>
                  <Plus className="w-3 h-3 mr-1" /> Adicionar
                </Button>
              </div>
              {buttons.map((btn, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <Input placeholder="Texto do botão" value={btn.text} onChange={e => setButtons(prev => prev.map((b, j) => j === i ? { ...b, text: e.target.value } : b))} className="h-9 text-xs rounded-lg flex-1 min-w-[120px]" />
                  <Select value={btn.action || "link"} onValueChange={v => setButtons(prev => prev.map((b, j) => j === i ? { ...b, action: v } : b))}>
                    <SelectTrigger className="h-9 text-xs rounded-lg w-[140px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="link">Abrir link</SelectItem>
                      <SelectItem value="reply">Resposta rápida</SelectItem>
                      <SelectItem value="whatsapp">Abrir WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                  {(btn.action || "link") !== "reply" && (
                    <Input placeholder={btn.action === "whatsapp" ? "5511999999999" : "https://..."} value={btn.url} onChange={e => setButtons(prev => prev.map((b, j) => j === i ? { ...b, url: e.target.value } : b))} className="h-9 text-xs rounded-lg flex-1 min-w-[140px]" />
                  )}
                  <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0 text-destructive hover:text-destructive" onClick={() => setButtons(prev => prev.filter((_, j) => j !== i))}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              {buttons.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum botão adicionado</p>}
            </div>
          )}

          {/* Carousel editor */}
          {messageType === "carousel" && (
            <div className="space-y-3 border-t border-border/20 pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cards do Carrossel (máx. 10)</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-lg" onClick={() => setCarouselCards(prev => [...prev, { title: "", description: "", image_url: "", buttons: [] }])} disabled={carouselCards.length >= 10}>
                  <Plus className="w-3 h-3 mr-1" /> Adicionar Card
                </Button>
              </div>
              {carouselCards.map((card, i) => (
                <Card key={i} className="border-border/30 bg-muted/5">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Card {i + 1}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setCarouselCards(prev => prev.filter((_, j) => j !== i))}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <Input placeholder="Título" value={card.title} onChange={e => setCarouselCards(prev => prev.map((c, j) => j === i ? { ...c, title: e.target.value } : c))} className="h-9 text-xs rounded-lg" />
                    <Input placeholder="Descrição" value={card.description} onChange={e => setCarouselCards(prev => prev.map((c, j) => j === i ? { ...c, description: e.target.value } : c))} className="h-9 text-xs rounded-lg" />
                    <Input placeholder="URL da imagem (opcional)" value={card.image_url} onChange={e => setCarouselCards(prev => prev.map((c, j) => j === i ? { ...c, image_url: e.target.value } : c))} className="h-9 text-xs rounded-lg" />
                    {/* Card buttons */}
                    <div className="pt-1 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">Botões do card</span>
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2 rounded" disabled={(card.buttons || []).length >= 2} onClick={() => setCarouselCards(prev => prev.map((c, j) => j === i ? { ...c, buttons: [...(c.buttons || []), { text: "", url: "", action: "link" }] } : c))}>
                          <Plus className="w-2.5 h-2.5 mr-0.5" /> Botão
                        </Button>
                      </div>
                      {(card.buttons || []).map((btn: any, bi: number) => (
                        <div key={bi} className="flex items-center gap-1.5">
                          <Input placeholder="Texto" value={btn.text} onChange={e => setCarouselCards(prev => prev.map((c, j) => j === i ? { ...c, buttons: (c.buttons || []).map((b: any, bj: number) => bj === bi ? { ...b, text: e.target.value } : b) } : c))} className="h-7 text-[10px] rounded flex-1" />
                          <Input placeholder="URL" value={btn.url} onChange={e => setCarouselCards(prev => prev.map((c, j) => j === i ? { ...c, buttons: (c.buttons || []).map((b: any, bj: number) => bj === bi ? { ...b, url: e.target.value } : b) } : c))} className="h-7 text-[10px] rounded flex-1" />
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive shrink-0" onClick={() => setCarouselCards(prev => prev.map((c, j) => j === i ? { ...c, buttons: (c.buttons || []).filter((_: any, bj: number) => bj !== bi) } : c))}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {carouselCards.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum card adicionado</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <Button onClick={save} disabled={update.isPending} className="gap-2 h-12 rounded-xl text-sm font-semibold w-full sm:w-auto px-8">
        {update.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        Salvar Configuração
      </Button>
    </div>
  );
}
