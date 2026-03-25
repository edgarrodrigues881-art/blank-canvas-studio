import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Users, Upload, Search, CheckCircle2, XCircle,
  Loader2, Play, Trash2, Copy, Shield, RefreshCw,
  FileText, BarChart3, UserPlus, ChevronRight, Globe,
  Clock, Pause, ArrowLeftRight, Settings2, Timer,
  StopCircle, AlertTriangle, TrendingUp, Plus, ArrowLeft,
  Eye, Info, WifiOff, Link2, Hash, AlertCircle, Download, RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Step = "import" | "preview" | "processing" | "done";
type View = "list" | "create" | "detail";

type ImportClassification = "valid" | "duplicate" | "invalid" | "empty";

interface ImportedContact {
  raw: string;
  normalized: string;
  classification: ImportClassification;
}

interface ValidationResult {
  total: number;
  valid: string[];
  invalid: string[];
  duplicates: string[];
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
}

interface ParticipantCheckResult {
  ready: string[];
  alreadyExists: string[];
  readyCount: number;
  alreadyExistsCount: number;
  totalParticipants: number;
}

interface ContactResult {
  phone: string;
  status: string;
  error?: string;
  deviceUsed?: string;
  contactId?: string;
}

interface GroupInfo {
  jid: string;
  name: string;
  participants: number;
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function translateError(err: string): string {
  const clean = (err || "").replace(/^\[retry:\d+\]\s*/i, "").trim();
  const e = clean.toLowerCase();
  if (e.includes("confirmed_disconnect") || e.includes("realmente desconectada")) return "Instância desconectada (confirmado)";
  if (e.includes("connection_unconfirmed")) return "Conexão não pôde ser confirmada";
  if (e.includes("confirmed_no_admin") || e.includes("privilégio de admin")) return "Sem privilégio de admin (confirmado)";
  if (e.includes("permission_unconfirmed")) return "Permissão de admin não confirmada";
  if (e.includes("invalid_group") || e.includes("grupo inválido")) return "Grupo inválido ou inacessível";
  if (e.includes("contact_not_found") || e.includes("não foi encontrado")) return "Contato não encontrado no WhatsApp";
  if (e.includes("unauthorized") || e.includes("autenticação")) return "Falha de autenticação da instância";
  if (e.includes("blocked") || e.includes("ban") || e.includes("bloqueio")) return "Número bloqueado ou restrito";
  if (e.includes("limite de requisições") || e.includes("rate") || e.includes("429")) return "Limite de requisições (temporário)";
  if (e.includes("tempo de resposta") || e.includes("timeout")) return "Tempo de resposta excedido";
  if (e.includes("503") || e.includes("indisponível")) return "Instância indisponível (503)";
  if (e.includes("cancelada pelo usuário")) return "Cancelado pelo usuário";
  if (e.includes("não classificada") || e.includes("falha não")) return "Falha não classificada";
  // Don't use generic "Erro temporário" - show what we know
  if (e.includes("whatsapp disconnected") || e.includes("disconnected")) return "Instância desconectada";
  if (e.includes("not admin")) return "Sem privilégio de admin";
  if (e.includes("not found") || e.includes("info query")) return "Número não encontrado";
  if (e.includes("full") || e.includes("limit")) return "Grupo cheio";
  if (e.includes("bad-request")) return "Requisição inválida";
  if (e.includes("failed to update")) return "Falha ao processar contato";
  if (clean.length > 80) return clean.substring(0, 80) + "...";
  return clean || "Falha sem detalhe";
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function statusLabel(status: string) {
  switch (status) {
    case "completed": return "Adicionado";
    case "already_exists": return "Já no grupo";
    case "rate_limited": return "Aguardando retry";
    case "api_temporary": return "Falha temporária";
    case "temporary_error": return "Erro temporário";
    case "connection_unconfirmed": return "Conexão não confirmada";
    case "confirmed_disconnect": return "Desconectada";
    case "permission_unconfirmed": return "Admin não confirmado";
    case "confirmed_no_admin": return "Sem privilégio";
    case "invalid_group": return "Grupo inválido";
    case "contact_not_found": return "Contato inexistente";
    case "unauthorized": return "Autenticação";
    case "blocked": return "Bloqueado";
    case "unknown_failure": return "Falha não confirmada";
    case "failed": return "Falha";
    case "pending": return "Pendente";
    case "processing": return "Processando";
    case "paused": return "Pausado";
    case "cancelled": return "Cancelado";
    case "done": return "Concluído";
    case "queued": return "Na fila";
    case "completed_with_failures": return "Concluída com falhas";
    case "draft": return "Rascunho";
    default: return status;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "completed": return "border-emerald-500/30 text-emerald-500 bg-emerald-500/5";
    case "already_exists": return "border-blue-500/30 text-blue-500 bg-blue-500/5";
    case "rate_limited": return "border-amber-500/30 text-amber-600 bg-amber-500/5";
    case "api_temporary": return "border-amber-500/30 text-amber-600 bg-amber-500/5";
    case "temporary_error": return "border-amber-500/30 text-amber-600 bg-amber-500/5";
    case "connection_unconfirmed": return "border-amber-500/30 text-amber-600 bg-amber-500/5";
    case "permission_unconfirmed": return "border-amber-500/30 text-amber-600 bg-amber-500/5";
    case "confirmed_disconnect": return "border-destructive/30 text-destructive bg-destructive/5";
    case "confirmed_no_admin": return "border-destructive/30 text-destructive bg-destructive/5";
    case "invalid_group": return "border-destructive/30 text-destructive bg-destructive/5";
    case "contact_not_found": return "border-destructive/30 text-destructive bg-destructive/5";
    case "unauthorized": return "border-destructive/30 text-destructive bg-destructive/5";
    case "blocked": return "border-destructive/30 text-destructive bg-destructive/5";
    case "unknown_failure": return "border-destructive/30 text-destructive bg-destructive/5";
    case "done": return "border-emerald-500/30 text-emerald-500 bg-emerald-500/5";
    case "completed_with_failures": return "border-amber-500/30 text-amber-600 bg-amber-500/5";
    case "queued": return "border-primary/30 text-primary bg-primary/5";
    case "failed": case "cancelled": return "border-destructive/30 text-destructive bg-destructive/5";
    case "processing": return "border-primary/30 text-primary bg-primary/5";
    case "paused": return "border-amber-500/30 text-amber-500 bg-amber-500/5";
    default: return "border-border/30 text-muted-foreground bg-muted/5";
  }
}

function isSuccessStatus(status: string) {
  return status === "completed" || status === "already_exists";
}

/** Classify imported contacts: keep ALL, tag each as valid/duplicate/invalid/empty */
function classifyContacts(rawLines: string[]): ImportedContact[] {
  const seen = new Set<string>();
  return rawLines.map(raw => {
    const trimmed = raw.trim();
    if (!trimmed) return { raw, normalized: "", classification: "empty" as ImportClassification };
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 8) return { raw: trimmed, normalized: digits, classification: "invalid" as ImportClassification };
    if (seen.has(digits)) return { raw: trimmed, normalized: digits, classification: "duplicate" as ImportClassification };
    seen.add(digits);
    return { raw: trimmed, normalized: digits, classification: "valid" as ImportClassification };
  });
}

function isFailureStatus(status: string) {
  return [
    "failed",
    "rate_limited",
    "api_temporary",
    "temporary_error",
    "connection_unconfirmed",
    "confirmed_disconnect",
    "permission_unconfirmed",
    "confirmed_no_admin",
    "invalid_group",
    "contact_not_found",
    "unauthorized",
    "blocked",
    "unknown_failure",
    "cancelled",
  ].includes(status);
}

// Statuses eligible for retry / export (not terminal successes or unrecoverable)
const RETRYABLE_EXPORT_STATUSES = new Set([
  "rate_limited",
  "api_temporary",
  "connection_unconfirmed",
  "confirmed_disconnect",
  "permission_unconfirmed",
  "unknown_failure",
  "blocked",
  "unauthorized",
]);

// ═══════════════════════════════════════════════════════════════
// NEXT ACTION COUNTDOWN
// ═══════════════════════════════════════════════════════════════
function NextActionCountdown({ contacts, campaign }: { contacts: any[]; campaign: any }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Find the most recently processed contact for context
  const lastProcessed = useMemo(() => {
    const processed = contacts
      .filter((c: any) => c.processed_at && c.status !== "pending")
      .sort((a: any, b: any) => new Date(b.processed_at).getTime() - new Date(a.processed_at).getTime());
    return processed[0] || null;
  }, [contacts]);

  const lastStatus = lastProcessed?.status;
  const isRetryable = lastStatus && ["rate_limited", "api_temporary", "connection_unconfirmed", "permission_unconfirmed", "unknown_failure"].includes(lastStatus);

  // ── Primary source: backend next_run_at ──
  const nextRunAt = campaign?.next_run_at ? new Date(campaign.next_run_at).getTime() : null;
  const hasBackendTimer = nextRunAt && nextRunAt > now;

  // ── Fallback: estimate from delay settings ──
  const baseMin = Math.max(campaign.min_delay || 8, 8);
  const baseMax = Math.max(campaign.max_delay || 15, baseMin);
  const estimatedDelay = Math.round((baseMin + baseMax) / 2) + 3;

  if (!lastProcessed?.processed_at && !hasBackendTimer) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Timer className="w-3.5 h-3.5 text-primary/60" />
        <span>Aguardando início do processamento...</span>
      </div>
    );
  }

  let remaining: number;
  let totalDuration: number;

  if (hasBackendTimer) {
    // Use precise backend timestamp
    remaining = Math.max(0, Math.ceil((nextRunAt - now) / 1000));
    // Estimate total duration from last processed contact
    const lastTime = lastProcessed?.processed_at ? new Date(lastProcessed.processed_at).getTime() : now;
    totalDuration = Math.max(1, Math.ceil((nextRunAt - lastTime) / 1000));
  } else {
    // Fallback to estimation
    const lastTime = new Date(lastProcessed.processed_at).getTime();
    const elapsed = Math.floor((now - lastTime) / 1000);
    remaining = Math.max(0, estimatedDelay - elapsed);
    totalDuration = estimatedDelay;

    // If too long since last action with no backend timer, show waiting
    if (elapsed > estimatedDelay * 3) {
      return (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Timer className="w-3.5 h-3.5 text-primary/60" />
          <span>Aguardando próximo ciclo de processamento...</span>
        </div>
      );
    }
  }

  const contextMsg = isRetryable
    ? `Retry em ${remaining}s — ${statusLabel(lastStatus)}`
    : remaining > 0
    ? `Próximo envio em ${remaining}s`
    : "Processando próximo contato...";

  const progressPct = remaining > 0 ? Math.min(100, ((totalDuration - remaining) / totalDuration) * 100) : 100;

  return (
    <div className="mt-3 flex items-center gap-3">
      <Timer className="w-3.5 h-3.5 text-primary/60 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs font-medium ${isRetryable ? "text-amber-500" : "text-muted-foreground"}`}>
            {contextMsg}
          </span>
          {remaining > 0 && (
            <span className="text-[10px] text-primary font-mono font-bold tabular-nums">{remaining}s</span>
          )}
        </div>
        <div className="h-1 w-full rounded-full bg-primary/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-linear ${isRetryable ? "bg-amber-500/60" : "bg-primary/40"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CAMPAIGN LIST VIEW
// ═══════════════════════════════════════════════════════════════
function CampaignList({ onCreateNew, onViewCampaign }: { onCreateNew: () => void; onViewCampaign: (id: string) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["mass_inject_campaigns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mass_inject_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  const filteredCampaigns = useMemo(() => {
    let list = campaigns;
    if (statusFilter !== "all") list = list.filter((c: any) => c.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c: any) => c.name?.toLowerCase().includes(q) || c.group_name?.toLowerCase().includes(q));
    }
    return list;
  }, [campaigns, statusFilter, searchQuery]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await supabase.from("mass_inject_contacts").delete().eq("campaign_id", deleteId);
      await supabase.from("mass_inject_campaigns").delete().eq("id", deleteId);
      qc.invalidateQueries({ queryKey: ["mass_inject_campaigns"] });
      toast.success("Campanha excluída");
    } catch { toast.error("Erro ao excluir"); }
    setDeleteId(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Adição em Massa</h1>
            <p className="text-sm text-muted-foreground">Campanhas de adição de membros a grupos</p>
          </div>
        </div>
        <Button onClick={onCreateNew} className="gap-2 shadow-md shadow-primary/10">
          <Plus className="w-4 h-4" /> Criar Campanha
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar campanha..." className="h-9 max-w-xs" />
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: "all", label: "Todas" },
            { key: "processing", label: "Em andamento" },
            { key: "paused", label: "Pausadas" },
            { key: "done", label: "Concluídas" },
            { key: "draft", label: "Rascunho" },
          ].map(f => (
            <Button key={f.key} variant={statusFilter === f.key ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(f.key)} className="text-xs h-8 rounded-lg">
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <Card className="border-border/40 bg-card/80">
          <CardContent className="py-16 text-center space-y-4">
            <UserPlus className="w-12 h-12 text-muted-foreground/30 mx-auto" />
            <h3 className="text-lg font-semibold text-foreground">
              {campaigns.length === 0 ? "Nenhuma campanha criada" : "Nenhuma campanha encontrada"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {campaigns.length === 0 ? "Crie sua primeira campanha para adicionar membros em lote a um grupo." : "Tente alterar os filtros de busca."}
            </p>
            {campaigns.length === 0 && (
              <Button onClick={onCreateNew} className="gap-2 mt-4"><Plus className="w-4 h-4" /> Criar Campanha</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredCampaigns.map((c: any) => {
            const successTotal = (c.success_count || 0) + (c.already_count || 0);
            const processed = successTotal + (c.fail_count || 0);
            const progress = c.total_contacts > 0 ? Math.round((processed / c.total_contacts) * 100) : 0;
            return (
              <Card key={c.id} className="border-border/40 bg-card/80 hover:bg-card/90 transition-colors cursor-pointer group" onClick={() => onViewCampaign(c.id)}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="text-sm font-semibold text-foreground truncate">{c.name}</h3>
                        <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 ${statusBadge(c.status)}`}>
                          {statusLabel(c.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="truncate max-w-[200px]">📁 {c.group_name || c.group_id?.substring(0, 15) + "..."}</span>
                        <span>📋 {c.total_contacts} contatos</span>
                        <span className="text-emerald-500">✓ {successTotal}</span>
                        {c.fail_count > 0 && <span className="text-destructive">✗ {c.fail_count}</span>}
                        <span>{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                      {c.status === "processing" && (
                        <div className="mt-2 flex items-center gap-2">
                          <Progress value={progress} className="h-1.5 flex-1 max-w-[200px]" />
                          <span className="text-[10px] text-primary font-semibold">{progress}%</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é irreversível. Todos os contatos e resultados serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CAMPAIGN DETAIL VIEW
// ═══════════════════════════════════════════════════════════════
function CampaignDetail({ campaignId, onBack, onNewCampaignFromFailed }: { campaignId: string; onBack: () => void; onNewCampaignFromFailed?: (phones: string[], sourceName: string) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchContact, setSearchContact] = useState("");
  const [isActionPending, setIsActionPending] = useState(false);
  const [liveRuntimeNote, setLiveRuntimeNote] = useState("");

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const isActiveStatus = (s?: string) => s === "processing" || s === "queued";

  const { data: campaign, isLoading, refetch: refetchCampaign, isFetching: isFetchingCampaign } = useQuery({
    queryKey: ["mass_inject_campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("mass_inject_campaigns").select("*").eq("id", campaignId).single();
      if (error) throw error;
      return data;
    },
    refetchOnWindowFocus: true,
  });

  const { data: contacts = [], refetch: refetchContacts, isFetching: isFetchingContacts } = useQuery({
    queryKey: ["mass_inject_contacts", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mass_inject_contacts")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("processed_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    refetchOnWindowFocus: true,
  });

  // Auto-refresh only while campaign is active
  useEffect(() => {
    if (!isActiveStatus(campaign?.status)) return;
    const id = setInterval(() => {
      if (!isFetchingCampaign) refetchCampaign();
      if (!isFetchingContacts) refetchContacts();
    }, 2500);
    return () => clearInterval(id);
  }, [campaign?.status, isFetchingCampaign, isFetchingContacts, refetchCampaign, refetchContacts]);

  // ── Toast notifications from events table (reliable, no event loss) ──
  const eventGroupRef = useRef<{ counts: Record<string, { count: number; level: string }>; timer: ReturnType<typeof setTimeout> | null }>({ counts: {}, timer: null });

  const EVENT_LABELS: Record<string, { msg: string; groupable?: boolean }> = {
    contact_added: { msg: "Contato adicionado com sucesso", groupable: true },
    contact_already_exists: { msg: "Contato já está no grupo", groupable: true },
    contact_not_found: { msg: "Número não encontrado no WhatsApp", groupable: true },
    contact_error: { msg: "Erro ao adicionar contato", groupable: true },
    rate_limited: { msg: "Limite temporário atingido, aguardando retry" },
    retry_waiting: { msg: "Aguardando cooldown antes de nova tentativa" },
    retry_resumed: { msg: "Processamento retomado" },
    instance_disconnected: { msg: "Instância desconectada" },
    instance_reconnected: { msg: "Instância reconectada" },
    no_admin_permission: { msg: "Sem privilégio de administrador no grupo" },
    campaign_started: { msg: "Campanha iniciada" },
    campaign_paused: { msg: "Campanha pausada" },
    campaign_resumed: { msg: "Campanha retomada" },
    campaign_completed: { msg: "Campanha concluída!" },
    timeout: { msg: "Timeout na API externa", groupable: true },
  };

  const showToastByLevel = useCallback((level: string, msg: string) => {
    if (level === "success") toast.success(msg);
    else if (level === "error") toast.error(msg);
    else if (level === "warning") toast.warning(msg);
    else toast.info(msg);
  }, []);

  const flushGroupedEvents = useCallback(() => {
    const ref = eventGroupRef.current;
    Object.entries(ref.counts).forEach(([eventType, { count, level }]) => {
      const label = EVENT_LABELS[eventType];
      if (!label) return;
      const msg = count > 1 ? `${count}x ${label.msg}` : label.msg;
      showToastByLevel(level, msg);
    });
    ref.counts = {};
    ref.timer = null;
  }, [showToastByLevel]);

  // Poll unconsumed events every 2.5s (same as campaign polling)
  useEffect(() => {
    if (!campaignId) return;
    const consumeEvents = async () => {
      const { data: events } = await supabase
        .from("mass_inject_events")
        .select("id, event_type, event_level, message")
        .eq("campaign_id", campaignId)
        .eq("consumed", false)
        .order("created_at", { ascending: true })
        .limit(50);

      if (!events || events.length === 0) return;

      // Mark all as consumed immediately
      const ids = events.map((e: any) => e.id);
      await supabase
        .from("mass_inject_events")
        .update({ consumed: true })
        .in("id", ids);

      // Process events
      const ref = eventGroupRef.current;
      for (const ev of events) {
        const label = EVENT_LABELS[ev.event_type];
        if (!label) continue;

        if (label.groupable) {
          if (!ref.counts[ev.event_type]) {
            ref.counts[ev.event_type] = { count: 0, level: ev.event_level };
          }
          ref.counts[ev.event_type].count++;
        } else {
          showToastByLevel(ev.event_level, ev.message || label.msg);
        }
      }

      // Flush grouped events after a short delay
      if (Object.keys(ref.counts).length > 0 && !ref.timer) {
        ref.timer = setTimeout(flushGroupedEvents, 3000);
      }
    };

    // Only poll while campaign is active
    if (!isActiveStatus(campaign?.status)) return;
    const interval = setInterval(consumeEvents, 2500);
    consumeEvents(); // initial fetch
    return () => {
      clearInterval(interval);
      if (eventGroupRef.current.timer) {
        clearTimeout(eventGroupRef.current.timer);
        flushGroupedEvents();
      }
    };
  }, [campaignId, campaign?.status, showToastByLevel, flushGroupedEvents]);

  const handleManualRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    await Promise.all([refetchCampaign(), refetchContacts()]);
    setIsManualRefreshing(false);
  }, [refetchCampaign, refetchContacts]);

  const handlePause = useCallback(async () => {
    setIsActionPending(true);
    setLiveRuntimeNote("Pausando campanha no backend...");
    try {
      const { error } = await supabase.functions.invoke("mass-group-inject", { body: { action: "pause-campaign", campaignId } });
      if (error) throw error;
      await Promise.all([refetchCampaign(), refetchContacts()]);
      qc.invalidateQueries({ queryKey: ["mass_inject_campaigns"] });
      toast.info("Campanha pausada");
    } catch (e: any) {
      toast.error(e.message || "Erro ao pausar campanha");
    } finally {
      setIsActionPending(false);
      setLiveRuntimeNote("");
    }
  }, [campaignId, qc, refetchCampaign, refetchContacts]);

  const handleCancel = useCallback(async () => {
    setIsActionPending(true);
    setLiveRuntimeNote("Cancelando campanha no backend...");
    try {
      const { error } = await supabase.functions.invoke("mass-group-inject", { body: { action: "cancel-campaign", campaignId } });
      if (error) throw error;
      await Promise.all([refetchCampaign(), refetchContacts()]);
      qc.invalidateQueries({ queryKey: ["mass_inject_campaigns"] });
      toast.info("Campanha cancelada");
    } catch (e: any) {
      toast.error(e.message || "Erro ao cancelar campanha");
    } finally {
      setIsActionPending(false);
      setLiveRuntimeNote("");
    }
  }, [campaignId, refetchCampaign, refetchContacts, qc]);

  const handleResume = useCallback(async () => {
    setIsActionPending(true);
    setLiveRuntimeNote("Retomando campanha no backend...");
    try {
      const { error } = await supabase.functions.invoke("mass-group-inject", { body: { action: "resume-campaign", campaignId } });
      if (error) throw error;
      await Promise.all([refetchCampaign(), refetchContacts()]);
      qc.invalidateQueries({ queryKey: ["mass_inject_campaigns"] });
      toast.success("Campanha retomada");
    } catch (e: any) {
      toast.error(e.message || "Erro ao retomar campanha");
    } finally {
      setIsActionPending(false);
      setLiveRuntimeNote("");
    }
  }, [campaignId, qc, refetchCampaign, refetchContacts]);

  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (activeFilter === "success") list = list.filter((c: any) => isSuccessStatus(c.status));
    else if (activeFilter === "failed") list = list.filter((c: any) => isFailureStatus(c.status));
    else if (activeFilter === "pending") list = list.filter((c: any) => c.status === "pending");
    else if (activeFilter !== "all") list = list.filter((c: any) => c.status === activeFilter);
    if (searchContact.trim()) {
      const q = searchContact.toLowerCase();
      list = list.filter((c: any) => c.phone?.includes(q));
    }
    return list;
  }, [contacts, activeFilter, searchContact]);

  const retryableContacts = useMemo(() => {
    return contacts.filter((c: any) => RETRYABLE_EXPORT_STATUSES.has(c.status));
  }, [contacts]);

  const handleExportNotAdded = useCallback(() => {
    if (retryableContacts.length === 0) { toast.info("Nenhum contato disponível para exportação"); return; }
    const lines = retryableContacts.map((c: any) => c.phone);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nao_adicionados_${campaign?.name?.replace(/\s+/g, "_") || campaignId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${lines.length} contatos exportados`);
  }, [retryableContacts, campaign, campaignId]);

  const handleNewCampaignFromFailed = useCallback(() => {
    if (retryableContacts.length === 0) { toast.info("Nenhum contato disponível para nova campanha"); return; }
    const phones = retryableContacts.map((c: any) => c.phone);
    onNewCampaignFromFailed?.(phones, campaign?.name || "Campanha anterior");
  }, [retryableContacts, campaign, onNewCampaignFromFailed]);

  if (isLoading || !campaign) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const successTotal = (campaign.success_count || 0) + (campaign.already_count || 0);
  const processed = successTotal + (campaign.fail_count || 0);
  const pendingCount = contacts.filter((c: any) => c.status === "pending").length;
  const cancelledCount = contacts.filter((c: any) => c.status === "cancelled").length;
  const progress = campaign.total_contacts > 0 ? Math.round((processed / campaign.total_contacts) * 100) : 0;

  const isRunning = campaign.status === "processing" || campaign.status === "queued";
  const canResume = (campaign.status === "paused" || campaign.status === "draft") && pendingCount > 0 && !isActionPending;
  const canPause = isRunning && !isActionPending;
  const canCancel = (isRunning || campaign.status === "paused") && campaign.status !== "cancelled" && campaign.status !== "done" && !isActionPending;
  const isDone = ["done", "completed_with_failures", "cancelled", "failed"].includes(campaign.status || "");

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">{campaign.name}</h1>
          <p className="text-xs text-muted-foreground">Grupo: {campaign.group_name || campaign.group_id}</p>
        </div>
        <Badge variant="outline" className={`text-xs font-semibold ${statusBadge(campaign.status)}`}>
          {statusLabel(campaign.status)}
        </Badge>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {canResume && (
            <Button onClick={handleResume} disabled={isActionPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {isActionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isActionPending ? "Preparando..." : "Retomar Campanha"}
          </Button>
        )}
        {canPause && (
          <Button onClick={handlePause} variant="outline" className="gap-2 border-amber-500/30 text-amber-600 hover:bg-amber-500/10">
            <Pause className="w-4 h-4" /> Pausar
          </Button>
        )}
        {canCancel && (
          <Button onClick={handleCancel} variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
            <StopCircle className="w-4 h-4" /> Cancelar
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleManualRefresh} disabled={isManualRefreshing} className="gap-1.5 text-xs">
          <RefreshCw className={`w-3.5 h-3.5 ${isManualRefreshing ? "animate-spin" : ""}`} />
          {isManualRefreshing ? "Atualizando..." : "Atualizar"}
        </Button>
        {isDone && retryableContacts.length > 0 && (
          <>
            <div className="w-px h-6 bg-border/40" />
            <Button variant="outline" size="sm" onClick={handleExportNotAdded} className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" /> Exportar não adicionados ({retryableContacts.length})
            </Button>
            {onNewCampaignFromFailed && (
              <Button variant="outline" size="sm" onClick={handleNewCampaignFromFailed} className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10">
                <RotateCcw className="w-3.5 h-3.5" /> Nova campanha com não adicionados
              </Button>
            )}
          </>
        )}
      </div>

      {/* Runtime note */}
      {(isActionPending || liveRuntimeNote) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-3 px-5 flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
            <span className="text-sm text-foreground">{liveRuntimeNote || "Processando..."}</span>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { label: "Total", value: campaign.total_contacts, color: "text-foreground" },
          { label: "Sucesso", value: successTotal, color: "text-emerald-500", sub: campaign.already_count > 0 ? `(${campaign.success_count || 0} novos + ${campaign.already_count} já no grupo)` : undefined },
          { label: "Falhas", value: campaign.fail_count || 0, color: "text-destructive" },
          { label: "Pendentes", value: pendingCount, color: "text-amber-500" },
          { label: "Cancelados", value: cancelledCount, color: "text-muted-foreground" },
          { label: "Progresso", value: `${progress}%`, color: "text-primary" },
        ].map(s => (
          <Card key={s.label} className="border-border/40 bg-card/80">
            <CardContent className="pt-4 pb-3 px-4">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
              <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
              {(s as any).sub && <p className="text-[9px] text-muted-foreground mt-0.5">{(s as any).sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {isRunning && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-sm font-semibold text-foreground">Campanha em andamento...</span>
              <span className="text-sm text-primary font-bold ml-auto">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2.5" />
            <NextActionCountdown contacts={contacts} campaign={campaign} />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "all", label: `Todos (${contacts.length})` },
            { key: "success", label: `Sucesso (${successTotal})` },
            { key: "failed", label: `Falhas (${campaign.fail_count || 0})` },
            { key: "pending", label: `Pendentes (${pendingCount})` },
            ...(cancelledCount > 0 ? [{ key: "cancelled", label: `Cancelados (${cancelledCount})` }] : []),
          ].map(f => (
            <Button key={f.key} variant={activeFilter === f.key ? "default" : "outline"} size="sm" onClick={() => setActiveFilter(f.key)} className="text-xs h-8 rounded-lg">
              {f.label}
            </Button>
          ))}
        </div>
        <Input value={searchContact} onChange={e => setSearchContact(e.target.value)} placeholder="Buscar número..." className="h-8 max-w-[200px] text-xs" />
      </div>

      {/* Results table */}
      <Card className="border-border/40 bg-card/80">
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 bg-muted/30">
                  <TableHead className="text-xs w-14 font-semibold">#</TableHead>
                  <TableHead className="text-xs font-semibold">Contato</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Instância</TableHead>
                  <TableHead className="text-xs font-semibold">Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.map((r: any, i: number) => (
                  <TableRow key={r.id} className="border-border/15 hover:bg-muted/20">
                    <TableCell className="text-xs text-muted-foreground font-mono">{i + 1}</TableCell>
                    <TableCell className="text-xs font-mono font-medium">{r.phone}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] font-semibold ${statusBadge(r.status)}`}>
                        {statusLabel(r.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.device_used || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[320px] whitespace-normal break-words">
                      {r.error_message
                        ? translateError(r.error_message)
                        : r.status === "completed" ? "Adicionado com sucesso."
                        : r.status === "already_exists" ? "Contato já estava no grupo."
                        : r.status === "pending" ? "Aguardando processamento"
                        : r.status === "cancelled" ? "Cancelado pelo usuário"
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredContacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">Nenhum resultado encontrado</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CREATE CAMPAIGN VIEW
// ═══════════════════════════════════════════════════════════════
function CreateCampaign({ onBack, onCampaignCreated, prefillContacts, prefillName }: { onBack: () => void; onCampaignCreated: (id: string) => void; prefillContacts?: string[]; prefillName?: string }) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("import");
  const [campaignName, setCampaignName] = useState(prefillName ? `Retry - ${prefillName}` : "");
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [rawInput, setRawInput] = useState(prefillContacts?.join("\n") || "");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [participantCheck, setParticipantCheck] = useState<ParticipantCheckResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [isImporting, setIsImporting] = useState(false);
  const [hasImported, setHasImported] = useState(!!prefillContacts?.length);
  const [reimportMode, setReimportMode] = useState<"ask" | null>(null);
  const [importedContacts, setImportedContacts] = useState<ImportedContact[]>(() => {
    if (!prefillContacts?.length) return [];
    return classifyContacts(prefillContacts);
  });
  const [importFilter, setImportFilter] = useState<ImportClassification | "all">("all");

  // Group state
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupLink, setGroupLink] = useState("");
  const [groupJidManual, setGroupJidManual] = useState("");
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [groupInputMode, setGroupInputMode] = useState<"list" | "link" | "jid">("list");
  const [groupLoadError, setGroupLoadError] = useState("");
  const [groupLoadDiagnostics, setGroupLoadDiagnostics] = useState("");

  // Config
  const [minDelay, setMinDelay] = useState(3);
  const [maxDelay, setMaxDelay] = useState(8);
  const [pauseAfter, setPauseAfter] = useState(0);
  const [pauseDuration, setPauseDuration] = useState(30);
  const [rotateAfter, setRotateAfter] = useState(0);

  // Processing state
  const [liveResults, setLiveResults] = useState<ContactResult[]>([]);
  const [liveOk, setLiveOk] = useState(0);
  const [liveFail, setLiveFail] = useState(0);
  const [liveAlready, setLiveAlready] = useState(0);
  const [liveTotal, setLiveTotal] = useState(0);
  const [liveCurrentPhone, setLiveCurrentPhone] = useState("");
  const [liveCurrentDevice, setLiveCurrentDevice] = useState("");
  const [liveStatus, setLiveStatus] = useState<"running" | "paused" | "waiting_pause" | "done" | "cancelled">("running");
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [liveRuntimeNote, setLiveRuntimeNote] = useState("A fila será processada com validação isolada por contato.");

  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const qc = useQueryClient();
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());

  const { data: devices = [] } = useQuery({
    queryKey: ["user-devices-inject", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, uazapi_base_url, instance_type, login_type")
        .not("uazapi_base_url", "is", null);
      if (error) throw error;
      return (data || [])
        .filter((d: any) => d.instance_type !== "notificacao" && d.login_type !== "report_wa")
        .sort((a: any, b: any) => {
          const numA = parseInt((a.name.match(/(\d+)\s*$/) || ["0", "0"])[1]);
          const numB = parseInt((b.name.match(/(\d+)\s*$/) || ["0", "0"])[1]);
          return numA - numB;
        });
    },
    enabled: !!user,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const isDeviceOnline = (status: string) => {
    const s = status?.toLowerCase();
    return s === "connected" || s === "ready" || s === "active";
  };

  // ── Warn on page close during processing ──
  useEffect(() => {
    if (!isProcessing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "A campanha está em andamento. Se sair, ela será pausada e poderá ser retomada depois.";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isProcessing]);

  // ── Auto-pause campaign on unmount ──
  useEffect(() => {
    return () => {
      if (campaignId && isProcessing) {
        cancelRef.current = true;
        supabase.from("mass_inject_campaigns").update({
          status: "paused",
          updated_at: new Date().toISOString(),
        } as any).eq("id", campaignId).then(() => {});
      }
    };
  }, [campaignId, isProcessing]);

  // ── Load groups for a SINGLE device (clear previous state) ──
  const handleLoadGroups = useCallback(async (deviceId: string) => {
    // ALWAYS clear previous groups to prevent cross-instance contamination
    setGroups([]);
    setGroupId("");
    setGroupName("");
    setGroupLoadError("");
    setGroupLoadDiagnostics("");
    setIsLoadingGroups(true);

    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: { action: "list-groups", deviceId },
      });
      if (error) throw error;

      const groupsList = data?.groups || [];
      setGroups(groupsList);

      if (data?.error) {
        setGroupLoadError(data.error);
      }
      if (data?.diagnostics) {
        setGroupLoadDiagnostics(data.diagnostics);
      }

      if (groupsList.length > 0) {
        toast.success(`${groupsList.length} grupo(s) encontrado(s)`);
      }
    } catch (e: any) {
      setGroupLoadError(`Erro ao buscar grupos: ${e.message || "Erro desconhecido"}`);
      toast.error("Erro ao buscar grupos da instância");
    } finally {
      setIsLoadingGroups(false);
    }
  }, []);

  // ── Device toggle with proper state isolation ──
  const handleDeviceToggle = useCallback((deviceId: string) => {
    const isCurrentlySelected = selectedDeviceIds.includes(deviceId);

    if (isCurrentlySelected) {
      // Removing device
      const remaining = selectedDeviceIds.filter(id => id !== deviceId);
      setSelectedDeviceIds(remaining);

      if (remaining.length === 0) {
        // No devices left: clear everything
        setGroups([]);
        setGroupId("");
        setGroupName("");
        setGroupLoadError("");
        setGroupLoadDiagnostics("");
      } else if (selectedDeviceIds[0] === deviceId) {
        // Removed the primary device: reload groups from new primary
        handleLoadGroups(remaining[0]);
      }
    } else {
      // Adding device
      const newIds = [...selectedDeviceIds, deviceId];
      setSelectedDeviceIds(newIds);

      // If this is the first device or we had none, load its groups
      if (selectedDeviceIds.length === 0) {
        handleLoadGroups(deviceId);
      }
    }
  }, [selectedDeviceIds, handleLoadGroups]);

  const primaryDeviceId = selectedDeviceIds[0] || "";

  // ── Resolve group link ──
  const handleResolveLink = useCallback(async () => {
    if (!groupLink.trim() || !primaryDeviceId) {
      toast.error("Informe o link e selecione uma instância");
      return;
    }
    setIsResolvingLink(true);
    setGroupLoadError("");
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: { action: "resolve-link", deviceId: primaryDeviceId, link: groupLink.trim() },
      });
      if (error) throw error;
      if (data?.jid) {
        setGroupId(data.jid);
        setGroupName(data.name || "Grupo");
        toast.success(`Grupo encontrado: ${data.name || data.jid}`);
      } else {
        setGroupLoadError(data?.error || "Não foi possível resolver o link do grupo.");
        toast.error(data?.error || "Não foi possível resolver o link");
      }
    } catch (e: any) {
      setGroupLoadError(`Erro ao resolver link: ${e.message}`);
      toast.error(e.message || "Erro ao resolver link");
    } finally {
      setIsResolvingLink(false);
    }
  }, [groupLink, primaryDeviceId]);

  // ── Set JID manually ──
  const handleSetJidManual = useCallback(() => {
    const jid = groupJidManual.trim();
    if (!jid) { toast.error("Informe o JID do grupo"); return; }
    if (!jid.includes("@g.us")) {
      toast.error("JID inválido. O formato correto é: 120363...@g.us");
      return;
    }
    setGroupId(jid);
    setGroupName("Grupo (JID manual)");
    toast.success("JID do grupo definido");
  }, [groupJidManual]);

  // ── Clear group when switching input mode ──
  const handleGroupModeChange = useCallback((mode: "list" | "link" | "jid") => {
    setGroupInputMode(mode);
    setGroupId("");
    setGroupName("");
    setGroupLoadError("");
    if (mode === "list" && primaryDeviceId && groups.length === 0) {
      handleLoadGroups(primaryDeviceId);
    }
  }, [primaryDeviceId, groups.length, handleLoadGroups]);

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    const q = groupSearch.toLowerCase();
    return groups.filter(g => g.name.toLowerCase().includes(q) || g.jid.toLowerCase().includes(q));
  }, [groups, groupSearch]);

  const selectedGroup = useMemo(() => groups.find(g => g.jid === groupId), [groups, groupId]);

  const parseContacts = useCallback((input: string): string[] => {
    return input.split(/[\n,;]+/).map(c => c.trim()).filter(c => c.length > 0);
  }, []);

  /** Import contacts: classify ALL, discard NONE */
  const handleImportContacts = useCallback((rawLines: string[], mode: "replace" | "merge" = "replace") => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      if (mode === "merge") {
        // Merge: re-classify entire combined list so duplicates across old+new are tagged
        const existingRaw = importedContacts.map(c => c.raw);
        const combined = [...existingRaw, ...rawLines];
        const classified = classifyContacts(combined);
        setImportedContacts(classified);
        const newCount = rawLines.length;
        toast.success(`${newCount} linha(s) adicionadas (total: ${classified.length})`);
      } else {
        const classified = classifyContacts(rawLines);
        setImportedContacts(classified);
        toast.success(`${classified.length} linha(s) importadas`);
      }
      // Also sync rawInput for downstream compatibility
      const allNormalized = (mode === "merge"
        ? [...importedContacts.map(c => c.raw), ...rawLines]
        : rawLines
      );
      setRawInput(allNormalized.join("\n"));
      setHasImported(true);
      setImportFilter("all");
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, importedContacts]);

  const importStats = useMemo(() => {
    const total = importedContacts.length;
    const valid = importedContacts.filter(c => c.classification === "valid").length;
    const duplicate = importedContacts.filter(c => c.classification === "duplicate").length;
    const invalid = importedContacts.filter(c => c.classification === "invalid").length;
    const empty = importedContacts.filter(c => c.classification === "empty").length;
    return { total, valid, duplicate, invalid, empty };
  }, [importedContacts]);

  const filteredImportedContacts = useMemo(() => {
    if (importFilter === "all") return importedContacts;
    return importedContacts.filter(c => c.classification === importFilter);
  }, [importedContacts, importFilter]);

  const handleValidate = useCallback(async () => {
    const validContacts = importedContacts.filter(c => c.classification === "valid").map(c => c.normalized);
    if (validContacts.length === 0) return toast.error("Nenhum contato válido para processar");
    if (!groupId.trim()) return toast.error("Selecione um grupo de destino");
    if (selectedDeviceIds.length === 0) return toast.error("Selecione pelo menos uma instância");
    if (!campaignName.trim()) return toast.error("Dê um nome para a campanha");

    setIsValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", { body: { action: "validate", contacts: validContacts } });
      if (error) throw error;
      setParticipantCheck(null);
      setValidationResult(data);
      setCompletedSteps(prev => new Set([...prev, "import"]));
      setStep("preview");
      toast.success(`${data.validCount} contatos válidos encontrados`);
    } catch (e: any) { toast.error(e.message || "Erro na validação"); }
    finally { setIsValidating(false); }
  }, [importedContacts, groupId, selectedDeviceIds, campaignName]);

  const handleCheckParticipants = useCallback(async () => {
    if (!validationResult?.valid.length) return;
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: { action: "check-participants", groupId, deviceId: primaryDeviceId, contacts: validationResult.valid },
      });
      if (error) throw error;
      setParticipantCheck(data);
      toast.success(`${data.readyCount} livres e ${data.alreadyExistsCount} já localizados no grupo`);
    } catch (e: any) { toast.error(e.message || "Erro ao verificar participantes"); }
    finally { setIsChecking(false); }
  }, [validationResult, groupId, primaryDeviceId]);

  const handleProcess = useCallback(async () => {
    const contacts = validationResult?.valid || [];
    if (contacts.length === 0) return toast.error("Nenhum contato válido para processar");
    setConfirmOpen(false);
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: {
          action: "create-campaign",
          name: campaignName || `Campanha ${new Date().toLocaleString("pt-BR")}`,
          groupId,
          groupName: groupName || selectedGroup?.name || groupId,
          deviceIds: selectedDeviceIds,
          contacts,
          minDelay,
          maxDelay,
          pauseAfter,
          pauseDuration,
          rotateAfter,
        },
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["mass_inject_campaigns"] });
      toast.success(
        data?.deferredParticipantCheck
          ? `Campanha iniciada: ${data?.readyCount ?? contacts.length} contatos na fila. A checagem no grupo acontecerá durante a execução.`
          : `Campanha criada: ${data?.readyCount ?? 0} na fila, ${data?.alreadyExistsCount ?? 0} já estavam no grupo.`
      );
      onCampaignCreated(data.campaignId);
    } catch (e: any) {
      toast.error("Erro ao criar campanha: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  }, [validationResult, groupId, groupName, selectedDeviceIds, minDelay, maxDelay, pauseAfter, pauseDuration, rotateAfter, campaignName, selectedGroup, qc, onCampaignCreated]);

  const handlePause = useCallback(() => { pauseRef.current = !pauseRef.current; setIsPaused(pauseRef.current); }, []);
  const handleCancel = useCallback(() => { cancelRef.current = true; pauseRef.current = false; setIsPaused(false); }, []);

  const handleStepClick = useCallback((targetStep: Step) => {
    if (isProcessing) return;
    const order: Step[] = ["import", "preview", "processing", "done"];
    const ti = order.indexOf(targetStep);
    const ci = order.indexOf(step);
    if (ti < ci) { setStep(targetStep); return; }
    if (completedSteps.has(targetStep) || (ti === ci + 1 && completedSteps.has(step))) setStep(targetStep);
  }, [step, completedSteps, isProcessing]);

  const filteredResults = useMemo(() => {
    if (activeFilter === "all") return liveResults;
    if (activeFilter === "success") return liveResults.filter(r => isSuccessStatus(r.status));
    if (activeFilter === "failed") return liveResults.filter(r => isFailureStatus(r.status));
    return liveResults.filter(r => r.status === activeFilter);
  }, [liveResults, activeFilter]);

  const totalToProcess = validationResult?.validCount ?? 0;
  const contactCount = importedContacts.length;
  const liveProcessed = liveOk + liveFail;
  const liveProgress = liveTotal > 0 ? Math.round((liveProcessed / liveTotal) * 100) : 0;

  const stepItems = [
    { key: "import" as Step, label: "Importar", icon: Upload },
    { key: "preview" as Step, label: "Revisão", icon: Search },
    { key: "processing" as Step, label: "Processando", icon: RefreshCw },
    { key: "done" as Step, label: "Concluído", icon: CheckCircle2 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => {
            if (isProcessing) {
              toast.info("Campanha pausada. Você pode retomá-la pela lista de campanhas.", { duration: 4000 });
            }
            onBack();
          }} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Nova Campanha</h1>
            <p className="text-sm text-muted-foreground">Adição em massa de membros</p>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-1 bg-card/50 border border-border/50 rounded-2xl p-2">
        {stepItems.map((s, i, arr) => {
          const isCurrent = step === s.key;
          const isPast = arr.findIndex(x => x.key === step) > i;
          const canClick = !isProcessing && (isPast || completedSteps.has(s.key) || isCurrent);
          return (
            <div key={s.key} className="flex items-center gap-1 flex-1">
              <button onClick={() => canClick && handleStepClick(s.key)} disabled={!canClick}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all w-full justify-center ${
                  isCurrent ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : isPast ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                  : canClick ? "text-muted-foreground hover:bg-muted/50 cursor-pointer"
                  : "text-muted-foreground/40 cursor-not-allowed"
                }`}>
                <s.icon className="w-4 h-4" /><span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* ══ IMPORT ══ */}
      {step === "import" && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-2 space-y-5">
            {/* Campaign name */}
            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm">
              <CardContent className="pt-5 pb-4 px-5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Nome da Campanha</label>
                <Input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Ex: Adição Grupo VIP - Março" className="h-11" />
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2.5"><Shield className="w-4 h-4 text-primary" />Configuração</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Instances */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Instâncias ({selectedDeviceIds.length} selecionada{selectedDeviceIds.length !== 1 ? "s" : ""})
                  </label>
                  <div className="max-h-[180px] overflow-y-auto rounded-xl border border-border/40 divide-y divide-border/20">
                    {devices.map((d: any) => (
                      <label key={d.id} className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-muted/30 ${selectedDeviceIds.includes(d.id) ? "bg-primary/5" : ""}`}>
                        <Checkbox checked={selectedDeviceIds.includes(d.id)} onCheckedChange={() => handleDeviceToggle(d.id)} />
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isDeviceOnline(d.status) ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                        <span className="text-sm font-medium truncate">{d.name}</span>
                        {d.number && <span className="text-xs text-muted-foreground">({d.number})</span>}
                      </label>
                    ))}
                    {devices.length === 0 && <p className="text-xs text-destructive text-center py-4">Nenhuma instância com Uazapi encontrada</p>}
                  </div>
                </div>

                {/* Group selection */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Grupo de Destino</label>
                  <div className="flex gap-1 mb-3 bg-muted/30 p-1 rounded-lg">
                    {([
                      { key: "list" as const, label: "Meus Grupos", icon: Users },
                      { key: "link" as const, label: "Link do Grupo", icon: Link2 },
                      { key: "jid" as const, label: "JID Manual", icon: Hash },
                    ]).map(m => (
                      <button key={m.key} onClick={() => handleGroupModeChange(m.key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold py-2 rounded-md transition-all ${
                          groupInputMode === m.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}>
                        <m.icon className="w-3 h-3" />
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Mode: Meus Grupos */}
                  {groupInputMode === "list" && (
                    !primaryDeviceId ? (
                      <div className="rounded-xl bg-muted/30 border border-border/30 px-4 py-5 text-center">
                        <Info className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Selecione uma instância acima para carregar os grupos.</p>
                      </div>
                    ) : isLoadingGroups ? (
                      <div className="flex items-center gap-3 py-5 justify-center">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        <span className="text-sm text-muted-foreground">Carregando grupos da instância...</span>
                      </div>
                    ) : groups.length > 0 ? (
                      <div className="space-y-2">
                        <Input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Buscar grupo..." className="h-9 text-sm" />
                        <div className="max-h-[200px] overflow-y-auto rounded-xl border border-border/40 divide-y divide-border/20">
                          {filteredGroups.map(g => (
                            <button key={g.jid} onClick={() => { setGroupId(g.jid); setGroupName(g.name); }}
                              className={`w-full text-left px-3.5 py-2.5 transition-colors hover:bg-muted/50 ${groupId === g.jid ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}>
                              <p className="text-sm font-medium truncate">{g.name}</p>
                              <p className="text-[10px] text-muted-foreground/60 font-mono truncate">{g.jid}</p>
                            </button>
                          ))}
                          {filteredGroups.length === 0 && groupSearch && (
                            <p className="text-xs text-muted-foreground text-center py-3">Nenhum grupo com esse nome</p>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleLoadGroups(primaryDeviceId)} className="w-full gap-2 text-xs h-8">
                          <RefreshCw className="w-3 h-3" /> Recarregar Grupos
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 px-4 py-4 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-amber-600">
                              {groupLoadError || "Esta instância não retornou grupos disponíveis."}
                            </p>
                            <div className="text-[11px] text-muted-foreground mt-2 space-y-1">
                              <p>• Tente recarregar a lista clicando abaixo</p>
                              <p>• Troque de instância — outra pode ter acesso</p>
                              <p>• Use <strong>"Link do Grupo"</strong> ou <strong>"JID Manual"</strong> como alternativa</p>
                              <p>• Verifique se a instância está conectada ao WhatsApp</p>
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleLoadGroups(primaryDeviceId)} className="w-full gap-2 text-xs h-8 mt-2">
                          <RefreshCw className="w-3 h-3" /> Tentar Novamente
                        </Button>
                      </div>
                    )
                  )}

                  {/* Mode: Link do Grupo */}
                  {groupInputMode === "link" && (
                    <div className="space-y-3">
                      {!primaryDeviceId && (
                        <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                          <p className="text-[11px] text-amber-600">Selecione uma instância acima. Ela será usada para resolver o link.</p>
                        </div>
                      )}
                      <Input value={groupLink} onChange={e => setGroupLink(e.target.value)} placeholder="https://chat.whatsapp.com/AbCdEfGhIjK..." className="h-11 font-mono text-sm" />
                      <Button onClick={handleResolveLink} disabled={isResolvingLink || !groupLink.trim() || !primaryDeviceId} variant="outline" className="w-full gap-2 h-10" size="sm">
                        {isResolvingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {isResolvingLink ? "Resolvendo..." : "Resolver Link"}
                      </Button>
                      {groupLoadError && (
                        <div className="rounded-xl bg-destructive/5 border border-destructive/20 px-3 py-2">
                          <p className="text-[11px] text-destructive">{groupLoadError}</p>
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground/60 space-y-0.5">
                        <p>• Cole o link de convite do grupo do WhatsApp</p>
                        <p>• A instância selecionada tentará validar e resolver o grupo</p>
                        <p>• Se a instância já é membro, use "Meus Grupos"</p>
                      </div>
                    </div>
                  )}

                  {/* Mode: JID Manual */}
                  {groupInputMode === "jid" && (
                    <div className="space-y-3">
                      <Input value={groupJidManual} onChange={e => setGroupJidManual(e.target.value)} placeholder="120363...@g.us" className="h-11 font-mono text-sm" />
                      <Button onClick={handleSetJidManual} disabled={!groupJidManual.trim()} variant="outline" className="w-full gap-2 h-10" size="sm">
                        <CheckCircle2 className="w-4 h-4" /> Definir Grupo
                      </Button>
                      <div className="text-[10px] text-muted-foreground/60 space-y-0.5">
                        <p>• O JID é o identificador único do grupo (ex: 120363...@g.us)</p>
                        <p>• Você pode encontrá-lo nas configurações do grupo ou em logs anteriores</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Selected group indicator */}
                {groupId && (
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 px-4 py-3 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{groupName || selectedGroup?.name || "Grupo selecionado"}</p>
                      <p className="text-[10px] text-muted-foreground/60 font-mono truncate">{groupId}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => { setGroupId(""); setGroupName(""); }}>
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Advanced config */}
            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2.5"><Settings2 className="w-4 h-4 text-primary" />Configurações Avançadas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-2"><Timer className="w-3.5 h-3.5 text-muted-foreground" /><label className="text-xs font-semibold text-muted-foreground">Delay entre contatos (segundos)</label></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-[10px] text-muted-foreground/60">Mínimo</span><Input type="number" min={1} max={120} value={minDelay} onChange={e => setMinDelay(Number(e.target.value) || 1)} className="h-9 text-sm mt-1" /></div>
                    <div><span className="text-[10px] text-muted-foreground/60">Máximo</span><Input type="number" min={1} max={300} value={maxDelay} onChange={e => setMaxDelay(Math.max(Number(e.target.value) || 1, minDelay))} className="h-9 text-sm mt-1" /></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2"><Pause className="w-3.5 h-3.5 text-muted-foreground" /><label className="text-xs font-semibold text-muted-foreground">Pausa automática</label></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-[10px] text-muted-foreground/60">A cada X adições</span><Input type="number" min={0} value={pauseAfter} onChange={e => setPauseAfter(Number(e.target.value) || 0)} className="h-9 text-sm mt-1" /></div>
                    <div><span className="text-[10px] text-muted-foreground/60">Duração (segundos)</span><Input type="number" min={5} max={600} value={pauseDuration} onChange={e => setPauseDuration(Number(e.target.value) || 30)} className="h-9 text-sm mt-1" /></div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">Deixe "A cada" em 0 para desativar</p>
                </div>
                {selectedDeviceIds.length > 1 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2"><ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" /><label className="text-xs font-semibold text-muted-foreground">Rotação de instância</label></div>
                    <Input type="number" min={0} value={rotateAfter} onChange={e => setRotateAfter(Number(e.target.value) || 0)} className="h-9 text-sm" />
                    <p className="text-[10px] text-muted-foreground/50 mt-1">Trocar de instância a cada X adições (0 = desativado)</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Import contacts */}
          <div className="xl:col-span-3">
            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm h-full">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2.5"><Upload className="w-4 h-4 text-primary" />Importar Contatos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Import contacts */}
                {hasImported ? (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 px-4 py-4 flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{contactCount} contatos importados</p>
                        <p className="text-[10px] text-muted-foreground">Duplicados já foram removidos automaticamente</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setReimportMode("ask")} className="gap-1.5 text-xs shrink-0">
                        <RotateCcw className="w-3.5 h-3.5" /> Reimportar
                      </Button>
                    </div>
                    <Textarea value={rawInput} onChange={e => setRawInput(e.target.value)}
                      onBlur={() => { if (rawInput.trim()) handleRawInputChange(rawInput); }}
                      placeholder="Um número por linha"
                      className="min-h-[200px] font-mono text-xs resize-none bg-muted/20 border-border/40" />
                  </div>
                ) : (
                  <Tabs defaultValue="paste">
                    <TabsList className="w-full grid grid-cols-2 h-10 bg-muted/50">
                      <TabsTrigger value="paste" className="text-xs font-semibold">Colar Números</TabsTrigger>
                      <TabsTrigger value="file" className="text-xs font-semibold">Arquivo CSV/TXT/XLSX</TabsTrigger>
                    </TabsList>
                    <TabsContent value="paste" className="mt-4">
                      <Textarea value={rawInput} onChange={e => setRawInput(e.target.value)}
                        onBlur={() => { if (rawInput.trim()) handleRawInputChange(rawInput); }}
                        placeholder={"5562999999999\n5521988888888\n\nDuplicados são removidos automaticamente.\nUm número por linha."}
                        className="min-h-[300px] font-mono text-xs resize-none bg-muted/20 border-border/40" />
                    </TabsContent>
                    <TabsContent value="file" className="mt-4">
                      <label className={`block border-2 border-dashed border-border/40 rounded-2xl p-10 text-center transition-colors hover:border-primary/30 hover:bg-primary/5 ${isImporting ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
                        {isImporting ? (
                          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-3" />
                        ) : (
                          <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                        )}
                        <p className="text-sm text-muted-foreground mb-1">{isImporting ? "Importando..." : "Arraste ou clique para selecionar"}</p>
                        <p className="text-[10px] text-muted-foreground/50">CSV, TXT ou XLSX — duplicados removidos automaticamente</p>
                        <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" disabled={isImporting} onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setIsImporting(true);
                          const ext = file.name.split('.').pop()?.toLowerCase();
                          try {
                            if (ext === 'xlsx' || ext === 'xls') {
                              const XLSX = await import('xlsx');
                              const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
                              const nums: string[] = [];
                              for (const sn of wb.SheetNames) {
                                const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 });
                                for (const row of rows) for (const cell of row) {
                                  const v = String(cell ?? '').trim();
                                  if (v && /\d{8,}/.test(v.replace(/\D/g, ''))) nums.push(v.replace(/\D/g, ''));
                                }
                              }
                              handleRawInputChange(nums.join('\n'));
                              toast.success(`${nums.length} números importados do arquivo`);
                            } else {
                              const text = await file.text();
                              handleRawInputChange(text);
                              toast.success(`Arquivo carregado com sucesso`);
                            }
                          } catch { toast.error('Erro ao ler arquivo'); }
                          finally { setIsImporting(false); }
                          e.target.value = '';
                        }} />
                      </label>
                    </TabsContent>
                  </Tabs>
                )}

                {contactCount > 0 && !hasImported && (
                  <div className="flex items-center gap-3 bg-primary/5 rounded-xl px-4 py-3">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">{contactCount} contatos detectados</span>
                  </div>
                )}

                <Button onClick={handleValidate} disabled={isValidating || isImporting || !rawInput.trim() || !groupId.trim() || selectedDeviceIds.length === 0 || !campaignName.trim()} className="w-full h-12 gap-2 text-sm font-semibold rounded-xl shadow-md shadow-primary/10" size="lg">
                  {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {isValidating ? "Validando contatos..." : "Validar e Revisar"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Reimport dialog */}
      <AlertDialog open={reimportMode === "ask"} onOpenChange={(open) => { if (!open) setReimportMode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reimportar contatos</AlertDialogTitle>
            <AlertDialogDescription>
              Já existem {contactCount} contatos importados. O que deseja fazer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => {
              setReimportMode(null);
              setHasImported(false);
              // Keep existing contacts, user will add via file (merge mode will be used)
              toast.info("Importe um novo arquivo para adicionar aos contatos existentes");
            }} className="gap-1.5">
              <Plus className="w-4 h-4" /> Adicionar aos existentes
            </Button>
            <AlertDialogAction onClick={() => {
              setReimportMode(null);
              setRawInput("");
              setHasImported(false);
              setValidationResult(null);
              setParticipantCheck(null);
              toast.info("Contatos anteriores removidos. Importe novamente.");
            }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Substituir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ PREVIEW ══ */}
      {step === "preview" && validationResult && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total", value: validationResult.total, color: "text-foreground" },
              { label: "Válidos", value: validationResult.validCount, color: "text-emerald-500" },
              { label: "Inválidos", value: validationResult.invalidCount, color: "text-destructive" },
              { label: "Duplicados", value: validationResult.duplicateCount, color: "text-amber-500" },
              { label: "Já no Grupo", value: participantCheck?.alreadyExistsCount ?? "Opcional", color: "text-blue-500" },
              { label: "Na Fila", value: validationResult.validCount, color: "text-primary" },
            ].map(s => (
              <Card key={s.label} className="border-border/40 bg-card/80">
                <CardContent className="pt-4 pb-3 px-4">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
                  <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {participantCheck ? (
            participantCheck.alreadyExistsCount > 0 && (
              <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 px-4 py-3 flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  <strong>{participantCheck.alreadyExistsCount}</strong> contato(s) foram encontrados na pré-checagem; a confirmação final ainda acontece durante o processamento.
                </p>
              </div>
            )
          ) : (
            <div className="rounded-xl border border-border/40 bg-card/50 px-4 py-3 flex items-start gap-3">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                A verificação de existentes no grupo é opcional. Se você iniciar agora, a checagem será feita durante a execução da fila.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Button variant="ghost" onClick={() => setStep("import")} className="gap-2 h-10 text-muted-foreground">← Voltar</Button>
            {!participantCheck && (
              <Button onClick={handleCheckParticipants} disabled={isChecking} variant="outline" className="gap-2 h-10">
                {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Verificar Existentes (opcional)
              </Button>
            )}
            <Button onClick={() => setConfirmOpen(true)} disabled={totalToProcess === 0} className="gap-2 h-10 shadow-md shadow-primary/10">
              <Play className="w-4 h-4" /> Iniciar Campanha ({totalToProcess} contatos)
            </Button>
          </div>
        </div>
      )}

      {/* ══ PROCESSING ══ */}
      {step === "processing" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Processados", value: `${liveProcessed}/${liveTotal}`, color: "text-foreground" },
              { label: "Sucesso", value: liveOk, color: "text-emerald-500" },
              { label: "Falhas", value: liveFail, color: "text-destructive" },
              { label: "Progresso", value: `${liveProgress}%`, color: "text-primary" },
              { label: "Tempo", value: formatTime(liveElapsed), color: "text-muted-foreground" },
            ].map(s => (
              <Card key={s.label} className="border-border/40 bg-card/80">
                <CardContent className="pt-4 pb-3 px-4">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
                  <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border/40 bg-card/80">
            <CardContent className="py-5 px-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {liveStatus === "running" && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                  {liveStatus === "paused" && <Pause className="w-5 h-5 text-amber-500" />}
                  {liveStatus === "waiting_pause" && <Clock className="w-5 h-5 text-amber-500 animate-pulse" />}
                  <div>
                    <p className="text-sm font-semibold">
                      {liveStatus === "running" && "Processando..."}
                      {liveStatus === "paused" && "Campanha pausada"}
                      {liveStatus === "waiting_pause" && `Pausa automática (${pauseDuration}s)...`}
                    </p>
                    {liveCurrentPhone && liveStatus === "running" && (
                      <p className="text-xs text-muted-foreground">
                        Adicionando <span className="font-mono">{liveCurrentPhone}</span> via <span className="text-primary font-medium">{liveCurrentDevice}</span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{liveRuntimeNote}</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-primary">{liveProgress}%</span>
              </div>
              <Progress value={liveProgress} className="h-3" />
              <p className="text-[10px] text-muted-foreground/50 text-center">Se você sair, a campanha será pausada automaticamente e poderá ser retomada depois.</p>
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-center">
            <Button onClick={handlePause} variant="outline" className="gap-2 h-11 min-w-[140px]" disabled={!isProcessing}>
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isPaused ? "Retomar" : "Pausar"}
            </Button>
            <Button onClick={handleCancel} variant="destructive" className="gap-2 h-11 min-w-[140px]" disabled={!isProcessing}>
              <StopCircle className="w-4 h-4" /> Cancelar
            </Button>
          </div>

          {liveResults.length > 0 && (
            <Card className="border-border/40 bg-card/80">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Resultados em Tempo Real</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow className="border-border/30 bg-muted/30">
                      <TableHead className="text-xs w-14">#</TableHead>
                      <TableHead className="text-xs">Contato</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Instância</TableHead>
                      <TableHead className="text-xs">Detalhe</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {[...liveResults].reverse().slice(0, 50).map((r, i) => (
                        <TableRow key={liveResults.length - i} className="border-border/15">
                          <TableCell className="text-xs font-mono">{liveResults.length - i}</TableCell>
                          <TableCell className="text-xs font-mono font-medium">{r.phone}</TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] font-semibold ${statusBadge(r.status)}`}>{statusLabel(r.status)}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.deviceUsed || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[280px] whitespace-normal break-words">{r.error ? translateError(r.error) : r.status === "completed" ? "Adicionado com sucesso." : r.status === "already_exists" ? "Contato já estava no grupo." : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ══ DONE ══ */}
      {step === "done" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Sucesso Total", value: liveOk, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
              { label: "Falhas", value: liveFail, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
              { label: "Processados", value: liveProcessed, color: "text-foreground", bg: "bg-muted/50 border-border/40" },
              { label: "Duração", value: formatTime(liveElapsed), color: "text-muted-foreground", bg: "bg-muted/50 border-border/40" },
            ].map(s => (
              <Card key={s.label} className={`border ${s.bg}`}>
                <CardContent className="pt-5 pb-4 px-5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
                  <p className={`text-3xl font-bold ${s.color} mt-1`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {liveAlready > 0 && (
            <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 px-4 py-3 flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                Do total de <strong>{liveOk}</strong> sucessos, <strong>{liveAlready}</strong> já estavam no grupo e foram contados automaticamente.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap justify-center">
            {[
              { key: "all", label: `Todos (${liveResults.length})` },
              { key: "success", label: `Sucesso (${liveOk})` },
              { key: "failed", label: `Falhas (${liveFail})` },
            ].map(f => (
              <Button key={f.key} variant={activeFilter === f.key ? "default" : "outline"} size="sm" onClick={() => setActiveFilter(f.key)} className="text-xs h-8 rounded-lg">
                {f.label}
              </Button>
            ))}
          </div>

          <Card className="border-border/40 bg-card/80">
            <CardContent className="p-0">
              <div className="max-h-[450px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow className="border-border/30 bg-muted/30">
                    <TableHead className="text-xs w-14">#</TableHead>
                    <TableHead className="text-xs">Contato</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Instância</TableHead>
                    <TableHead className="text-xs">Detalhe</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredResults.map((r, i) => (
                      <TableRow key={i} className="border-border/15">
                        <TableCell className="text-xs font-mono">{i + 1}</TableCell>
                        <TableCell className="text-xs font-mono font-medium">{r.phone}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] font-semibold ${statusBadge(r.status)}`}>{statusLabel(r.status)}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.deviceUsed || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[280px] whitespace-normal break-words">{r.error ? translateError(r.error) : r.status === "completed" ? "Adicionado com sucesso." : r.status === "already_exists" ? "Contato já estava no grupo." : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button onClick={onBack} className="gap-2 h-11 rounded-xl"><ArrowLeft className="w-4 h-4" /> Ver Campanhas</Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Processamento</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Campanha: <strong>{campaignName}</strong></p>
                <p><strong>{totalToProcess}</strong> contatos para adição ao grupo <strong>{groupName || selectedGroup?.name || groupId}</strong>.</p>
                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-xs">
                  <p>📱 {selectedDeviceIds.length} instância{selectedDeviceIds.length !== 1 ? "s" : ""}</p>
                  <p>⏱ Delay: {minDelay}s – {maxDelay}s</p>
                  {pauseAfter > 0 && <p>⏸ Pausa de {pauseDuration}s a cada {pauseAfter} adições</p>}
                  {rotateAfter > 0 && <p>🔄 Troca de instância a cada {rotateAfter} adições</p>}
                  <p>🔎 {participantCheck ? "Pré-checagem opcional concluída; a confirmação final ocorrerá durante a execução." : "Sem pré-checagem: a verificação no grupo será feita durante a execução."}</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleProcess}>Iniciar Campanha</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════════════
export default function MassGroupInject() {
  const [view, setView] = useState<View>("list");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [prefillContacts, setPrefillContacts] = useState<string[] | undefined>();
  const [prefillName, setPrefillName] = useState<string | undefined>();

  const handleNewCampaignFromFailed = useCallback((phones: string[], sourceName: string) => {
    setPrefillContacts(phones);
    setPrefillName(sourceName);
    setView("create");
  }, []);

  if (view === "create") {
    return (
      <CreateCampaign
        onBack={() => { setView("list"); setPrefillContacts(undefined); setPrefillName(undefined); }}
        onCampaignCreated={(id) => { setSelectedCampaignId(id); setView("detail"); setPrefillContacts(undefined); setPrefillName(undefined); }}
        prefillContacts={prefillContacts}
        prefillName={prefillName}
      />
    );
  }

  if (view === "detail" && selectedCampaignId) {
    return (
      <CampaignDetail
        campaignId={selectedCampaignId}
        onBack={() => { setSelectedCampaignId(null); setView("list"); }}
        onNewCampaignFromFailed={handleNewCampaignFromFailed}
      />
    );
  }

  return <CampaignList onCreateNew={() => setView("create")} onViewCampaign={(id) => { setSelectedCampaignId(id); setView("detail"); }} />;
}
