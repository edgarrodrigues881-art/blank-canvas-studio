import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useWelcomeAutomations,
  useWelcomeQueue,
  useWelcomeQueueStats,
  useCreateWelcomeAutomation,
  useUpdateWelcomeAutomation,
  useDeleteWelcomeAutomation,
  useUpdateQueueItem,
  WelcomeAutomation,
} from "@/hooks/useWelcomeAutomation";
import {
  Heart,
  Plus,
  Play,
  Pause,
  Square,
  Trash2,
  RefreshCw,
  Download,
  Eye,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  Send,
  Shield,
  Filter,
  Search,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pendente", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: Clock },
  processing: { label: "Processando", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: RefreshCw },
  sent: { label: "Enviado", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  failed: { label: "Falhou", color: "bg-red-500/15 text-red-400 border-red-500/30", icon: AlertTriangle },
  ignored: { label: "Ignorado", color: "bg-gray-500/15 text-gray-400 border-gray-500/30", icon: XCircle },
  duplicate_blocked: { label: "Duplicado", color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: Shield },
  aguardando_pausa: { label: "Aguardando Pausa", color: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: Pause },
  aguardando_janela: { label: "Fora do Horário", color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30", icon: Clock },
};

const AUTOMATION_STATUS: Record<string, { label: string; color: string }> = {
  paused: { label: "Pausada", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  active: { label: "Ativa", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  completed: { label: "Finalizada", color: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] || { label: status, color: "bg-muted text-muted-foreground", icon: Clock };
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.color} gap-1 text-[11px] font-medium border`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

export default function WelcomeAutomationPage() {
  const { user } = useAuth();
  const { data: automations, isLoading } = useWelcomeAutomations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState("config");
  const [queueFilter, setQueueFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const selected = automations?.find(a => a.id === selectedId);
  const { data: queue } = useWelcomeQueue(selectedId || undefined);
  const stats = useWelcomeQueueStats(selectedId || undefined);
  const updateAutomation = useUpdateWelcomeAutomation();
  const deleteAutomation = useDeleteWelcomeAutomation();
  const updateQueueItem = useUpdateQueueItem();

  const filteredQueue = useMemo(() => {
    if (!queue) return [];
    return queue.filter(item => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (queueFilter) {
        const search = queueFilter.toLowerCase();
        return (
          item.participant_phone?.toLowerCase().includes(search) ||
          item.participant_name?.toLowerCase().includes(search) ||
          item.group_name?.toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [queue, queueFilter, statusFilter]);

  const handleToggleStatus = async () => {
    if (!selected) return;
    const newStatus = selected.status === "active" ? "paused" : "active";
    await updateAutomation.mutateAsync({ id: selected.id, status: newStatus } as any);
    toast.success(newStatus === "active" ? "Automação iniciada!" : "Automação pausada!");
  };

  const handleFinalize = async () => {
    if (!selected) return;
    await updateAutomation.mutateAsync({ id: selected.id, status: "completed" } as any);
    toast.success("Automação finalizada!");
  };

  const handleDelete = async () => {
    if (!selected) return;
    await deleteAutomation.mutateAsync(selected.id);
    setSelectedId(null);
  };

  const handleRequeue = async (itemId: string) => {
    await updateQueueItem.mutateAsync({ id: itemId, status: "pending" });
    toast.success("Reenfileirado!");
  };

  const handleIgnore = async (itemId: string) => {
    await updateQueueItem.mutateAsync({ id: itemId, status: "ignored" });
    toast.success("Ignorado!");
  };

  const exportCSV = () => {
    if (!filteredQueue.length) return;
    const headers = ["Participante", "Nome", "Grupo", "Status", "Detectado", "Processado", "Tentativas", "Erro"];
    const rows = filteredQueue.map(q => [
      q.participant_phone,
      q.participant_name || "",
      q.group_name || q.group_id,
      q.status,
      q.detected_at,
      q.processed_at || "",
      String(q.attempts),
      q.error_reason || "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `boas-vindas-fila-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Heart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Boas-vindas</h1>
            <p className="text-xs text-muted-foreground">Mensagens automáticas para novos participantes</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Automação
        </Button>
      </div>

      {/* Automations List */}
      {(!selectedId || !selected) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && <p className="text-muted-foreground text-sm col-span-full">Carregando...</p>}
          {automations?.length === 0 && !isLoading && (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center">
                <Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhuma automação criada</p>
                <Button onClick={() => setShowCreate(true)} className="mt-4 gap-2" size="sm">
                  <Plus className="w-4 h-4" />
                  Criar primeira automação
                </Button>
              </CardContent>
            </Card>
          )}
          {automations?.map(a => {
            const st = AUTOMATION_STATUS[a.status] || AUTOMATION_STATUS.paused;
            return (
              <Card
                key={a.id}
                className="cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => { setSelectedId(a.id); setTab("config"); }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{a.name}</CardTitle>
                    <Badge variant="outline" className={`${st.color} text-[10px] border`}>{st.label}</Badge>
                  </div>
                  <CardDescription className="text-[11px]">
                    Criada {format(new Date(a.created_at), "dd/MM/yyyy HH:mm")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-4 text-[11px] text-muted-foreground">
                    <span>Delay: {a.min_delay_seconds}–{a.max_delay_seconds}s</span>
                    <span>Max/conta: {a.max_per_account}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail View */}
      {selected && (
        <div className="flex flex-col gap-4">
          {/* Back + Actions */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>← Voltar</Button>
            <div className="flex gap-2 flex-wrap">
              {selected.status !== "completed" && (
                <Button
                  size="sm"
                  variant={selected.status === "active" ? "outline" : "default"}
                  onClick={handleToggleStatus}
                  className="gap-1.5"
                >
                  {selected.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {selected.status === "active" ? "Pausar" : "Iniciar"}
                </Button>
              )}
              {selected.status !== "completed" && (
                <Button size="sm" variant="outline" onClick={handleFinalize} className="gap-1.5">
                  <Square className="w-3.5 h-3.5" /> Finalizar
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={handleDelete} className="gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              { label: "Total", value: stats.total, color: "text-foreground" },
              { label: "Pendentes", value: stats.pending, color: "text-yellow-400" },
              { label: "Processando", value: stats.processing, color: "text-blue-400" },
              { label: "Enviados", value: stats.sent, color: "text-emerald-400" },
              { label: "Falhas", value: stats.failed, color: "text-red-400" },
              { label: "Ignorados", value: stats.ignored, color: "text-gray-400" },
              { label: "Duplicados", value: stats.duplicate_blocked, color: "text-orange-400" },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="py-3 px-3 text-center">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabs */}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="config">Configuração</TabsTrigger>
              <TabsTrigger value="queue">Fila ({stats.total})</TabsTrigger>
            </TabsList>

            <TabsContent value="config">
              <AutomationConfig automation={selected} />
            </TabsContent>

            <TabsContent value="queue">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-sm">Fila de Envio</CardTitle>
                    <div className="flex gap-2 flex-wrap">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Buscar..."
                          value={queueFilter}
                          onChange={e => setQueueFilter(e.target.value)}
                          className="pl-8 h-8 w-40 text-xs"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {Object.entries(STATUS_MAP).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 gap-1.5 text-xs">
                        <Download className="w-3.5 h-3.5" /> CSV
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Participante</TableHead>
                          <TableHead className="text-xs">Grupo</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Detectado</TableHead>
                          <TableHead className="text-xs">Processado</TableHead>
                          <TableHead className="text-xs">Tent.</TableHead>
                          <TableHead className="text-xs">Erro</TableHead>
                          <TableHead className="text-xs">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredQueue.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground text-xs py-8">
                              Nenhum item na fila
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredQueue.map(item => (
                          <TableRow key={item.id}>
                            <TableCell className="text-xs font-mono">
                              <div>
                                <span>{item.participant_phone}</span>
                                {item.participant_name && (
                                  <span className="block text-muted-foreground text-[10px]">{item.participant_name}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs max-w-[120px] truncate">{item.group_name || item.group_id.slice(0, 12)}</TableCell>
                            <TableCell><StatusBadge status={item.status} /></TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">
                              {format(new Date(item.detected_at), "dd/MM HH:mm")}
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">
                              {item.processed_at ? format(new Date(item.processed_at), "dd/MM HH:mm") : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-center">{item.attempts}</TableCell>
                            <TableCell className="text-[11px] text-red-400 max-w-[120px] truncate">{item.error_reason || "—"}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {(item.status === "failed" || item.status === "ignored") && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    title="Reenfileirar"
                                    onClick={() => handleRequeue(item.id)}
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                  </Button>
                                )}
                                {item.status === "pending" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    title="Ignorar"
                                    onClick={() => handleIgnore(item.id)}
                                  >
                                    <XCircle className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Create Dialog */}
      <CreateAutomationDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}

function AutomationConfig({ automation }: { automation: WelcomeAutomation }) {
  const update = useUpdateWelcomeAutomation();
  const [minDelay, setMinDelay] = useState(automation.min_delay_seconds);
  const [maxDelay, setMaxDelay] = useState(automation.max_delay_seconds);
  const [maxPerAccount, setMaxPerAccount] = useState(automation.max_per_account);
  const [maxRetries, setMaxRetries] = useState(automation.max_retries);
  const [dedupeRule, setDedupeRule] = useState(automation.dedupe_rule);
  const [dedupeDays, setDedupeDays] = useState(automation.dedupe_window_days);
  const [startHour, setStartHour] = useState(automation.send_start_hour);
  const [endHour, setEndHour] = useState(automation.send_end_hour);
  const [messageContent, setMessageContent] = useState(automation.message_content || "");

  const save = async () => {
    await update.mutateAsync({
      id: automation.id,
      min_delay_seconds: minDelay,
      max_delay_seconds: Math.max(maxDelay, minDelay),
      max_per_account: maxPerAccount,
      max_retries: maxRetries,
      dedupe_rule: dedupeRule,
      dedupe_window_days: dedupeDays,
      send_start_hour: startHour,
      send_end_hour: endHour,
      message_content: messageContent,
    } as any);
    toast.success("Configuração salva!");
  };

  return (
    <Card>
      <CardContent className="pt-5 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Delay mínimo (segundos)</Label>
            <Input type="number" value={minDelay} onChange={e => setMinDelay(Number(e.target.value))} className="h-9" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Delay máximo (segundos)</Label>
            <Input type="number" value={maxDelay} onChange={e => setMaxDelay(Number(e.target.value))} className="h-9" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Máximo por conta</Label>
            <Input type="number" value={maxPerAccount} onChange={e => setMaxPerAccount(Number(e.target.value))} className="h-9" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Tentativas máximas</Label>
            <Input type="number" value={maxRetries} onChange={e => setMaxRetries(Number(e.target.value))} className="h-9" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Horário início</Label>
            <Input type="time" value={startHour} onChange={e => setStartHour(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Horário fim</Label>
            <Input type="time" value={endHour} onChange={e => setEndHour(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Regra anti-duplicidade</Label>
            <Select value={dedupeRule} onValueChange={setDedupeRule}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="same_group">Mesmo número no mesmo grupo</SelectItem>
                <SelectItem value="any_group">Mesmo número em qualquer grupo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Janela anti-duplicidade (dias)</Label>
            <Input type="number" value={dedupeDays} onChange={e => setDedupeDays(Number(e.target.value))} className="h-9" />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Mensagem de Boas-vindas</Label>
          <Textarea
            value={messageContent}
            onChange={e => setMessageContent(e.target.value)}
            placeholder="Olá {nome}! Seja bem-vindo(a) ao grupo {grupo}! 🎉"
            className="min-h-[100px] text-sm"
          />
          <p className="text-[10px] text-muted-foreground">Variáveis: {"{nome}"}, {"{numero}"}, {"{grupo}"}, {"{data}"}, {"{hora}"}</p>
        </div>
        <Button onClick={save} disabled={update.isPending} className="gap-2">
          {update.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
          Salvar Configuração
        </Button>
      </CardContent>
    </Card>
  );
}

function CreateAutomationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const create = useCreateWelcomeAutomation();
  const [name, setName] = useState("");
  const [monitoringDevice, setMonitoringDevice] = useState("");
  const [messageContent, setMessageContent] = useState("Olá! Seja bem-vindo(a) ao grupo! 🎉");
  const [selectedSenders, setSelectedSenders] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<{ group_id: string; group_name: string }[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<{ id: string; name: string }[]>([]);

  const { data: devices } = useQuery({
    queryKey: ["devices-for-welcome"],
    queryFn: async () => {
      const { data } = await supabase.from("devices").select("id, name, status, number").order("name");
      return data || [];
    },
    enabled: open,
  });

  const connectedDevices = devices?.filter(d => ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"].includes(d.status)) || [];

  const loadGroups = async () => {
    if (!monitoringDevice) return;
    setGroupsLoading(true);
    try {
      const device = devices?.find(d => d.id === monitoringDevice);
      if (!device) return;
      const { data: deviceFull } = await supabase.from("devices").select("uazapi_token, uazapi_base_url").eq("id", monitoringDevice).single();
      if (!deviceFull?.uazapi_token || !deviceFull?.uazapi_base_url) {
        toast.error("Dispositivo sem credenciais configuradas");
        return;
      }
      // Try to fetch groups via edge function
      const { data, error } = await supabase.functions.invoke("whapi-chats", {
        body: { deviceId: monitoringDevice, type: "groups" },
      });
      if (error) throw error;
      const groups = (data?.chats || data?.groups || [])
        .filter((g: any) => g.id?.includes("@g.us"))
        .map((g: any) => ({ id: g.id, name: g.name || g.subject || g.id }));
      setAvailableGroups(groups);
    } catch (err: any) {
      toast.error("Erro ao carregar grupos: " + (err.message || "desconhecido"));
    } finally {
      setGroupsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!name || !monitoringDevice || !messageContent || selectedSenders.length === 0) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    await create.mutateAsync({
      name,
      monitoring_device_id: monitoringDevice,
      message_content: messageContent,
      group_ids: selectedGroups,
      sender_device_ids: selectedSenders,
    });
    onOpenChange(false);
    setName("");
    setMonitoringDevice("");
    setMessageContent("Olá! Seja bem-vindo(a) ao grupo! 🎉");
    setSelectedSenders([]);
    setSelectedGroups([]);
  };

  const toggleGroup = (g: { id: string; name: string }) => {
    setSelectedGroups(prev =>
      prev.some(sg => sg.group_id === g.id)
        ? prev.filter(sg => sg.group_id !== g.id)
        : [...prev, { group_id: g.id, group_name: g.name }]
    );
  };

  const toggleSender = (id: string) => {
    setSelectedSenders(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-primary" />
            Nova Automação de Boas-vindas
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Nome da automação *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Boas-vindas Grupo VIP" className="h-9" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Conta de monitoramento *</Label>
            <Select value={monitoringDevice} onValueChange={(v) => { setMonitoringDevice(v); setAvailableGroups([]); setSelectedGroups([]); }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {connectedDevices.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name} {d.number ? `(${d.number})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {monitoringDevice && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Grupos monitorados</Label>
                <Button size="sm" variant="outline" onClick={loadGroups} disabled={groupsLoading} className="h-7 text-[11px] gap-1">
                  {groupsLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Carregar
                </Button>
              </div>
              {availableGroups.length > 0 && (
                <ScrollArea className="max-h-[150px] border rounded-lg p-2">
                  {availableGroups.map(g => (
                    <label key={g.id} className="flex items-center gap-2 py-1 px-1 hover:bg-muted/30 rounded cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={selectedGroups.some(sg => sg.group_id === g.id)}
                        onChange={() => toggleGroup(g)}
                        className="rounded"
                      />
                      <span className="truncate">{g.name}</span>
                    </label>
                  ))}
                </ScrollArea>
              )}
              {selectedGroups.length > 0 && (
                <p className="text-[10px] text-muted-foreground">{selectedGroups.length} grupo(s) selecionado(s)</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Contas remetentes *</Label>
            <ScrollArea className="max-h-[120px] border rounded-lg p-2">
              {connectedDevices.map(d => (
                <label key={d.id} className="flex items-center gap-2 py-1 px-1 hover:bg-muted/30 rounded cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={selectedSenders.includes(d.id)}
                    onChange={() => toggleSender(d.id)}
                    className="rounded"
                  />
                  <span className="truncate">{d.name} {d.number ? `(${d.number})` : ""}</span>
                </label>
              ))}
            </ScrollArea>
            {selectedSenders.length > 0 && (
              <p className="text-[10px] text-muted-foreground">{selectedSenders.length} conta(s) selecionada(s)</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Mensagem *</Label>
            <Textarea
              value={messageContent}
              onChange={e => setMessageContent(e.target.value)}
              placeholder="Olá {nome}! Seja bem-vindo(a)!"
              className="min-h-[80px] text-sm"
            />
            <p className="text-[10px] text-muted-foreground">Use: {"{nome}"}, {"{numero}"}, {"{grupo}"}, {"{data}"}, {"{hora}"}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={create.isPending} className="gap-2">
            {create.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
