import { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, BotMessageSquare, Pencil, Copy, Trash2, MoreHorizontal,
  Zap, Clock, Search, Filter, GitBranch, MousePointerClick,
  Loader2, Smartphone, FolderPlus, Folder, Check, ChevronsUpDown, CheckCircle2,
  ChevronDown, ChevronRight, FolderOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const triggerLabels: Record<string, string> = {
  any_message: "Qualquer mensagem",
  keyword: "Palavra-chave",
  new_contact: "Novo contato",
  start_chat: "Início de atendimento",
  template: "Template",
};

const onlineStatuses = new Set(["connected", "Connected", "Ready", "ready", "authenticated"]);

export default function AutoReplyList() {
  const navigate = useNavigate();
  const location = useLocation();
  const isStandalone = location.pathname.startsWith("/dashboard/auto-reply") || location.pathname.startsWith("/dashboard/autoreply");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroup, setRenamingGroup] = useState<{ id: string; name: string } | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAutomationName, setNewAutomationName] = useState("");
  const [newAutomationGroup, setNewAutomationGroup] = useState<string>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) =>
    setCollapsedGroups((s) => ({ ...s, [key]: !s[key] }));

  const { data: flows, isLoading } = useQuery({
    queryKey: ["autoreply_flows", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("autoreply_flows")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: groups } = useQuery({
    queryKey: ["autoreply_flow_groups", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("autoreply_flow_groups")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: devices } = useQuery({
    queryKey: ["devices-list", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .eq("user_id", user.id)
        .neq("login_type", "report_wa")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 120_000,
  });

  // Contador real: sessões iniciadas por fluxo
  const { data: successCounts } = useQuery({
    queryKey: ["autoreply_success_counts", user?.id],
    queryFn: async () => {
      if (!user?.id) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("autoreply_sessions")
        .select("flow_id")
        .eq("user_id", user.id);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        counts[row.flow_id] = (counts[row.flow_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const deviceMap = useMemo(() => {
    const map = new Map<string, { name: string; number: string | null; status: string }>();
    devices?.forEach((d) => map.set(d.id, { name: d.name, number: d.number, status: d.status }));
    return map;
  }, [devices]);

  const groupMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    groups?.forEach((g) => map.set(g.id, { id: g.id, name: g.name }));
    return map;
  }, [groups]);

  const updateFlowMutation = useMutation({
    mutationFn: async (vars: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("autoreply_flows").update(vars.patch as any).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoreply_flows", user?.id] });
    },
    onError: () => toast.error("Erro ao atualizar fluxo"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const flow = flows?.find((f) => f.id === id);
      if (is_active) {
        const ids: string[] = (flow as any)?.device_ids || [];
        const applyAll = !!(flow as any)?.apply_to_all_devices;
        if (!applyAll && ids.length === 0 && !(flow as any)?.device_id) {
          throw new Error("NO_DEVICE");
        }
      }
      const { error } = await supabase.from("autoreply_flows").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["autoreply_flows", user?.id] });
      const previousFlows = queryClient.getQueryData<any[]>(["autoreply_flows", user?.id]);
      queryClient.setQueryData<any[]>(["autoreply_flows", user?.id], (old = []) =>
        old.map((flow) => (flow.id === vars.id ? { ...flow, is_active: vars.is_active } : flow))
      );
      return { previousFlows };
    },
    onSuccess: (_, vars) => {
      toast.success(vars.is_active ? "Automação ativada" : "Automação desativada");
    },
    onError: (err: any, _vars, context) => {
      if (context?.previousFlows) {
        queryClient.setQueryData(["autoreply_flows", user?.id], context.previousFlows);
      }
      if (err.message === "NO_DEVICE") {
        toast.error("Selecione ao menos uma instância (ou marque 'Todas as instâncias') antes de ativar");
      } else {
        toast.error("Erro ao alterar status da automação");
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["autoreply_flows", user?.id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("autoreply_flows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoreply_flows", user?.id] });
      toast.success("Automação excluída");
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: original, error: fetchErr } = await supabase
        .from("autoreply_flows").select("*").eq("id", id).single();
      if (fetchErr || !original) throw fetchErr;
      const { error } = await supabase.from("autoreply_flows").insert({
        user_id: user!.id,
        name: `${original.name} (cópia)`,
        is_active: false,
        nodes: original.nodes,
        edges: original.edges,
        device_id: (original as any).device_id || null,
        device_ids: (original as any).device_ids || [],
        apply_to_all_devices: (original as any).apply_to_all_devices || false,
        group_id: (original as any).group_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoreply_flows", user?.id] });
      toast.success("Automação duplicada");
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("autoreply_flow_groups").insert({
        user_id: user!.id,
        name: name.trim(),
        sort_order: (groups?.length || 0),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoreply_flow_groups", user?.id] });
      toast.success("Grupo criado");
      setNewGroupName("");
      setGroupDialogOpen(false);
    },
    onError: () => toast.error("Erro ao criar grupo"),
  });

  const renameGroupMutation = useMutation({
    mutationFn: async (vars: { id: string; name: string }) => {
      const { error } = await supabase.from("autoreply_flow_groups")
        .update({ name: vars.name.trim() })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoreply_flow_groups", user?.id] });
      setRenamingGroup(null);
      toast.success("Grupo renomeado");
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("autoreply_flow_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoreply_flow_groups", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["autoreply_flows", user?.id] });
      toast.success("Grupo excluído");
    },
  });

  const models = flows || [];

  const filtered = useMemo(() => {
    return models.filter((m) => {
      const matchSearch = m.name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" ||
        (statusFilter === "active" && m.is_active) ||
        (statusFilter === "inactive" && !m.is_active);
      return matchSearch && matchStatus;
    });
  }, [models, search, statusFilter]);

  // Agrupar por grupo
  const grouped = useMemo(() => {
    const map = new Map<string | null, any[]>();
    filtered.forEach((f) => {
      const k = (f as any).group_id || null;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    });
    return map;
  }, [filtered]);

  const getFlowInfo = (flow: any) => {
    const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
    const steps = nodes.length;
    const buttons = nodes.reduce((acc: number, n: any) => acc + (n.data?.buttons?.length || 0), 0);
    const startNode = nodes.find((n: any) => n.type === "startNode");
    const trigger = startNode?.data?.trigger || "keyword";
    return { steps, buttons, trigger };
  };

  const activeCount = models.filter((m) => m.is_active).length;

  // ── Render de um card de fluxo ──
  const renderFlowCard = (flow: any) => {
    const { steps, buttons, trigger } = getFlowInfo(flow);
    const flowDeviceIds: string[] = (flow.device_ids && flow.device_ids.length > 0)
      ? flow.device_ids
      : (flow.device_id ? [flow.device_id] : []);
    const applyAll: boolean = !!flow.apply_to_all_devices;
    const successCount = successCounts?.[flow.id] || 0;

    return (
      <div
        key={flow.id}
        className="group relative rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30 hover:border-border/50 hover:bg-card/80 transition-all duration-200 overflow-hidden"
      >
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl transition-colors ${
          flow.is_active ? "bg-emerald-500" : "bg-transparent"
        }`} />

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-4 pl-6">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 transition-colors ${
              flow.is_active ? "bg-emerald-500/10 ring-emerald-500/20" : "bg-muted/20 ring-border/30"
            }`}>
              <BotMessageSquare className={`w-4 h-4 ${flow.is_active ? "text-emerald-500" : "text-muted-foreground/40"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1">
                <h3 className="text-sm font-semibold text-foreground truncate">{flow.name}</h3>
                <Badge variant={flow.is_active ? "default" : "secondary"} className={`text-[10px] px-2 py-0 h-5 font-medium shrink-0 ${
                  flow.is_active
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/15"
                    : "bg-muted/30 text-muted-foreground/50 border-border/30 hover:bg-muted/40"
                }`}>
                  {flow.is_active ? "Ativo" : "Inativo"}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 font-medium shrink-0 bg-emerald-500/5 text-emerald-500 border-emerald-500/20 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {successCount} sucesso{successCount !== 1 ? "s" : ""}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                  <Zap className="w-3 h-3 text-amber-500/60" /> {triggerLabels[trigger] || trigger}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
                  <GitBranch className="w-3 h-3" /> {steps} bloco{steps !== 1 ? "s" : ""}
                </span>
                {buttons > 0 && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
                    <MousePointerClick className="w-3 h-3" /> {buttons} botão{buttons !== 1 ? "ões" : ""}
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
                  <Smartphone className="w-3 h-3" />
                  {applyAll
                    ? <span>Todas as instâncias</span>
                    : flowDeviceIds.length === 0
                      ? <span className="text-amber-500/70">Nenhuma instância</span>
                      : <span>{flowDeviceIds.length} instância{flowDeviceIds.length !== 1 ? "s" : ""}</span>}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/30">
                  <Clock className="w-3 h-3" /> {format(new Date(flow.updated_at), "dd MMM, HH:mm", { locale: ptBR })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pl-[52px] sm:pl-0">
            {/* Multi-select de instâncias */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[180px] h-8 text-xs justify-between gap-1.5 bg-card/60 border-border/30">
                  <span className="flex items-center gap-1.5 truncate">
                    <Smartphone className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                    <span className="truncate">
                      {applyAll ? "Todas as instâncias" : flowDeviceIds.length > 0 ? `${flowDeviceIds.length} selecionada${flowDeviceIds.length !== 1 ? "s" : ""}` : "Instâncias"}
                    </span>
                  </span>
                  <ChevronsUpDown className="w-3 h-3 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="end">
                <div className="px-3 py-2.5 border-b border-border/40">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={applyAll}
                      onCheckedChange={(v) => updateFlowMutation.mutate({
                        id: flow.id,
                        patch: { apply_to_all_devices: !!v, device_ids: !!v ? [] : flowDeviceIds }
                      })}
                    />
                    <span className="text-xs font-medium">Aplicar a todas as instâncias</span>
                  </label>
                </div>
                <ScrollArea className="max-h-[280px]">
                  <div className="p-1.5">
                    {(devices || []).map((d) => {
                      const checked = flowDeviceIds.includes(d.id);
                      return (
                        <label
                          key={d.id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/40 ${applyAll ? "opacity-50 pointer-events-none" : ""}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = v
                                ? Array.from(new Set([...flowDeviceIds, d.id]))
                                : flowDeviceIds.filter((id) => id !== d.id);
                              updateFlowMutation.mutate({
                                id: flow.id,
                                patch: { device_ids: next, apply_to_all_devices: false, device_id: next[0] || null }
                              });
                            }}
                          />
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${onlineStatuses.has(d.status) ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                          <span className="text-xs truncate flex-1">{d.name}</span>
                          {d.number && <span className="text-[10px] text-muted-foreground/50">{d.number}</span>}
                        </label>
                      );
                    })}
                    {(!devices || devices.length === 0) && (
                      <div className="text-xs text-muted-foreground/50 px-3 py-4 text-center">
                        Nenhuma instância disponível
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>

            <Switch
              checked={flow.is_active}
              onCheckedChange={(val) => toggleMutation.mutate({ id: flow.id, is_active: val })}
              className="scale-[0.85]"
            />
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-border/40 hover:border-primary/40 hover:text-primary transition-colors" onClick={() => navigate(`/dashboard/auto-reply/${flow.id}`)}>
              <Pencil className="w-3 h-3" /> <span className="hidden sm:inline">Editar</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground/40 hover:text-foreground">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => duplicateMutation.mutate(flow.id)}>
                  <Copy className="w-3.5 h-3.5 mr-2" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/50">Mover para grupo</div>
                <DropdownMenuItem onClick={() => updateFlowMutation.mutate({ id: flow.id, patch: { group_id: null } })}>
                  <Folder className="w-3.5 h-3.5 mr-2 opacity-40" /> Sem grupo
                  {!flow.group_id && <Check className="w-3.5 h-3.5 ml-auto" />}
                </DropdownMenuItem>
                {groups?.map((g) => (
                  <DropdownMenuItem key={g.id} onClick={() => updateFlowMutation.mutate({ id: flow.id, patch: { group_id: g.id } })}>
                    <Folder className="w-3.5 h-3.5 mr-2 text-emerald-500/70" /> {g.name}
                    {flow.group_id === g.id && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => deleteMutation.mutate(flow.id)} className="text-destructive focus:text-destructive">
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full px-4 sm:px-6 py-8 animate-fade-in">
      {isStandalone && (
        <button
          onClick={() => navigate("/dashboard/conversations")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Voltar para Conversas
        </button>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
            <BotMessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Resposta Automática</h1>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {models.length} automação{models.length !== 1 ? "ões" : ""} · {activeCount} ativa{activeCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setGroupDialogOpen(true)}
            className="h-9 text-xs gap-2 border-border/40"
          >
            <FolderPlus className="w-4 h-4" /> Novo grupo
          </Button>
          <Button onClick={() => { setNewAutomationName(""); setNewAutomationGroup("none"); setCreateDialogOpen(true); }} className="h-9 text-xs gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> Criar nova automação
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs bg-card/60 border-border/30 focus:border-primary/40"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px] h-9 text-xs bg-card/60 border-border/30">
            <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground/40" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/30" />
        </div>
      ) : models.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center mb-5 ring-1 ring-border/20">
            <BotMessageSquare className="w-8 h-8 text-muted-foreground/20" />
          </div>
          <h2 className="text-sm font-semibold text-foreground mb-1.5">Nenhuma automação criada</h2>
          <p className="text-xs text-muted-foreground/50 max-w-xs mb-6">
            Crie sua primeira automação e use seus modelos existentes como mensagens do fluxo.
          </p>
          <Button onClick={() => { setNewAutomationName(""); setNewAutomationGroup("none"); setCreateDialogOpen(true); }} className="h-9 text-xs gap-2">
            <Plus className="w-4 h-4" /> Criar primeira automação
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="w-8 h-8 text-muted-foreground/20 mb-4" />
          <p className="text-sm text-muted-foreground/50">Nenhuma automação encontrada</p>
          <p className="text-xs text-muted-foreground/30 mt-1">Tente ajustar a busca ou o filtro</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Renderiza cada grupo + sem grupo no fim */}
          {(groups || []).map((g) => {
            const list = grouped.get(g.id) || [];
            const collapsed = !!collapsedGroups[g.id];
            const activeInGroup = list.filter((f: any) => f.is_active).length;
            return (
              <div
                key={g.id}
                className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center shrink-0">
                      {collapsed ? (
                        <Folder className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <FolderOpen className="w-3.5 h-3.5 text-emerald-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate">{g.name}</h3>
                      <Badge variant="secondary" className="h-5 px-2 text-[10px] bg-muted/40 border-border/30 text-muted-foreground">
                        {list.length}
                      </Badge>
                      {activeInGroup > 0 && (
                        <Badge variant="outline" className="h-5 px-2 text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                          {activeInGroup} ativa{activeInGroup !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    {collapsed ? (
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 ml-auto shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground/40 ml-auto shrink-0" />
                    )}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground/40 hover:text-foreground shrink-0">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setRenamingGroup({ id: g.id, name: g.name })}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setNewAutomationName("");
                          setNewAutomationGroup(g.id);
                          setCreateDialogOpen(true);
                        }}
                      >
                        <Plus className="w-3.5 h-3.5 mr-2" /> Nova automação aqui
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => deleteGroupMutation.mutate(g.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir grupo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {!collapsed && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/30 bg-background/20">
                    {list.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground/40 px-2 py-4 italic text-center">
                        Nenhuma automação neste grupo. Use o menu de cada automação para mover, ou crie uma nova aqui.
                      </div>
                    ) : (
                      <div className="space-y-2 pt-2">{list.map(renderFlowCard)}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Sem grupo */}
          {(grouped.get(null) || []).length > 0 && (() => {
            const list = grouped.get(null) || [];
            const collapsed = !!collapsedGroups["__none__"];
            const showHeader = (groups?.length || 0) > 0;
            const activeInGroup = list.filter((f: any) => f.is_active).length;
            return (
              <div className="rounded-2xl border border-border/30 bg-card/30 backdrop-blur-sm overflow-hidden">
                {showHeader && (
                  <button
                    type="button"
                    onClick={() => toggleGroup("__none__")}
                    className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-muted/30 ring-1 ring-border/30 flex items-center justify-center shrink-0">
                      {collapsed ? (
                        <Folder className="w-3.5 h-3.5 text-muted-foreground/60" />
                      ) : (
                        <FolderOpen className="w-3.5 h-3.5 text-muted-foreground/60" />
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-muted-foreground/80 truncate">Sem grupo</h3>
                    <Badge variant="secondary" className="h-5 px-2 text-[10px] bg-muted/40 border-border/30 text-muted-foreground">
                      {list.length}
                    </Badge>
                    {activeInGroup > 0 && (
                      <Badge variant="outline" className="h-5 px-2 text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        {activeInGroup} ativa{activeInGroup !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {collapsed ? (
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 ml-auto" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground/40 ml-auto" />
                    )}
                  </button>
                )}
                {(!showHeader || !collapsed) && (
                  <div className={showHeader ? "px-3 pb-3 pt-1 border-t border-border/30 bg-background/20" : "p-0"}>
                    <div className={`space-y-2 ${showHeader ? "pt-2" : ""}`}>{list.map(renderFlowCard)}</div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Dialog de novo grupo */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo grupo de fluxos</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Nome do grupo</Label>
            <Input
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Ex: Atendimento, Vendas..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && newGroupName.trim()) {
                  createGroupMutation.mutate(newGroupName);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createGroupMutation.mutate(newGroupName)}
              disabled={!newGroupName.trim() || createGroupMutation.isPending}
            >
              {createGroupMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Criar grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog renomear grupo */}
      <Dialog open={!!renamingGroup} onOpenChange={(o) => !o && setRenamingGroup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear grupo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Nome do grupo</Label>
            <Input
              autoFocus
              value={renamingGroup?.name || ""}
              onChange={(e) => setRenamingGroup((g) => g ? { ...g, name: e.target.value } : g)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renamingGroup?.name.trim()) {
                  renameGroupMutation.mutate(renamingGroup);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingGroup(null)}>Cancelar</Button>
            <Button
              onClick={() => renamingGroup && renameGroupMutation.mutate(renamingGroup)}
              disabled={!renamingGroup?.name.trim() || renameGroupMutation.isPending}
            >
              {renameGroupMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
