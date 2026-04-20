import { useState, useMemo } from "react";
import { ArrowRightLeft, Copy, Download, Eraser, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

export default function LidConverter() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const handleConvert = async () => {
    const lines = Array.from(
      new Set(
        input
          .split(/[\n,;]+/)
          .map((l) => l.trim())
          .filter(Boolean),
      ),
    );

    if (lines.length === 0) {
      toast.error("Cole ao menos um contato.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-contact", {
        body: { inputs: lines },
      });

      if (error) throw error;

      const results = Array.isArray(data?.results) ? data.results : [];
      const mapped: Row[] = results.map((r: any) => ({
        original: String(r?.original ?? ""),
        type: (r?.type as EntryType) ?? "number",
        number: r?.number ? String(r.number) : "—",
        jid: r?.jid ? String(r.jid) : "—",
        valid: !!r?.valid,
        error: r?.error,
      }));

      setRows(mapped);
      const validCount = mapped.filter((m) => m.valid).length;
      toast.success(`${mapped.length} processados · ${validCount} válidos`);
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
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopyValid = async () => {
    if (validNumbers.length === 0) {
      toast.error("Nenhum número válido para copiar.");
      return;
    }
    const ok = await copyToClipboard(validNumbers.join("\n"));
    if (ok) toast.success(`${validNumbers.length} números copiados`);
    else toast.error("Falha ao copiar para a área de transferência");
  };

  const handleCopyValidJids = async () => {
    if (validJids.length === 0) {
      toast.error("Nenhum JID válido para copiar.");
      return;
    }
    const ok = await copyToClipboard(validJids.join("\n"));
    if (ok) toast.success(`${validJids.length} JIDs copiados`);
    else toast.error("Falha ao copiar para a área de transferência");
  };

  const handleExport = () => {
    if (rows.length === 0) {
      toast.error("Nada para exportar.");
      return;
    }
    const header = "original,tipo,numero,jid,status\n";
    const body = rows
      .map(
        (r) =>
          `"${r.original.replace(/"/g, '""')}","${r.type}","${r.number}","${r.jid}","${r.valid ? "Válido" : "Inválido"}"`,
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lid-converter-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Lista exportada");
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const valid = rows.filter((r) => r.valid).length;
    const lid = rows.filter((r) => r.type === "lid").length;
    return { total, valid, invalid: total - valid, lid };
  }, [rows]);

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <ArrowRightLeft className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conversor de @LID</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cole uma lista de contatos (LID, JID ou número) e converta para o formato JID padrão do WhatsApp.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entrada</CardTitle>
          <CardDescription>
            Um contato por linha. Aceita formatos: <code>5511999998888</code>, <code>5511999998888@s.whatsapp.net</code>,{" "}
            <code>123456789@lid</code>.
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
            <Button variant="outline" onClick={handleClear} disabled={loading || (!input && rows.length === 0)}>
              <Eraser className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {(loading || rows.length > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Resultados</CardTitle>
              <CardDescription>
                {loading ? (
                  "Resolvendo contatos via backend..."
                ) : (
                  <>
                    {stats.total} total ·{" "}
                    <span className="text-emerald-500 font-medium">{stats.valid} válidos</span> ·{" "}
                    <span className="text-destructive font-medium">{stats.invalid} inválidos</span>
                    {stats.lid > 0 && <> · {stats.lid} LIDs</>}
                  </>
                )}
              </CardDescription>
            </div>
            {!loading && rows.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyValid}>
                  <Copy className="h-4 w-4" />
                  Copiar válidos
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4" />
                  Exportar
                </Button>
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
                          <Badge
                            variant={r.type === "lid" ? "destructive" : "secondary"}
                            className="text-[10px] uppercase"
                          >
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
                            <Badge
                              variant="outline"
                              className="text-destructive border-destructive/40"
                              title={r.error}
                            >
                              Inválido
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {!loading && stats.lid > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                ⚠️ Identificadores <strong>@lid</strong> são resolvidos via Uazapi quando há uma instância conectada.
                Se não houver, ficam marcados como inválidos.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
