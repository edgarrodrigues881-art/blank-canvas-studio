// XLSX is dynamically imported when needed to reduce initial bundle
import { RefreshCw, Shield, Link2, Upload, Download, Trash2, CheckSquare, Plus, Globe, Wifi, Server, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRef, useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type StatusFilter = "NOVA" | "USANDO" | "USADA" | "INVALID" | null;

const PROXY_DISCLAIMER_KEY = "proxy-disclaimer-accepted";

const statusConfig = {
  NOVA: { label: "Livre", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", dot: "bg-emerald-400" },
  USANDO: { label: "Em uso", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", dot: "bg-amber-400" },
  USADA: { label: "Usada", color: "text-muted-foreground", bg: "bg-muted/10", border: "border-border/30", dot: "bg-muted-foreground/40" },
  INVALID: { label: "Inválida", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", dot: "bg-red-400" },
};

const Proxy = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ host: "", port: "", username: "", password: "" });
  const [pasteInput, setPasteInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!localStorage.getItem(PROXY_DISCLAIMER_KEY)) setDisclaimerOpen(true);
  }, []);

  const handleAcceptDisclaimer = () => {
    localStorage.setItem(PROXY_DISCLAIMER_KEY, "true");
    setDisclaimerOpen(false);
    setDisclaimerChecked(false);
  };

  const { data: dbProxies = [] } = useQuery({
    queryKey: ["proxies"],
    queryFn: async () => {
      // Fetch all proxies (handle >1000 rows)
      const allProxies: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("proxies")
          .select("id, display_id, host, port, username, type, status, active, created_at, updated_at")
          .order("display_id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allProxies.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return allProxies;
    },
    enabled: !!session,
    refetchInterval: 60000,
  });

  // Fetch devices to map proxy_id → device name
  const { data: devices = [] } = useQuery({
    queryKey: ["proxy-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, proxy_id, profile_name, profile_picture")
        .neq("login_type", "report_wa");
      if (error) throw error;
      return (data || []) as { id: string; name: string; number: string | null; proxy_id: string | null; profile_name: string | null; profile_picture: string | null }[];
    },
    enabled: !!session,
    refetchInterval: 60000,
  });

  const deviceByProxy = useMemo(() => {
    const map: Record<string, { name: string; number: string | null; profile_name: string | null; profile_picture: string | null }> = {};
    devices.forEach(d => {
      if (d.proxy_id) map[d.proxy_id] = { name: d.name, number: d.number, profile_name: d.profile_name, profile_picture: d.profile_picture };
    });
    return map;
  }, [devices]);

  const proxiesWithIndex = dbProxies.map((p: any, index: number) => ({
    ...p,
    displayId: index + 1,
    proxyStatus: p.status || "NOVA",
  }));

  const filtered = statusFilter
    ? proxiesWithIndex.filter((p: any) => p.proxyStatus === statusFilter)
    : proxiesWithIndex;

  const counts = useMemo(() => ({
    total: proxiesWithIndex.length,
    NOVA: proxiesWithIndex.filter((p: any) => p.proxyStatus === "NOVA").length,
    USANDO: proxiesWithIndex.filter((p: any) => p.proxyStatus === "USANDO").length,
    USADA: proxiesWithIndex.filter((p: any) => p.proxyStatus === "USADA").length,
    INVALID: proxiesWithIndex.filter((p: any) => p.proxyStatus === "INVALID").length,
  }), [proxiesWithIndex]);

  // Mutations
  const addMutation = useMutation({
    mutationFn: async (proxies: { host: string; port: string; username: string; password: string }[]) => {
      const insertData = proxies.map((p) => ({ ...p, type: "HTTP", user_id: session?.user.id }));
      const { error } = await supabase.from("proxies").insert(insertData as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      toast.success("Proxy adicionada");
    },
    onError: () => toast.error("Erro ao adicionar proxy"),
  });

  const deleteMultipleMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: linkedDevices } = await supabase
        .from("devices")
        .select("proxy_id")
        .in("proxy_id", ids.slice(0, 500));
      
      const linkedIds = new Set((linkedDevices || []).map(d => d.proxy_id).filter(Boolean));
      const deletableIds = ids.filter(id => !linkedIds.has(id));
      const blockedCount = ids.length - deletableIds.length;

      // Delete in batches of 200 to avoid URL length limits
      if (deletableIds.length > 0) {
        for (let i = 0; i < deletableIds.length; i += 200) {
          const batch = deletableIds.slice(i, i + 200);
          const { error } = await supabase.from("proxies").delete().in("id", batch);
          if (error) throw error;
        }
      }

      return { deleted: deletableIds.length, blocked: blockedCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      setSelectedIds(new Set());
      if (result.blocked > 0 && result.deleted > 0) {
        toast.success(`${result.deleted} removida(s). ${result.blocked} ignorada(s) — vinculadas a instâncias.`);
      } else if (result.blocked > 0 && result.deleted === 0) {
        toast.error(`Proxy vinculada a instância. Desvincule primeiro.`);
      } else {
        toast.success("Removida");
      }
    },
    onError: () => toast.error("Erro ao remover"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "NOVA" | "USANDO" | "USADA" | "INVALID" }) => {
      const { error } = await supabase.from("proxies").update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["proxies"] });
      const previous = queryClient.getQueryData(["proxies"]);
      queryClient.setQueryData(["proxies"], (old: any[]) =>
        old?.map((p: any) => (p.id === id ? { ...p, status } : p)) ?? []
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["proxies"], context.previous);
      toast.error("Erro ao atualizar status");
    },
    onSettled: () => {},
    onSuccess: () => {},
  });

  const parseLine = (line: string) => {
    const t = line.trim();
    if (!t) return null;
    let host = "", port = "", username = "", password = "";
    if (t.includes("@")) {
      const [cred, hp] = t.split("@");
      const c = cred.split(":");
      username = c[0] || ""; password = c[1] || "";
      const h = hp?.split(":") || [];
      host = h[0] || ""; port = h[1] || "";
    } else {
      const p = t.split(":");
      host = p[0] || ""; port = p[1] || ""; username = p[2] || ""; password = p[3] || "";
    }
    return host && port ? { host, port, username, password } : null;
  };

  const handlePasteInput = (value: string) => {
    setPasteInput(value);
    const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const parsed = lines.map(parseLine).filter(Boolean) as any[];
      if (parsed.length > 0) {
        addMutation.mutate(parsed);
        setPasteInput("");
        setForm({ host: "", port: "", username: "", password: "" });
      }
      return;
    }
    const parsed = parseLine(value);
    if (parsed && parsed.host && parsed.port) {
      setForm(parsed);
    }
  };

  const handleAdd = () => {
    if (!form.host || !form.port) {
      toast.error("Preencha pelo menos Host e Porta");
      return;
    }
    addMutation.mutate([{ host: form.host, port: form.port, username: form.username, password: form.password }]);
    setForm({ host: "", port: "", username: "", password: "" });
    setPasteInput("");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const XLSX = await import("xlsx");
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          
          const parsed: any[] = [];
          for (const row of rows) {
            if (!row || !Array.isArray(row) || row.length < 1) continue;
            const vals = row.map((v: any) => String(v ?? "").trim());
            const first = vals[0]?.toLowerCase();
            if (!first || first === "host" || first === "ip" || first.includes("proxy") || first === "servidor") continue;
            const fromParse = parseLine(vals[0]);
            if (fromParse) { parsed.push(fromParse); continue; }
            if (vals.length >= 2) {
              const host = vals[0] || "";
              const port = vals[1] || "";
              const username = vals[2] || "";
              const password = vals[3] || "";
              if (host && port) parsed.push({ host, port, username, password });
            }
          }
          
          if (parsed.length > 0) addMutation.mutate(parsed);
          else toast.error("Nenhuma proxy válida encontrada");
        } catch {
          toast.error("Erro ao ler arquivo");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (!text) return;
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        const parsed = lines.map(parseLine).filter(Boolean) as any[];
        if (parsed.length > 0) addMutation.mutate(parsed);
        else toast.error("Nenhuma proxy válida encontrada");
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    setSelectedIds(
      selectedIds.size === filtered.length ? new Set() : new Set(filtered.map((p: any) => p.id))
    );
  };

  const handleExport = (status: "NOVA" | "USANDO" | "USADA" | "INVALID" | "TODAS") => {
    const toExport = status === "TODAS"
      ? proxiesWithIndex
      : proxiesWithIndex.filter((p: any) => p.proxyStatus === status);
    if (toExport.length === 0) {
      toast.error("Nenhuma proxy para exportar");
      return;
    }
    const content = toExport.map((p: any) =>
      p.username ? `${p.username}:${p.password}@${p.host}:${p.port}` : `${p.host}:${p.port}`
    ).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `proxies-${status.toLowerCase()}.txt`; a.click();
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
    toast.success(`${toExport.length} proxy(s) exportada(s)`);
  };

  const handleSync = async () => {
    try {
      const { data: allProxies } = await supabase.from("proxies").select("id, status");
      const { data: allDevices } = await supabase.from("devices").select("proxy_id");
      const linkedProxyIds = new Set((allDevices || []).map(d => d.proxy_id).filter(Boolean));
      let updated = 0;
      for (const proxy of (allProxies || [])) {
        const isLinked = linkedProxyIds.has(proxy.id);
        let correctStatus: string;
        if (isLinked) correctStatus = "USANDO";
        else if (proxy.status === "USANDO") correctStatus = "USADA";
        else correctStatus = proxy.status;
        if (proxy.status !== correctStatus) {
          await supabase.from("proxies").update({ status: correctStatus } as any).eq("id", proxy.id);
          updated++;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      toast.success(`Sincronizado. ${updated} atualizada(s).`);
    } catch {
      toast.error("Erro ao sincronizar");
    }
  };

  const getStatusBadge = (s: string) => {
    const cfg = statusConfig[s as keyof typeof statusConfig] || statusConfig.NOVA;
    return (
      <Badge variant="outline" className={`text-[10px] ${cfg.bg} ${cfg.color} ${cfg.border} px-2 py-0.5`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} mr-1 inline-block`} />
        {cfg.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Disclaimer */}
      <Dialog open={disclaimerOpen} onOpenChange={(open) => { if (!open) navigate("/dashboard"); }}>
        <DialogContent className="sm:max-w-[380px] p-0 bg-card/95 backdrop-blur-2xl border-border/10 overflow-hidden rounded-2xl shadow-2xl">
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                Boas práticas de Proxy
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="px-6 pb-4 space-y-3">
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Proxies são parte crítica da saúde do chip. A qualidade da conexão impacta diretamente na estabilidade da instância.
            </p>
            <div className="space-y-2">
              {[
                "Use proxies residenciais ou móveis dedicadas",
                "Evite proxies de datacenter ou compartilhadas",
                "Uma proxy dedicada por instância",
              ].map((rule, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px] text-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  {rule}
                </div>
              ))}
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border/10 bg-muted/5 space-y-3">
            <div className="flex items-start gap-2">
              <Checkbox id="disclaimer-check" checked={disclaimerChecked} onCheckedChange={(v) => setDisclaimerChecked(!!v)} className="mt-0.5" />
              <label htmlFor="disclaimer-check" className="text-[11px] text-muted-foreground cursor-pointer leading-relaxed">
                Estou ciente e assumo responsabilidade pelo uso.
              </label>
            </div>
            <Button onClick={handleAcceptDisclaimer} className="w-full h-10 rounded-xl text-xs font-semibold shadow-md" disabled={!disclaimerChecked}>
              Continuar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <Globe className="w-6 h-6 text-primary" />
            Proxies
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Conexão dedicada por instância para saúde do chip</p>
        </div>
        <div className="flex items-center gap-1.5 w-full md:w-auto">
          <input ref={fileInputRef} type="file" accept=".txt,.csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" className="gap-1 md:gap-1.5 text-[10px] md:text-xs flex-1 md:flex-none" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 shrink-0" /> Importar
          </Button>
          <div className="relative flex-1 md:flex-none">
            <Button variant="outline" size="sm" className="gap-1 md:gap-1.5 text-[10px] md:text-xs w-full" onClick={() => setExportMenuOpen(!exportMenuOpen)}>
              <Download className="w-3.5 h-3.5 shrink-0" /> Exportar
            </Button>
            {exportMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-card/95 backdrop-blur-2xl border border-border/20 rounded-xl shadow-2xl py-1.5 min-w-[130px]">
                  {(["TODAS", "NOVA", "USANDO", "USADA"] as const).map((s) => (
                    <button key={s} onClick={() => handleExport(s)} className="w-full text-left px-3.5 py-2 text-xs text-foreground hover:bg-muted/50 transition-colors rounded-lg mx-0.5" style={{ width: "calc(100% - 4px)" }}>
                      {s === "TODAS" ? "Todas" : s === "NOVA" ? "Livres" : s === "USANDO" ? "Em uso" : "Usadas"}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-1 md:gap-1.5 text-[10px] md:text-xs flex-1 md:flex-none" onClick={handleSync}>
            <RefreshCw className="w-3.5 h-3.5 shrink-0" /> Sincronizar
          </Button>
        </div>
      </div>

      {/* Stats — premium cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: counts.total, icon: Server, color: "#a1a1aa" },
          { label: "Livres", value: counts.NOVA, icon: Wifi, color: "#10b981" },
          { label: "Em uso", value: counts.USANDO, icon: Link2, color: "#f59e0b" },
          { label: "Usadas", value: counts.USADA, icon: Globe, color: "#6b7280" },
        ].map(s => (
          <div key={s.label} className="relative rounded-2xl border border-border/20 bg-card/80 backdrop-blur-xl p-4 overflow-hidden group hover:border-border/40 transition-colors">
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent to-transparent" style={{ backgroundImage: `linear-gradient(to right, transparent, ${s.color}40, transparent)` }} />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-semibold mt-1.5">{s.label}</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          { key: null as StatusFilter, label: "Todas" },
          { key: "NOVA" as StatusFilter, label: "Livres" },
          { key: "USANDO" as StatusFilter, label: "Em uso" },
          { key: "USADA" as StatusFilter, label: "Usadas" },
          { key: "INVALID" as StatusFilter, label: "Inválidas" },
        ]).map(f => (
          <button
            key={f.label}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              statusFilter === f.key
                ? "bg-primary/10 text-primary border-primary/20 shadow-sm"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Add form — premium */}
      <div className="relative rounded-2xl border border-border/20 bg-card/80 backdrop-blur-xl overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="p-5 space-y-4">
          <label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Adicionar proxy</label>
          <div className="flex gap-2">
            <Input
              placeholder="192.168.0.1:8080:user:senha"
              value={pasteInput}
              onChange={(e) => handlePasteInput(e.target.value)}
              className="font-mono text-xs flex-1 h-10 rounded-xl bg-muted/10 border-border/15"
            />
            <Button onClick={handleAdd} size="sm" className="gap-1.5 text-xs h-10 px-4 rounded-xl shrink-0 shadow-md">
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { label: "Host", placeholder: "192.168.0.1", key: "host" as const },
              { label: "Porta", placeholder: "8080", key: "port" as const },
              { label: "Usuário", placeholder: "user", key: "username" as const },
              { label: "Senha", placeholder: "senha", key: "password" as const },
            ].map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-[10px] font-semibold text-muted-foreground/50 uppercase">{f.label}</Label>
                <Input
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="h-9 text-xs font-mono rounded-xl bg-muted/10 border-border/15"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2.5 flex-wrap rounded-xl bg-destructive/5 border border-destructive/15 px-4 py-2.5">
          <span className="text-xs text-muted-foreground font-medium">{selectedIds.size} selecionada(s)</span>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive border-destructive/20 hover:bg-destructive/10 rounded-lg" onClick={() => deleteMultipleMutation.mutate(Array.from(selectedIds))}>
            <Trash2 className="w-3 h-3" /> Remover
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive border-destructive/20 hover:bg-destructive/10 rounded-lg" onClick={() => setClearAllConfirmOpen(true)}>
            Limpar tudo
          </Button>

          <Dialog open={clearAllConfirmOpen} onOpenChange={setClearAllConfirmOpen}>
            <DialogContent className="sm:max-w-[340px] p-0 bg-card/95 backdrop-blur-2xl border-border/10 overflow-hidden rounded-2xl shadow-2xl">
              <div className="px-6 pt-6 pb-4">
                <DialogHeader>
                  <DialogTitle className="text-sm font-bold flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                    </div>
                    Confirmar remoção
                  </DialogTitle>
                </DialogHeader>
              </div>
              <div className="px-6 pb-4">
                <p className="text-xs text-muted-foreground leading-relaxed">Todas as proxies livres serão removidas. Proxies vinculadas a instâncias serão preservadas.</p>
              </div>
              <div className="flex gap-2 px-6 py-4 border-t border-border/10 bg-muted/5">
                <Button variant="outline" size="sm" onClick={() => setClearAllConfirmOpen(false)} className="flex-1 h-9 rounded-xl text-xs font-semibold border-border/15">Cancelar</Button>
                <Button variant="destructive" size="sm" onClick={() => { deleteMultipleMutation.mutate(filtered.map((p: any) => p.id)); setClearAllConfirmOpen(false); }} className="flex-1 h-9 rounded-xl text-xs font-semibold shadow-md">Confirmar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Proxy table — premium */}
      <div className="relative rounded-2xl border border-border/20 bg-card/80 backdrop-blur-xl overflow-hidden" ref={tableRef}>
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/10">
          <h3 className="text-sm font-bold text-foreground">Proxies ({filtered.length})</h3>
          {filtered.length > 0 && (
            <button onClick={selectAll} className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors">
              {selectedIds.size === filtered.length ? "Desmarcar" : "Selecionar tudo"}
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Globe className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground/50 font-medium">Nenhuma proxy encontrada</p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/10 bg-muted/5">
                  <TableHead className="w-8 px-3"></TableHead>
                  <TableHead className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/50">#</TableHead>
                  <TableHead className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/50">Proxy</TableHead>
                  <TableHead className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/50">Auth</TableHead>
                  <TableHead className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/50">Status</TableHead>
                  <TableHead className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/50">Instância</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((proxy: any) => {
                  const isSelected = selectedIds.has(proxy.id);
                  const linkedDevice = deviceByProxy[proxy.id];
                  return (
                    <TableRow key={proxy.id} className={`border-b border-border/10 transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/5"}`}>
                      <TableCell className="px-3">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(proxy.id)} />
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground/30 font-mono tabular-nums">
                        {proxy.displayId}
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-semibold text-foreground font-mono">{proxy.host}:{proxy.port}</p>
                      </TableCell>
                      <TableCell>
                        {proxy.username ? (
                          <p className="text-[11px] text-muted-foreground/60 font-mono truncate max-w-[120px]" title={`${proxy.username}:${proxy.password}`}>
                            {proxy.username}:{"•".repeat(Math.min(proxy.password?.length || 4, 4))}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/20">—</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={proxy.proxyStatus}
                          onValueChange={(value) => updateStatusMutation.mutate({ id: proxy.id, status: value as any })}
                        >
                          <SelectTrigger className="h-6 w-auto gap-1 rounded-full !border-0 bg-transparent px-0 text-[10px] !shadow-none !ring-0 !ring-offset-0 !outline-none [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-40">
                            {getStatusBadge(proxy.proxyStatus)}
                          </SelectTrigger>
                          <SelectContent className="min-w-[100px] bg-popover z-50">
                            <SelectItem value="NOVA" className="text-xs">Livre</SelectItem>
                            <SelectItem value="USANDO" className="text-xs">Em uso</SelectItem>
                            <SelectItem value="USADA" className="text-xs">Usada</SelectItem>
                            <SelectItem value="INVALID" className="text-xs">Inválida</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {linkedDevice ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-muted/30 flex items-center justify-center overflow-hidden shrink-0 border border-border/10">
                              {linkedDevice.profile_picture ? (
                                <img src={linkedDevice.profile_picture} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Link2 className="w-3 h-3 text-muted-foreground/40" />
                              )}
                            </div>
                            <span className="text-[11px] text-foreground/70 truncate max-w-[120px]">
                              {linkedDevice.profile_name || linkedDevice.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/20">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isSelected && (
                          <button
                            onClick={() => deleteMultipleMutation.mutate([proxy.id])}
                            className="text-destructive/40 hover:text-destructive transition-colors"
                            title="Remover"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Proxy;
