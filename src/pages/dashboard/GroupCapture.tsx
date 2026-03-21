import { useState, useMemo, useCallback } from "react";
import dgGroupAvatar from "@/assets/dg-group-avatar.png";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  UsersRound, Copy, Check, LogIn, Timer, Search,
  Loader2, Shield, StopCircle, XCircle, Clock, Users, Plus, Trash2, Link2, UserPlus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast as sonnerToast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ── Helpers ── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted/40 transition-colors shrink-0" onClick={copy}>
      {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground/40" />}
    </button>
  );
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const statusMap: Record<string, { label: string; dot: string }> = {
  running:   { label: "Em andamento", dot: "bg-emerald-400 animate-pulse" },
  paused:    { label: "Pausada",      dot: "bg-amber-400" },
  done:      { label: "Concluída",    dot: "bg-blue-400" },
  cancelled: { label: "Cancelada",    dot: "bg-muted-foreground" },
};

/* ── Campaign Card ── */
function CampaignCard({ camp, onCancel, onDelete, showDelete }: {
  camp: any; onCancel?: () => void; onDelete?: () => void; showDelete?: boolean;
}) {
  const total = camp.total_items || 0;
  const success = (camp.success_count || 0) + (camp.already_member_count || 0);
  const errors = camp.error_count || 0;
  const pending = Math.max(0, total - success - errors);
  const progress = total > 0 ? ((success + errors) / total) * 100 : 0;
  const st = statusMap[camp.status] || statusMap.done;

  return (
    <div className="relative rounded-2xl border border-border/20 bg-card/80 backdrop-blur-xl p-4 space-y-3 overflow-hidden group hover:border-border/30 transition-colors">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
          <span className="text-[13px] font-semibold text-foreground truncate">
            {camp.name || `Campanha ${formatDate(camp.created_at)}`}
          </span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-border/20 text-muted-foreground/60 font-medium shrink-0">{st.label}</span>
      </div>

      <Progress value={progress} className="h-1" />

      <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
        <div><span className="text-muted-foreground/50">OK</span> <span className="font-bold text-primary ml-0.5">{success}</span></div>
        <div><span className="text-muted-foreground/50">Erro</span> <span className={`font-bold ml-0.5 ${errors ? "text-destructive" : "text-foreground/60"}`}>{errors}</span></div>
        <div><span className="text-muted-foreground/50">Pend.</span> <span className="font-bold ml-0.5 text-foreground/60">{pending}</span></div>
        <div><span className="text-muted-foreground/50">Total</span> <span className="font-bold ml-0.5 text-foreground/60">{total}</span></div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/10 text-[10px] text-muted-foreground/40">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(camp.created_at)}</span>
        <div className="flex gap-1">
          {camp.status === "running" && onCancel && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive rounded-lg" onClick={onCancel}>
              <StopCircle className="w-3 h-3 mr-1" /> Parar
            </Button>
          )}
          {showDelete && camp.status !== "running" && onDelete && (
            <button className="h-6 w-6 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-muted-foreground/30 hover:text-destructive transition-colors" onClick={onDelete}>
              <XCircle className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Campaigns Widget ── */
function GroupJoinCampaignsWidget() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: campaigns = [] } = useQuery({
    queryKey: ["group-join-campaigns"],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_join_campaigns" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(15);
      return (data || []) as any[];
    },
    enabled: !!user,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("group_join_campaigns" as any).update({ status: "cancelled", completed_at: new Date().toISOString() } as any).eq("id", id);
      await supabase.from("group_join_queue" as any).update({ status: "cancelled" } as any).eq("campaign_id", id).eq("status", "pending");
    },
    onSuccess: () => { sonnerToast.success("Cancelada"); queryClient.invalidateQueries({ queryKey: ["group-join-campaigns"] }); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { await supabase.from("group_join_campaigns" as any).delete().eq("id", id); },
    onSuccess: () => { sonnerToast.success("Removida"); queryClient.invalidateQueries({ queryKey: ["group-join-campaigns"] }); },
  });

  if (campaigns.length === 0) return null;

  const active = campaigns.filter((c: any) => c.status === "running");
  const history = campaigns.filter((c: any) => c.status !== "running");

  return (
    <div className="space-y-3">
      {active.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" /> Ativas
            <Badge variant="secondary" className="text-[10px] ml-1">{active.length}</Badge>
          </h2>
          {active.map((c: any) => (
            <CampaignCard key={c.id} camp={c} onCancel={() => cancelMut.mutate(c.id)} />
          ))}
        </div>
      )}
      {history.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Histórico
          </h2>
          {history.slice(0, 5).map((c: any) => (
            <CampaignCard key={c.id} camp={c} showDelete onDelete={() => deleteMut.mutate(c.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Group List Component ── */
function GroupList({ groups, isCustom, onDelete }: { groups: any[]; isCustom: boolean; onDelete?: (id: string) => void }) {
  if (groups.length === 0) {
    return (
      <div className="relative rounded-2xl border border-border/20 bg-card/80 backdrop-blur-xl overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="py-16 text-center">
          <UsersRound className="w-10 h-10 text-muted-foreground/15 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground/50 font-medium">
            {isCustom ? "Nenhum grupo próprio cadastrado" : "Nenhum grupo do sistema"}
          </p>
          {isCustom && (
            <p className="text-xs text-muted-foreground/30 mt-1">Adicione seus grupos usando o formulário acima</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-border/20 bg-card/80 backdrop-blur-xl overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/10">
        <h3 className="text-sm font-bold text-foreground">{groups.length} grupo{groups.length !== 1 ? "s" : ""}</h3>
        {isCustom && (
          <Badge variant="outline" className="text-[10px] border-primary/20 text-primary/70">Seus grupos</Badge>
        )}
      </div>
      <div className="divide-y divide-border/10">
        {groups.map((g: any) => (
          <div key={g.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/5 transition-colors group/row">
            <img src={dgGroupAvatar} alt="Grupo" className="w-10 h-10 rounded-xl object-cover shrink-0 ring-1 ring-border/10" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate">{g.name}</p>
              <p className="text-[10px] text-muted-foreground/35 truncate font-mono mt-0.5">{g.link}</p>
            </div>
            <div className="flex items-center gap-1 opacity-50 group-hover/row:opacity-100 transition-opacity">
              <CopyButton text={g.link} />
              {isCustom && onDelete && (
                <button
                  className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-colors"
                  onClick={() => onDelete(g.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Page ── */
const GroupCapture = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [activeTab, setActiveTab] = useState("custom");
  const [deviceSearch, setDeviceSearch] = useState("");

  // Add group form
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupLink, setNewGroupLink] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Fetch ALL groups (system + custom)
  const { data: allGroups = [], isLoading } = useQuery({
    queryKey: ["warmup-groups"],
    queryFn: async () => {
      const { data } = await supabase
        .from("warmup_groups")
        .select("id, name, link, description, is_custom, created_at")
        .order("name", { ascending: true });
      return (data || []) as any[];
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const systemGroups = useMemo(() => allGroups.filter((g: any) => !g.is_custom), [allGroups]);
  const customGroups = useMemo(() => allGroups.filter((g: any) => g.is_custom), [allGroups]);
  const currentGroups = activeTab === "system" ? systemGroups : customGroups;

  const { data: devices = [] } = useQuery({
    queryKey: ["devices-for-join"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .eq("user_id", user!.id)
        .neq("login_type", "report_wa")
        .order("name");
      return data || [];
    },
    enabled: !!user,
    staleTime: 60000,
  });

  // Add custom group
  const handleAddGroup = async () => {
    if (!user || !newGroupName.trim() || !newGroupLink.trim()) return;

    // Validate link
    const link = newGroupLink.trim();
    if (!link.includes("chat.whatsapp.com/")) {
      toast({ title: "Link inválido", description: "O link deve ser um convite do WhatsApp (chat.whatsapp.com/...)", variant: "destructive" });
      return;
    }

    setIsAdding(true);
    try {
      const { error } = await supabase
        .from("warmup_groups")
        .insert({
          user_id: user.id,
          name: newGroupName.trim(),
          link: link,
          is_custom: true,
          description: "Grupo próprio do usuário",
        });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["warmup-groups"] });
      setNewGroupName("");
      setNewGroupLink("");
      toast({ title: "Grupo adicionado!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  // Delete custom group
  const handleDeleteGroup = async (id: string) => {
    try {
      const { error } = await supabase.from("warmup_groups").delete().eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["warmup-groups"] });
      toast({ title: "Grupo removido" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const toggleGroup = useCallback((link: string) =>
    setSelectedGroups((prev) => prev.includes(link) ? prev.filter((l) => l !== link) : [...prev, link]), []);
  const toggleDevice = useCallback((id: string) =>
    setSelectedDevices((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]), []);

  const selectAllGroups = useCallback(() =>
    setSelectedGroups((prev) => prev.length === allGroups.length ? [] : allGroups.map((g: any) => g.link)), [allGroups]);
  const onlineDevices = devices.filter((d) => ["Connected", "Ready", "authenticated"].includes(d.status));
  const selectAllDevices = useCallback(() =>
    setSelectedDevices((prev) => prev.length === onlineDevices.length ? [] : onlineDevices.map((d) => d.id)), [onlineDevices]);

  const hasOffline = useMemo(() =>
    selectedDevices.some(id => {
      const d = devices.find(dev => dev.id === id);
      return d && !["Connected", "Ready", "authenticated"].includes(d.status);
    }), [selectedDevices, devices]);

  const totalOps = selectedGroups.length * selectedDevices.length;
  const canStart = totalOps > 0 && !hasOffline && !isStarting;

  const startJoinProcess = async () => {
    if (!user) return;
    setIsStarting(true);
    try {
      const queueItems: { device_id: string; device_name: string; group_link: string; group_name: string }[] = [];
      for (const deviceId of selectedDevices) {
        const dev = devices.find((d) => d.id === deviceId);
        for (const groupLink of selectedGroups) {
          const grp = allGroups.find((g: any) => g.link === groupLink);
          queueItems.push({ device_id: deviceId, device_name: dev?.name || deviceId, group_link: groupLink, group_name: grp?.name || groupLink });
        }
      }

      const { data: campData, error: campError } = await supabase
        .from("group_join_campaigns" as any)
        .insert({ user_id: user.id, name: `${selectedDevices.length} inst. × ${selectedGroups.length} grupos`, status: "running", total_items: queueItems.length, device_ids: selectedDevices, group_links: selectedGroups, min_delay: 10, max_delay: 30 } as any)
        .select("id").single();
      if (campError) throw campError;
      const campaignId = (campData as any)?.id;

      const { error: queueError } = await supabase
        .from("group_join_queue" as any)
        .insert(queueItems.map((item) => ({ campaign_id: campaignId, user_id: user.id, ...item, status: "pending" })) as any);
      if (queueError) throw queueError;

      supabase.functions.invoke("process-group-join-campaign", { body: { campaign_id: campaignId } }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["group-join-campaigns"] });
      toast({ title: "Campanha iniciada!", description: `${queueItems.length} entradas agendadas em segundo plano.` });
      setJoinModalOpen(false);
      setSelectedGroups([]);
      setSelectedDevices([]);
    } catch (err) {
      toast({ title: "Erro", description: String(err), variant: "destructive" });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <UsersRound className="w-5 h-5 text-primary" />
            </div>
            Grupos de Aquecimento
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cadastre seus próprios grupos para usar no aquecimento</p>
        </div>
        <Button onClick={() => setJoinModalOpen(true)} size="sm" className="gap-1.5 text-xs h-10 px-5 rounded-xl shadow-md">
          <LogIn className="w-4 h-4" /> Entrar nos Grupos
        </Button>
      </div>

      {/* Campaigns */}
      <GroupJoinCampaignsWidget />

      {/* Tabs: System vs Custom */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/10 border border-border/15 rounded-xl p-1 h-auto">
          <TabsTrigger value="custom" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 px-4 py-2">
            <UserPlus className="w-3.5 h-3.5" />
            Meus Grupos
            <Badge variant="secondary" className="text-[9px] ml-1 h-4 px-1.5">{customGroups.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="custom" className="space-y-4 mt-0">
          {/* Add group form */}
          <div className="relative rounded-2xl border border-border/20 bg-card/80 backdrop-blur-xl overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            <div className="p-5 space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" />
                Adicionar Grupo
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Nome do grupo</label>
                  <Input
                    placeholder="Ex: Meu Grupo #01"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="h-9 text-xs rounded-xl border-border/15 bg-muted/5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Link do convite</label>
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/30" />
                    <Input
                      placeholder="https://chat.whatsapp.com/..."
                      value={newGroupLink}
                      onChange={(e) => setNewGroupLink(e.target.value)}
                      className="h-9 text-xs rounded-xl border-border/15 bg-muted/5 pl-9"
                    />
                  </div>
                </div>
              </div>
              <Button
                onClick={handleAddGroup}
                disabled={isAdding || !newGroupName.trim() || !newGroupLink.trim()}
                size="sm"
                className="gap-1.5 text-xs h-9 rounded-xl"
              >
                {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Adicionar
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/30" /></div>
          ) : (
            <GroupList groups={customGroups} isCustom={true} onDelete={handleDeleteGroup} />
          )}
        </TabsContent>
      </Tabs>

      {/* Join Modal */}
      <Dialog open={joinModalOpen} onOpenChange={setJoinModalOpen}>
        <DialogContent className="max-w-sm sm:max-w-md max-h-[80vh] overflow-y-auto p-0 bg-card/95 backdrop-blur-2xl border-border/10 rounded-2xl shadow-2xl">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="px-6 pt-6 pb-3">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <LogIn className="w-4 h-4 text-primary" />
                </div>
                Entrar nos Grupos
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                Selecione instâncias e grupos. Roda <span className="font-semibold text-foreground">em segundo plano</span>.
              </p>
            </DialogHeader>
          </div>

          <div className="px-6 pb-4 space-y-4">
            {/* Devices */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  Instâncias <span className="normal-case font-normal">({selectedDevices.length}/{devices.length})</span>
                </span>
                <button className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors" onClick={selectAllDevices}>
                  {selectedDevices.length === devices.length ? "Desmarcar" : "Todas"}
                </button>
              </div>
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/30 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar instância..."
                  value={deviceSearch}
                  onChange={(e) => setDeviceSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-xs bg-muted/10 border border-border/15 rounded-lg placeholder:text-muted-foreground/25 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/20 transition-all"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-border/15 bg-muted/5 p-1.5 space-y-0.5">
                {(() => {
                  const sorted = [...devices].sort((a, b) => {
                    const onlineStatuses = ["Connected", "Ready", "authenticated"];
                    const aOn = onlineStatuses.includes(a.status) ? 0 : 1;
                    const bOn = onlineStatuses.includes(b.status) ? 0 : 1;
                    if (aOn !== bOn) return aOn - bOn;
                    return a.name.localeCompare(b.name, undefined, { numeric: true });
                  });
                  const filtered = deviceSearch.trim()
                    ? sorted.filter((d) => d.name.toLowerCase().includes(deviceSearch.toLowerCase()) || (d.number || "").includes(deviceSearch))
                    : sorted;
                  if (filtered.length === 0) return <p className="text-[11px] text-muted-foreground/30 text-center py-4">{devices.length === 0 ? "Nenhuma instância" : "Nenhum resultado"}</p>;
                  return filtered.map((d) => {
                    const online = ["Connected", "Ready", "authenticated"].includes(d.status);
                    const sel = selectedDevices.includes(d.id);
                    return (
                      <label key={d.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${online ? "cursor-pointer" : "cursor-not-allowed opacity-40"} ${sel ? "bg-primary/5 border border-primary/10" : "border border-transparent hover:bg-muted/20"}`}>
                        <Checkbox checked={sel} disabled={!online} onCheckedChange={() => online && toggleDevice(d.id)} />
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ring-2 ${online ? "bg-emerald-400 ring-emerald-400/20" : "bg-red-400 ring-red-400/20"}`} />
                        <span className="text-xs font-medium truncate flex-1">{d.name}</span>
                        {!online && <span className="text-[9px] text-destructive/60 font-medium ml-auto shrink-0">Offline</span>}
                        {online && d.number && <span className="text-[10px] text-muted-foreground/30 font-mono ml-auto">{d.number}</span>}
                      </label>
                    );
                  });
                })()}
              </div>
            </section>

            {/* Groups — show both system and custom */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  Grupos <span className="normal-case font-normal">({selectedGroups.length}/{allGroups.length})</span>
                </span>
                <button className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors" onClick={selectAllGroups}>
                  {selectedGroups.length === allGroups.length ? "Desmarcar" : "Todos"}
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto rounded-xl border border-border/15 bg-muted/5 p-1.5 space-y-0.5">
                {customGroups.length > 0 && (
                  <>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-primary/50 px-3 pt-1.5 pb-0.5">Meus Grupos</p>
                    {customGroups.map((g: any) => {
                      const sel = selectedGroups.includes(g.link);
                      return (
                        <label key={g.link} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${sel ? "bg-primary/5 border border-primary/10" : "border border-transparent hover:bg-muted/20"}`}>
                          <Checkbox checked={sel} onCheckedChange={() => toggleGroup(g.link)} />
                          <span className="text-xs font-medium truncate">{g.name}</span>
                          <Badge variant="outline" className="text-[8px] h-4 px-1 ml-auto border-primary/20 text-primary/50 shrink-0">Próprio</Badge>
                        </label>
                      );
                    })}
                  </>
                )}
                {systemGroups.length > 0 && (
                  <>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 px-3 pt-1.5 pb-0.5">Sistema</p>
                    {systemGroups.map((g: any) => {
                      const sel = selectedGroups.includes(g.link);
                      return (
                        <label key={g.link} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${sel ? "bg-primary/5 border border-primary/10" : "border border-transparent hover:bg-muted/20"}`}>
                          <Checkbox checked={sel} onCheckedChange={() => toggleGroup(g.link)} />
                          <span className="text-xs font-medium truncate">{g.name}</span>
                        </label>
                      );
                    })}
                  </>
                )}
                {allGroups.length === 0 && <p className="text-[11px] text-muted-foreground/30 text-center py-4">Nenhum grupo</p>}
              </div>
            </section>

            {/* Info chips */}
            <div className="flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/15 text-[10px] text-muted-foreground/50 font-medium">
                <Timer className="w-3 h-3" /> 10–30s delay
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/15 text-[10px] text-primary/70 font-medium">
                <Shield className="w-3 h-3" /> Segundo plano
              </span>
            </div>

            {hasOffline && (
              <p className="text-[11px] text-destructive flex items-center gap-1.5 font-medium">
                <Shield className="w-3 h-3" /> Instâncias offline selecionadas
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border/10 bg-muted/5">
            {totalOps > 0 && <span className="text-[11px] text-muted-foreground/40">{totalOps} operaç{totalOps !== 1 ? "ões" : "ão"}</span>}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" className="h-9 text-xs rounded-xl border-border/15 font-semibold" onClick={() => setJoinModalOpen(false)}>Cancelar</Button>
              <Button onClick={startJoinProcess} disabled={!canStart} size="sm" className="gap-1.5 h-9 text-xs rounded-xl font-semibold shadow-md">
                {isStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                Iniciar ({totalOps})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GroupCapture;
