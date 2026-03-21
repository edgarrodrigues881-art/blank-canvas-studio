import { useState, useCallback, lazy, Suspense, memo, useMemo, useEffect } from "react";
import { useAdminDashboard, type AdminUser } from "@/hooks/useAdmin";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import {
  LayoutDashboard, Users, Bell, ScrollText, Wallet, Database,
  Flame, ListTodo, Server, Heart, Loader2, LogOut,
  ChevronRight, Menu, X, BookOpen, MessageCircle, Clock,
  AlertTriangle, XCircle, Skull, Check, Mail, Plug, Sparkles, Key,
  Send, FileText, Cable, Megaphone, List, Trash2, ToggleLeft, Activity
} from "lucide-react";
import logoNew from "@/assets/logo-new.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// Lazy load all tab components
const AdminOverview = lazy(() => import("./AdminOverview"));
const AdminClientsTable = lazy(() => import("./AdminClientsTable"));
const AdminClientDetail = lazy(() => import("./AdminClientDetail"));
const AdminLogs = lazy(() => import("./AdminLogs"));
const CostsTab = lazy(() => import("./CostsTab"));
const AdminGroupsPool = lazy(() => import("./AdminGroupsPool"));
const AdminWarmupCycles = lazy(() => import("./AdminWarmupCycles"));
const AdminWarmupJobs = lazy(() => import("./AdminWarmupJobs"));
const AdminInfra = lazy(() => import("./AdminInfra"));
const AdminCommunityWarmer = lazy(() => import("./AdminCommunityWarmer"));
const AdminWarmupRoadmap = lazy(() => import("./AdminWarmupRoadmap"));
const AdminWarmupDiagnostic = lazy(() => import("./AdminWarmupDiagnostic"));
const AdminMessages = lazy(() => import("./AdminMessages"));
const AdminConexao = lazy(() => import("./AdminConexao"));
const AdminTokensGlobal = lazy(() => import("./AdminTokensGlobal"));
const AdminDispatchTemplates = lazy(() => import("./AdminDispatchTemplates"));
const AdminClientBase = lazy(() => import("./AdminClientBase"));
const AdminConnectionPurposes = lazy(() => import("./AdminConnectionPurposes"));
const AdminAutoTemplates = lazy(() => import("./AdminAutoTemplates"));
const AdminAnnouncements = lazy(() => import("./AdminAnnouncements"));
const AdminFeatureControls = lazy(() => import("./AdminFeatureControls"));
const MessageGeneratorPreview = lazy(() => import("@/components/warmup/MessageGeneratorPreview").then(m => ({ default: m.MessageGeneratorPreview })));

const MESSAGE_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  WELCOME: { label: "Boas-vindas", icon: Mail, color: "text-emerald-500" },
  DUE_3_DAYS: { label: "Faltam 3 dias", icon: Clock, color: "text-yellow-500" },
  DUE_TODAY: { label: "Vence hoje", icon: AlertTriangle, color: "text-orange-500" },
  OVERDUE_1: { label: "Vencido 1 dia", icon: XCircle, color: "text-destructive" },
  OVERDUE_7: { label: "Vencido 7 dias", icon: XCircle, color: "text-destructive" },
  OVERDUE_30: { label: "Vencido 30 dias", icon: Skull, color: "text-destructive" },
};

function getDaysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

const BOCampaigns = lazy(() => import("@/pages/backoffice/BOCampaigns"));
const BOCampaignList = lazy(() => import("@/pages/backoffice/BOCampaignList"));
const BOCampaignDetail = lazy(() => import("@/pages/backoffice/BOCampaignDetail"));

const NAV_ITEMS = [
  { id: "overview", label: "Visão Geral", shortLabel: "Home", icon: LayoutDashboard, group: "principal", badge: false },
  { id: "clients", label: "Clientes", shortLabel: "Clientes", icon: Users, group: "principal", badge: false },
  { id: "messages", label: "Relatório WhatsApp", shortLabel: "Relatório", icon: MessageCircle, group: "principal", badge: false },
  { id: "pendencias", label: "Pendências", shortLabel: "Alertas", icon: Bell, group: "principal", badge: true },
  { id: "conexao", label: "Conexão Admin", shortLabel: "Conexão", icon: Plug, group: "principal", badge: false },
  { id: "auto-templates", label: "Modelo Automático", shortLabel: "Auto", icon: Sparkles, group: "principal", badge: false },
  { id: "announcements", label: "Aviso", shortLabel: "Aviso", icon: Megaphone, group: "principal", badge: false },
  { id: "feature-controls", label: "Controle de Funções", shortLabel: "Funções", icon: ToggleLeft, group: "principal", badge: false },

  { id: "dispatch-templates", label: "Modelos", shortLabel: "Modelos", icon: FileText, group: "disparo", badge: false },
  { id: "client-base", label: "Base de Contatos", shortLabel: "Contatos", icon: Users, group: "disparo", badge: false },
  { id: "dispatch-connections", label: "Conexões Envio", shortLabel: "Conexões", icon: Cable, group: "disparo", badge: false },
  { id: "bo-campaigns", label: "Nova Campanha", shortLabel: "Campanha", icon: Megaphone, group: "campanhas", badge: false },
  { id: "bo-campaign-list", label: "Campanhas", shortLabel: "Lista", icon: List, group: "campanhas", badge: false },

  { id: "groups-pool", label: "Grupo De Aquecimento", shortLabel: "Grupos", icon: Database, group: "operacao", badge: false },
  { id: "tokens-global", label: "Tokens Globais", shortLabel: "Tokens", icon: Key, group: "sistema", badge: false },
  { id: "community", label: "Comunidade", shortLabel: "Social", icon: Heart, group: "sistema", badge: false },
  { id: "msg-generator", label: "Gerador de Mensagens", shortLabel: "Gerador", icon: Sparkles, group: "operacao", badge: false },
  { id: "warmup-diagnostic", label: "Diagnóstico Warmup", shortLabel: "Diagnóstico", icon: Activity, group: "operacao", badge: false },
] as const;

const GROUP_LABELS: Record<string, string> = {
  principal: "Principal",
  disparo: "Disparo",
  campanhas: "Campanhas",
  gestao: "Gestão",
  operacao: "Operação",
  sistema: "Sistema",
};

const GROUPS = [...new Set(NAV_ITEMS.map(i => i.group))];

const PendenciasTab = memo(({ onSelectClient, users }: { onSelectClient?: (u: AdminUser) => void; users?: AdminUser[] }) => {
  const findUser = useCallback((userId: string): AdminUser | null => {
    return users?.find(u => u.id === userId) || null;
  }, [users]);

  const handleClickUser = useCallback((userId: string) => {
    const user = findUser(userId);
    if (user && onSelectClient) onSelectClient(user);
  }, [findUser, onSelectClient]);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("message_queue" as any).delete() as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-queue-pending"] });
      queryClient.invalidateQueries({ queryKey: ["pending-count"] });
      toast.success("Pendência removida com sucesso");
    },
    onError: () => toast.error("Erro ao remover pendência"),
  });

  const { data: queueItems = [], isLoading } = useQuery({
    queryKey: ["message-queue-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_queue" as any)
        .select("id, user_id, client_name, client_email, client_phone, plan_name, expires_at, message_type, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 120_000,
  });

  // Fetch subscriptions for expiry alerts
  const { data: subs = [] } = useQuery({
    queryKey: ["pendencias-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, user_id, plan_name, plan_price, expires_at");
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 300_000,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["pendencias-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone");
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 300_000,
  });

  const profileMap = useMemo(() => {
    const m: Record<string, any> = {};
    profiles.forEach((p: any) => { m[p.id] = p; });
    return m;
  }, [profiles]);

  const getDaysLeft = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  };

  const expired = useMemo(() =>
    subs.filter((s: any) => { const d = getDaysLeft(s.expires_at); return d !== null && d <= 0; }),
  [subs]);

  const expiringSoon = useMemo(() =>
    subs.filter((s: any) => { const d = getDaysLeft(s.expires_at); return d !== null && d > 0 && d <= 3; }),
  [subs]);

  const revenueExpired = expired.reduce((s: number, sub: any) => s + Number(sub.plan_price || 0), 0);
  const revenueAtRisk = expiringSoon.reduce((s: number, sub: any) => s + Number(sub.plan_price || 0), 0);

  // Group queue by message_type
  const grouped = useMemo(() => {
    if (queueItems.length === 0) return [];
    const groups: Record<string, any[]> = {};
    for (const item of queueItems) {
      const type = item.message_type as string;
      if (!groups[type]) groups[type] = [];
      groups[type].push(item);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      const order = ["WELCOME", "DUE_3_DAYS", "DUE_TODAY", "OVERDUE_1", "OVERDUE_7", "OVERDUE_30"];
      return order.indexOf(a) - order.indexOf(b);
    });
  }, [queueItems]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  const hasAlerts = expired.length > 0 || expiringSoon.length > 0;
  const hasQueue = queueItems.length > 0;

  if (!hasAlerts && !hasQueue) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
          <Check size={20} className="text-primary" />
        </div>
        <p className="text-muted-foreground text-sm">Nenhuma pendência</p>
        <p className="text-muted-foreground/60 text-xs mt-1">Tudo em dia!</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ═══ SUBSCRIPTION ALERTS ═══ */}
      {hasAlerts && (
        <div className="space-y-3">
          {expired.length > 0 && (
            <div className="border border-destructive/20 rounded-xl p-4 bg-destructive/5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="text-destructive" />
                <h3 className="text-sm font-semibold text-destructive">
                  {expired.length} vencido{expired.length > 1 ? "s" : ""} · R$ {revenueExpired.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="space-y-1.5">
                {expired.map((s: any) => {
                  const p = profileMap[s.user_id];
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleClickUser(s.user_id)}
                      className="flex items-center justify-between bg-destructive/5 rounded-lg px-3 py-2 border border-destructive/10 cursor-pointer hover:bg-destructive/10 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{p?.full_name || s.user_id.slice(0, 8)}</p>
                        <p className="text-[11px] text-muted-foreground">{s.plan_name} · R$ {Number(s.plan_price).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] border-destructive/30 text-destructive">
                          {Math.abs(getDaysLeft(s.expires_at) || 0)}d atrás
                        </Badge>
                        <ChevronRight size={14} className="text-muted-foreground/30" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {expiringSoon.length > 0 && (
            <div className="border border-primary/20 rounded-xl p-4 bg-primary/5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="text-primary" />
                <h3 className="text-sm font-semibold text-primary">
                  {expiringSoon.length} vencendo · R$ {revenueAtRisk.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="space-y-1.5">
                {expiringSoon.map((s: any) => {
                  const p = profileMap[s.user_id];
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleClickUser(s.user_id)}
                      className="flex items-center justify-between bg-primary/5 rounded-lg px-3 py-2 border border-primary/10 cursor-pointer hover:bg-primary/10 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{p?.full_name || s.user_id.slice(0, 8)}</p>
                        <p className="text-[11px] text-muted-foreground">{s.plan_name} · R$ {Number(s.plan_price).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] border-primary/30 text-primary">
                          {getDaysLeft(s.expires_at)}d restante{(getDaysLeft(s.expires_at) || 0) > 1 ? "s" : ""}
                        </Badge>
                        <ChevronRight size={14} className="text-muted-foreground/30" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ MESSAGE QUEUE ═══ */}
      {hasQueue && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">
              {queueItems.length} mensagem pendente{queueItems.length !== 1 ? "s" : ""}
            </Badge>
            <span className="text-[10px] text-muted-foreground">Atualiza a cada 30s</span>
          </div>

          {grouped.map(([type, items]) => {
            const config = MESSAGE_TYPE_CONFIG[type] || { label: type, icon: Mail, color: "text-muted-foreground" };
            const Icon = config.icon;
            return (
              <div key={type} className="border border-border rounded-xl p-4 bg-card">
                <div className="flex items-center gap-2 mb-3">
                  <Icon size={16} className={config.color} />
                  <h3 className="text-sm font-semibold text-foreground">{config.label}</h3>
                  <Badge variant="outline" className="text-[10px] ml-auto">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((item: any) => (
                    <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-muted/20 rounded-lg px-3 py-2.5 border border-border/60">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground font-medium truncate">{item.client_name || item.client_email}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-muted-foreground">{item.client_email}</span>
                          {item.client_phone && (
                            <>
                              <span className="text-[11px] text-muted-foreground/40">·</span>
                              <span className="text-[11px] text-muted-foreground">{item.client_phone}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <span className="text-[11px] text-muted-foreground">{item.plan_name || "—"}</span>
                        {item.expires_at && (
                          <>
                            <span className="text-[11px] text-muted-foreground/40">·</span>
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(item.expires_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                            </span>
                          </>
                        )}
                        <Badge variant="outline" className="text-[9px] border-primary/30 text-primary bg-primary/5 ml-1">
                          <Clock size={8} className="mr-0.5" /> Aguardando
                        </Badge>
                        {(() => {
                          const now = new Date();
                          const nowBRT = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
                          const hourBRT = nowBRT.getHours();
                          
                          // Sending window: 09:00 - 19:00 BRT
                          if (hourBRT < 9) {
                            return (
                              <span className="text-[9px] text-muted-foreground/60">
                                Envio a partir das 09:00
                              </span>
                            );
                          }
                          if (hourBRT >= 19) {
                            return (
                              <span className="text-[9px] text-muted-foreground/60">
                                Envio amanhã às 09:00
                              </span>
                            );
                          }
                          // Within window: next 5-min cron
                          const next = new Date(now);
                          next.setMinutes(Math.ceil(next.getMinutes() / 5) * 5, 0, 0);
                          if (next <= now) next.setMinutes(next.getMinutes() + 5);
                          return (
                            <span className="text-[9px] text-muted-foreground/60">
                              Envio ~{next.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                            </span>
                          );
                        })()}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors ml-1" title="Apagar pendência">
                              <Trash2 size={12} />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-card border-border">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Apagar pendência?</AlertDialogTitle>
                              <AlertDialogDescription>
                                A mensagem de <strong>{item.client_name}</strong> ({MESSAGE_TYPE_CONFIG[item.message_type]?.label || item.message_type}) será removida da fila e não será enviada.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(item.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Apagar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
PendenciasTab.displayName = "PendenciasTab";

const TabLoader = () => (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="w-5 h-5 animate-spin text-primary" />
  </div>
);

const BackOfficeDashboard = ({ onLogout, initialTab }: { onLogout: () => void; initialTab?: string }) => {
  const { data, isLoading, error, refetch } = useAdminDashboard();
  const [selectedClient, setSelectedClient] = useState<AdminUser | null>(null);
  const [activeTab, setActiveTab] = useState(initialTab || "overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  // Sync activeTab when initialTab changes (route navigation)
  useEffect(() => {
    const target = initialTab || "overview";
    if (target !== activeTab) setActiveTab(target);
  }, [initialTab]);

  const handleSelectClient = useCallback((u: AdminUser) => {
    setSelectedClient(u);
    window.history.pushState({ backofficeClient: true }, "");
  }, []);
  const handleBack = useCallback(() => setSelectedClient(null), []);

  // Handle browser back button for client detail
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (selectedClient) {
        setSelectedClient(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [selectedClient]);

  const { data: pendingQueueCount = 0 } = useQuery({
    queryKey: ["message-queue-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("message_queue" as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) return 0;
      return count || 0;
    },
    refetchInterval: 120_000,
  });
  const pendingCount = pendingQueueCount;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-32 px-4">
        <p className="text-destructive font-medium">Erro ao carregar dados</p>
        <p className="text-sm text-muted-foreground mt-1">{(error as any)?.message}</p>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  if (selectedClient) {
    return (
      <div className="min-h-screen bg-background">
        <Suspense fallback={<TabLoader />}>
          <AdminClientDetail client={selectedClient} onBack={() => { setSelectedClient(null); }} />
        </Suspense>
      </div>
    );
  }

  const renderContent = () => {
    const content = (() => {
      switch (activeTab) {
        case "overview": return data ? <AdminOverview data={data} /> : null;
        case "clients": return <AdminClientsTable users={data?.users || []} onSelectClient={handleSelectClient} />;
        case "pendencias": return <PendenciasTab onSelectClient={handleSelectClient} users={data?.users || []} />;
        case "messages": return <AdminMessages />;
        case "conexao": return <AdminConexao />;
        case "dispatch-templates": return <AdminDispatchTemplates />;
        case "auto-templates": return <AdminAutoTemplates />;
        case "client-base": return <AdminClientBase />;
        case "dispatch-connections": return <AdminConnectionPurposes />;
        case "bo-campaigns": return <BOCampaigns />;
        case "bo-campaign-list": return <BOCampaignList />;
        case "bo-campaign-detail": return <BOCampaignDetail />;
        case "logs": return <AdminLogs />;
        case "costs": return <CostsTab costs={((data as any)?.costs || []) as any[]} onRefresh={() => refetch()} />;
        case "groups-pool": return <AdminGroupsPool />;
        case "warmup-cycles": return <AdminWarmupCycles />;
        case "warmup-jobs": return <AdminWarmupJobs />;
        case "infra": return <AdminInfra />;
        case "tokens-global": return <AdminTokensGlobal />;
        case "community": return <AdminCommunityWarmer />;
        case "warmup-roadmap": return <AdminWarmupRoadmap />;
        case "warmup-diagnostic": return <AdminWarmupDiagnostic />;
        case "msg-generator": return <MessageGeneratorPreview />;
        case "announcements": return <AdminAnnouncements />;
        case "feature-controls": return <AdminFeatureControls />;
        default: return null;
      }
    })();
    return <Suspense fallback={<TabLoader />}>{content}</Suspense>;
  };

  const currentItem = NAV_ITEMS.find(i => i.id === activeTab);

  return (
    <div className="flex min-h-screen">
      {/* ═══ SIDEBAR (desktop) ═══ */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed lg:sticky top-0 left-0 z-50 lg:z-auto
        w-[240px] h-screen bg-card border-r border-border
        flex-col transition-transform duration-200
        hidden lg:flex
        ${sidebarOpen ? "!flex translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        {/* Brand with logo and particles */}
        <div className="px-5 py-5 border-b border-border relative overflow-hidden">
          {/* Golden particle dots */}
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-primary/40"
              style={{
                left: `${15 + i * 14}%`,
                top: `${30 + (i % 3) * 20}%`,
                animation: `bo-particle-float ${3 + i * 0.5}s ease-in-out infinite`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              {/* Logo with golden ring + glow */}
              <div className="relative shrink-0">
                <div className="absolute -inset-1 rounded-2xl bg-primary/25 blur-md" />
                <div className="relative z-10 p-[2.5px] rounded-2xl bg-gradient-to-br from-primary via-primary/50 to-primary shadow-lg shadow-primary/10">
                  <img src={logoNew} alt="DG Logo" className="w-12 h-12 rounded-[13px] block" />
                </div>
              </div>
              <div className="leading-tight">
                <h1 className="text-[13px] font-extrabold tracking-tight leading-tight">
                  <span className="text-primary">DG</span>{" "}
                  <span className="text-foreground">CONTINGÊNCIA</span>
                </h1>
                <h1 className="text-[13px] font-extrabold tracking-[0.15em] text-primary leading-tight">
                  PRO
                </h1>
                <p className="text-[9px] text-muted-foreground mt-0.5">Painel Administrativo</p>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {GROUPS.map(group => (
            <div key={group} className="mb-4">
              <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] px-3 mb-2">
                {GROUP_LABELS[group]}
              </p>
              <div className="space-y-0.5">
                {NAV_ITEMS.filter(i => i.group === group).map(item => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        const routes: Record<string, string> = {
                          "bo-campaigns": "/backoffice/campaigns",
                          "bo-campaign-list": "/backoffice/campaign-list",
                        };
                        navigate(routes[item.id] || "/backoffice");
                        setActiveTab(item.id); setSidebarOpen(false);
                      }}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
                        ${isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }
                      `}
                    >
                      <Icon size={17} className={isActive ? "text-primary" : "text-muted-foreground"} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && pendingCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-border">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-150"
          >
            <LogOut size={17} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <main className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border px-4 lg:px-6 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground p-1">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {currentItem && <currentItem.icon size={18} className="text-muted-foreground shrink-0" />}
            <h2 className="text-base font-semibold text-foreground truncate">{currentItem?.label || "Visão Geral"}</h2>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/60">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Online
          </span>
        </header>

        {/* Content */}
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>

    </div>
  );
};

export default BackOfficeDashboard;
