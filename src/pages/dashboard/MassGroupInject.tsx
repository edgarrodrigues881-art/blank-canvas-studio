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
  Eye, MoreVertical
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
  const e = err.toLowerCase();
  if (e.includes("whatsapp disconnected") || e.includes("disconnected")) return "WhatsApp desconectado";
  if (e.includes("not admin")) return "Instância não é admin do grupo";
  if (e.includes("not found") || e.includes("info query")) return "Número não encontrado no WhatsApp";
  if (e.includes("full") || e.includes("limit")) return "Grupo cheio";
  if (e.includes("blocked") || e.includes("ban")) return "Número bloqueado";
  if (e.includes("rate") || e.includes("429")) return "Limite de requisições";
  if (e.includes("bad-request")) return "Requisição inválida";
  return err;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function statusLabel(status: string) {
  switch (status) {
    case "completed": case "already_exists": return "Sucesso";
    case "failed": return "Falha";
    case "pending": return "Pendente";
    case "processing": return "Processando";
    case "paused": return "Pausado";
    case "cancelled": return "Cancelado";
    case "done": return "Concluído";
    case "draft": return "Rascunho";
    default: return status;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "completed": case "done": return "border-emerald-500/30 text-emerald-500 bg-emerald-500/5";
    case "already_exists": return "border-emerald-500/30 text-emerald-500 bg-emerald-500/5";
    case "failed": case "cancelled": return "border-destructive/30 text-destructive bg-destructive/5";
    case "processing": return "border-primary/30 text-primary bg-primary/5";
    case "paused": return "border-amber-500/30 text-amber-500 bg-amber-500/5";
    default: return "border-border/30 text-muted-foreground bg-muted/5";
  }
}

// ═══════════════════════════════════════════════════════════════
// CAMPAIGN LIST VIEW
// ═══════════════════════════════════════════════════════════════
function CampaignList({ onCreateNew, onViewCampaign }: { onCreateNew: () => void; onViewCampaign: (id: string) => void }) {
  const { user } = useAuth();

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

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Adição em Massa</h1>
            <p className="text-sm text-muted-foreground">Campanhas de adição de membros a grupos do WhatsApp</p>
          </div>
        </div>
        <Button onClick={onCreateNew} className="gap-2 shadow-md shadow-primary/10">
          <Plus className="w-4 h-4" />
          Criar Campanha
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="border-border/40 bg-card/80">
          <CardContent className="py-16 text-center space-y-4">
            <UserPlus className="w-12 h-12 text-muted-foreground/30 mx-auto" />
            <h3 className="text-lg font-semibold text-foreground">Nenhuma campanha criada</h3>
            <p className="text-sm text-muted-foreground">Crie sua primeira campanha para adicionar membros em lote a um grupo.</p>
            <Button onClick={onCreateNew} className="gap-2 mt-4">
              <Plus className="w-4 h-4" /> Criar Campanha
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c: any) => {
            const total = (c.success_count || 0) + (c.already_count || 0) + (c.fail_count || 0);
            const successTotal = (c.success_count || 0) + (c.already_count || 0);
            const progress = c.total_contacts > 0 ? Math.round((total / c.total_contacts) * 100) : 0;
            return (
              <Card key={c.id} className="border-border/40 bg-card/80 hover:bg-card/90 transition-colors cursor-pointer" onClick={() => onViewCampaign(c.id)}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-sm font-semibold text-foreground truncate">{c.name}</h3>
                        <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 ${statusBadge(c.status)}`}>
                          {statusLabel(c.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Grupo: {c.group_name || c.group_id?.substring(0, 15) + "..."}</span>
                        <span>{c.total_contacts} contatos</span>
                        <span>✓ {successTotal} sucesso</span>
                        {c.fail_count > 0 && <span className="text-destructive">✗ {c.fail_count} falhas</span>}
                        <span>{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {c.status === "processing" && (
                        <div className="w-24">
                          <Progress value={progress} className="h-2" />
                          <p className="text-[10px] text-muted-foreground text-center mt-0.5">{progress}%</p>
                        </div>
                      )}
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                        <Eye className="w-3.5 h-3.5" /> Ver
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CAMPAIGN DETAIL VIEW (resume/view results)
// ═══════════════════════════════════════════════════════════════
function CampaignDetail({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState("all");

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["mass_inject_campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("mass_inject_campaigns").select("*").eq("id", campaignId).single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  const { data: contacts = [] } = useQuery({
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
    refetchInterval: 5000,
  });

  const filteredContacts = useMemo(() => {
    if (activeFilter === "all") return contacts;
    if (activeFilter === "success") return contacts.filter((c: any) => c.status === "completed" || c.status === "already_exists");
    return contacts.filter((c: any) => c.status === activeFilter);
  }, [contacts, activeFilter]);

  if (isLoading || !campaign) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const successTotal = (campaign.success_count || 0) + (campaign.already_count || 0);
  const total = successTotal + (campaign.fail_count || 0);
  const progress = campaign.total_contacts > 0 ? Math.round((total / campaign.total_contacts) * 100) : 0;

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

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total", value: campaign.total_contacts, color: "text-foreground" },
          { label: "Sucesso", value: successTotal, color: "text-emerald-500" },
          { label: "Falhas", value: campaign.fail_count || 0, color: "text-destructive" },
          { label: "Pendentes", value: campaign.total_contacts - total, color: "text-amber-500" },
          { label: "Progresso", value: `${progress}%`, color: "text-primary" },
        ].map(s => (
          <Card key={s.label} className="border-border/40 bg-card/80">
            <CardContent className="pt-4 pb-3 px-4">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
              <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {campaign.status === "processing" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-sm font-semibold text-foreground">Processando...</span>
              <span className="text-sm text-primary font-bold ml-auto">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2.5" />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap justify-center">
        {[
          { key: "all", label: `Todos (${contacts.length})` },
          { key: "success", label: `Sucesso (${successTotal})` },
          { key: "failed", label: `Falhas (${campaign.fail_count || 0})` },
          { key: "pending", label: `Pendentes (${campaign.total_contacts - total})` },
        ].map(f => (
          <Button key={f.key} variant={activeFilter === f.key ? "default" : "outline"} size="sm" onClick={() => setActiveFilter(f.key)} className="text-xs h-8 rounded-lg">
            {f.label}
          </Button>
        ))}
      </div>

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
                    <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{r.error_message ? translateError(r.error_message) : "—"}</TableCell>
                  </TableRow>
                ))}
                {filteredContacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">Nenhum resultado</TableCell>
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
function CreateCampaign({ onBack, onCampaignCreated }: { onBack: () => void; onCampaignCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("import");
  const [campaignName, setCampaignName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [rawInput, setRawInput] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [participantCheck, setParticipantCheck] = useState<ParticipantCheckResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupLink, setGroupLink] = useState("");
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [groupInputMode, setGroupInputMode] = useState<"list" | "link" | "jid">("list");

  const [minDelay, setMinDelay] = useState(3);
  const [maxDelay, setMaxDelay] = useState(8);
  const [pauseAfter, setPauseAfter] = useState(0);
  const [pauseDuration, setPauseDuration] = useState(30);
  const [rotateAfter, setRotateAfter] = useState(0);

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
  });

  const isDeviceOnline = (status: string) => {
    const s = status?.toLowerCase();
    return s === "connected" || s === "ready" || s === "active";
  };

  const toggleDevice = useCallback((deviceId: string) => {
    setSelectedDeviceIds(prev => prev.includes(deviceId) ? prev.filter(id => id !== deviceId) : [...prev, deviceId]);
  }, []);

  const primaryDeviceId = selectedDeviceIds[0] || "";

  const handleLoadGroups = useCallback(async (deviceId: string) => {
    setGroups([]);
    setGroupId("");
    setIsLoadingGroups(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", { body: { action: "list-groups", deviceId } });
      if (error) throw error;
      const groupsList = data?.groups || [];
      setGroups(groupsList);
      if (groupsList.length === 0) toast.info("Nenhum grupo encontrado. Tente outra instância ou 'Link do Grupo'.");
    } catch { toast.error("Erro ao buscar grupos"); }
    finally { setIsLoadingGroups(false); }
  }, []);

  const handleLoadGroupsFromAll = useCallback(async (deviceIds: string[]) => {
    if (deviceIds.length === 0) return;
    setGroups([]);
    setGroupId("");
    setIsLoadingGroups(true);
    const allGroups: GroupInfo[] = [];
    const seenJids = new Set<string>();
    try {
      for (const did of deviceIds) {
        try {
          const { data } = await supabase.functions.invoke("mass-group-inject", { body: { action: "list-groups", deviceId: did } });
          for (const g of (data?.groups || [])) {
            if (!seenJids.has(g.jid)) { seenJids.add(g.jid); allGroups.push(g); }
          }
        } catch { /* skip */ }
      }
      setGroups(allGroups);
      if (allGroups.length === 0) toast.info("Nenhum grupo encontrado.");
    } finally { setIsLoadingGroups(false); }
  }, []);

  const handleDeviceToggle = useCallback((deviceId: string) => {
    const willBeSelected = !selectedDeviceIds.includes(deviceId);
    toggleDevice(deviceId);
    if (willBeSelected) {
      const newIds = [...selectedDeviceIds, deviceId];
      handleLoadGroups(selectedDeviceIds.length === 0 ? deviceId : newIds[0]);
    } else {
      const remaining = selectedDeviceIds.filter(id => id !== deviceId);
      if (remaining.length > 0 && selectedDeviceIds[0] === deviceId) handleLoadGroups(remaining[0]);
      else if (remaining.length === 0) { setGroups([]); setGroupId(""); }
    }
  }, [selectedDeviceIds, toggleDevice, handleLoadGroups]);

  const handleResolveLink = useCallback(async () => {
    if (!groupLink.trim() || !primaryDeviceId) return;
    setIsResolvingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", { body: { action: "resolve-link", deviceId: primaryDeviceId, link: groupLink.trim() } });
      if (error) throw error;
      if (data?.jid) { setGroupId(data.jid); toast.success(`Grupo encontrado: ${data.name || data.jid}`); }
      else toast.error(data?.error || "Não foi possível resolver o link");
    } catch (e: any) { toast.error(e.message || "Erro ao resolver link"); }
    finally { setIsResolvingLink(false); }
  }, [groupLink, primaryDeviceId]);

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    const q = groupSearch.toLowerCase();
    return groups.filter(g => g.name.toLowerCase().includes(q) || g.jid.toLowerCase().includes(q));
  }, [groups, groupSearch]);

  const selectedGroup = useMemo(() => groups.find(g => g.jid === groupId), [groups, groupId]);

  const parseContacts = useCallback((input: string): string[] => {
    return input.split(/[\n,;]+/).map(c => c.trim()).filter(c => c.length > 0);
  }, []);

  const handleRawInputChange = useCallback((value: string) => {
    const lines = value.split(/[\n,;]+/).map(c => c.trim()).filter(c => c.length > 0);
    const seen = new Set<string>();
    const unique: string[] = [];
    let removed = 0;
    for (const line of lines) {
      const digits = line.replace(/\D/g, "");
      const key = digits.length >= 10 ? digits : line;
      if (seen.has(key)) { removed++; continue; }
      seen.add(key);
      unique.push(line);
    }
    setRawInput(unique.join("\n"));
    if (removed > 0) toast.info(`${removed} duplicado(s) removido(s)`);
  }, []);

  const handleValidate = useCallback(async () => {
    const contacts = parseContacts(rawInput);
    if (contacts.length === 0) return toast.error("Nenhum contato informado");
    if (!groupId.trim()) return toast.error("Selecione um grupo");
    if (selectedDeviceIds.length === 0) return toast.error("Selecione pelo menos uma instância");
    if (!campaignName.trim()) return toast.error("Dê um nome para a campanha");

    setIsValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", { body: { action: "validate", contacts } });
      if (error) throw error;
      setValidationResult(data);
      setCompletedSteps(prev => new Set([...prev, "import"]));
      setStep("preview");
      toast.success(`${data.validCount} contatos válidos encontrados`);
    } catch (e: any) { toast.error(e.message || "Erro na validação"); }
    finally { setIsValidating(false); }
  }, [rawInput, groupId, selectedDeviceIds, parseContacts, campaignName]);

  const handleCheckParticipants = useCallback(async () => {
    if (!validationResult?.valid.length) return;
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", { body: { action: "check-participants", groupId, deviceId: primaryDeviceId, contacts: validationResult.valid } });
      if (error) throw error;
      setParticipantCheck(data);
      toast.success(`${data.readyCount} prontos, ${data.alreadyExistsCount} já no grupo`);
    } catch (e: any) { toast.error(e.message || "Erro ao verificar"); }
    finally { setIsChecking(false); }
  }, [validationResult, groupId, primaryDeviceId]);

  const handleProcess = useCallback(async () => {
    const contacts = participantCheck?.ready || validationResult?.valid || [];
    if (contacts.length === 0) return toast.error("Nenhum contato");
    setConfirmOpen(false);
    setIsProcessing(true);
    setIsPaused(false);
    cancelRef.current = false;
    pauseRef.current = false;
    setCompletedSteps(prev => new Set([...prev, "preview"]));
    setStep("processing");

    // Create campaign in DB
    let cId = campaignId;
    try {
      if (!cId) {
        const alreadyInGroup = participantCheck?.alreadyExists || [];
        const allContacts = [...contacts, ...alreadyInGroup];

        const { data: camp, error } = await supabase.from("mass_inject_campaigns").insert({
          user_id: user!.id,
          name: campaignName || `Campanha ${new Date().toLocaleString("pt-BR")}`,
          group_id: groupId,
          group_name: selectedGroup?.name || groupId,
          device_ids: selectedDeviceIds,
          status: "processing",
          total_contacts: allContacts.length,
          already_count: alreadyInGroup.length,
          success_count: alreadyInGroup.length, // already in group = success
          min_delay: minDelay,
          max_delay: maxDelay,
          pause_after: pauseAfter,
          pause_duration: pauseDuration,
          rotate_after: rotateAfter,
          started_at: new Date().toISOString(),
        } as any).select().single();
        if (error) throw error;
        cId = camp.id;
        setCampaignId(cId);

        // Insert contacts
        const contactRows = allContacts.map(phone => ({
          campaign_id: cId!,
          phone,
          status: alreadyInGroup.includes(phone) ? "already_exists" : "pending",
        }));
        if (contactRows.length > 0) {
          await supabase.from("mass_inject_contacts").insert(contactRows as any);
        }
      }
    } catch (e: any) {
      toast.error("Erro ao criar campanha: " + e.message);
      setIsProcessing(false);
      setStep("preview");
      return;
    }

    // Get pending contacts from DB
    const { data: pendingContacts } = await supabase
      .from("mass_inject_contacts")
      .select("id, phone")
      .eq("campaign_id", cId!)
      .eq("status", "pending")
      .order("created_at");
    
    const contactsToProcess = pendingContacts || [];

    setLiveResults([]);
    setLiveOk(participantCheck?.alreadyExistsCount || 0);
    setLiveFail(0);
    setLiveAlready(participantCheck?.alreadyExistsCount || 0);
    setLiveTotal(contacts.length + (participantCheck?.alreadyExistsCount || 0));
    setLiveStatus("running");
    const start = Date.now();
    setLiveElapsed(0);
    timerRef.current = setInterval(() => setLiveElapsed(Math.round((Date.now() - start) / 1000)), 1000);

    let ok = participantCheck?.alreadyExistsCount || 0;
    let fail = 0;
    let currentDeviceIndex = 0;
    let addedWithCurrentDevice = 0;
    let processedSincePause = 0;

    for (let i = 0; i < contactsToProcess.length; i++) {
      if (cancelRef.current) { setLiveStatus("cancelled"); break; }
      while (pauseRef.current) {
        setLiveStatus("paused");
        await new Promise(r => setTimeout(r, 500));
        if (cancelRef.current) break;
      }
      if (cancelRef.current) { setLiveStatus("cancelled"); break; }
      setLiveStatus("running");

      const { phone, id: contactId } = contactsToProcess[i];
      const deviceId = selectedDeviceIds[currentDeviceIndex % selectedDeviceIds.length];
      const deviceName = (devices as any[]).find((d: any) => d.id === deviceId)?.name || deviceId;

      setLiveCurrentPhone(phone);
      setLiveCurrentDevice(deviceName);

      try {
        const { data } = await supabase.functions.invoke("mass-group-inject", {
          body: { action: "add-single", groupId, deviceId, phone, campaignId: cId, contactId },
        });

        const result: ContactResult = { phone, status: data?.status || "failed", error: data?.error, deviceUsed: deviceName, contactId };
        setLiveResults(prev => [...prev, result]);

        if (data?.status === "completed") {
          ok++; setLiveOk(prev => prev + 1);
          addedWithCurrentDevice++; processedSincePause++;
          if (rotateAfter > 0 && addedWithCurrentDevice >= rotateAfter) { currentDeviceIndex++; addedWithCurrentDevice = 0; }
        } else if (data?.status === "already_exists") {
          ok++; setLiveOk(prev => prev + 1); setLiveAlready(prev => prev + 1); processedSincePause++;
        } else {
          fail++; setLiveFail(prev => prev + 1); processedSincePause++;
        }
      } catch (e: any) {
        fail++; setLiveFail(prev => prev + 1); processedSincePause++;
        setLiveResults(prev => [...prev, { phone, status: "failed", error: e.message || "Erro", deviceUsed: deviceName }]);
      }

      if (i < contactsToProcess.length - 1 && !cancelRef.current) {
        await new Promise(r => setTimeout(r, randomBetween(minDelay, maxDelay) * 1000));
      }
      if (pauseAfter > 0 && processedSincePause >= pauseAfter && i < contactsToProcess.length - 1 && !cancelRef.current) {
        setLiveStatus("waiting_pause");
        await new Promise(r => setTimeout(r, pauseDuration * 1000));
        processedSincePause = 0;
      }
    }

    clearInterval(timerRef.current);
    setLiveElapsed(Math.round((Date.now() - start) / 1000));
    const finalStatus = cancelRef.current ? "cancelled" : "done";
    setLiveStatus(finalStatus);
    setIsProcessing(false);

    // Update campaign status in DB
    try {
      await supabase.from("mass_inject_campaigns").update({
        status: finalStatus === "cancelled" ? "paused" : "done",
        completed_at: finalStatus === "done" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      } as any).eq("id", cId!);
    } catch { /* ignore */ }

    qc.invalidateQueries({ queryKey: ["mass_inject_campaigns"] });
    setCompletedSteps(prev => new Set([...prev, "processing"]));
    setStep("done");
    toast.success(`Concluído: ${ok} sucesso, ${fail} falhas`);
  }, [participantCheck, validationResult, groupId, selectedDeviceIds, devices, minDelay, maxDelay, pauseAfter, pauseDuration, rotateAfter, campaignName, selectedGroup, user, campaignId, qc]);

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
    if (activeFilter === "success") return liveResults.filter(r => r.status === "completed" || r.status === "already_exists");
    return liveResults.filter(r => r.status === activeFilter);
  }, [liveResults, activeFilter]);

  const totalToProcess = participantCheck?.readyCount ?? validationResult?.validCount ?? 0;
  const contactCount = rawInput.trim() ? parseContacts(rawInput).length : 0;
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
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5" disabled={isProcessing}>
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
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Instâncias ({selectedDeviceIds.length})</label>
                  <div className="max-h-[180px] overflow-y-auto rounded-xl border border-border/40 divide-y divide-border/20">
                    {devices.map((d: any) => (
                      <label key={d.id} className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-muted/30 ${selectedDeviceIds.includes(d.id) ? "bg-primary/5" : ""}`}>
                        <Checkbox checked={selectedDeviceIds.includes(d.id)} onCheckedChange={() => handleDeviceToggle(d.id)} />
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isDeviceOnline(d.status) ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                        <span className="text-sm font-medium">{d.name}</span>
                        {d.number && <span className="text-xs text-muted-foreground">({d.number})</span>}
                      </label>
                    ))}
                    {devices.length === 0 && <p className="text-xs text-destructive text-center py-4">Nenhuma instância encontrada</p>}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Grupo de Destino</label>
                  <div className="flex gap-1 mb-3 bg-muted/30 p-1 rounded-lg">
                    {([{ key: "list" as const, label: "Meus Grupos" }, { key: "link" as const, label: "Link do Grupo" }, { key: "jid" as const, label: "JID Manual" }]).map(m => (
                      <button key={m.key} onClick={() => setGroupInputMode(m.key)}
                        className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${groupInputMode === m.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {groupInputMode === "list" && (
                    !primaryDeviceId ? <p className="text-xs text-muted-foreground text-center py-4">Selecione uma instância primeiro</p>
                    : isLoadingGroups ? <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Carregando...</div>
                    : groups.length > 0 ? (
                      <div className="space-y-2">
                        <Input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Buscar grupo..." className="h-9 text-sm" />
                        <div className="max-h-[200px] overflow-y-auto rounded-xl border border-border/40 divide-y divide-border/20">
                          {filteredGroups.map(g => (
                            <button key={g.jid} onClick={() => setGroupId(g.jid)} className={`w-full text-left px-3.5 py-2.5 transition-colors hover:bg-muted/50 ${groupId === g.jid ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}>
                              <p className="text-sm font-medium truncate">{g.name}</p>
                              <p className="text-[10px] text-muted-foreground/60 font-mono truncate">{g.jid}</p>
                            </button>
                          ))}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => selectedDeviceIds.length > 1 ? handleLoadGroupsFromAll(selectedDeviceIds) : handleLoadGroups(primaryDeviceId)} className="w-full gap-2 text-xs h-8">
                          <RefreshCw className="w-3 h-3" /> Recarregar
                        </Button>
                      </div>
                    ) : <p className="text-xs text-muted-foreground text-center py-4">Nenhum grupo. Use "Link do Grupo" ou "JID Manual".</p>
                  )}

                  {groupInputMode === "link" && (
                    <div className="space-y-3">
                      <Input value={groupLink} onChange={e => setGroupLink(e.target.value)} placeholder="https://chat.whatsapp.com/..." className="h-11 font-mono text-sm" />
                      <Button onClick={handleResolveLink} disabled={isResolvingLink || !groupLink.trim() || !primaryDeviceId} variant="outline" className="w-full gap-2 h-10" size="sm">
                        {isResolvingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {isResolvingLink ? "Resolvendo..." : "Resolver Link"}
                      </Button>
                    </div>
                  )}

                  {groupInputMode === "jid" && (
                    <Input value={groupId} onChange={e => setGroupId(e.target.value)} placeholder="120363...@g.us" className="h-11 font-mono text-sm" />
                  )}
                </div>

                {groupId && (
                  <div className="rounded-xl bg-primary/5 border border-primary/15 px-4 py-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{selectedGroup?.name || "Grupo selecionado"}</p>
                      <p className="text-[10px] text-muted-foreground/60 font-mono">{groupId}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2.5"><Settings2 className="w-4 h-4 text-primary" />Configurações Avançadas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-2"><Timer className="w-3.5 h-3.5 text-muted-foreground" /><label className="text-xs font-semibold text-muted-foreground">Delay entre contatos (s)</label></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-[10px] text-muted-foreground/60">Mín</span><Input type="number" min={1} max={120} value={minDelay} onChange={e => setMinDelay(Number(e.target.value) || 1)} className="h-9 text-sm mt-1" /></div>
                    <div><span className="text-[10px] text-muted-foreground/60">Máx</span><Input type="number" min={1} max={300} value={maxDelay} onChange={e => setMaxDelay(Math.max(Number(e.target.value) || 1, minDelay))} className="h-9 text-sm mt-1" /></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2"><Pause className="w-3.5 h-3.5 text-muted-foreground" /><label className="text-xs font-semibold text-muted-foreground">Pausa após X adições</label></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-[10px] text-muted-foreground/60">A cada</span><Input type="number" min={0} value={pauseAfter} onChange={e => setPauseAfter(Number(e.target.value) || 0)} className="h-9 text-sm mt-1" /></div>
                    <div><span className="text-[10px] text-muted-foreground/60">Duração (s)</span><Input type="number" min={5} max={600} value={pauseDuration} onChange={e => setPauseDuration(Number(e.target.value) || 30)} className="h-9 text-sm mt-1" /></div>
                  </div>
                </div>
                {selectedDeviceIds.length > 1 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2"><ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" /><label className="text-xs font-semibold text-muted-foreground">Trocar instância após X</label></div>
                    <Input type="number" min={0} value={rotateAfter} onChange={e => setRotateAfter(Number(e.target.value) || 0)} className="h-9 text-sm" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="xl:col-span-3">
            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm h-full">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2.5"><Upload className="w-4 h-4 text-primary" />Importar Contatos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <Tabs defaultValue="paste">
                  <TabsList className="w-full grid grid-cols-2 h-10 bg-muted/50">
                    <TabsTrigger value="paste" className="text-xs font-semibold">Colar Números</TabsTrigger>
                    <TabsTrigger value="file" className="text-xs font-semibold">Arquivo CSV/TXT/XLSX</TabsTrigger>
                  </TabsList>
                  <TabsContent value="paste" className="mt-4">
                    <Textarea value={rawInput} onChange={e => setRawInput(e.target.value)}
                      onBlur={() => { if (rawInput.trim()) handleRawInputChange(rawInput); }}
                      placeholder={"5562999999999\n5521988888888\n\nDuplicados são removidos automaticamente."}
                      className="min-h-[300px] font-mono text-xs resize-none bg-muted/20 border-border/40" />
                  </TabsContent>
                  <TabsContent value="file" className="mt-4">
                    <label className="block border-2 border-dashed border-border/40 rounded-2xl p-10 text-center transition-colors hover:border-primary/30 hover:bg-primary/5 cursor-pointer">
                      <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-1">Arraste ou clique para selecionar</p>
                      <p className="text-[10px] text-muted-foreground/50">CSV, TXT ou XLSX</p>
                      <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const ext = file.name.split('.').pop()?.toLowerCase();
                        if (ext === 'xlsx' || ext === 'xls') {
                          try {
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
                            toast.success(`${nums.length} números importados`);
                          } catch { toast.error('Erro ao ler Excel'); }
                        } else {
                          const reader = new FileReader();
                          reader.onload = (ev) => { handleRawInputChange(ev.target?.result as string || ""); toast.success(`Arquivo carregado`); };
                          reader.readAsText(file);
                        }
                        e.target.value = '';
                      }} />
                    </label>
                  </TabsContent>
                </Tabs>

                {contactCount > 0 && (
                  <div className="flex items-center gap-3 bg-primary/5 rounded-xl px-4 py-3">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">{contactCount} contatos detectados</span>
                  </div>
                )}

                <Button onClick={handleValidate} disabled={isValidating || !rawInput.trim() || !groupId.trim() || selectedDeviceIds.length === 0 || !campaignName.trim()} className="w-full h-12 gap-2 text-sm font-semibold rounded-xl shadow-md shadow-primary/10" size="lg">
                  {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {isValidating ? "Validando..." : "Validar e Revisar"}
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
              { label: "Já no Grupo", value: participantCheck?.alreadyExistsCount ?? "—", color: "text-blue-500" },
              { label: "Prontos", value: participantCheck?.readyCount ?? "—", color: "text-primary" },
            ].map(s => (
              <Card key={s.label} className="border-border/40 bg-card/80">
                <CardContent className="pt-4 pb-3 px-4">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
                  <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Button variant="ghost" onClick={() => setStep("import")} className="gap-2 h-10 text-muted-foreground">← Voltar</Button>
            {!participantCheck && (
              <Button onClick={handleCheckParticipants} disabled={isChecking} variant="outline" className="gap-2 h-10">
                {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Verificar Existentes
              </Button>
            )}
            <Button onClick={() => setConfirmOpen(true)} disabled={totalToProcess === 0} className="gap-2 h-10 shadow-md shadow-primary/10">
              <Play className="w-4 h-4" /> Iniciar ({totalToProcess} contatos)
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
                      {liveStatus === "paused" && "Pausado"}
                      {liveStatus === "waiting_pause" && `Pausa automática (${pauseDuration}s)...`}
                    </p>
                    {liveCurrentPhone && liveStatus === "running" && (
                      <p className="text-xs text-muted-foreground">
                        Adicionando <span className="font-mono">{liveCurrentPhone}</span> via <span className="text-primary">{liveCurrentDevice}</span>
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-lg font-bold text-primary">{liveProgress}%</span>
              </div>
              <Progress value={liveProgress} className="h-3" />
              <p className="text-[10px] text-muted-foreground/50 text-center">Você pode sair — a campanha será salva e pode ser retomada depois.</p>
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
                      <TableHead className="text-xs">Detalhe</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {[...liveResults].reverse().slice(0, 50).map((r, i) => (
                        <TableRow key={liveResults.length - i} className="border-border/15">
                          <TableCell className="text-xs font-mono">{liveResults.length - i}</TableCell>
                          <TableCell className="text-xs font-mono font-medium">{r.phone}</TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] font-semibold ${statusBadge(r.status)}`}>{statusLabel(r.status)}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{r.error ? translateError(r.error) : "—"}</TableCell>
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
              { label: "Sucesso", value: liveOk, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
              { label: "Falhas", value: liveFail, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
              { label: "Total", value: liveProcessed, color: "text-foreground", bg: "bg-muted/50 border-border/40" },
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
                    <TableHead className="text-xs">Detalhe</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredResults.map((r, i) => (
                      <TableRow key={i} className="border-border/15">
                        <TableCell className="text-xs font-mono">{i + 1}</TableCell>
                        <TableCell className="text-xs font-mono font-medium">{r.phone}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] font-semibold ${statusBadge(r.status)}`}>{statusLabel(r.status)}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[250px]">{r.error ? translateError(r.error) : "—"}</TableCell>
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
                <p><strong>{totalToProcess}</strong> contatos para adição{selectedGroup && <> ao grupo <strong>{selectedGroup.name}</strong></>}.</p>
                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-xs">
                  <p>📱 {selectedDeviceIds.length} instância{selectedDeviceIds.length !== 1 ? "s" : ""}</p>
                  <p>⏱ Delay: {minDelay}s – {maxDelay}s</p>
                  {pauseAfter > 0 && <p>⏸ Pausa de {pauseDuration}s a cada {pauseAfter}</p>}
                  {rotateAfter > 0 && <p>🔄 Troca a cada {rotateAfter}</p>}
                  {(participantCheck?.alreadyExistsCount || 0) > 0 && <p>✓ {participantCheck?.alreadyExistsCount} já no grupo (contados como sucesso)</p>}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleProcess}>Confirmar</AlertDialogAction>
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

  if (view === "create") {
    return <CreateCampaign onBack={() => setView("list")} onCampaignCreated={(id) => { setSelectedCampaignId(id); setView("detail"); }} />;
  }

  if (view === "detail" && selectedCampaignId) {
    return <CampaignDetail campaignId={selectedCampaignId} onBack={() => { setSelectedCampaignId(null); setView("list"); }} />;
  }

  return <CampaignList onCreateNew={() => setView("create")} onViewCampaign={(id) => { setSelectedCampaignId(id); setView("detail"); }} />;
}
