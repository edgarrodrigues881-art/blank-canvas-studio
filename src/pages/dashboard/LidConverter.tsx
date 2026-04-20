import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { ArrowRightLeft, Copy, Download, Eraser, History, Loader2, RotateCcw, Eye, Filter, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type EntryType = "lid" | "jid" | "number";

interface Row {
  original: string;
  type: EntryType;
  number: string;
  jid: string;
  valid: boolean;
  error?: string;
}

interface CampaignRow {
  id: string;
  name: string | null;
  type: "verificacao" | "adicao";
  status: string;
  total: number;
  processed: number;
  valid_count: number;
  invalid_count: number;
  created_at: string;
}

const LID_INPUT_STORAGE_KEY = "lid-converter:input";

export default function LidConverter() {
  const [input, setInput] = useState<string>(() => {
    try { return localStorage.getItem(LID_INPUT_STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<"convert" | "history">("convert");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autosave do textarea (debounced para performance com listas grandes)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (input) localStorage.setItem(LID_INPUT_STORAGE_KEY, input);
        else localStorage.removeItem(LID_INPUT_STORAGE_KEY);
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [input]);

  // history
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "verificacao" | "adicao">("all");
  const [openCampaign, setOpenCampaign] = useState<CampaignRow | null>(null);
  const [openResults, setOpenResults] = useState<Row[]>([]);
  const [openLoading, setOpenLoading] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("contact_processing_campaigns")
        .select("id,name,type,status,total,processed,valid_count,invalid_count,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setCampaigns((data || []) as CampaignRow[]);
    } catch (err) {
      console.error("[lid-converter] load campaigns", err);
      toast.error("Falha ao carregar histórico");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "history") loadCampaigns();
  }, [tab, loadCampaigns]);

  const handleConvert = async () => {
    const allLines = Array.from(
      new Set(
        input
          .split(/[\n,;]+/)
          .map((l) => l.trim())
          .filter(Boolean),
      ),
    );

    if (allLines.length === 0) {
      toast.error("Cole ao menos um contato.");
      return;
    }

    setLoading(true);
    try {
      // Skip já-validados (cache de campanhas anteriores) — busca números/jids/originals já marcados como válidos.
      const { data: alreadyData } = await supabase
        .from("contact_processing_results")
        .select("original,number,jid,valid,detected_type")
        .eq("valid", true)
        .in("original", allLines);

      const cached = new Map<string, Row>();
      (alreadyData || []).forEach((r: any) => {
        cached.set(String(r.original), {
          original: String(r.original),
          type: (r.detected_type as EntryType) ?? "number",
          number: r.number ? String(r.number) : "—",
          jid: r.jid ? String(r.jid) : "—",
          valid: true,
        });
      });

      const toResolve = allLines.filter((l) => !cached.has(l));
      let resolvedRows: Row[] = [];

      if (toResolve.length > 0) {
        const { data, error } = await supabase.functions.invoke("resolve-contact", {
          body: { inputs: toResolve },
        });
        if (error) throw error;
        const results = Array.isArray(data?.results) ? data.results : [];
        resolvedRows = results.map((r: any) => ({
          original: String(r?.original ?? ""),
          type: (r?.type as EntryType) ?? "number",
          number: r?.number ? String(r.number) : "—",
          jid: r?.jid ? String(r.jid) : "—",
          valid: !!r?.valid,
          error: r?.error,
        }));
      }

      // Mantém ordem original
      const merged: Row[] = allLines.map((l) => cached.get(l) || resolvedRows.find((r) => r.original === l) || {
        original: l, type: "number", number: "—", jid: "—", valid: false, error: "no_result",
      });

      setRows(merged);

      // Salva campanha + resultados
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (uid) {
        const validCount = merged.filter((m) => m.valid).length;
        const { data: camp, error: campErr } = await supabase
          .from("contact_processing_campaigns")
          .insert({
            user_id: uid,
            type: "verificacao",
            status: "completed",
            total: merged.length,
            processed: merged.length,
            valid_count: validCount,
            invalid_count: merged.length - validCount,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            name: `Conversão ${new Date().toLocaleString("pt-BR")}`,
          })
          .select("id")
          .single();
        if (!campErr && camp?.id) {
          const payload = merged.map((r) => ({
            campaign_id: camp.id,
            user_id: uid,
            original: r.original,
            detected_type: r.type,
            number: r.number === "—" ? null : r.number,
            jid: r.jid === "—" ? null : r.jid,
            valid: r.valid,
            status: r.valid ? "valid" : "invalid",
            error_message: r.error || null,
          }));
          if (payload.length > 0) {
            await supabase.from("contact_processing_results").insert(payload);
          }
        }
      }

      const validCount = merged.filter((m) => m.valid).length;
      const cachedCount = cached.size;
      toast.success(
        cachedCount > 0
          ? `${merged.length} processados · ${validCount} válidos (${cachedCount} reaproveitados)`
          : `${merged.length} processados · ${validCount} válidos`,
      );
    } catch (err) {
      console.error("[lid-converter] convert error", err);
      toast.error(err instanceof Error ? err.message : "Falha ao processar contatos");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setInput("");
    setRows([]);
  };

  // Extrai tokens (números, JIDs, LIDs) de strings arbitrárias
  const extractTokens = (text: string): string[] => {
    const out: string[] = [];
    const re = /(\d+@(?:s\.whatsapp\.net|c\.us|lid|g\.us))|(\+?\d[\d\s().-]{6,}\d)/gi;
    const matches = text.match(re);
    if (matches) {
      for (const m of matches) {
        const cleaned = m.includes("@") ? m.trim() : m.replace(/[\s().-]/g, "");
        if (cleaned.length >= 6) out.push(cleaned);
      }
    }
    return out;
  };

  const processCell = (cell: unknown, collected: string[]) => {
    if (cell == null) return;
    const s = String(cell).trim();
    if (!s) return;
    const tokens = extractTokens(s);
    if (tokens.length > 0) collected.push(...tokens);
    else {
      const digits = s.replace(/\D/g, "");
      if (digits.length >= 6) collected.push(digits);
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const name = file.name.toLowerCase();
      const isExcel = /\.xlsx?$/.test(name);
      const collected: string[] = [];

      if (isExcel) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          const rowsData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
          for (const row of rowsData) for (const cell of row) processCell(cell, collected);
        }
      } else {
        const text = await file.text();
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          const cells = line.split(/[,;\t]/);
          for (const cell of cells) processCell(cell.replace(/^["']|["']$/g, ""), collected);
        }
      }

      if (collected.length === 0) {
        toast.error("Nenhum contato encontrado no arquivo.");
        return;
      }

      // Mantém entradas existentes + dedup global
      const existing = input.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
      const seen = new Set<string>(existing);
      const merged: string[] = [...existing];
      let added = 0;
      for (const c of collected) {
        if (!seen.has(c)) { seen.add(c); merged.push(c); added++; }
      }
      setInput(merged.join("\n"));
      const dup = collected.length - added;
      toast.success(`${added} contatos importados${dup > 0 ? ` · ${dup} duplicados ignorados` : ""}`);
    } catch (err) {
      console.error("[lid-converter] import error", err);
      toast.error("Falha ao ler arquivo.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const validNumbers = useMemo(
    () => rows.filter((r) => r.valid && r.number !== "—").map((r) => r.number),
    [rows],
  );
  const validJids = useMemo(
    () => rows.filter((r) => r.valid && r.jid !== "—").map((r) => r.jid),
    [rows],
  );

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta); return ok;
    } catch { return false; }
  };

  const handleCopyValid = async () => {
    if (validNumbers.length === 0) return toast.error("Nenhum número válido.");
    const ok = await copyToClipboard(validNumbers.join("\n"));
    ok ? toast.success(`${validNumbers.length} números copiados`) : toast.error("Falha ao copiar");
  };
  const handleCopyValidJids = async () => {
    if (validJids.length === 0) return toast.error("Nenhum JID válido.");
    const ok = await copyToClipboard(validJids.join("\n"));
    ok ? toast.success(`${validJids.length} JIDs copiados`) : toast.error("Falha ao copiar");
  };

  const exportRowsToCsv = (data: Row[], filename: string) => {
    const header = "original,tipo,numero,jid,status\n";
    const body = data.map((r) =>
      `"${r.original.replace(/"/g, '""')}","${r.type}","${r.number}","${r.jid}","${r.valid ? "Válido" : "Inválido"}"`,
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    if (rows.length === 0) return toast.error("Nada para exportar.");
    exportRowsToCsv(rows, `lid-converter-${Date.now()}.csv`);
    toast.success("Lista exportada");
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const valid = rows.filter((r) => r.valid).length;
    const lid = rows.filter((r) => r.type === "lid").length;
    return { total, valid, invalid: total - valid, lid };
  }, [rows]);

  const filteredCampaigns = useMemo(
    () => filterType === "all" ? campaigns : campaigns.filter((c) => c.type === filterType),
    [campaigns, filterType],
  );

  const openCampaignDetails = async (c: CampaignRow) => {
    setOpenCampaign(c);
    setOpenLoading(true);
    setOpenResults([]);
    try {
      const { data, error } = await supabase
        .from("contact_processing_results")
        .select("original,detected_type,number,jid,valid,error_message")
        .eq("campaign_id", c.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const mapped: Row[] = (data || []).map((r: any) => ({
        original: String(r.original),
        type: (r.detected_type as EntryType) ?? "number",
        number: r.number ? String(r.number) : "—",
        jid: r.jid ? String(r.jid) : "—",
        valid: !!r.valid,
        error: r.error_message || undefined,
      }));
      setOpenResults(mapped);
    } catch (err) {
      toast.error("Falha ao carregar resultados");
    } finally {
      setOpenLoading(false);
    }
  };

  const handleReuseList = (results: Row[]) => {
    const lines = results.map((r) => r.original).filter(Boolean);
    setInput(lines.join("\n"));
    setOpenCampaign(null);
    setTab("convert");
    toast.success(`${lines.length} contatos carregados na entrada`);
  };

  const handleCopyValidFromCampaign = async (results: Row[]) => {
    const nums = results.filter((r) => r.valid && r.number !== "—").map((r) => r.number);
    if (nums.length === 0) return toast.error("Nenhum número válido nesta campanha.");
    const ok = await copyToClipboard(nums.join("\n"));
    ok ? toast.success(`${nums.length} números copiados`) : toast.error("Falha ao copiar");
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <ArrowRightLeft className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conversor de @LID</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Converta LIDs, JIDs e números para o formato padrão do WhatsApp e mantenha histórico das listas processadas.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="convert"><ArrowRightLeft className="h-4 w-4 mr-1" /> Converter</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1" /> Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="convert" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entrada</CardTitle>
              <CardDescription>
                Um contato por linha. Aceita: <code>5511999998888</code>, <code>5511999998888@s.whatsapp.net</code>,{" "}
                <code>123456789@lid</code>. Contatos já validados anteriormente são reaproveitados automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`5511999998888\n5511988887777@s.whatsapp.net\n123456789@lid`}
                rows={8}
                className="font-mono text-sm"
                disabled={loading}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleConvert} disabled={loading || !input.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                  {loading ? "Processando..." : "Converter"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || importing}
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {importing ? "Importando..." : "Importar lista"}
                </Button>
                <Button variant="outline" onClick={handleClear} disabled={loading || (!input && rows.length === 0)}>
                  <Eraser className="h-4 w-4" />
                  Limpar
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv,.xlsx,.xls,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportFile(f);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {(loading || rows.length > 0) && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Resultados</CardTitle>
                    <CardDescription>
                      {loading ? "Resolvendo contatos via backend..." : "Resumo do processamento"}
                    </CardDescription>
                  </div>
                  {!loading && rows.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={handleCopyValid}>
                        <Copy className="h-4 w-4" /> Copiar números válidos ({validNumbers.length})
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleCopyValidJids}>
                        <Copy className="h-4 w-4" /> Copiar JIDs válidos ({validJids.length})
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleExport}>
                        <Download className="h-4 w-4" /> Exportar CSV
                      </Button>
                    </div>
                  )}
                </div>

                {!loading && rows.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                    <StatBox label="Total" value={stats.total} />
                    <StatBox label="Válidos" value={stats.valid} variant="emerald" />
                    <StatBox label="Inválidos" value={stats.invalid} variant="destructive" />
                    <StatBox label="LIDs" value={stats.lid} />
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-sm">Resolvendo via Uazapi...</span>
                  </div>
                ) : (
                  <ResultsTable rows={rows} />
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Histórico de Campanhas</CardTitle>
                  <CardDescription>Visualize, filtre e reaproveite listas processadas anteriormente.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="verificacao">Verificação</SelectItem>
                      <SelectItem value="adicao">Adição</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando histórico...
                </div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  Nenhuma campanha encontrada.
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead className="w-[120px]">Tipo</TableHead>
                        <TableHead className="w-[100px]">Total</TableHead>
                        <TableHead className="w-[100px]">Válidos</TableHead>
                        <TableHead className="w-[100px]">Inválidos</TableHead>
                        <TableHead className="w-[160px]">Data</TableHead>
                        <TableHead className="w-[120px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCampaigns.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm">{c.name || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="capitalize">{c.type}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{c.total}</TableCell>
                          <TableCell className="text-sm text-emerald-600 dark:text-emerald-400">{c.valid_count}</TableCell>
                          <TableCell className="text-sm text-destructive">{c.invalid_count}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(c.created_at).toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => openCampaignDetails(c)}>
                              <Eye className="h-4 w-4" /> Abrir
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detalhes de Campanha */}
      <Dialog open={!!openCampaign} onOpenChange={(o) => !o && setOpenCampaign(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{openCampaign?.name || "Campanha"}</DialogTitle>
            <DialogDescription>
              {openCampaign && (
                <>
                  {openCampaign.total} contatos · {openCampaign.valid_count} válidos · {openCampaign.invalid_count} inválidos ·{" "}
                  {new Date(openCampaign.created_at).toLocaleString("pt-BR")}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {openLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => handleReuseList(openResults)}>
                  <RotateCcw className="h-4 w-4" /> Usar lista novamente
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleCopyValidFromCampaign(openResults)}>
                  <Copy className="h-4 w-4" /> Copiar números válidos
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportRowsToCsv(openResults, `campanha-${openCampaign?.id}.csv`)}>
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>
              <ResultsTable rows={openResults} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatBox({ label, value, variant }: { label: string; value: number; variant?: "emerald" | "destructive" }) {
  const cls =
    variant === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/10"
      : variant === "destructive"
        ? "border-destructive/30 bg-destructive/10"
        : "bg-muted/30";
  const labelCls =
    variant === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : variant === "destructive"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className={`text-[10px] uppercase tracking-wide ${labelCls}`}>{label}</div>
      <div className={`text-lg font-semibold ${labelCls}`}>{value}</div>
    </div>
  );
}

function ResultsTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-6">Sem resultados.</div>;
  }
  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Original</TableHead>
            <TableHead className="w-[100px]">Tipo</TableHead>
            <TableHead>Número</TableHead>
            <TableHead>JID</TableHead>
            <TableHead className="w-[110px]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow
              key={`${r.original}-${i}`}
              className={r.valid ? "bg-emerald-500/[0.04]" : "bg-destructive/[0.04]"}
            >
              <TableCell className="font-mono text-xs break-all max-w-[200px]">{r.original}</TableCell>
              <TableCell>
                <Badge variant={r.type === "lid" ? "destructive" : "secondary"} className="text-[10px] uppercase">
                  {r.type === "number" ? "Número" : r.type}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{r.number}</TableCell>
              <TableCell className="font-mono text-xs break-all max-w-[220px]">{r.jid}</TableCell>
              <TableCell>
                {r.valid ? (
                  <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/30">
                    Válido
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-destructive border-destructive/40" title={r.error}>
                    Inválido
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
