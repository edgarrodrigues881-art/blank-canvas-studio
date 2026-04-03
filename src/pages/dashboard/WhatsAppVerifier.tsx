import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search, Download, Loader2, Smartphone, Copy,
  CheckCircle2, XCircle, AlertTriangle, Phone, Upload
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface VerifyResult {
  phone: string;
  status: "success" | "no_whatsapp" | "error";
  detail: string;
  checked_at: string;
}

function cleanAndDeduplicatePhones(raw: string): string[] {
  const lines = raw.split(/[\n,;]+/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    // Remove everything except digits
    let cleaned = line.replace(/[^0-9]/g, "");
    if (!cleaned || cleaned.length < 8) continue;

    // Add Brazil country code if missing
    if (cleaned.length >= 10 && cleaned.length <= 11 && !cleaned.startsWith("55")) {
      cleaned = "55" + cleaned;
    }

    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }

  return result;
}

export default function WhatsAppVerifier() {
  const [selectedDevice, setSelectedDevice] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [results, setResults] = useState<VerifyResult[]>([]);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });

  const { data: devices = [] } = useQuery({
    queryKey: ["devices-for-verifier"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status, uazapi_base_url")
        .not("uazapi_base_url", "is", null)
        .order("name");
      return (data || []).filter(d =>
        ["Ready", "Connected", "connected", "authenticated", "open", "active"].includes(d.status)
      );
    },
    staleTime: 30_000,
  });

  const phones = useMemo(() => cleanAndDeduplicatePhones(rawInput), [rawInput]);

  const stats = useMemo(() => {
    const s = { success: 0, no_whatsapp: 0, error: 0 };
    for (const r of results) s[r.status]++;
    return s;
  }, [results]);

  const handleFileImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.csv";
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const text = await file.text();
      setRawInput(prev => (prev ? prev + "\n" : "") + text);
      toast.success(`Arquivo "${file.name}" importado`);
    };
    input.click();
  }, []);

  const handleVerify = async () => {
    if (!selectedDevice) { toast.warning("Selecione uma instância"); return; }
    if (phones.length === 0) { toast.warning("Nenhum número válido encontrado"); return; }

    setVerifying(true);
    setResults([]);
    setProgress({ processed: 0, total: phones.length });

    const BATCH_SIZE = 50; // Send in batches to the edge function
    const allResults: VerifyResult[] = [];

    try {
      for (let i = 0; i < phones.length; i += BATCH_SIZE) {
        const batch = phones.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase.functions.invoke("verify-whatsapp-numbers", {
          body: { device_id: selectedDevice, phones: batch },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const batchResults = data?.results || [];
        allResults.push(...batchResults);
        setResults([...allResults]);
        setProgress({ processed: Math.min(i + BATCH_SIZE, phones.length), total: phones.length });
      }

      toast.success(`Verificação concluída: ${allResults.filter(r => r.status === "success").length} números com WhatsApp`);
    } catch (err: any) {
      toast.error(err?.message || "Erro na verificação");
    } finally {
      setVerifying(false);
    }
  };

  const validPhones = useMemo(() => results.filter(r => r.status === "success"), [results]);

  const copyValid = useCallback(() => {
    const text = validPhones.map(r => r.phone).join("\n");
    navigator.clipboard.writeText(text);
    toast.success(`${validPhones.length} números copiados!`);
  }, [validPhones]);

  const triggerDownload = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }, []);

  const exportCSV = useCallback(() => {
    const header = "Número,Status,Detalhe,Verificado em\n";
    const rows = results.map(r => `${r.phone},${r.status},${r.detail},${r.checked_at}`).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `verificacao_whatsapp_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success("CSV exportado!");
  }, [results, triggerDownload]);

  const exportValidOnly = useCallback(() => {
    const header = "Número\n";
    const rows = validPhones.map(r => r.phone).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `numeros_validos_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success("Números válidos exportados!");
  }, [validPhones, triggerDownload]);

  const statusBadge = (status: VerifyResult["status"]) => {
    switch (status) {
      case "success":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1"><CheckCircle2 className="w-3 h-3" /> WhatsApp</Badge>;
      case "no_whatsapp":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1"><XCircle className="w-3 h-3" /> Sem WhatsApp</Badge>;
      case "error":
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1"><AlertTriangle className="w-3 h-3" /> Erro</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Phone className="w-6 h-6 text-primary" />
          Verificador de WhatsApp
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Verifique quais números possuem WhatsApp ativo antes de disparar
        </p>
      </div>

      {/* Config */}
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Device selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Instância</label>
            <Select value={selectedDevice} onValueChange={setSelectedDevice}>
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Selecione uma instância conectada" />
              </SelectTrigger>
              <SelectContent>
                {devices.map(d => (
                  <SelectItem key={d.id} value={d.id}>
                    <span className="flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5" />
                      {d.name} {d.number ? `(${d.number})` : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Input area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                Números para verificar
              </label>
              <span className="text-xs text-muted-foreground">
                {phones.length} número{phones.length !== 1 ? "s" : ""} válido{phones.length !== 1 ? "s" : ""}
              </span>
            </div>
            <Textarea
              placeholder={"Cole os números aqui, um por linha:\n5511999999999\n5521988888888\n55319777777777"}
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              className="min-h-[160px] bg-background/50 font-mono text-sm"
              disabled={verifying}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFileImport}
              disabled={verifying}
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Importar Lista
            </Button>
            <Button
              onClick={handleVerify}
              disabled={verifying || phones.length === 0 || !selectedDevice}
              className="ml-auto"
            >
              {verifying ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-1.5" />
              )}
              {verifying ? "Verificando..." : "Verificar Números"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {verifying && (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progresso</span>
              <span className="text-foreground font-medium">
                {progress.processed} / {progress.total}
              </span>
            </div>
            <Progress value={progress.total > 0 ? (progress.processed / progress.total) * 100 : 0} className="h-2" />
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="text-emerald-400">✓ {stats.success} válidos</span>
              <span className="text-red-400">✗ {stats.no_whatsapp} sem WA</span>
              <span className="text-amber-400">⚠ {stats.error} erros</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results.length > 0 && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Resultados ({results.length})
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyValid}
                  disabled={validPhones.length === 0}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copiar Válidos ({validPhones.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportValidOnly}
                  disabled={validPhones.length === 0}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Exportar Válidos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCSV}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Exportar Tudo
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border border-border/50 p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{results.length}</div>
                <div className="text-xs text-muted-foreground">Total Verificado</div>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">{stats.success}</div>
                <div className="text-xs text-emerald-400/70">Com WhatsApp</div>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-center">
                <div className="text-2xl font-bold text-red-400">{stats.no_whatsapp}</div>
                <div className="text-xs text-red-400/70">Sem WhatsApp</div>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">{stats.error}</div>
                <div className="text-xs text-amber-400/70">Erros</div>
              </div>
            </div>

            {/* Results table */}
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Número</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Detalhe</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Verificado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {results.slice(0, 500).map((r, i) => (
                      <tr key={i} className="hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-foreground">{r.phone}</td>
                        <td className="px-4 py-2.5">{statusBadge(r.status)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{r.detail}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs hidden lg:table-cell">
                          {new Date(r.checked_at).toLocaleTimeString("pt-BR")}
                        </td>
                      </tr>
                    ))}
                    {results.length > 500 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-center text-sm text-muted-foreground">
                          Exibindo 500 de {results.length} resultados. Use "Exportar Tudo" para ver todos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
