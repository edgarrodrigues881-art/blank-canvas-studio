import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, BotMessageSquare, Pencil, Copy, Trash2, MoreHorizontal,
  Zap, Clock, Search, Filter, GitBranch, MousePointerClick,
  Loader2, Smartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

export default function AutoReplyList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: flows, isLoading } = useQuery({
    queryKey: ["autoreply_flows", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("autoreply_flows")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: devices } = useQuery({
    queryKey: ["devices-list", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .neq("login_type", "report_wa")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 120_000,
  });

  const onlineStatuses = new Set(["connected", "Connected", "Ready", "ready", "authenticated"]);

  const deviceMap = useMemo(() => {
    const map = new Map<string, { name: string; number: string | null; status: string }>();
    devices?.forEach((d) => map.set(d.id, { name: d.name, number: d.number, status: d.status }));
    return map;
  }, [devices]);

  const deviceMutation = useMutation({
    mutationFn: async ({ id, device_id }: { id: string; device_id: string | null }) => {
      const { error } = await supabase.from("autoreply_flows").update({ device_id } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoreply_flows", user?.id] });
      toast.success("Instância atualizada");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const flow = flows?.find((f) => f.id === id);

      if (is_active) {
        if (!flow?.device_id) {
          throw new Error("NO_DEVICE");
        }
        const device = deviceMap.get(flow.device_id);
        if (!device) {
          throw new Error("NO_DEVICE");
        }
        if (!onlineStatuses.has(device.status)) {
          throw new Error("DEVICE_OFFLINE");
        }
      }

      const { error } = await supabase.from("autoreply_flows").update({ is_active }).eq("id", id);
      if (error) throw error;

      if (flow?.device_id) {
        const action = is_active ? "register_webhook" : "disable_webhook";
        const { data, error: webhookError } = await supabase.functions.invoke("autoreply-webhook", {
          body: { action, device_id: flow.device_id },
        });

        const webhookMessage = webhookError?.message || (data?.error ? `${data.error}${data.details ? ` ${data.details}` : ""}` : "");

        if (is_active && webhookMessage) {
          await supabase.from("autoreply_flows").update({ is_active: false }).eq("id", id);
          throw new Error(`WEBHOOK_REGISTRATION_FAILED:${webhookMessage}`);
        }
      }
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["autoreply_flows", user?.id] });
      const previousFlows = queryClient.getQueryData<any[]>(["autoreply_flows", user?.id]);

      queryClient.setQueryData<any[]>(["autoreply_flows", user?.id], (old = []) =>
        old.map((flow) =>
          flow.id === vars.id ? { ...flow, is_active: vars.is_active } : flow
        )
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
        toast.error("Selecione uma instância antes de ativar a automação");
      } else if (err.message === "DEVICE_OFFLINE") {
        toast.error("A instância selecionada está desconectada. Reconecte antes de ativar.");
      } else if (typeof err.message === "string" && err.message.startsWith("WEBHOOK_REGISTRATION_FAILED:")) {
        toast.error(err.message.replace("WEBHOOK_REGISTRATION_FAILED:", "Falha ao registrar webhook: "));
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
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoreply_flows", user?.id] });
      toast.success("Automação duplicada");
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

  const getFlowInfo = (flow: any) => {
    const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
    const steps = nodes.length;
    const buttons = nodes.reduce((acc: number, n: any) => acc + (n.data?.buttons?.length || 0), 0);
    const startNode = nodes.find((n: any) => n.type === "startNode");
    const trigger = startNode?.data?.trigger || "keyword";
    return { steps, buttons, trigger };
  };

  const activeCount = models.filter((m) => m.is_active).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      {/* Header */}
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
        <Button onClick={() => navigate("/dashboard/auto-reply/new")} className="h-9 text-xs gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> Criar nova automação
        </Button>
      </div>

      {/* Search & Filter */}
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

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/30" />
        </div>
      ) : filtered.length === 0 && models.length > 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="w-8 h-8 text-muted-foreground/20 mb-4" />
          <p className="text-sm text-muted-foreground/50">Nenhuma automação encontrada</p>
          <p className="text-xs text-muted-foreground/30 mt-1">Tente ajustar a busca ou o filtro</p>
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
          <Button onClick={() => navigate("/dashboard/auto-reply/new")} className="h-9 text-xs gap-2">
            <Plus className="w-4 h-4" /> Criar primeira automação
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((flow) => {
            const { steps, buttons, trigger } = getFlowInfo(flow);
            const deviceInfo = (flow as any).device_id ? deviceMap.get((flow as any).device_id) : null;
            return (
              <div
                key={flow.id}
                className="group relative rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30 hover:border-border/50 hover:bg-card/80 transition-all duration-200 overflow-hidden"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl transition-colors ${
                  flow.is_active ? "bg-emerald-500" : "bg-transparent"
                }`} />
                
                {/* Main row - stack on mobile */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-4 pl-6">
                  {/* Icon + Info */}
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
                        {deviceInfo && (
                          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
                            <Smartphone className="w-3 h-3" />
                            <span className={`w-1.5 h-1.5 rounded-full ${onlineStatuses.has(deviceInfo.status) ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                            {deviceInfo.name}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/30">
                          <Clock className="w-3 h-3" /> {format(new Date(flow.updated_at), "dd MMM, HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 pl-[52px] sm:pl-0">
                    <Select
                      value={(flow as any).device_id || "none"}
                      onValueChange={(v) => deviceMutation.mutate({ id: flow.id, device_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger className="w-[140px] sm:w-[160px] h-8 text-xs bg-card/60 border-border/30 gap-1.5">
                        <Smartphone className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                        <SelectValue placeholder="Instância" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem instância</SelectItem>
                         {devices?.map((d) => (
                           <SelectItem key={d.id} value={d.id}>
                             <div className="flex items-center gap-1.5">
                               <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${onlineStatuses.has(d.status) ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                               <span className="truncate">{d.name}</span>
                             </div>
                           </SelectItem>
                         ))}
                      </SelectContent>
                    </Select>
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
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => duplicateMutation.mutate(flow.id)}>
                          <Copy className="w-3.5 h-3.5 mr-2" /> Duplicar
                        </DropdownMenuItem>
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
          })}
        </div>
      )}
    </div>
  );
}
