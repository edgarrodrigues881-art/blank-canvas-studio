import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  if (e.includes("session_dropped") || e.includes("sessão da api")) return "Sessão da API desconectada (temporário)";
  if (e.includes("confirmed_disconnect") || e.includes("realmente desconectada")) return "Instância offline (confirmado)";
  if (e.includes("connection_unconfirmed")) return "Conexão instável — revalidando";
  if (e.includes("confirmed_no_admin") || e.includes("privilégio de admin")) return "Sem privilégio de admin (confirmado)";
  if (e.includes("permission_unconfirmed")) return "Permissão de admin não confirmada";
  if (e.includes("invalid_group") || e.includes("grupo inválido")) return "Grupo inválido ou inacessível";
  if (e.includes("contact_not_found") || e.includes("não foi encontrado")) return "Contato não encontrado no WhatsApp";
  if (e.includes("unauthorized") || e.includes("autenticação")) return "Falha de autenticação da instância";
  if (e.includes("blocked") || e.includes("ban") || e.includes("bloqueio")) return "Número bloqueado pelo WhatsApp";
  if (e.includes("limite de requisições") || e.includes("rate") || e.includes("429")) return "Limite da API atingido — aguardando cooldown automático";
  if (e.includes("api temporariamente")) return "API sobrecarregada — aguardando";
  if (e.includes("tentativas esgotadas")) return clean;
  if (e.includes("tempo de resposta") || e.includes("timeout")) return "Tempo de resposta excedido";
  if (e.includes("503") || e.includes("indisponível")) return "Instância indisponível (503)";
  if (e.includes("todas as instâncias")) return "Todas as instâncias desconectadas";
  if (e.includes("cancelada pelo usuário")) return "Cancelado pelo usuário";
  if (e.includes("não classificada") || e.includes("falha não")) return "Falha não classificada";
  if (e.includes("sessão") && e.includes("desconectada")) return "Sessão da API desconectada";
  if (e.includes("whatsapp disconnected") || e.includes("disconnected")) return "Sessão da API desconectada (temporário)";
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
    case "rate_limited": return "Limite de API";
    case "api_temporary": return "Falha temporária";
    case "temporary_error": return "Erro temporário";
    case "connection_unconfirmed": return "Conexão instável";
    case "session_dropped": return "Sessão desconectada";
    case "confirmed_disconnect": return "Offline (confirmado)";
    case "permission_unconfirmed": return "Admin não confirmado";
    case "confirmed_no_admin": return "Sem privilégio";
    case "invalid_group": return "Grupo inválido";
    case "contact_not_found": return "Contato inexistente";
    case "unauthorized": return "Autenticação";
    case "blocked": return "Bloqueado (WhatsApp)";
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
    case "session_dropped": return "border-amber-500/30 text-amber-600 bg-amber-500/5";
    case "permission_unconfirmed": return "border-amber-500/30 text-amber-600 bg-amber-500/5";
    case "confirmed_disconnect": return "border-orange-500/30 text-orange-500 bg-orange-500/5";
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

const REAL_FAILURE_CONTACT_STATUSES = new Set([
  "failed",
  "confirmed_disconnect",
  "confirmed_no_admin",
  "invalid_group",
  "contact_not_found",
  "unauthorized",
  "blocked",
]);

function isFailureStatus(status: string) {
  return REAL_FAILURE_CONTACT_STATUSES.has(status);
}

// Statuses eligible for retry / export (anything that wasn't successfully added)
const RETRYABLE_EXPORT_STATUSES = new Set([
  "rate_limited",
  "api_temporary",
  "connection_unconfirmed",
  "confirmed_disconnect",
  "permission_unconfirmed",
  "unknown_failure",
  "blocked",
  "unauthorized",
  "cancelled",
  "failed",
  "timeout",
  "invalid_group",
  "contact_not_found",
  "confirmed_no_admin",
]);

const ACTIVE_QUEUE_STATUSES = new Set([
  "pending",
  "processing",
  "rate_limited",
  "api_temporary",
  "temporary_error",
  "connection_unconfirmed",
  "session_dropped",
  "permission_unconfirmed",
  "unknown_failure",
  "timeout",
]);

const WATCHDOG_INTERVAL_MS = 5000;
const WATCHDOG_GRACE_MS = 5000;
const WATCHDOG_STALE_AFTER_MS = 60000;
const STALE_PROCESSING_MS = 3 * 60 * 1000;
const WATCHDOG_RUNTIME_NOTE = "Fila atrasada — reativando automaticamente...";

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
  const isActiveCampaign = campaign?.status === "processing" || campaign?.status === "queued";
  const hasQueuedContacts = contacts.some((contact: any) => ACTIVE_QUEUE_STATUSES.has(contact.status));

  // ── Primary source: backend next_run_at ──
  const nextRunAt = campaign?.next_run_at ? new Date(campaign.next_run_at).getTime() : null;
  const hasBackendTimer = nextRunAt && nextRunAt > now;
  const lastActivityAt = lastProcessed?.processed_at
    ? new Date(lastProcessed.processed_at).getTime()
    : campaign?.updated_at
      ? new Date(campaign.updated_at).getTime()
      : null;
  const isPastDue = !!nextRunAt && now >= nextRunAt + WATCHDOG_GRACE_MS;
  const isLikelyStalled = isActiveCampaign && hasQueuedContacts && (isPastDue || (!nextRunAt && !!lastActivityAt && now - lastActivityAt >= WATCHDOG_STALE_AFTER_MS));

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
    if (isLikelyStalled || elapsed > estimatedDelay * 3) {
      return (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Timer className="w-3.5 h-3.5 text-primary/60" />
          <span>{isLikelyStalled ? WATCHDOG_RUNTIME_NOTE : "Aguardando próximo ciclo de processamento..."}</span>
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
        .select("id, name, status, group_name, group_id, total_contacts, success_count, already_count, fail_count, created_at, updated_at, started_at, completed_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    refetchInterval: () => document.hidden ? false : 30_000,
    staleTime: 15_000,
  });

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: campaigns.length, processing: 0, paused: 0, done: 0, draft: 0 };
    campaigns.forEach((c: any) => {
      if (c.status === "processing" || c.status === "queued") counts.processing++;
      else if (c.status === "paused") counts.paused++;
      else if (["done", "completed_with_failures", "cancelled"].includes(c.status)) counts.done++;
      else if (c.status === "draft") counts.draft++;
    });
    return counts;
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    let list = campaigns;
    if (statusFilter === "processing") list = list.filter((c: any) => c.status === "processing" || c.status === "queued");
    else if (statusFilter === "done") list = list.filter((c: any) => ["done", "completed_with_failures", "cancelled"].includes(c.status));
    else if (statusFilter !== "all") list = list.filter((c: any) => c.status === statusFilter);
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

  const filters = [
    { key: "all", label: "Todas" },
    { key: "processing", label: "Ativas" },
    { key: "paused", label: "Pausadas" },
    { key: "done", label: "Concluídas" },
  ].filter(f => f.key === "all" || statusCounts[f.key] > 0);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Instability warning */}
      <Alert className="border-amber-500/40 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-500 font-semibold">Instabilidade temporária</AlertTitle>
        <AlertDescription className="text-muted-foreground text-sm">
          A função de Adição em Massa está passando por instabilidades. Estamos trabalhando para resolver o problema o mais rápido possível. Caso encontre erros, entre em contato com o suporte para que possamos resolver.
        </AlertDescription>
      </Alert>
      {/* Top bar — search + create */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground tracking-tight shrink-0">Adição em Massa</h1>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar campanha ou grupo..."
              className="h-9 pl-9 bg-muted/20 border-border/30 text-sm"
            />
          </div>
        </div>
        <Button onClick={onCreateNew} className="gap-2 shadow-lg shadow-primary/15 shrink-0">
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 border-b border-border/30 pb-3">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === f.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            {f.label}
            {f.key !== "all" && statusCounts[f.key] > 0 && (
              <span className="ml-1.5 text-[10px] opacity-70">({statusCounts[f.key]})</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center">
            <UserPlus className="w-7 h-7 text-muted-foreground/30" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {campaigns.length === 0 ? "Nenhuma campanha criada" : "Nenhuma campanha encontrada"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm text-center">
            {campaigns.length === 0 ? "Crie sua primeira campanha para adicionar membros em lote a um grupo." : "Tente alterar os filtros de busca."}
          </p>
          {campaigns.length === 0 && (
            <Button onClick={onCreateNew} className="gap-2 mt-2"><Plus className="w-4 h-4" /> Nova Campanha</Button>
          )}
        </div>
      ) : (
        <div className="w-full space-y-3">
          {filteredCampaigns.map((c: any, idx: number) => {
            const sc = c.success_count || 0;
            const ac = c.already_count || 0;
            const fc = c.fail_count || 0;
            const total = c.total_contacts || 0;
            const processed = sc + ac + fc;
            const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
            const isActive = c.status === "processing" || c.status === "queued";

            return (
              <div
                key={c.id}
                className="group relative rounded-xl border border-border/40 bg-card/80 hover:border-primary/30 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
                onClick={() => onViewCampaign(c.id)}
              >
                {/* Subtle gradient accent on left */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${
                  c.status === "done" || c.status === "completed_with_failures" ? "bg-emerald-500" :
                  isActive ? "bg-primary" :
                  c.status === "paused" ? "bg-amber-500" :
                  c.status === "cancelled" ? "bg-destructive/60" :
                  "bg-muted-foreground/20"
                }`} />

                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Campaign info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{c.name}</p>
                      <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 ${statusBadge(c.status)}`}>
                        {statusLabel(c.status)}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1 mt-1 truncate">
                      <Globe className="w-3 h-3 shrink-0" />
                      {c.group_name || c.group_id?.substring(0, 24)}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-6 shrink-0">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Total</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">{total}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Sucesso</p>
                      <p className="text-sm font-bold text-emerald-500 tabular-nums">{sc}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Falhas</p>
                      <p className={`text-sm font-bold tabular-nums ${fc > 0 ? "text-destructive" : "text-muted-foreground/30"}`}>{fc}</p>
                    </div>
                  </div>

                  {/* Date + delete */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-muted-foreground/50 hidden sm:block">{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={e => { e.stopPropagation(); setDeleteId(c.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary/50 transition-colors" />
                  </div>
                </div>

                {/* Progress bar for active campaigns */}
                {isActive && total > 0 && (
                  <div className="px-5 pb-3">
                    <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
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
  const watchdogKickInFlightRef = useRef(false);
  const lastWatchdogKickAtRef = useRef(0);

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

  // Watchdog removed — VPS engine handles campaign processing now.
  // We only show a visual note if the campaign seems stalled.
  useEffect(() => {
    if (!campaignId || !campaign || !isActiveStatus(campaign.status)) return;

    const checkStalled = () => {
      const nowMs = Date.now();
      const hasQueuedContacts = contacts.some((contact: any) => ACTIVE_QUEUE_STATUSES.has(contact.status));
      if (!hasQueuedContacts) { setLiveRuntimeNote(""); return; }

      const nextRunAtMs = campaign.next_run_at ? new Date(campaign.next_run_at).getTime() : null;
      const updatedAtMs = campaign.updated_at ? new Date(campaign.updated_at).getTime() : nowMs;

      const timerPastDue = nextRunAtMs !== null && nowMs >= nextRunAtMs + WATCHDOG_GRACE_MS;
      const noTimerTooLong = nextRunAtMs === null && nowMs - updatedAtMs >= WATCHDOG_STALE_AFTER_MS;

      if (timerPastDue || noTimerTooLong) {
        setLiveRuntimeNote("Aguardando processamento...");
      } else {
        setLiveRuntimeNote("");
      }
    };

    const id = setInterval(checkStalled, WATCHDOG_INTERVAL_MS);
    checkStalled();

    return () => clearInterval(id);
  }, [campaignId, campaign, contacts]);

  // ── Toast notifications from events table (reliable, no event loss) ──
  const eventGroupRef = useRef<{ counts: Record<string, { count: number; level: string }>; timer: ReturnType<typeof setTimeout> | null }>({ counts: {}, timer: null });
  const consumeEventsInFlightRef = useRef(false);
  const consumedEventIdsRef = useRef<Set<string>>(new Set());

  // Events that generate noisy pause/resume loops are silenced (consumed but not shown)
  const SILENCED_EVENTS = new Set(["campaign_paused", "campaign_resumed", "retry_waiting", "retry_resumed"]);

  const EVENT_LABELS: Record<string, { msg: string; groupable?: boolean }> = {
    contact_added: { msg: "Contato adicionado com sucesso", groupable: true },
    contact_already_exists: { msg: "Contato já está no grupo", groupable: true },
    contact_not_found: { msg: "Número não encontrado no WhatsApp", groupable: true },
    contact_error: { msg: "Erro ao adicionar contato", groupable: true },
    rate_limited: { msg: "Limite de API atingido — aguardando cooldown", groupable: true },
    instance_disconnected: { msg: "Instância desconectada" },
    instance_reconnected: { msg: "Instância reconectada" },
    no_admin_permission: { msg: "Sem privilégio de administrador no grupo" },
    all_instances_disconnected: { msg: "Todas as instâncias desconectadas — campanha finalizada" },
    campaign_failed_no_devices: { msg: "Nenhuma instância disponível — campanha finalizada" },
    campaign_started: { msg: "Campanha iniciada" },
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
      if (consumeEventsInFlightRef.current) return;
      consumeEventsInFlightRef.current = true;

      const { data: events } = await supabase
        .from("mass_inject_events")
        .select("id, event_type, event_level, message")
        .eq("campaign_id", campaignId)
        .eq("consumed", false)
        .order("created_at", { ascending: true })
        .limit(50);

      const unseenEvents = (events || []).filter((event: any) => !consumedEventIdsRef.current.has(event.id));
      if (unseenEvents.length === 0) {
        consumeEventsInFlightRef.current = false;
        return;
      }

      unseenEvents.forEach((event: any) => consumedEventIdsRef.current.add(event.id));

      // Mark all as consumed immediately
      const ids = unseenEvents.map((e: any) => e.id);
      await supabase
        .from("mass_inject_events")
        .update({ consumed: true })
        .in("id", ids);

      // Process events
      const ref = eventGroupRef.current;
      for (const ev of unseenEvents) {
        // Silenced events: consume but don't show toast
        if (SILENCED_EVENTS.has(ev.event_type)) continue;

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

      consumeEventsInFlightRef.current = false;
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
    else if (activeFilter === "pending") list = list.filter((c: any) => ACTIVE_QUEUE_STATUSES.has(c.status));
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

  const isRunning = campaign?.status === "processing" || campaign?.status === "queued";

  const nextRunAtLabel = useMemo(() => {
    if (!campaign?.next_run_at || !isRunning) return "Sem agendamento ativo";
    const diffMs = new Date(campaign.next_run_at).getTime() - Date.now();
    if (diffMs <= 0) return "Executando agora";
    const totalSec = Math.ceil(diffMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
  }, [campaign?.next_run_at, isRunning]);

  const lastDeviceUsed = useMemo(() => {
    return contacts.find((contact: any) => !!contact.device_used)?.device_used || "—";
  }, [contacts]);

  const rotationSummary = useMemo(() => {
    const rotateAfter = Number(campaign?.rotate_after || 0);
    if (rotateAfter <= 0) return "Instância fixa";
    return `Rotação a cada ${rotateAfter} contato(s)`;
  }, [campaign?.rotate_after]);

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

  const derivedCounts = contacts.reduce((acc: any, contact: any) => {
    if (contact.status === "completed") acc.success++;
    if (contact.status === "already_exists") acc.already++;
    if (isFailureStatus(contact.status)) acc.failed++;
    if (ACTIVE_QUEUE_STATUSES.has(contact.status)) acc.pending++;
    return acc;
  }, { success: 0, already: 0, failed: 0, pending: 0 });

  const hasContactSnapshot = contacts.length > 0;
  const successCount = hasContactSnapshot ? derivedCounts.success : (campaign.success_count || 0);
  const alreadyCount = hasContactSnapshot ? derivedCounts.already : (campaign.already_count || 0);
  const failedCount = hasContactSnapshot ? derivedCounts.failed : (campaign.fail_count || 0);
  const pendingCount = hasContactSnapshot ? derivedCounts.pending : contacts.filter((c: any) => ACTIVE_QUEUE_STATUSES.has(c.status)).length;

  const canResume = (campaign.status === "paused" || campaign.status === "draft") && pendingCount > 0;
  const canPause = isRunning;
  const canCancel = (isRunning || campaign.status === "paused") && campaign.status !== "cancelled" && campaign.status !== "done";
  const isDone = ["done", "completed_with_failures", "cancelled", "failed"].includes(campaign.status || "");

  return (
    <div className="w-full py-6 space-y-5">
      {/* Header — compact, clean */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-9 w-9 rounded-xl">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-foreground truncate">{campaign.name}</h1>
            <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 ${statusBadge(campaign.status)}`}>
              {statusLabel(campaign.status)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <Globe className="w-3 h-3" /> {campaign.group_name || campaign.group_id}
          </p>
        </div>
        {/* Actions — integrated in header */}
        <div className="flex items-center gap-2 shrink-0">
          {canResume && (
            <Button onClick={handleResume} disabled={isActionPending} size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 h-8 text-xs">
              {isActionPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Retomar
            </Button>
          )}
          {canPause && (
            <Button onClick={handlePause} disabled={isActionPending} variant="outline" size="sm" className="gap-1.5 h-8 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10">
              {isActionPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
              Pausar
            </Button>
          )}
          {canCancel && (
            <Button onClick={handleCancel} disabled={isActionPending} variant="outline" size="sm" className="gap-1.5 h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
              {isActionPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
              Cancelar
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleManualRefresh} disabled={isManualRefreshing} className="h-8 w-8">
            <RefreshCw className={`w-3.5 h-3.5 ${isManualRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Pause reason */}
      {campaign.status === "paused" && campaign.pause_reason && (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-500/5 border border-amber-500/15 rounded-lg px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-medium">{campaign.pause_reason}</span>
        </div>
      )}

      {/* Stats bar — single row */}
      <div className="grid grid-cols-5 gap-px bg-border/30 rounded-xl overflow-hidden border border-border/40">
        {[
          { label: "Total", value: campaign.total_contacts, color: "text-foreground" },
          { label: "Adicionados", value: successCount, color: "text-emerald-500" },
          { label: "Já no grupo", value: alreadyCount, color: "text-blue-500" },
          { label: "Pendentes", value: pendingCount, color: "text-muted-foreground" },
          { label: "Falhas", value: failedCount, color: "text-destructive" },
        ].map(s => (
          <div key={s.label} className="bg-card/90 px-4 py-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{s.label}</p>
            <p className={`text-xl font-bold ${s.color} mt-0.5 tabular-nums`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar for active campaigns */}
      {isRunning && campaign.total_contacts > 0 && (() => {
        const processed = successCount + alreadyCount + failedCount;
        const pct = Math.round((processed / campaign.total_contacts) * 100);
        const hasStarted = processed > 0;

        if (!hasStarted) {
          return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-primary/5 border border-primary/10 rounded-lg px-4 py-2.5">
              <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              <span>Aguardando processamento...</span>
            </div>
          );
        }

        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                <span className="font-medium text-foreground">Em andamento</span>
                {lastDeviceUsed !== "—" && <span>• {lastDeviceUsed}</span>}
              </div>
              <span className="font-mono tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <NextActionCountdown contacts={contacts} campaign={campaign} />
          </div>
        );
      })()}

      {/* Done actions — styled as cards */}
      {isDone && retryableContacts.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportNotAdded}
            className="gap-2 text-xs h-9 rounded-lg border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all"
          >
            <Download className="w-4 h-4 text-muted-foreground" />
            <span>Exportar não adicionados</span>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-muted/50 font-bold">{retryableContacts.length}</Badge>
          </Button>
          {onNewCampaignFromFailed && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewCampaignFromFailed}
              className="gap-2 text-xs h-9 rounded-lg border-primary/30 text-primary hover:bg-primary/10 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retentar com nova campanha</span>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-primary/10 text-primary font-bold">{retryableContacts.length}</Badge>
            </Button>
          )}
        </div>
      )}

      {/* Contacts table — clean */}
      <Card className="border-border/40 bg-card/80 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30 flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { key: "all", label: "Todos", count: contacts.length },
              { key: "completed", label: "Adicionados", count: successCount },
              { key: "failed", label: "Falhas", count: failedCount },
              { key: "pending", label: "Pendentes", count: pendingCount },
            ].filter(f => f.count > 0 || f.key === "all").map(f => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  activeFilter === f.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 bg-muted/20">
                <TableHead className="text-[10px] w-10 font-semibold">#</TableHead>
                <TableHead className="text-[10px] font-semibold">Contato</TableHead>
                <TableHead className="text-[10px] font-semibold">Resultado</TableHead>
                <TableHead className="text-[10px] font-semibold">Instância</TableHead>
                <TableHead className="text-[10px] font-semibold text-right">Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContacts.map((r: any, i: number) => {
                const updatedAt = r.processed_at ? new Date(r.processed_at) : null;
                const timeStr = updatedAt && !isNaN(updatedAt.getTime())
                  ? updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                  : "—";
                const detail = r.error_message
                  ? translateError(r.error_message)
                  : r.status === "completed" ? "Adicionado"
                  : r.status === "already_exists" ? "Já no grupo"
                  : r.status === "pending" ? "Aguardando"
                  : r.status === "cancelled" ? "Cancelado"
                  : "—";
                return (
                  <TableRow key={r.id} className="border-border/10 hover:bg-muted/15">
                    <TableCell className="text-[10px] text-muted-foreground/60 font-mono py-2">{i + 1}</TableCell>
                    <TableCell className="text-xs font-mono font-medium py-2">{r.phone}</TableCell>
                    <TableCell className="py-2">
                      <span className={`text-[11px] font-medium ${
                        r.status === "completed" ? "text-emerald-500" :
                        r.status === "already_exists" ? "text-blue-500" :
                        isFailureStatus(r.status) ? "text-destructive" :
                        r.status === "processing" ? "text-primary" :
                        "text-muted-foreground"
                      }`}>
                        {detail}
                      </span>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground/70 py-2">{r.device_used || "—"}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground/50 font-mono text-right py-2">{timeStr}</TableCell>
                  </TableRow>
                );
              })}
              {filteredContacts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">Nenhum resultado encontrado</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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
  const initDraft = useRef(() => {
    try { const r = localStorage.getItem("mass-inject-draft"); return r ? JSON.parse(r) : null; } catch { return null; }
  });
  const _d = useRef(prefillContacts?.length ? null : initDraft.current());
  const [campaignName, setCampaignName] = useState(prefillName ? `Retry - ${prefillName}` : (_d.current?.campaignName || ""));
  const [groupId, setGroupId] = useState(_d.current?.groupId || "");
  const [groupName, setGroupName] = useState(_d.current?.groupName || "");
  const [selectedGroups, setSelectedGroups] = useState<Array<{jid: string, name: string}>>(_d.current?.selectedGroups || []);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(_d.current?.selectedDeviceIds || []);
  const [rawInput, setRawInput] = useState(prefillContacts?.join("\n") || (_d.current?.rawInput || ""));
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
  const pendingMergeRef = useRef(false);

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

  // Config — restore draft from localStorage
  const DRAFT_KEY = "mass-inject-draft";
  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };
  const draft = useRef(loadDraft());

  const [minDelay, setMinDelay] = useState(draft.current?.minDelay ?? 10);
  const [maxDelay, setMaxDelay] = useState(draft.current?.maxDelay ?? 30);
  const [pauseAfter, setPauseAfter] = useState(draft.current?.pauseAfter ?? 0);
  const [pauseDuration, setPauseDuration] = useState(draft.current?.pauseDuration ?? 30);
  const [rotateAfter, setRotateAfter] = useState(draft.current?.rotateAfter ?? 0);

  // Persist draft to localStorage
  useEffect(() => {
    const data = { campaignName, groupId, groupName, selectedGroups, selectedDeviceIds, minDelay, maxDelay, pauseAfter, pauseDuration, rotateAfter, rawInput };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  }, [campaignName, groupId, groupName, selectedGroups, selectedDeviceIds, minDelay, maxDelay, pauseAfter, pauseDuration, rotateAfter, rawInput]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    setCampaignName("");
    setGroupId("");
    setGroupName("");
    setSelectedGroups([]);
    setSelectedDeviceIds([]);
    setRawInput("");
    setImportedContacts([]);
    setHasImported(false);
    setValidationResult(null);
    setParticipantCheck(null);
    setMinDelay(10);
    setMaxDelay(30);
    setPauseAfter(0);
    setPauseDuration(30);
    setRotateAfter(0);
    setStep("import");
    setCompletedSteps(new Set());
    toast.success("Rascunho limpo");
  }, []);

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
        .select("id, name, number, status, uazapi_base_url, instance_type, login_type, profile_picture")
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
    refetchInterval: () => document.hidden ? false : 30_000,
    staleTime: 15_000,
  });

  const isDeviceOnline = (status: string) => {
    const s = status?.toLowerCase();
    return s === "connected" || s === "ready" || s === "active";
  };

  const connectedDevices = useMemo(() => devices.filter((d: any) => isDeviceOnline(d.status)), [devices]);

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

  // ── Load groups for a SINGLE device (clear previous state) ──
  const handleLoadGroups = useCallback(async (deviceId: string) => {
    // ALWAYS clear previous groups to prevent cross-instance contamination
    setGroups([]);
    setGroupId("");
    setGroupName("");
    setSelectedGroups([]);
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
        setSelectedGroups([]);
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
        setSelectedGroups([{ jid: data.jid, name: data.name || "Grupo" }]);
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
    setSelectedGroups([{ jid, name: "Grupo (JID manual)" }]);
    toast.success("JID do grupo definido");
  }, [groupJidManual]);

  // ── Clear group when switching input mode ──
  const handleGroupModeChange = useCallback((mode: "list" | "link" | "jid") => {
    setGroupInputMode(mode);
    setGroupId("");
    setGroupName("");
    setSelectedGroups([]);
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
  const handleImportContacts = useCallback((rawLines: string[], modeOverride?: "replace" | "merge") => {
    if (isImporting) return;
    setIsImporting(true);
    const mode = modeOverride || (pendingMergeRef.current ? "merge" : "replace");
    pendingMergeRef.current = false;
    try {
      if (mode === "merge") {
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
      setRawInput(
        (mode === "merge" ? [...importedContacts.map(c => c.raw), ...rawLines] : rawLines).join("\n")
      );
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
    const activeGroupId = selectedGroups.length > 0 ? selectedGroups[0].jid : groupId;
    if (!activeGroupId) return toast.error("Selecione pelo menos um grupo de destino");
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

      // Auto-check participants in the first group
      if (data.valid?.length > 0 && primaryDeviceId && activeGroupId) {
        setIsChecking(true);
        try {
          const { data: checkData, error: checkError } = await supabase.functions.invoke("mass-group-inject", {
            body: { action: "check-participants", groupId: activeGroupId, deviceId: primaryDeviceId, contacts: data.valid },
          });
          if (checkError) {
            console.warn("check-participants error:", checkError);
            toast.warning("Não foi possível verificar participantes do grupo. Você pode tentar novamente manualmente.");
          } else if (checkData?.error) {
            console.warn("check-participants API error:", checkData.error);
            toast.warning(`Verificação de participantes: ${checkData.error}`);
          } else if (checkData) {
            setParticipantCheck(checkData);
            if (checkData.alreadyExistsCount > 0) {
              toast.info(`${checkData.alreadyExistsCount} contato(s) já estão no grupo`);
            } else {
              toast.success("Nenhum contato duplicado no grupo!");
            }
          }
        } catch (checkErr: any) {
          console.warn("check-participants exception:", checkErr);
          toast.warning("Falha ao verificar participantes: " + (checkErr?.message || "erro desconhecido"));
        }
        finally { setIsChecking(false); }
      }
    } catch (e: any) { toast.error(e.message || "Erro na validação"); }
    finally { setIsValidating(false); }
  }, [importedContacts, groupId, selectedGroups, selectedDeviceIds, campaignName, primaryDeviceId]);

  const handleCheckParticipants = useCallback(async () => {
    if (!validationResult?.valid.length) return;
    const activeGroupId = selectedGroups.length > 0 ? selectedGroups[0].jid : groupId;
    if (!activeGroupId || !primaryDeviceId) return toast.error("Grupo e instância necessários");
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: { action: "check-participants", groupId: activeGroupId, deviceId: primaryDeviceId, contacts: validationResult.valid },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setParticipantCheck(data);
      toast.success(`${data.readyCount} livres e ${data.alreadyExistsCount} já localizados no grupo`);
    } catch (e: any) { toast.error(e.message || "Erro ao verificar participantes"); }
    finally { setIsChecking(false); }
  }, [validationResult, groupId, selectedGroups, primaryDeviceId]);

  const handleProcess = useCallback(async () => {
    if (isProcessing) return;
    const contacts = participantCheck?.ready?.length ? participantCheck.ready : (validationResult?.valid || []);
    if (contacts.length === 0) return toast.error("Nenhum contato válido para processar");
    setConfirmOpen(false);
    setIsProcessing(true);

    // Build groupTargets from selectedGroups or fallback to single groupId
    const groupTargets = selectedGroups.length > 0
      ? selectedGroups.map(g => ({ group_id: g.jid, group_name: g.name }))
      : groupId ? [{ group_id: groupId, group_name: groupName || selectedGroup?.name || groupId }] : [];

    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: {
          action: "create-campaign",
          name: campaignName || `Campanha ${new Date().toLocaleString("pt-BR")}`,
          groupId: groupTargets[0]?.group_id || groupId,
          groupName: groupTargets[0]?.group_name || groupName,
          groupTargets,
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
        selectedGroups.length > 1
          ? `Campanha criada: ${contacts.length} contatos distribuídos em ${selectedGroups.length} grupos.`
          : data?.deferredParticipantCheck
            ? `Campanha iniciada: ${data?.readyCount ?? contacts.length} contatos na fila.`
            : `Campanha criada: ${data?.readyCount ?? 0} na fila, ${data?.alreadyExistsCount ?? 0} já estavam no grupo.`
      );
      onCampaignCreated(data.campaignId);
    } catch (e: any) {
      toast.error("Erro ao criar campanha: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  }, [validationResult, participantCheck, groupId, groupName, selectedGroups, selectedDeviceIds, minDelay, maxDelay, pauseAfter, pauseDuration, rotateAfter, campaignName, selectedGroup, qc, onCampaignCreated, isProcessing]);

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

  const totalToProcess = participantCheck ? participantCheck.readyCount : (validationResult?.validCount ?? 0);
  const contactCount = importedContacts.length;
  const liveProcessed = liveOk + liveFail;
  const liveProgress = liveTotal > 0 ? Math.round((liveProcessed / liveTotal) * 100) : 0;

  const stepItems = [
    { key: "import" as Step, label: "Importar", icon: Upload },
    { key: "preview" as Step, label: "Revisão", icon: Search },
  ];

  return (
    <div className="w-full py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" disabled={isProcessing} onClick={() => {
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
        {!isProcessing && (
          <Button variant="ghost" size="sm" onClick={clearDraft} className="gap-1.5 text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" /> Limpar tudo
          </Button>
        )}
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
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2.5"><Shield className="w-4 h-4 text-primary" />Configuração</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Campaign name */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Nome da Campanha</label>
                  <Input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Ex: Adição Grupo VIP - Março" className="h-11" />
                </div>

                {/* Instances */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Instâncias ({selectedDeviceIds.length} selecionada{selectedDeviceIds.length !== 1 ? "s" : ""})
                  </label>
                  {connectedDevices.length === 0 ? (
                    <div className="rounded-xl bg-muted/30 border border-border/30 px-4 py-5 text-center">
                      <WifiOff className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Nenhuma instância conectada</p>
                    </div>
                  ) : (
                    <div className="max-h-[220px] overflow-y-auto rounded-xl border border-border/40 divide-y divide-border/20">
                      {connectedDevices.map((d: any) => (
                        <label key={d.id} className={`flex items-center gap-3 px-3.5 py-3 cursor-pointer transition-colors hover:bg-muted/30 ${selectedDeviceIds.includes(d.id) ? "bg-primary/5" : ""}`}>
                          <Checkbox checked={selectedDeviceIds.includes(d.id)} onCheckedChange={() => handleDeviceToggle(d.id)} />
                          <div className={`w-2 h-2 rounded-full shrink-0 bg-emerald-500`} />
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-semibold block truncate">{d.name}</span>
                            {d.number && <span className="text-[11px] text-muted-foreground block">{d.number}</span>}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
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
                      selectedGroups.length > 0 ? (
                        /* Show only selected group(s) with option to change */
                        <div className="space-y-2">
                          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 px-3 py-2.5 flex items-center gap-3">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold truncate">{selectedGroups[0].name}</p>
                              <p className="text-[10px] text-muted-foreground/60 font-mono truncate">{selectedGroups[0].jid}</p>
                            </div>
                            <button onClick={() => { setSelectedGroups([]); setGroupId(""); setGroupName(""); }} className="text-[11px] text-muted-foreground hover:text-destructive transition-colors shrink-0">
                              Trocar
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Show group list for selection */
                        <div className="space-y-2">
                          <Input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Buscar grupo..." className="h-8 text-sm" />
                          <div className="max-h-[180px] overflow-y-auto rounded-xl border border-border/40 divide-y divide-border/20">
                            {filteredGroups.map(g => (
                              <button key={g.jid} onClick={() => {
                                setSelectedGroups([{ jid: g.jid, name: g.name }]);
                                setGroupId(g.jid);
                                setGroupName(g.name);
                              }}
                                className="w-full text-left px-3 py-2 transition-colors hover:bg-muted/50 flex items-center gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">{g.name}</p>
                                  <p className="text-[10px] text-muted-foreground/60 font-mono truncate">{g.jid}</p>
                                </div>
                              </button>
                            ))}
                            {filteredGroups.length === 0 && groupSearch && (
                              <p className="text-xs text-muted-foreground text-center py-3">Nenhum grupo com esse nome</p>
                            )}
                          </div>
                          <button onClick={() => handleLoadGroups(primaryDeviceId)} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" /> Recarregar
                          </button>
                        </div>
                      )
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

                {/* Selected group indicator - for link/jid mode */}
                {groupId && groupInputMode !== "list" && (
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 px-4 py-3 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{groupName || selectedGroup?.name || "Grupo selecionado"}</p>
                      <p className="text-[10px] text-muted-foreground/60 font-mono truncate">{groupId}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => { setGroupId(""); setGroupName(""); setSelectedGroups([]); }}>
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}

              </CardContent>
            </Card>

            {/* Compact delay config */}
            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-3.5 h-3.5 text-primary" />Delay & Pausa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground/60">Delay mín (s)</span>
                    <Input type="number" min={0} max={600} value={minDelay || ""} onChange={e => setMinDelay(e.target.value === "" ? 0 : Number(e.target.value))} onBlur={() => { const v = Math.max(0, minDelay || 0); setMinDelay(v); if (maxDelay < v) setMaxDelay(v); }} className="h-8 text-sm mt-0.5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground/60">Delay máx (s)</span>
                    <Input type="number" min={0} max={600} value={maxDelay || ""} onChange={e => setMaxDelay(e.target.value === "" ? 0 : Number(e.target.value))} onBlur={() => setMaxDelay(Math.max(0, maxDelay || 0, minDelay || 0))} className="h-8 text-sm mt-0.5" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground/60">Pausa a cada X</span>
                    <Input type="number" min={0} value={pauseAfter} onChange={e => setPauseAfter(Number(e.target.value) || 0)} className="h-8 text-sm mt-0.5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground/60">Duração (s)</span>
                    <Input type="number" min={0} max={600} value={pauseDuration} onChange={e => setPauseDuration(Number(e.target.value) || 0)} className="h-8 text-sm mt-0.5" />
                  </div>
                </div>
                {selectedDeviceIds.length > 1 && (
                  <div>
                    <span className="text-[10px] text-muted-foreground/60">Rotação a cada X</span>
                    <Input type="number" min={0} value={rotateAfter} onChange={e => setRotateAfter(Number(e.target.value) || 0)} className="h-8 text-sm mt-0.5" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Import contacts - full width below */}
          <div className="lg:col-span-2">
            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><Upload className="w-3.5 h-3.5 text-primary" />Contatos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasImported ? (
                  <div className="space-y-3">
                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "Total", value: importStats.total, color: "text-foreground" },
                        { label: "Válidos", value: importStats.valid, color: "text-emerald-500" },
                        { label: "Duplicados", value: importStats.duplicate, color: "text-amber-500" },
                        { label: "Inválidos", value: importStats.invalid + importStats.empty, color: "text-destructive" },
                      ].map(s => (
                        <div key={s.label} className="rounded-lg bg-muted/30 border border-border/30 px-2 py-1.5 text-center">
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
                          <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Contact table — clean, no filters */}
                    <div className="max-h-[240px] overflow-y-auto rounded-xl border border-border/30">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/30 bg-muted/30">
                            <TableHead className="text-[10px] w-10">#</TableHead>
                            <TableHead className="text-[10px]">Número</TableHead>
                            <TableHead className="text-[10px]">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importedContacts.slice(0, 200).map((c, i) => (
                            <TableRow key={i} className="border-border/15">
                              <TableCell className="text-[10px] font-mono text-muted-foreground py-1">{i + 1}</TableCell>
                              <TableCell className="text-xs font-mono font-medium py-1">{c.raw || "(vazio)"}</TableCell>
                              <TableCell className="py-1">
                                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                                  c.classification === "valid" ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5" :
                                  c.classification === "duplicate" ? "border-amber-500/30 text-amber-500 bg-amber-500/5" :
                                  "border-destructive/30 text-destructive bg-destructive/5"
                                }`}>
                                  {c.classification === "valid" ? "Válido" : c.classification === "duplicate" ? "Duplicado" : "Inválido"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          {importedContacts.length > 200 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-[10px] text-muted-foreground py-2">
                                ...e mais {importedContacts.length - 200} linhas
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <button onClick={() => {
                      setImportedContacts([]);
                      setRawInput("");
                      setHasImported(false);
                      setValidationResult(null);
                    }} className="text-[11px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" /> Reimportar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Textarea value={rawInput} onChange={e => setRawInput(e.target.value)}
                      placeholder={"Um número por linha\n5562999999999\n5521988888888"}
                      className="min-h-[140px] font-mono text-xs resize-none bg-muted/20 border-border/40" />
                    <div className="flex gap-2">
                      {rawInput.trim() && (
                        <Button onClick={() => {
                          const lines = rawInput.split(/[\n,;]+/).map(c => c.trim());
                          handleImportContacts(lines);
                        }} disabled={isImporting} className="flex-1 gap-2 h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                          {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Importar {rawInput.split(/[\n,;]+/).filter(c => c.trim()).length}
                        </Button>
                      )}
                      <label className={`flex items-center gap-1.5 px-3 h-9 rounded-md border border-border/40 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors ${isImporting ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
                        <Upload className="w-3.5 h-3.5" />
                        Arquivo
                        <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" disabled={isImporting} onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setIsImporting(true);
                          const ext = file.name.split('.').pop()?.toLowerCase();
                          try {
                            if (ext === 'xlsx' || ext === 'xls') {
                              const XLSX = await import('xlsx');
                              const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
                              const rawLines: string[] = [];
                              for (const sn of wb.SheetNames) {
                                const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 });
                                for (const row of rows) for (const cell of row) {
                                  const v = String(cell ?? '').trim();
                                  if (v && /\d{8,}/.test(v.replace(/\D/g, ''))) rawLines.push(v.replace(/\D/g, ''));
                                }
                              }
                              handleImportContacts(rawLines);
                            } else {
                              const text = await file.text();
                              const lines = text.split(/[\n,;]+/).map(c => c.trim());
                              handleImportContacts(lines);
                            }
                          } catch { toast.error('Erro ao ler arquivo'); }
                          finally { setIsImporting(false); }
                          e.target.value = '';
                        }} />
                      </label>
                    </div>
                  </div>
                )}

                <Button onClick={handleValidate} disabled={isValidating || isImporting || importStats.valid === 0 || !groupId.trim() || selectedDeviceIds.length === 0 || !campaignName.trim()} className="w-full h-10 gap-2 text-sm font-semibold rounded-xl" size="lg">
                  {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {isValidating ? "Validando..." : `Validar e Revisar (${importStats.valid})`}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}




      {/* ══ PREVIEW ══ */}
      {step === "preview" && validationResult && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total", value: validationResult.total, color: "text-foreground" },
              { label: "Válidos", value: validationResult.validCount, color: "text-emerald-500" },
              { label: "Inválidos", value: validationResult.invalidCount, color: "text-destructive" },
              { label: "Duplicados", value: validationResult.duplicateCount, color: "text-amber-500" },
              { label: "Já no Grupo", value: participantCheck ? participantCheck.alreadyExistsCount : (isChecking ? "..." : "—"), color: "text-blue-500" },
              { label: "Na Fila", value: totalToProcess, color: "text-primary" },
            ].map(s => (
              <Card key={s.label} className="border-border/40 bg-card/80">
                <CardContent className="pt-4 pb-3 px-4">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
                  <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {isChecking ? (
            <div className="rounded-xl border border-border/40 bg-card/50 px-4 py-3 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              <p className="text-xs text-muted-foreground">Verificando quais contatos já estão no grupo...</p>
            </div>
          ) : participantCheck ? (
            participantCheck.alreadyExistsCount > 0 ? (
              <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">
                    <strong>{participantCheck.alreadyExistsCount}</strong> contato(s) já estão no grupo e serão ignorados na fila. Restam <strong>{participantCheck.readyCount}</strong> para adicionar.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!validationResult || !participantCheck) return;
                    const alreadySet = new Set(participantCheck.alreadyExists);
                    const cleaned = validationResult.valid.filter(p => !alreadySet.has(p));
                    setValidationResult({
                      ...validationResult,
                      valid: cleaned,
                      validCount: cleaned.length,
                      total: cleaned.length + validationResult.invalidCount + validationResult.duplicateCount,
                    });
                    setParticipantCheck({ ...participantCheck, alreadyExists: [], alreadyExistsCount: 0, readyCount: cleaned.length });
                    toast.success(`${alreadySet.size} contato(s) removidos da lista`);
                  }}
                  className="gap-1.5 shrink-0 text-xs border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Limpar já adicionados
                </Button>
              </div>
            ) : (
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 px-4 py-3 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700">
                  Nenhum dos contatos está no grupo. Todos os <strong>{participantCheck.readyCount}</strong> estão prontos para adição.
                </p>
              </div>
            )
          ) : null}

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
            <Button variant="outline" onClick={() => setStep("import")} className="gap-2 h-11 px-6">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Button>
            {!participantCheck && !isChecking && (
              <Button onClick={handleCheckParticipants} disabled={isChecking} variant="outline" className="gap-2 h-11 px-6 border-blue-500/30 text-blue-500 hover:bg-blue-500/10">
                <Search className="w-4 h-4" /> Verificar Existentes
              </Button>
            )}
            <Button onClick={() => setConfirmOpen(true)} disabled={totalToProcess === 0 || isChecking || isProcessing} className="gap-2 h-11 px-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} {isProcessing ? "Iniciando campanha..." : `Iniciar Campanha (${totalToProcess} contatos)`}
            </Button>
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
                <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-xs">
                  <p>{selectedDeviceIds.length} instância{selectedDeviceIds.length !== 1 ? "s" : ""}</p>
                  <p>Delay: {minDelay}s – {maxDelay}s</p>
                  {pauseAfter > 0 && <p>Pausa de {pauseDuration}s a cada {pauseAfter} adições</p>}
                  {rotateAfter > 0 && <p>Troca de instância a cada {rotateAfter} adições</p>}
                  <p>{participantCheck ? "Pré-checagem concluída. Confirmação final durante a execução." : "Sem pré-checagem. Verificação será feita durante a execução."}</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={isProcessing} onClick={(event) => {
              event.preventDefault();
              void handleProcess();
            }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isProcessing ? "Iniciando..." : "Iniciar Campanha"}
            </AlertDialogAction>
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

  const mainContent = (() => {
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
    return <CampaignList onCreateNew={() => { localStorage.removeItem("mass-inject-draft"); setView("create"); }} onViewCampaign={(id) => { setSelectedCampaignId(id); setView("detail"); }} />;
  })();

  return <>{mainContent}</>;
}
