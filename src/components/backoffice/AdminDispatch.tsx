import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Send, Loader2, CheckCircle2, Users, Filter, Search,
  FileText, ChevronRight, Smartphone, AlertTriangle, Eye,
  Upload, FileSpreadsheet, ArrowRight, Trash2, X, Pencil, Plus,
  Pause, Play, XCircle, Clock, History, BarChart3
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAdminDashboard, type AdminUser } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55"))
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)} ${digits.slice(9)}`;
  if (digits.length === 11)
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return phone;
}

function getDaysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

type AudienceFilter = "all" | "active" | "expired" | "expiring" | "trial" | "pro" | "scale" | "elite" | "start";

const AUDIENCE_OPTIONS: { value: AudienceFilter; label: string; color: string }[] = [
  { value: "all", label: "Todos os clientes", color: "text-foreground" },
  { value: "active", label: "Ativos", color: "text-emerald-400" },
  { value: "expired", label: "Vencidos", color: "text-red-400" },
  { value: "expiring", label: "Vencendo (≤3d)", color: "text-yellow-400" },
  { value: "trial", label: "Plano Trial", color: "text-zinc-400" },
  { value: "start", label: "Plano Start", color: "text-zinc-400" },
  { value: "pro", label: "Plano Pro", color: "text-teal-400" },
  { value: "scale", label: "Plano Scale", color: "text-purple-400" },
  { value: "elite", label: "Plano Elite", color: "text-amber-400" },
];

type ImportColumnMapping = "nome" | "numero" | "ignorar";
const IMPORT_MAPPING_OPTIONS: { value: ImportColumnMapping; label: string }[] = [
  { value: "ignorar", label: "Ignorar" },
  { value: "nome", label: "Nome" },
  { value: "numero", label: "Número" },
];

interface RawImport {
  headers: string[];
  rows: any[][];
  columnMappings: ImportColumnMapping[];
}

interface ImportedContact {
  id: string;
  name: string;
  phone: string;
}

interface ConnectionDevice {
  id: string;
  name: string;
  number: string | null;
  status: string;
  profile_name: string | null;
}

interface ConnectionPurpose {
  id: string;
  purpose: string;
  label: string;
  device_id: string | null;
  device: ConnectionDevice | null;
}

type AudienceSource = "clients" | "imported" | "manual";

export default function AdminDispatch() {
  const queryClient = useQueryClient();
  const { data: dashData } = useAdminDashboard();
  const users = dashData?.users || [];

  const [viewMode, setViewMode] = useState<"compose" | "history">("compose");
  const [step, setStep] = useState<"audience" | "message" | "review" | "done">("audience");
  const [audienceSource, setAudienceSource] = useState<AudienceSource>("clients");
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(true);
  const [search, setSearch] = useState("");
  const [templateId, setTemplateId] = useState<string>("custom");
  const [customMessage, setCustomMessage] = useState("");
  const [connectionPurpose, setConnectionPurpose] = useState("dispatch");
  const [minDelay, setMinDelay] = useState(5);
  const [maxDelay, setMaxDelay] = useState(15);
  const [pauseEveryMin, setPauseEveryMin] = useState(10);
  const [pauseEveryMax, setPauseEveryMax] = useState(20);
  const [pauseDurationMin, setPauseDurationMin] = useState(30);
  const [pauseDurationMax, setPauseDurationMax] = useState(120);
  const [dispatching, setDispatching] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawImport, setRawImport] = useState<RawImport | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importedContacts, setImportedContacts] = useState<ImportedContact[]>([]);
  const [importSelectedIds, setImportSelectedIds] = useState<Set<string>>(new Set());

  // Manual state
  const manualFileRef = useRef<HTMLInputElement>(null);
  const [manualContacts, setManualContacts] = useState<ImportedContact[]>([]);
  const [importSelectAll, setImportSelectAll] = useState(true);
  const [importSearch, setImportSearch] = useState("");

  // Load templates
  const { data: templates = [] } = useQuery({
    queryKey: ["admin-dispatch-templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_dispatch_templates" as any)
        .select("*")
        .eq("is_active", true)
        .order("name");
      return (data || []) as any[];
    },
  });

  // Load connection purposes
  const { data: connections = [] } = useQuery({
    queryKey: ["admin-connection-purposes", "dispatch-view"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_connection_purposes" as any)
        .select(`
          id,
          purpose,
          label,
          device_id,
          device:devices (
            id,
            name,
            number,
            status,
            profile_name
          )
        `)
        .order("purpose");

      if (error) throw error;

      return ((data || []) as any[]).map((item) => ({
        ...item,
        device: Array.isArray(item.device) ? item.device[0] ?? null : item.device ?? null,
      })) as ConnectionPurpose[];
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // === Dispatch history ===
  const { data: dispatchHistory = [], refetch: refetchHistory } = useQuery({
    queryKey: ["admin-dispatch-history"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data?action=dispatch-list`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const data = await resp.json();
      return data.dispatches || [];
    },
    refetchInterval: viewMode === "history" ? 5000 : false,
  });

  const dispatchControlMutation = useMutation({
    mutationFn: async ({ dispatch_id, command }: { dispatch_id: string; command: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data?action=dispatch-control`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ dispatch_id, command }),
        }
      );
      if (!resp.ok) throw new Error("Erro ao controlar disparo");
    },
    onSuccess: () => {
      refetchHistory();
      toast.success("Disparo atualizado");
    },
  });


  const audienceUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(u => {
      const d = getDaysLeft(u.plan_expires_at);
      switch (audienceFilter) {
        case "active": if (u.status !== "active") return false; break;
        case "expired": if (d === null || d > 0) return false; break;
        case "expiring": if (d === null || d <= 0 || d > 3) return false; break;
        case "trial": if (u.plan_name !== "Trial") return false; break;
        case "start": if (u.plan_name !== "Start") return false; break;
        case "pro": if (u.plan_name !== "Pro") return false; break;
        case "scale": if (u.plan_name !== "Scale") return false; break;
        case "elite": if (u.plan_name !== "Elite") return false; break;
      }
      if (q && !u.full_name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, audienceFilter, search]);

  const filteredImported = useMemo(() => {
    const q = importSearch.toLowerCase();
    if (!q) return importedContacts;
    return importedContacts.filter(c =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }, [importedContacts, importSearch]);

  const effectiveSelected = useMemo(() => {
    if (audienceSource === "imported") {
      if (importSelectAll) return new Set(filteredImported.map(c => c.id));
      return importSelectedIds;
    }
    if (audienceSource === "manual") {
      return new Set(manualContacts.map(c => c.id));
    }
    if (selectAll) return new Set(audienceUsers.map(u => u.id));
    return selectedIds;
  }, [audienceSource, selectAll, selectedIds, audienceUsers, importSelectAll, importSelectedIds, filteredImported, manualContacts]);

  const toggleUser = (id: string) => {
    setSelectAll(false);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllManual = () => {
    if (selectAll) {
      setSelectAll(false);
      setSelectedIds(new Set());
    } else {
      setSelectAll(true);
    }
  };

  // === Import logic ===

  const toggleImportContact = (id: string) => {
    setImportSelectAll(false);
    setImportSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleImportAll = () => {
    if (importSelectAll) {
      setImportSelectAll(false);
      setImportSelectedIds(new Set());
    } else {
      setImportSelectAll(true);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    const ext = file.name.split(".").pop()?.toLowerCase();

    const processRows = (rawRows: any[][]) => {
      if (rawRows.length < 2) { setImportLoading(false); toast.error("Arquivo vazio ou sem dados"); return; }
      const headers = rawRows[0].map((h: any) => String(h || "").trim());
      const dataRows = rawRows.slice(1).filter(r => r.some((c: any) => c != null && String(c).trim()));
      const mappings: ImportColumnMapping[] = headers.map((h) => {
        const lower = h.toLowerCase();
        if (lower.includes("nome") || lower.includes("name")) return "nome";
        if (lower.includes("numero") || lower.includes("phone") || lower.includes("telefone") || lower.includes("number") || lower.includes("celular") || lower.includes("whatsapp")) return "numero";
        return "ignorar";
      });
      setRawImport({ headers, rows: dataRows, columnMappings: mappings });
      setImportLoading(false);
    };

    if (ext === "xlsx" || ext === "xls") {
      import("xlsx").then(XLSX => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const wb = XLSX.read(ev.target?.result, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          processRows(XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]);
        };
        reader.readAsArrayBuffer(file);
      });
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const lines = text.split("\n").filter(Boolean);
        processRows(lines.map(l => l.split(/[,;]/)));
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const updateImportMapping = (colIndex: number, value: ImportColumnMapping) => {
    if (!rawImport) return;
    const newMappings = [...rawImport.columnMappings];
    if (value !== "ignorar") {
      newMappings.forEach((m, i) => { if (i !== colIndex && m === value) newMappings[i] = "ignorar"; });
    }
    newMappings[colIndex] = value;
    setRawImport({ ...rawImport, columnMappings: newMappings });
  };

  const confirmImportMapping = () => {
    if (!rawImport) return;
    const { rows, columnMappings } = rawImport;
    const numIdx = columnMappings.indexOf("numero");
    const nameIdx = columnMappings.indexOf("nome");

    if (numIdx < 0) { toast.error("Mapeie a coluna de número"); return; }

    const contacts: ImportedContact[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const rawPhone = String(row[numIdx] || "").trim();
      if (!rawPhone) continue;
      const phone = rawPhone.replace(/\D/g, "");
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      contacts.push({
        id: `imp_${phone}`,
        name: nameIdx >= 0 ? String(row[nameIdx] || "Sem nome").trim() : "Sem nome",
        phone,
      });
    }

    setImportedContacts(contacts);
    setImportSelectAll(true);
    setImportSelectedIds(new Set());
    setRawImport(null);
    setAudienceSource("imported");
    toast.success(`${contacts.length} contatos importados`);
  };

  // === Manual file import ===
  const handleManualFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();

    const processRows = (rawRows: any[][]) => {
      if (rawRows.length < 1) { toast.error("Arquivo vazio"); return; }
      // Try to detect header row
      const firstRow = rawRows[0].map((c: any) => String(c || "").toLowerCase().trim());
      const hasHeader = firstRow.some(h => ["nome", "name", "numero", "phone", "telefone", "number", "celular", "whatsapp"].includes(h));
      const dataRows = hasHeader ? rawRows.slice(1) : rawRows;
      const headers = hasHeader ? firstRow : [];

      let nameIdx = headers.findIndex(h => h.includes("nome") || h.includes("name"));
      let phoneIdx = headers.findIndex(h => h.includes("numero") || h.includes("phone") || h.includes("telefone") || h.includes("number") || h.includes("celular") || h.includes("whatsapp"));

      // If no header, assume first column is phone (or name;phone)
      if (phoneIdx < 0) phoneIdx = headers.length > 1 ? 1 : 0;

      const contacts: ImportedContact[] = [];
      const seen = new Set<string>();
      for (const row of dataRows) {
        const rawPhone = String(row[phoneIdx] || "").trim();
        if (!rawPhone) continue;
        const phone = rawPhone.replace(/\D/g, "");
        if (phone.length < 10 || seen.has(phone)) continue;
        seen.add(phone);
        const name = nameIdx >= 0 && nameIdx !== phoneIdx ? String(row[nameIdx] || "").trim() || "Contato" : "Contato";
        contacts.push({ id: crypto.randomUUID(), name, phone });
      }

      if (contacts.length === 0) { toast.error("Nenhum número válido encontrado"); return; }
      setManualContacts(prev => {
        const existingPhones = new Set(prev.map(c => c.phone));
        const newContacts = contacts.filter(c => !existingPhones.has(c.phone));
        return [...prev, ...newContacts];
      });
      toast.success(`${contacts.length} contatos importados`);
    };

    if (ext === "xlsx" || ext === "xls") {
      import("xlsx").then(XLSX => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const wb = XLSX.read(ev.target?.result, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          processRows(XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]);
        };
        reader.readAsArrayBuffer(file);
      });
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const lines = text.split("\n").filter(Boolean);
        processRows(lines.map(l => l.split(/[,;\t]/)));
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  // === Shared logic ===
  const selectedTemplate = templates.find((t: any) => t.id === templateId);
  const messageContent = templateId === "custom" ? customMessage : selectedTemplate?.content || "";
  const selectedTemplateButtons = Array.isArray((selectedTemplate as any)?.buttons)
    ? (selectedTemplate as any).buttons.filter((btn: any) => btn?.text)
    : [];
  const selectedTemplateMedia = (() => {
    const raw = (selectedTemplate as any)?.media_url;
    if (!raw) return [] as any[];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [{ url: raw }];
    }
  })();

  const handleDispatch = useCallback(async () => {
    if (!messageContent.trim()) { toast.error("Selecione ou escreva uma mensagem"); return; }
    if (effectiveSelected.size === 0) { toast.error("Selecione pelo menos um destinatário"); return; }

    setDispatching(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      let targets: any[];
      if (audienceSource === "imported") {
        targets = importedContacts
          .filter(c => effectiveSelected.has(c.id))
          .map(c => ({
            phone: c.phone,
            name: c.name,
          }));
      } else if (audienceSource === "manual") {
        targets = manualContacts
          .map(c => ({
            phone: c.phone,
            name: c.name,
          }));
      } else {
        targets = audienceUsers
          .filter(u => effectiveSelected.has(u.id))
          .map(u => ({
            user_id: u.id, phone: u.phone, name: u.full_name || u.email,
            email: u.email, plan_name: u.plan_name,
          }));
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data?action=bulk-dispatch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            targets,
            message_content: messageContent,
            connection_purpose: connectionPurpose,
            min_delay_seconds: minDelay,
            max_delay_seconds: maxDelay,
            pause_every_min: pauseEveryMin,
            pause_every_max: pauseEveryMax,
            pause_duration_min: pauseDurationMin,
            pause_duration_max: pauseDurationMax,
          }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao disparar");
      setResult({ ok: data.enqueued || targets.length, fail: data.failed || 0 });
      setStep("done");
      refetchHistory();
      toast.success(`Disparo enviado para ${data.enqueued || targets.length} destinatários`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDispatching(false);
    }
  }, [messageContent, effectiveSelected, audienceUsers, importedContacts, manualContacts, audienceSource, connectionPurpose, refetchHistory]);

  const resetAll = () => {
    setStep("audience");
    setResult(null);
    setCustomMessage("");
    setTemplateId("custom");
    setSelectedIds(new Set());
    setSelectAll(true);
    setSearch("");
    setAudienceFilter("all");
    setImportedContacts([]);
    setImportSelectAll(true);
    setImportSelectedIds(new Set());
    setImportSearch("");
    setAudienceSource("clients");
  };

  const dispatchConnection = connections.find((c) => c.purpose === connectionPurpose);
  const dispatchDevice = dispatchConnection?.device ?? null;
  const dispatchDeviceName = dispatchDevice?.profile_name || dispatchDevice?.name || dispatchConnection?.label || "Disparos manuais";
  const dispatchDeviceNumber = formatPhone(dispatchDevice?.number);
  const dispatchDeviceConnected = !!dispatchDevice && ["Connected", "Ready", "authenticated"].includes(dispatchDevice.status);

  const audienceLabel = audienceSource === "imported"
    ? `Lista importada (${importedContacts.length})`
    : audienceSource === "manual"
    ? `Manual (${manualContacts.length})`
    : AUDIENCE_OPTIONS.find(o => o.value === audienceFilter)?.label || "Clientes";

  return (
    <div className="space-y-6">
      {/* Header + view toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Send size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Enviar Mensagem</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Selecione clientes, escreva a mensagem e envie
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 p-1 bg-muted/20 rounded-lg border border-border/40">
          <button
            onClick={() => setViewMode("compose")}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
              viewMode === "compose" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Send size={12} /> Novo Disparo
          </button>
          <button
            onClick={() => { setViewMode("history"); refetchHistory(); }}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
              viewMode === "history" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <History size={12} /> Histórico
            {dispatchHistory.filter((d: any) => d.status === "running").length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {viewMode === "history" && (
        <DispatchHistoryPanel
          dispatches={dispatchHistory}
          onControl={(id, cmd) => dispatchControlMutation.mutate({ dispatch_id: id, command: cmd })}
          controlling={dispatchControlMutation.isPending}
        />
      )}

      {viewMode === "compose" && (<>


      {/* Stepper */}
      <div className="flex items-center gap-1 p-1 bg-muted/20 rounded-xl border border-border/40 w-fit">
        {(["audience", "message", "review"] as const).map((s, i) => {
          const labels = ["1. Clientes", "2. Mensagem", "3. Enviar"];
          const icons = [Users, FileText, Send];
          const Icon = icons[i];
          const isActive = step === s;
          const isDone = ["audience", "message", "review", "done"].indexOf(step) > i;
          return (
            <button
              key={s}
              onClick={() => setStep(s as any)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : isDone
                    ? "text-emerald-400 hover:bg-muted/30"
                    : "text-muted-foreground hover:bg-muted/30"
              }`}
            >
              {isDone && !isActive ? <CheckCircle2 size={13} /> : <Icon size={13} />}
              {labels[i]}
            </button>
          );
        })}
      </div>

      {/* Step: Audience */}
      {step === "audience" && (
        <div className="space-y-4">
          {/* Source toggle */}
          <div className="flex items-center gap-1 p-1 bg-muted/20 rounded-lg border border-border/40 w-fit">
            <button
              onClick={() => setAudienceSource("clients")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                audienceSource === "clients"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/30"
              }`}
            >
              <Users size={12} /> Clientes
            </button>
            <button
              onClick={() => setAudienceSource("imported")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                audienceSource === "imported"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/30"
              }`}
            >
              <FileSpreadsheet size={12} /> Lista importada
              {importedContacts.length > 0 && (
                <span className="text-[10px] bg-primary-foreground/20 px-1.5 rounded-full">{importedContacts.length}</span>
              )}
            </button>
            <button
              onClick={() => setAudienceSource("manual")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                audienceSource === "manual"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/30"
              }`}
            >
              <Pencil size={12} /> Manual
              {manualContacts.length > 0 && (
                <span className="text-[10px] bg-primary-foreground/20 px-1.5 rounded-full">{manualContacts.length}</span>
              )}
            </button>
          </div>

          {/* Clients source */}
          {audienceSource === "clients" && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={audienceFilter} onValueChange={(v) => setAudienceFilter(v as AudienceFilter)}>
                  <SelectTrigger className="h-9 w-56 bg-card/50 border-border/60 text-sm">
                    <Filter size={14} className="mr-2 text-muted-foreground/50" />
                    <SelectValue placeholder="Filtrar clientes" />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map(opt => {
                      const count = users.filter(u => {
                        const d = getDaysLeft(u.plan_expires_at);
                        switch (opt.value) {
                          case "all": return true;
                          case "active": return u.status === "active";
                          case "expired": return d !== null && d <= 0;
                          case "expiring": return d !== null && d > 0 && d <= 3;
                          case "trial": return u.plan_name === "Trial";
                          case "start": return u.plan_name === "Start";
                          case "pro": return u.plan_name === "Pro";
                          case "scale": return u.plan_name === "Scale";
                          case "elite": return u.plan_name === "Elite";
                          default: return true;
                        }
                      }).length;
                      return (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="flex items-center justify-between gap-3 w-full">
                            {opt.label}
                            <span className="text-[10px] font-mono text-muted-foreground/50">{count}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                <div className="relative flex-1 max-w-xs">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    placeholder="Buscar cliente..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-9 bg-card/50 border-border/60 text-sm"
                  />
                </div>

                <button
                  onClick={toggleAllManual}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                    selectAll ? "bg-primary/15 text-primary border-primary/40" : "bg-card border-border/60 text-muted-foreground"
                  }`}
                >
                  <Users size={12} />
                  {selectAll ? `Todos (${audienceUsers.length})` : `${effectiveSelected.size} selecionados`}
                </button>
              </div>

              <ScrollArea className="h-[320px] border border-border/50 rounded-xl bg-card/30">
                <div className="divide-y divide-border/30">
                  {audienceUsers.map(u => {
                    const d = getDaysLeft(u.plan_expires_at);
                    const isChecked = selectAll || selectedIds.has(u.id);
                    return (
                      <div
                        key={u.id}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors cursor-pointer"
                        onClick={() => toggleUser(u.id)}
                      >
                        <Checkbox checked={isChecked} className="shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{u.full_name || "—"}</p>
                          <p className="text-[11px] text-muted-foreground/60 truncate">{u.email}</p>
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground/50 hidden sm:block">
                          {formatPhone(u.phone)}
                        </span>
                        <Badge variant="outline" className="text-[9px] shrink-0">
                          {u.plan_name || "—"}
                        </Badge>
                        {d !== null && d <= 0 && (
                          <span className="text-[9px] text-red-400 font-bold shrink-0">Vencido</span>
                        )}
                      </div>
                    );
                  })}
                  {audienceUsers.length === 0 && (
                    <div className="text-center py-12 text-sm text-muted-foreground/50">
                      Nenhum cliente neste filtro
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}

          {/* Imported source */}
          {audienceSource === "imported" && (
            <>
              {importedContacts.length === 0 ? (
                <div className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center space-y-4">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Upload size={24} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Importar lista de contatos</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Envie um arquivo CSV ou XLSX com nome e número de telefone
                    </p>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importLoading}
                    className="gap-2"
                  >
                    {importLoading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                    {importLoading ? "Processando..." : "Selecionar arquivo"}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 max-w-xs">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                      <Input
                        placeholder="Buscar na lista..."
                        value={importSearch}
                        onChange={e => setImportSearch(e.target.value)}
                        className="pl-9 h-9 bg-card/50 border-border/60 text-sm"
                      />
                    </div>

                    <button
                      onClick={toggleImportAll}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                        importSelectAll ? "bg-primary/15 text-primary border-primary/40" : "bg-card border-border/60 text-muted-foreground"
                      }`}
                    >
                      <Users size={12} />
                      {importSelectAll ? `Todos (${filteredImported.length})` : `${effectiveSelected.size} selecionados`}
                    </button>

                    <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importLoading}
                      className="gap-1.5 text-xs"
                    >
                      <FileSpreadsheet size={12} />
                      Reimportar
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setImportedContacts([]); setImportSelectAll(true); setImportSelectedIds(new Set()); }}
                      className="gap-1.5 text-xs text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={12} />
                      Limpar
                    </Button>
                  </div>

                  <ScrollArea className="h-[320px] border border-border/50 rounded-xl bg-card/30">
                    <div className="divide-y divide-border/30">
                      {filteredImported.map(c => {
                        const isChecked = importSelectAll || importSelectedIds.has(c.id);
                        return (
                          <div
                            key={c.id}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors cursor-pointer"
                            onClick={() => toggleImportContact(c.id)}
                          >
                            <Checkbox checked={isChecked} className="shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                            </div>
                            <span className="text-[11px] font-mono text-muted-foreground/50">
                              {formatPhone(c.phone)}
                            </span>
                            <Badge variant="outline" className="text-[9px] shrink-0 text-blue-400 border-blue-400/30">
                              Importado
                            </Badge>
                          </div>
                        );
                      })}
                      {filteredImported.length === 0 && (
                        <div className="text-center py-12 text-sm text-muted-foreground/50">
                          Nenhum contato encontrado
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </>
              )}
            </>
          )}

          {/* Manual source */}
          {audienceSource === "manual" && (
            <div className="space-y-4">
              {/* File + manual input area */}
              <div className="border border-border/50 rounded-xl bg-card/30 overflow-hidden">
                {/* Drag & drop / click to upload area */}
                <input ref={manualFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleManualFileImport} />
                {manualContacts.length === 0 ? (
                  <button
                    onClick={() => manualFileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/40", "bg-primary/5"); }}
                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove("ring-2", "ring-primary/40", "bg-primary/5"); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("ring-2", "ring-primary/40", "bg-primary/5");
                      const f = e.dataTransfer.files[0];
                      if (f && manualFileRef.current) {
                        const dt = new DataTransfer();
                        dt.items.add(f);
                        manualFileRef.current.files = dt.files;
                        manualFileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                      }
                    }}
                    className="w-full py-12 flex flex-col items-center gap-4 transition-all duration-200 hover:bg-muted/5 group cursor-pointer"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Upload size={24} className="text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-foreground">Arraste sua planilha aqui</p>
                      <p className="text-xs text-muted-foreground/50 mt-1">ou clique para selecionar — .xlsx, .xls, .csv</p>
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={() => manualFileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/40", "bg-primary/5"); }}
                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove("ring-2", "ring-primary/40", "bg-primary/5"); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("ring-2", "ring-primary/40", "bg-primary/5");
                      const f = e.dataTransfer.files[0];
                      if (f && manualFileRef.current) {
                        const dt = new DataTransfer();
                        dt.items.add(f);
                        manualFileRef.current.files = dt.files;
                        manualFileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                      }
                    }}
                    className="w-full py-5 flex flex-col items-center gap-2 transition-all duration-200 hover:bg-muted/5 group cursor-pointer border-b border-border/30"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Upload size={16} className="text-primary" />
                    </div>
                    <p className="text-xs font-medium text-foreground/70">Arraste ou clique para importar mais</p>
                  </button>
                )}

                {/* Action bar */}
                <div className="px-4 py-3 flex items-center gap-2 border-b border-border/30 bg-muted/10 flex-wrap">
                  <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5 border-border/30" onClick={() => manualFileRef.current?.click()}>
                    <Upload size={12} /> Planilha
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5 border-border/30" onClick={() => {
                    setManualContacts(prev => [
                      ...prev,
                      { id: crypto.randomUUID(), name: "", phone: "" },
                    ]);
                  }}>
                    <Plus size={12} /> Manual
                  </Button>

                  {manualContacts.length > 0 && (
                    <>
                      <div className="h-4 w-px bg-border/20 mx-1" />
                      <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1 border-border/30 text-muted-foreground" onClick={() => {
                        const seen = new Set<string>();
                        const unique = manualContacts.filter(c => {
                          const p = c.phone.replace(/\D/g, "");
                          if (!p || seen.has(p)) return false;
                          seen.add(p);
                          return true;
                        });
                        const removed = manualContacts.length - unique.length;
                        setManualContacts(unique);
                        toast.success(`${removed} duplicado(s) removido(s)`);
                      }}>
                        Remover Duplicados
                      </Button>
                      <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1 border-border/30 text-muted-foreground" onClick={() => {
                        const valid = manualContacts.filter(c => /^\d{10,15}$/.test(c.phone.replace(/\D/g, "")));
                        const removed = manualContacts.length - valid.length;
                        setManualContacts(valid);
                        toast.success(`${removed} inválido(s) removido(s)`);
                      }}>
                        Remover Inválidos
                      </Button>
                    </>
                  )}

                  {manualContacts.length > 0 && (
                    <span className="ml-auto text-[11px] text-muted-foreground/50 tabular-nums font-medium">
                      {manualContacts.filter(c => /^\d{10,15}$/.test(c.phone.replace(/\D/g, ""))).length} válidos
                      {(() => {
                        const inv = manualContacts.filter(c => c.phone && !/^\d{10,15}$/.test(c.phone.replace(/\D/g, ""))).length;
                        return inv > 0 ? <span className="text-amber-400/70 ml-1.5">· {inv} inválido{inv !== 1 ? "s" : ""}</span> : null;
                      })()}
                    </span>
                  )}
                </div>
              </div>

              {/* Editable contact table */}
              {manualContacts.length > 0 && (
                <div className="border border-border/50 rounded-xl bg-card/30 overflow-hidden">
                  <div className="overflow-x-auto overflow-y-auto max-h-[350px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b border-border/30">
                          <th className="text-left px-4 py-3 text-muted-foreground/50 font-semibold text-[10px] w-10">#</th>
                          <th className="text-left px-4 py-3 text-muted-foreground/50 font-semibold text-[10px] uppercase tracking-wider">Nome</th>
                          <th className="text-left px-4 py-3 text-muted-foreground/50 font-semibold text-[10px] uppercase tracking-wider">Número</th>
                          <th className="text-left px-4 py-3 text-muted-foreground/50 font-semibold w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualContacts.map((c, i) => {
                          const isValid = /^\d{10,15}$/.test(c.phone.replace(/\D/g, ""));
                          return (
                            <tr key={c.id} className={cn(
                              "border-b border-border/10 transition-colors",
                              i % 2 === 0 ? "bg-transparent" : "bg-muted/5",
                              "hover:bg-primary/5"
                            )}>
                              <td className="px-4 py-2 text-muted-foreground/30 tabular-nums text-[11px]">{i + 1}</td>
                              <td className="px-4 py-1.5">
                                <Input
                                  value={c.name}
                                  onChange={e => {
                                    const next = [...manualContacts];
                                    next[i] = { ...next[i], name: e.target.value };
                                    setManualContacts(next);
                                  }}
                                  placeholder="Nome"
                                  className="h-8 text-xs bg-transparent border-none p-0 focus-visible:ring-0"
                                />
                              </td>
                              <td className="px-4 py-1.5">
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={c.phone}
                                    onChange={e => {
                                      const next = [...manualContacts];
                                      next[i] = { ...next[i], phone: e.target.value };
                                      setManualContacts(next);
                                    }}
                                    placeholder="5511999998888"
                                    className={cn("h-8 text-xs bg-transparent border-none p-0 font-mono focus-visible:ring-0", c.phone && !isValid && "text-amber-400")}
                                  />
                                  {c.phone && !isValid && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Número inválido" />
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-1.5">
                                <button
                                  onClick={() => setManualContacts(prev => prev.filter(x => x.id !== c.id))}
                                  className="text-muted-foreground/20 hover:text-destructive transition-colors p-1 rounded-md hover:bg-destructive/10"
                                >
                                  <X size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/20 bg-muted/5">
                    <span className="text-[11px] text-muted-foreground/40 tabular-nums">{manualContacts.length} contatos</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setManualContacts([]); }}
                      className="text-[11px] h-7 gap-1 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 size={12} /> Limpar tudo
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => setStep("message")}
              disabled={effectiveSelected.size === 0}
              className="gap-2"
            >
              Próximo: Mensagem <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Message */}
      {step === "message" && (
        <div className="space-y-4">
          <div className="bg-card/60 border border-border/50 rounded-xl p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Modelo de mensagem</label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione um modelo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">
                    <span className="flex items-center gap-2">✏️ Mensagem personalizada</span>
                  </SelectItem>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <FileText size={12} /> {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {templateId === "custom" ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Mensagem *</label>
                <Textarea
                  placeholder="Digite sua mensagem..."
                  value={customMessage}
                  onChange={e => setCustomMessage(e.target.value)}
                  rows={6}
                  className="resize-none text-sm"
                />
                <p className="text-[10px] text-muted-foreground/50">
                  Variáveis: {"{{nome}}"}, {"{{email}}"}, {"{{plano}}"}, {"{{telefone}}"}, {"{{vencimento}}"}
                </p>
              </div>
            ) : selectedTemplate ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Preview do modelo</label>
                <div className="bg-muted/30 border border-border/40 rounded-lg p-4 space-y-3">
                  {selectedTemplateMedia.length > 0 && (
                    <div className="rounded-lg border border-border/30 bg-card/60 px-3 py-6 text-center text-xs text-muted-foreground">
                      📎 {selectedTemplateMedia.length} mídia{selectedTemplateMedia.length > 1 ? "s" : ""} anexada{selectedTemplateMedia.length > 1 ? "s" : ""}
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap text-foreground">{selectedTemplate.content}</p>
                  {selectedTemplateButtons.length > 0 && (
                    <div className="space-y-2 border-t border-border/30 pt-3">
                      {selectedTemplateButtons.map((btn: any, i: number) => (
                        <div key={i} className="rounded-md border border-border/30 bg-card/60 px-3 py-2 text-center text-xs font-medium text-primary">
                          {btn.text || `Botão ${i + 1}`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Delay config */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Intervalo entre envios (segundos)</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground/60 mb-1 block">Mínimo</label>
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    value={minDelay}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setMinDelay(v);
                      if (v > maxDelay) setMaxDelay(v);
                    }}
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground/60 mb-1 block">Máximo</label>
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    value={maxDelay}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setMaxDelay(v);
                      if (v < minDelay) setMinDelay(v);
                    }}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/50">
                Cada mensagem será enviada com um atraso aleatório entre {minDelay}s e {maxDelay}s
              </p>
            </div>

            {/* Pause config */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Pausa automática</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground/60 mb-1 block">Pausar a cada (min msgs)</label>
                  <Input type="number" min={1} max={500} value={pauseEveryMin} onChange={e => { const v = Number(e.target.value); setPauseEveryMin(v); if (v > pauseEveryMax) setPauseEveryMax(v); }} className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground/60 mb-1 block">Pausar a cada (max msgs)</label>
                  <Input type="number" min={1} max={500} value={pauseEveryMax} onChange={e => { const v = Number(e.target.value); setPauseEveryMax(v); if (v < pauseEveryMin) setPauseEveryMin(v); }} className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground/60 mb-1 block">Duração da pausa (min seg)</label>
                  <Input type="number" min={5} max={600} value={pauseDurationMin} onChange={e => { const v = Number(e.target.value); setPauseDurationMin(v); if (v > pauseDurationMax) setPauseDurationMax(v); }} className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground/60 mb-1 block">Duração da pausa (max seg)</label>
                  <Input type="number" min={5} max={600} value={pauseDurationMax} onChange={e => { const v = Number(e.target.value); setPauseDurationMax(v); if (v < pauseDurationMin) setPauseDurationMin(v); }} className="h-9 text-sm" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/50">
                A cada {pauseEveryMin}–{pauseEveryMax} mensagens, pausa de {pauseDurationMin}s–{pauseDurationMax}s
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Conexão para envio</label>
              <div className="flex min-h-10 items-center gap-2 rounded-md border border-border/50 bg-card/60 px-3 py-2">
                <Smartphone size={14} className="text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{dispatchDeviceName}</p>
                  {dispatchDevice && (
                    <p className="text-[11px] text-muted-foreground truncate">{dispatchDeviceNumber}</p>
                  )}
                </div>
                {dispatchDeviceConnected ? (
                  <Badge variant="outline" className="ml-auto text-[9px] border-primary/30 bg-primary/5 text-primary">Conectado</Badge>
                ) : dispatchConnection?.device_id ? (
                  <Badge variant="outline" className="ml-auto text-[9px] border-border text-muted-foreground">Configurado</Badge>
                ) : (
                  <span className="ml-auto text-[10px] text-destructive">(sem dispositivo)</span>
                )}
              </div>
              {dispatchConnection && !dispatchConnection.device_id && (
                <p className="text-[10px] text-yellow-400 flex items-center gap-1">
                  <AlertTriangle size={10} /> Configure um dispositivo na aba Conexões
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("audience")}>Voltar</Button>
            <Button
              onClick={() => setStep("review")}
              disabled={!messageContent.trim()}
              className="gap-2"
            >
              Próximo: Enviar <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Review */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="bg-card/60 border border-border/50 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Eye size={16} className="text-primary" /> Resumo do Envio</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/20 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-bold mb-1">Destinatários</p>
                <p className="text-lg font-bold text-foreground">{effectiveSelected.size}</p>
                <p className="text-[11px] text-muted-foreground">{audienceLabel}</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-bold mb-1">Conexão</p>
                <p className="text-sm font-semibold text-foreground">{dispatchDeviceName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {dispatchConnection?.device_id ? (dispatchDevice ? `${dispatchDeviceNumber} · ${dispatchDeviceConnected ? "Conectada ✓" : "Configurada ✓"}` : "Configurada ✓") : "Sem dispositivo ⚠"}
                </p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-bold mb-1">Intervalo</p>
                <p className="text-sm font-semibold text-foreground">{minDelay}s – {maxDelay}s</p>
                <p className="text-[11px] text-muted-foreground">entre cada envio</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-bold mb-1">Pausa</p>
                <p className="text-sm font-semibold text-foreground">{pauseDurationMin}s – {pauseDurationMax}s</p>
                <p className="text-[11px] text-muted-foreground">a cada {pauseEveryMin}–{pauseEveryMax} msgs</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-bold mb-1">Tempo estimado</p>
                <p className="text-sm font-semibold text-foreground">
                  {(() => {
                    const avg = (minDelay + maxDelay) / 2;
                    const totalSec = avg * effectiveSelected.size;
                    if (totalSec < 60) return `~${Math.round(totalSec)}s`;
                    if (totalSec < 3600) return `~${Math.round(totalSec / 60)} min`;
                    return `~${(totalSec / 3600).toFixed(1)}h`;
                  })()}
                </p>
                <p className="text-[11px] text-muted-foreground">aprox. total</p>
              </div>
            </div>

            {/* WhatsApp-style message preview */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-bold mb-2">Prévia da Mensagem</p>
                <div className="bg-[#0b1418] rounded-xl p-4 max-w-sm mx-auto">
                  <div className="bg-[#005c4b] rounded-lg p-3 ml-auto max-w-[90%]">
                    {selectedTemplateMedia.length > 0 && (
                      <div className="mb-2 rounded overflow-hidden bg-black/20 flex items-center justify-center h-32 text-xs text-white/40">
                        📎 {selectedTemplateMedia.length} mídia{selectedTemplateMedia.length > 1 ? "s" : ""}
                      </div>
                    )}
                    <p className="text-[13px] whitespace-pre-wrap text-white leading-relaxed">{messageContent || "(mensagem vazia)"}</p>
                    {selectedTemplateButtons.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                        {selectedTemplateButtons.map((btn: any, i: number) => (
                          <div key={i} className="text-center py-1.5 rounded bg-white/5 text-[12px] text-[#53bdeb] font-medium">
                            {btn.text || btn.label || btn.title || `Botão ${i + 1}`}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-white/40 text-right mt-1">agora</p>
                  </div>
                </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("message")}>Voltar</Button>
            <Button
              onClick={handleDispatch}
              disabled={dispatching}
              className="gap-2"
            >
              {dispatching ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {dispatching ? "Enviando..." : `Disparar para ${effectiveSelected.size}`}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && result && (
        <div className="text-center py-12 space-y-4">
          <CheckCircle2 size={48} className="mx-auto text-emerald-400" />
          <div>
            <p className="text-xl font-bold text-foreground">{result.ok} mensagen{result.ok !== 1 ? "s" : ""} enfileirada{result.ok !== 1 ? "s" : ""}</p>
            {result.fail > 0 && <p className="text-sm text-destructive mt-1">{result.fail} falha{result.fail !== 1 ? "s" : ""}</p>}
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={resetAll} className="gap-2">
              <Send size={14} /> Novo Disparo
            </Button>
            <Button variant="outline" onClick={() => { setViewMode("history"); refetchHistory(); }} className="gap-2">
              <History size={14} /> Ver Histórico
            </Button>
          </div>
        </div>
      )}

      {/* Import Mapping Dialog */}
      <Dialog open={!!rawImport} onOpenChange={(open) => { if (!open) setRawImport(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Mapear colunas do arquivo</DialogTitle></DialogHeader>
          {rawImport && (
            <div className="space-y-4">
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{rawImport.rows.length} linhas</span>
                <span>{rawImport.headers.length} colunas</span>
                <span className={rawImport.columnMappings.filter(m => m !== "ignorar").length > 0 ? "text-primary font-medium" : ""}>
                  {rawImport.columnMappings.filter(m => m !== "ignorar").length} mapeadas
                </span>
              </div>

              <div className="space-y-2">
                {rawImport.headers.map((header, i) => {
                  const mapping = rawImport.columnMappings[i];
                  const sample = rawImport.rows.slice(0, 3).map(r => String(r[i] || "")).filter(Boolean).join(", ");
                  const mappingColors: Record<string, string> = {
                    nome: "ring-emerald-500/30 bg-emerald-500/5",
                    numero: "ring-blue-500/30 bg-blue-500/5",
                  };
                  return (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg border border-border/30 bg-muted/10">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{header || `Coluna ${i + 1}`}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{sample || "—"}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                      <Select value={mapping} onValueChange={(v) => updateImportMapping(i, v as ImportColumnMapping)}>
                        <SelectTrigger className={cn("w-[150px] h-9 text-xs", mapping !== "ignorar" && (mappingColors[mapping] || "ring-primary/30 bg-primary/5"))}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {IMPORT_MAPPING_OPTIONS.map(opt => {
                            const taken = opt.value !== "ignorar" && rawImport.columnMappings.some((m, idx) => idx !== i && m === opt.value);
                            return <SelectItem key={opt.value} value={opt.value} disabled={taken} className={taken ? "opacity-30" : ""}>{opt.label}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRawImport(null)}>Cancelar</Button>
            <Button onClick={confirmImportMapping} disabled={!rawImport?.columnMappings.includes("numero")}>
              Importar {rawImport ? rawImport.rows.length : 0} contatos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>)}
    </div>
  );
}

// ─── Dispatch History Panel ───
function DispatchHistoryPanel({ dispatches, onControl, controlling }: {
  dispatches: any[];
  onControl: (id: string, cmd: string) => void;
  controlling: boolean;
}) {
  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    running: { label: "Enviando", color: "text-emerald-400", icon: Play },
    paused: { label: "Pausado", color: "text-yellow-400", icon: Pause },
    completed: { label: "Concluído", color: "text-primary", icon: CheckCircle2 },
    cancelled: { label: "Cancelado", color: "text-destructive", icon: XCircle },
    pending: { label: "Pendente", color: "text-muted-foreground", icon: Clock },
  };

  if (dispatches.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <History size={40} className="mx-auto text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground">Nenhum disparo realizado ainda</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {dispatches.map((d: any) => {
        const cfg = statusConfig[d.status] || statusConfig.pending;
        const Icon = cfg.icon;
        const progress = d.total_contacts > 0 ? Math.round(((d.sent_count + d.failed_count) / d.total_contacts) * 100) : 0;
        const isActive = d.status === "running" || d.status === "paused";

        return (
          <div key={d.id} className="bg-card/60 border border-border/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Icon size={16} className={cfg.color} />
                <span className={cn("text-xs font-bold", cfg.color)}>{cfg.label}</span>
                {d.status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              </div>
              <span className="text-[10px] text-muted-foreground/50">
                {d.started_at ? new Date(d.started_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
              </span>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500",
                    d.status === "running" ? "bg-emerald-400" :
                    d.status === "completed" ? "bg-primary" :
                    d.status === "cancelled" ? "bg-destructive/60" : "bg-yellow-400"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
                <span className="tabular-nums">{d.sent_count + d.failed_count} / {d.total_contacts}</span>
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400">✓ {d.sent_count}</span>
                  {d.failed_count > 0 && <span className="text-destructive">✗ {d.failed_count}</span>}
                </div>
              </div>
            </div>

            {/* Message preview */}
            <p className="text-[11px] text-muted-foreground/60 line-clamp-2 bg-muted/10 rounded-lg px-3 py-2">
              {d.message_content}
            </p>

            {/* Controls */}
            {isActive && (
              <div className="flex items-center gap-2 pt-1">
                {d.status === "running" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 gap-1 border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10"
                    onClick={() => onControl(d.id, "pause")}
                    disabled={controlling}
                  >
                    <Pause size={12} /> Pausar
                  </Button>
                )}
                {d.status === "paused" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 gap-1 border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10"
                    onClick={() => onControl(d.id, "resume")}
                    disabled={controlling}
                  >
                    <Play size={12} /> Retomar
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[11px] h-7 gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => onControl(d.id, "cancel")}
                  disabled={controlling}
                >
                  <XCircle size={12} /> Cancelar
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
