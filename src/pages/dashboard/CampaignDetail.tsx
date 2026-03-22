import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Pause, Play, XCircle, CheckCircle2, Clock, AlertTriangle,
  Search, Timer, Hash, Zap, RefreshCw, RotateCcw, Send, Ban, ChevronDown, Download, ShieldAlert, Save, Loader2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useCreateTemplate } from "@/hooks/useTemplates";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

/* ── Status configs ─────────────────────────────────────────── */
const statusConfig: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  pending:    { label: "Pendente",   dotClass: "bg-yellow-400",    badgeClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  scheduled:  { label: "Agendada",   dotClass: "bg-sky-400",       badgeClass: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  running:    { label: "Enviando",   dotClass: "bg-primary animate-pulse", badgeClass: "bg-primary/10 text-primary border-primary/20" },
  processing: { label: "Enviando",   dotClass: "bg-primary animate-pulse", badgeClass: "bg-primary/10 text-primary border-primary/20" },
  paused:     { label: "Pausada",    dotClass: "bg-yellow-400",    badgeClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  completed:  { label: "Concluída",  dotClass: "bg-primary",       badgeClass: "bg-primary/10 text-primary border-primary/20" },
  canceled:   { label: "Cancelada",  dotClass: "bg-muted-foreground", badgeClass: "bg-muted/50 text-muted-foreground border-border" },
  failed:     { label: "Falhou",     dotClass: "bg-destructive",   badgeClass: "bg-destructive/10 text-destructive border-destructive/20" },
};

const contactStatusConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  sent:      { label: "Enviada",  icon: CheckCircle2,  className: "text-primary" },
  delivered: { label: "Entregue", icon: CheckCircle2,  className: "text-primary" },
  failed:    { label: "Falhou",   icon: XCircle,       className: "text-destructive" },
  pending:   { label: "Pendente", icon: Clock,         className: "text-yellow-400" },
  error:     { label: "Erro",     icon: AlertTriangle, className: "text-destructive" },
};

function translateError(msg: string | null): string | null {
  if (!msg) return null;
  if (msg.includes("not on Whats") || msg.includes("not registered") || msg.includes("not_exists")) return "Número inválido";
  if (/disconnected|not connected|qr code|logout|unauthorized|not authenticated/i.test(msg)) return "WhatsApp desconectado";
  return msg;
}

function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  return phone;
}

/* ── Stat Card Component ─────────────────────────────────────── */
function StatCard({ label, value, icon: Icon, colorClass }: { label: string; value: number; icon: typeof Send; colorClass: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-card/50 px-4 py-3">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colorClass)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-lg font-bold text-foreground leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
const CampaignDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [countdown, setCountdown] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [resendFailed, setResendFailed] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSent, setExportSent] = useState(true);
  const [exportFailed, setExportFailed] = useState(true);
  const [exportPending, setExportPending] = useState(true);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const createTemplate = useCreateTemplate();

  const { data: campaign, isLoading: campLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, status, message_type, message_content, media_url, buttons, device_id, device_ids, total_contacts, sent_count, delivered_count, failed_count, min_delay_seconds, max_delay_seconds, pause_every_min, pause_every_max, pause_duration_min, pause_duration_max, messages_per_instance, scheduled_at, started_at, completed_at, created_at, updated_at, pause_on_disconnect")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && ["running", "processing"].includes(status)) return 3000;
      if (status && ["paused", "queued", "scheduled"].includes(status)) return 15000;
      return false;
    },
  });

  useEffect(() => {
    if (!campaign?.scheduled_at || !["scheduled", "pending"].includes(campaign.status)) {
      setCountdown("");
      return;
    }
    const update = () => {
      const diff = new Date(campaign.scheduled_at!).getTime() - Date.now();
      if (diff <= 0) { setCountdown("Iniciando..."); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [campaign?.scheduled_at, campaign?.status]);

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["campaign-contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_contacts")
        .select("id, campaign_id, phone, name, status, sent_at, error_message, created_at, device_id")
        .eq("campaign_id", id!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!id && !!user,
    refetchInterval: () => {
      if (campaign && ["running", "processing"].includes(campaign.status)) return 5000;
      return false;
    },
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("devices").select("id, name, number, status").eq("user_id", user!.id).neq("login_type", "report_wa");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`campaign-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns', filter: `id=eq.${id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_contacts', filter: `campaign_id=eq.${id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["campaign-contacts", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, queryClient]);

  const [minDelay, setMinDelay] = useState(8);
  const [maxDelay, setMaxDelay] = useState(25);
  const [pauseEveryMin, setPauseEveryMin] = useState(10);
  const [pauseEveryMax, setPauseEveryMax] = useState(20);
  const [pauseDurationMin, setPauseDurationMin] = useState(30);
  const [pauseDurationMax, setPauseDurationMax] = useState(120);
  const [delayDirty, setDelayDirty] = useState(false);
  const [pauseOnDisconnect, setPauseOnDisconnect] = useState(true);

  useEffect(() => {
    if (!campaign) return;
    setMinDelay(campaign.min_delay_seconds ?? 8);
    setMaxDelay(campaign.max_delay_seconds ?? 25);
    setPauseEveryMin(campaign.pause_every_min ?? 10);
    setPauseEveryMax(campaign.pause_every_max ?? 20);
    setPauseDurationMin(campaign.pause_duration_min ?? 30);
    setPauseDurationMax(campaign.pause_duration_max ?? 120);
    setPauseOnDisconnect(campaign.pause_on_disconnect !== false);
  }, [campaign]);

  const saveDelayConfig = useCallback(async () => {
    if (!id) return;
    await supabase.from("campaigns").update({
      min_delay_seconds: minDelay, max_delay_seconds: maxDelay,
      pause_every_min: pauseEveryMin, pause_every_max: pauseEveryMax,
      pause_duration_min: pauseDurationMin, pause_duration_max: pauseDurationMax,
    }).eq("id", id);
    setDelayDirty(false);
    toast({ title: "✅ Configuração salva" });
  }, [id, minDelay, maxDelay, pauseEveryMin, pauseEveryMax, pauseDurationMin, pauseDurationMax, toast]);

  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState("all");

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchSearch = (c.phone || "").includes(logSearch) || (c.name || "").toLowerCase().includes(logSearch.toLowerCase());
      const matchFilter = logFilter === "all"
        || (logFilter === "sent" && (c.status === "sent" || c.status === "delivered"))
        || (logFilter === "failed" && (c.status === "failed" || c.status === "error"))
        || (logFilter === "pending" && c.status === "pending");
      return matchSearch && matchFilter;
    });
  }, [contacts, logSearch, logFilter]);

  const isInvalidNumber = (msg: string | null) => {
    if (!msg) return false;
    const lower = msg.toLowerCase();
    return lower.includes("número inválido") || lower.includes("not on whats") || lower.includes("not registered") || lower.includes("not_exists");
  };

  const stats = useMemo(() => {
    const failed = contacts.filter(c => c.status === "failed" || c.status === "error");
    return {
      total: contacts.length,
      sent: contacts.filter(c => c.status === "sent" || c.status === "delivered").length,
      failed: failed.length,
      failedResendable: failed.filter(c => !isInvalidNumber(c.error_message)).length,
      pending: contacts.filter(c => c.status === "pending").length,
    };
  }, [contacts]);

  // Auto-detect stuck campaigns
  useEffect(() => {
    if (!campaign || !id || !user) return;
    if (!["running", "processing"].includes(campaign.status)) return;
    if (stats.pending === 0) return;
    const hasDisconnectFailure = contacts.some(c =>
      c.status === "failed" && c.error_message && /disconnected|desconectado/i.test(c.error_message)
    );
    if (hasDisconnectFailure && stats.pending > 0) {
      supabase.functions.invoke("process-campaign", {
        body: { action: "cancel", campaignId: id },
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["campaign", id] });
        queryClient.invalidateQueries({ queryKey: ["campaign-contacts", id] });
        toast({ title: "Campanha finalizada", description: "Dispositivo desconectado." });
      });
    }
  }, [campaign?.status, stats.pending, contacts, id, user, queryClient, toast]);

  const progress = campaign ? Math.round(((campaign.sent_count || 0) + (campaign.failed_count || 0)) / Math.max(campaign.total_contacts || 1, 1) * 100) : 0;

  const handleAction = async (action: "pause" | "resume" | "cancel" | "start") => {
    if (!id) return;
    try {
      const { data, error } = await supabase.functions.invoke("process-campaign", { body: { action, campaignId: id } });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      const labels: Record<string, { title: string; description: string; variant?: "default" | "destructive" }> = {
        pause: { title: "⏸️ Campanha pausada", description: "O envio foi interrompido. Você pode retomar a qualquer momento." },
        resume: { title: "▶️ Campanha retomada", description: "O envio continua de onde parou." },
        cancel: { title: "🚫 Campanha cancelada", description: "A campanha foi encerrada permanentemente.", variant: "destructive" },
        start: { title: "🚀 Campanha iniciada", description: "Os disparos estão em andamento." },
      };
      toast(labels[action]);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const remainingTime = useMemo(() => {
    if (!campaign || !["running", "processing"].includes(campaign.status)) return null;
    if (stats.pending === 0) return null;
    const avgDelay = (minDelay + maxDelay) / 2;
    const totalSeconds = stats.pending * avgDelay;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `≈ ${hours}h ${minutes}min restantes`;
    return `≈ ${minutes}min restantes`;
  }, [campaign, stats.pending, minDelay, maxDelay]);

  const isActive = campaign && ["running", "processing"].includes(campaign.status);
  const isPaused = campaign?.status === "paused";
  const isScheduled = campaign && ["scheduled", "pending"].includes(campaign.status);
  const isFinished = campaign && ["completed", "canceled", "failed"].includes(campaign.status);

  const handleResendConfirm = () => {
    const selectedContacts = contacts.filter(c => {
      if (resendFailed && (c.status === "failed" || c.status === "error")) {
        // Exclude invalid numbers from resend
        const err = (c.error_message || "").toLowerCase();
        if (err.includes("número inválido") || err.includes("not on whats") || err.includes("not registered") || err.includes("not_exists")) return false;
        return true;
      }
      if (resendPending && c.status === "pending") return true;
      return false;
    });
    if (selectedContacts.length === 0) {
      toast({ title: "Nenhum contato selecionado para reenviar", variant: "destructive" });
      return;
    }
    const resendData = {
      contacts: selectedContacts.map((c, i) => ({
        id: i + 1, nome: c.name || "", numero: c.phone,
        var1: "", var2: "", var3: "", var4: "", var5: "",
        var6: "", var7: "", var8: "", var9: "", var10: "",
      })),
      message: campaign?.message_content || "",
      mediaUrl: campaign?.media_url || "",
      buttons: campaign?.buttons || [],
      campaignName: `${campaign?.name} (Reenvio)`,
    };
    sessionStorage.setItem("resend_campaign_data", JSON.stringify(resendData));
    setResendOpen(false);
    navigate("/dashboard/campaigns");
  };

  const handleExportConfirm = async () => {
    const XLSX = await import("xlsx");
    const toRows = (list: typeof contacts) =>
      list.map(c => {
        const dev = (c as any).device_id ? devices.find(d => d.id === (c as any).device_id) : null;
        return {
          Nome: c.name || "—",
          Telefone: c.phone,
          Status: contactStatusConfig[c.status]?.label || c.status,
          Horário: c.sent_at ? format(new Date(c.sent_at), "dd/MM/yyyy HH:mm:ss") : "",
          Erro: c.error_message || "",
          "Enviado por": dev ? (dev.number || dev.name) : "",
        };
      });

    const wb = XLSX.utils.book_new();
    let total = 0;

    if (exportSent) {
      const rows = toRows(contacts.filter(c => c.status === "sent" || c.status === "delivered"));
      total += rows.length;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Enviadas");
    }
    if (exportFailed) {
      const rows = toRows(contacts.filter(c => c.status === "failed" || c.status === "error"));
      total += rows.length;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Falhas");
    }
    if (exportPending) {
      const rows = toRows(contacts.filter(c => c.status === "pending"));
      total += rows.length;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Pendentes");
    }

    if (total === 0) {
      toast({ title: "Nenhum contato selecionado", variant: "destructive" });
      return;
    }

    XLSX.writeFile(wb, `${campaign?.name || "campanha"}_export.xlsx`);
    setExportOpen(false);
    toast({ title: `✅ ${total} contatos exportados em ${wb.SheetNames.length} planilha(s)` });
  };

  const successRate = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0;

  if (campLoading) {
    return (
      <div className="space-y-5 w-full">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Campanha não encontrada.
        <Button variant="link" onClick={() => navigate("/dashboard/campaign-list")}>Voltar</Button>
      </div>
    );
  }

  const cfg = statusConfig[campaign.status] || statusConfig.pending;

  return (
    <div className="space-y-4 w-full">
      {/* Back */}
      <button
        onClick={() => navigate("/dashboard/campaign-list")}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Campanhas
      </button>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/30 bg-card p-5 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold tracking-tight text-foreground">{campaign.name}</h1>
              <Badge variant="outline" className={cn("text-[10px] font-semibold gap-1.5 px-2 py-0.5", cfg.badgeClass)}>
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dotClass)} />
                {cfg.label}
              </Badge>
            </div>
            {countdown && isScheduled && (
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary animate-pulse" />
                <span className="text-xs font-mono font-bold text-primary">{countdown}</span>
                <span className="text-[10px] text-muted-foreground">para iniciar</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isScheduled && (
              <>
                <Button size="sm" className="gap-1.5 h-8 text-xs rounded-lg" onClick={() => handleAction("start")}>
                  <Play className="w-3.5 h-3.5" /> Iniciar agora
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-xs rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleAction("cancel")}>
                  <XCircle className="w-3.5 h-3.5" /> Cancelar
                </Button>
              </>
            )}
            {isActive && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs rounded-lg border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10" onClick={() => handleAction("pause")}>
                  <Pause className="w-3.5 h-3.5" /> Pausar
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-xs rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleAction("cancel")}>
                  <XCircle className="w-3.5 h-3.5" /> Cancelar
                </Button>
              </>
            )}
            {isPaused && (
              <>
                <Button size="sm" className="gap-1.5 h-8 text-xs rounded-lg" onClick={() => handleAction("resume")}>
                  <Play className="w-3.5 h-3.5" /> Retomar
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-xs rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleAction("cancel")}>
                  <XCircle className="w-3.5 h-3.5" /> Cancelar
                </Button>
              </>
            )}
            {isFinished && (stats.failed + stats.pending > 0) && (
              <Button size="sm" className="gap-1.5 h-8 text-xs rounded-lg" onClick={() => { setResendFailed(false); setResendPending(false); setResendOpen(true); }}>
                <RotateCcw className="w-3.5 h-3.5" /> Reenviar
              </Button>
            )}
            {isFinished && stats.total > 0 && (
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs rounded-lg" onClick={() => { setExportSent(true); setExportFailed(true); setExportPending(true); setExportOpen(true); }}>
                <Download className="w-3.5 h-3.5" /> Exportar
              </Button>
            )}
            {(isPaused || campaign?.status === "completed") && campaign?.message_content && (
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs rounded-lg" onClick={() => { setSaveTemplateName(campaign.name || ""); setSaveTemplateOpen(true); }}>
                <Save className="w-3.5 h-3.5" /> Salvar Template
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <Progress value={progress} className="h-1.5" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground">{progress}%</span>
              {remainingTime && <span className="text-[10px] text-primary/80 font-medium">{remainingTime}</span>}
            </div>
            <button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["campaign", id] });
                queryClient.invalidateQueries({ queryKey: ["campaign-contacts", id] });
                toast({ title: "Sincronizado" });
              }}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              <RefreshCw className="w-2.5 h-2.5" /> Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* ── Stat Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total de contatos" value={stats.total} icon={Send} colorClass="bg-primary/10 text-primary" />
        <StatCard label="Enviadas" value={stats.sent} icon={CheckCircle2} colorClass="bg-primary/10 text-primary" />
        <StatCard label="Pendentes" value={stats.pending} icon={Clock} colorClass="bg-yellow-500/10 text-yellow-400" />
        <StatCard label="Falhas" value={stats.failed} icon={XCircle} colorClass="bg-destructive/10 text-destructive" />
      </div>



      {/* ── Delay Config (collapsible) ───────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
        <button
          onClick={() => setConfigOpen(!configOpen)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">Configuração de envio</span>
            {delayDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
          </div>
          <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", configOpen && "rotate-180")} />
        </button>

        <AnimatePresence>
          {configOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                {delayDirty && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={saveDelayConfig} className="h-7 text-[10px] rounded-lg gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Salvar alterações
                    </Button>
                  </div>
                )}

                <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-3 transition-opacity", isActive && "opacity-30 pointer-events-none select-none")}>
                  {[
                    {
                      icon: Timer, title: "Intervalo", hint: "Tempo entre cada envio",
                      fields: [
                        { label: "MIN (S)", value: minDelay, set: setMinDelay, blur: () => { const v = minDelay || 1; setMinDelay(v); if (v > maxDelay) setMaxDelay(v); } },
                        { label: "MAX (S)", value: maxDelay, set: setMaxDelay, blur: () => { const v = maxDelay || 1; setMaxDelay(v); if (v < minDelay) setMaxDelay(minDelay); } },
                      ],
                    },
                    {
                      icon: Hash, title: "Pausa a cada", hint: "Msgs antes de pausar",
                      fields: [
                        { label: "MIN", value: pauseEveryMin, set: setPauseEveryMin, blur: () => { const v = pauseEveryMin || 1; setPauseEveryMin(v); if (v > pauseEveryMax) setPauseEveryMax(v); } },
                        { label: "MAX", value: pauseEveryMax, set: setPauseEveryMax, blur: () => { const v = pauseEveryMax || 1; setPauseEveryMax(v); if (v < pauseEveryMin) setPauseEveryMax(pauseEveryMin); } },
                      ],
                    },
                    {
                      icon: Zap, title: "Duração da pausa", hint: "Tempo de descanso",
                      fields: [
                        { label: "MIN (S)", value: pauseDurationMin, set: setPauseDurationMin, blur: () => { const v = pauseDurationMin || 1; setPauseDurationMin(v); if (v > pauseDurationMax) setPauseDurationMax(v); } },
                        { label: "MAX (S)", value: pauseDurationMax, set: setPauseDurationMax, blur: () => { const v = pauseDurationMax || 1; setPauseDurationMax(v); if (v < pauseDurationMin) setPauseDurationMax(pauseDurationMin); } },
                      ],
                    },
                  ].map((card) => (
                    <div key={card.title} className="rounded-lg border border-border/20 bg-background/30 p-3 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <card.icon className="w-3.5 h-3.5 text-primary/70" />
                        <span className="text-[11px] font-medium text-foreground">{card.title}</span>
                      </div>
                      <div className="flex gap-2">
                        {card.fields.map(f => (
                          <div key={f.label} className="flex-1 space-y-1">
                            <label className="text-[9px] text-muted-foreground/60 uppercase tracking-widest font-medium">{f.label}</label>
                            <Input
                              type="number" min={1} value={f.value || ""} disabled={!!isActive}
                              onChange={e => { f.set(Number(e.target.value)); setDelayDirty(true); }}
                              onBlur={f.blur}
                              className="h-8 text-sm font-medium bg-background/50"
                            />
                          </div>
                        ))}
                      </div>
                      <p className="text-[9px] text-muted-foreground/40">{card.hint}</p>
                    </div>
                  ))}
                </div>

                {isActive && (
                  <p className="text-[10px] text-muted-foreground/40 italic">Pause a campanha para editar.</p>
                )}

                {/* Pause on disconnect toggle */}
                <div className="rounded-lg border border-border/20 bg-background/30 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      <div>
                        <p className="text-[11px] font-medium text-foreground">Pausar se desconectar</p>
                        <p className="text-[9px] text-muted-foreground/50">Pausa a campanha se uma instância for desconectada</p>
                      </div>
                    </div>
                    <Switch
                      checked={pauseOnDisconnect}
                      onCheckedChange={async (val) => {
                        setPauseOnDisconnect(val);
                        if (id) {
                          await supabase.from("campaigns").update({ pause_on_disconnect: val }).eq("id", id);
                          toast({ title: val ? "✅ Campanha pausará ao desconectar" : "⚠️ Campanha continuará mesmo se desconectar" });
                        }
                      }}
                    />
                  </div>
                  {!pauseOnDisconnect && (
                    <p className="text-[9px] text-amber-400/70 mt-1.5 ml-6">⚠ O envio continuará mesmo se contas forem banidas ou desconectadas</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Logs ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Logs de envio</h2>
          <span className="text-[10px] text-muted-foreground/50">{filteredContacts.length} registros</span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { key: "all", label: "Todos", count: stats.total },
            { key: "sent", label: "Enviadas", count: stats.sent },
            { key: "failed", label: "Falhas", count: stats.failed },
            { key: "pending", label: "Pendentes", count: stats.pending },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setLogFilter(f.key)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-150",
                logFilter === f.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/30"
              )}
            >
              {f.label} ({f.count})
            </button>
          ))}

          <div className="relative flex-1 min-w-[140px] ml-auto max-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
            <Input
              placeholder="Buscar..."
              value={logSearch}
              onChange={e => setLogSearch(e.target.value)}
              className="pl-7 h-7 text-[11px] bg-background/50 border-border/20"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/20 bg-card/30 overflow-hidden">
          <div className="max-h-[440px] overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/10 hover:bg-transparent">
                  <TableHead className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-widest w-[140px]">Contato</TableHead>
                  <TableHead className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Número</TableHead>
                  <TableHead className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-widest text-center w-[100px]">Status</TableHead>
                  <TableHead className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-widest w-[120px]">Horário</TableHead>
                  <TableHead className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Erro</TableHead>
                  <TableHead className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-widest w-[140px]">Enviado por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contactsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-3.5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredContacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-[11px] text-muted-foreground/50 py-14">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContacts.slice(0, 200).map(c => {
                    const ccfg = contactStatusConfig[c.status] || contactStatusConfig.pending;
                    const Icon = ccfg.icon;
                    const errCount = c.error_message?.match(/\((\d+) tentativa/)?.[1];
                    return (
                      <TableRow key={c.id} className="border-border/5 hover:bg-muted/10 transition-colors">
                        <TableCell className="text-[11px] font-medium text-foreground/80 py-2.5">{c.name || "—"}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground font-mono tracking-tight py-2.5">{formatPhoneDisplay(c.phone)}</TableCell>
                        <TableCell className="text-center py-2.5">
                          <span className={cn("inline-flex items-center gap-1", ccfg.className)}>
                            <Icon className="w-3 h-3" />
                            <span className="text-[10px] font-medium">{ccfg.label}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground/60 py-2.5 tabular-nums">
                          {c.sent_at ? format(new Date(c.sent_at), "dd/MM HH:mm:ss") : "—"}
                        </TableCell>
                        <TableCell className="text-[10px] max-w-[200px] py-2.5">
                          {c.error_message ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-destructive/70 truncate block cursor-help">
                                  {translateError(c.error_message)}
                                  {errCount && <span className="text-muted-foreground/40 ml-1">({errCount}x)</span>}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-sm">
                                <p className="text-xs">{c.error_message}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : <span className="text-muted-foreground/20">—</span>}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground/60 py-2.5 font-mono tracking-tight">
                          {(() => {
                            const dev = (c as any).device_id ? devices.find(d => d.id === (c as any).device_id) : null;
                            if (dev) return dev.number ? formatPhoneDisplay(dev.number) : dev.name;
                            return <span className="text-muted-foreground/20">—</span>;
                          })()}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filteredContacts.length > 200 && (
            <div className="px-4 py-2 text-[9px] text-muted-foreground/40 border-t border-border/10 text-center">
              Mostrando 200 de {filteredContacts.length} registros
            </div>
          )}
        </div>
      </div>

      {/* ── Resend Dialog ──────────────────────────────────────── */}
      <Dialog open={resendOpen} onOpenChange={setResendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Reenviar contatos</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Selecione quais contatos deseja importar para um novo envio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-center gap-3 rounded-lg border border-border/30 p-3 cursor-pointer hover:bg-muted/20 transition-colors">
              <Checkbox checked={resendFailed} onCheckedChange={(v) => setResendFailed(!!v)} />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Falhas</p>
                <p className="text-[10px] text-muted-foreground">Contatos que falharam, exceto números inválidos ({stats.failedResendable})</p>
              </div>
              <XCircle className="w-4 h-4 text-destructive/60" />
            </label>
            {stats.pending > 0 && (
              <label className="flex items-center gap-3 rounded-lg border border-border/30 p-3 cursor-pointer hover:bg-muted/20 transition-colors">
                <Checkbox checked={resendPending} onCheckedChange={(v) => setResendPending(!!v)} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Pendentes</p>
                  <p className="text-[10px] text-muted-foreground">Contatos que não foram enviados ({stats.pending})</p>
                </div>
                <Clock className="w-4 h-4 text-yellow-400/60" />
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setResendOpen(false)} className="text-xs">Cancelar</Button>
            <Button size="sm" onClick={handleResendConfirm} disabled={!resendFailed && !resendPending} className="gap-1.5 text-xs">
              <RotateCcw className="w-3.5 h-3.5" />
              Reenviar ({(resendFailed ? stats.failedResendable : 0) + (resendPending ? stats.pending : 0)})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Export Dialog ──────────────────────────────────────── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Exportar contatos (CSV)</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Selecione quais contatos deseja exportar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-center gap-3 rounded-lg border border-border/30 p-3 cursor-pointer hover:bg-muted/20 transition-colors">
              <Checkbox checked={exportSent} onCheckedChange={(v) => setExportSent(!!v)} />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Enviadas</p>
                <p className="text-[10px] text-muted-foreground">Contatos enviados com sucesso ({stats.sent})</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-primary/60" />
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border/30 p-3 cursor-pointer hover:bg-muted/20 transition-colors">
              <Checkbox checked={exportFailed} onCheckedChange={(v) => setExportFailed(!!v)} />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Falhas</p>
                <p className="text-[10px] text-muted-foreground">Contatos que falharam ({stats.failed})</p>
              </div>
              <XCircle className="w-4 h-4 text-destructive/60" />
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border/30 p-3 cursor-pointer hover:bg-muted/20 transition-colors">
              <Checkbox checked={exportPending} onCheckedChange={(v) => setExportPending(!!v)} />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Pendentes</p>
                <p className="text-[10px] text-muted-foreground">Contatos não enviados ({stats.pending})</p>
              </div>
              <Clock className="w-4 h-4 text-yellow-400/60" />
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setExportOpen(false)} className="text-xs">Cancelar</Button>
            <Button size="sm" onClick={handleExportConfirm} disabled={!exportSent && !exportFailed && !exportPending} className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />
              Exportar ({(exportSent ? stats.sent : 0) + (exportFailed ? stats.failed : 0) + (exportPending ? stats.pending : 0)})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Template Dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar como Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Nome do template</Label>
              <Input
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                placeholder="Ex: Promoção Black Friday"
                className="h-9"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveTemplateName.trim() && campaign) {
                    createTemplate.mutate({
                      name: saveTemplateName.trim(),
                      content: campaign.message_content || "",
                      type: campaign.message_type || "texto",
                      media_url: campaign.media_url || undefined,
                      buttons: Array.isArray(campaign.buttons) ? campaign.buttons as any[] : [],
                    }, {
                      onSuccess: () => { toast({ title: "Template salvo!", description: `"${saveTemplateName.trim()}" salvo em Templates.` }); setSaveTemplateOpen(false); setSaveTemplateName(""); },
                      onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                    });
                  }
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              O template ficará disponível em <strong>Templates</strong> para uso em futuras campanhas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={createTemplate.isPending || !saveTemplateName.trim()} className="gap-1.5" onClick={() => {
              if (!campaign) return;
              createTemplate.mutate({
                name: saveTemplateName.trim(),
                content: campaign.message_content || "",
                type: campaign.message_type || "texto",
                media_url: campaign.media_url || undefined,
                buttons: Array.isArray(campaign.buttons) ? campaign.buttons as any[] : [],
              }, {
                onSuccess: () => { toast({ title: "Template salvo!", description: `"${saveTemplateName.trim()}" salvo em Templates.` }); setSaveTemplateOpen(false); setSaveTemplateName(""); },
                onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
              });
            }}>
              {createTemplate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CampaignDetail;
