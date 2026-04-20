import { useState, useMemo } from "react";
import { ArrowRightLeft, Copy, Download, Eraser, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type EntryType = "LID" | "JID" | "Numero" | "Invalido";

interface Row {
  original: string;
  type: EntryType;
  number: string;
  jid: string;
  valid: boolean;
}

const PRIVATE_JID_SUFFIX = "@s.whatsapp.net";
const LID_SUFFIX = "@lid";
const GROUP_SUFFIX = "@g.us";

function onlyDigits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function classify(raw: string): { type: EntryType; digits: string } {
  const value = String(raw || "").trim();
  if (!value) return { type: "Invalido", digits: "" };

  if (value.toLowerCase().endsWith(LID_SUFFIX)) {
    return { type: "LID", digits: onlyDigits(value.split("@")[0]) };
  }
  if (value.toLowerCase().endsWith(PRIVATE_JID_SUFFIX) || value.toLowerCase().endsWith(GROUP_SUFFIX)) {
    return { type: "JID", digits: onlyDigits(value.split("@")[0]) };
  }
  if (value.includes("@")) {
    return { type: "Invalido", digits: onlyDigits(value.split("@")[0]) };
  }
  const digits = onlyDigits(value);
  return { type: digits ? "Numero" : "Invalido", digits };
}

function isValidDigits(digits: string): boolean {
  // Aceita números de 10 a 15 dígitos (E.164-ish), padrão internacional
  return digits.length >= 10 && digits.length <= 15;
}

function convertLine(raw: string): Row {
  const { type, digits } = classify(raw);

  // LID não carrega o número real do WhatsApp — não é convertível para um número válido
  if (type === "LID") {
    return {
      original: raw,
      type: "LID",
      number: digits || "—",
      jid: digits ? `${digits}${PRIVATE_JID_SUFFIX}` : "—",
      valid: false,
    };
  }

  if (type === "Invalido" || !isValidDigits(digits)) {
    return {
      original: raw,
      type: type === "Invalido" ? "Invalido" : type,
      number: digits || "—",
      jid: "—",
      valid: false,
    };
  }

  return {
    original: raw,
    type,
    number: digits,
    jid: `${digits}${PRIVATE_JID_SUFFIX}`,
    valid: true,
  };
}

export default function LidConverter() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const handleConvert = () => {
    setLoading(true);
    try {
      const lines = input
        .split(/[\n,;]+/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        toast.error("Cole ao menos um contato.");
        return;
      }

      const seen = new Set<string>();
      const result: Row[] = [];
      for (const line of lines) {
        const row = convertLine(line);
        const key = `${row.type}:${row.original}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(row);
      }
      setRows(result);
      toast.success(`${result.length} entradas processadas`);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setInput("");
    setRows([]);
  };

  const validNumbers = useMemo(() => rows.filter((r) => r.valid).map((r) => r.number), [rows]);

  const handleCopyValid = async () => {
    if (validNumbers.length === 0) {
      toast.error("Nenhum número válido para copiar.");
      return;
    }
    await navigator.clipboard.writeText(validNumbers.join("\n"));
    toast.success(`${validNumbers.length} números copiados`);
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
    const lid = rows.filter((r) => r.type === "LID").length;
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
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleConvert} disabled={loading || !input.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
              Converter
            </Button>
            <Button variant="outline" onClick={handleClear} disabled={!input && rows.length === 0}>
              <Eraser className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Resultados</CardTitle>
              <CardDescription>
                {stats.total} total · <span className="text-emerald-500 font-medium">{stats.valid} válidos</span> ·{" "}
                <span className="text-destructive font-medium">{stats.invalid} inválidos</span>
                {stats.lid > 0 && <> · {stats.lid} LIDs (não convertíveis)</>}
              </CardDescription>
            </div>
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
          </CardHeader>
          <CardContent>
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
                    <TableRow key={`${r.original}-${i}`}>
                      <TableCell className="font-mono text-xs break-all max-w-[200px]">{r.original}</TableCell>
                      <TableCell>
                        <Badge
                          variant={r.type === "LID" ? "destructive" : r.type === "Invalido" ? "outline" : "secondary"}
                          className="text-[10px]"
                        >
                          {r.type === "Numero" ? "Número" : r.type === "Invalido" ? "Inválido" : r.type}
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
                          <Badge variant="outline" className="text-destructive border-destructive/40">
                            Inválido
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {stats.lid > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                ⚠️ Identificadores <strong>@lid</strong> são opacos e não permitem recuperar o número real do WhatsApp diretamente.
                Eles são marcados como inválidos para envio.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
