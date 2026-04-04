import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Download, MapPin, Phone, Globe, Star, Loader2, Building2 } from "lucide-react";

const ESTADOS_BR = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"
];

interface ProspectResult {
  nome: string;
  endereco: string;
  telefone: string;
  website: string;
  avaliacao: number | null;
  totalAvaliacoes: number;
  categoria: string;
  categorias: string[];
  horario: any;
  googleMapsUrl: string;
  imagem: string;
}

export default function Prospeccao() {
  const [nicho, setNicho] = useState("");
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [maxResults, setMaxResults] = useState("50");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProspectResult[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!nicho.trim() || !estado || !cidade.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const { data, error } = await supabase.functions.invoke("prospeccao", {
        body: { nicho: nicho.trim(), estado, cidade: cidade.trim(), maxResults: Number(maxResults) },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResults(data.results || []);
      toast.success(`${data.total || 0} resultados encontrados`);
    } catch (err: any) {
      console.error("Erro na prospecção:", err);
      toast.error(err.message || "Erro ao buscar dados");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!results.length) return;
    const headers = ["Nome", "Endereço", "Telefone", "Website", "Avaliação", "Total Avaliações", "Categoria"];
    const rows = results.map((r) => [
      r.nome, r.endereco, r.telefone, r.website,
      r.avaliacao ?? "", r.totalAvaliacoes, r.categoria,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospeccao_${nicho}_${cidade}_${estado}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Prospecção</h1>
          <p className="text-muted-foreground text-sm">
            Busque comercios e negócios por nicho e localização
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros de Busca</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Nicho / Segmento *</Label>
              <Input
                placeholder="Ex: restaurante, dentista, academia..."
                value={nicho}
                onChange={(e) => setNicho(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Estado *</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_BR.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cidade *</Label>
              <Input
                placeholder="Ex: São Paulo"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Máx. resultados</Label>
              <Select value={maxResults} onValueChange={setMaxResults}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button onClick={handleSearch} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Buscando..." : "Buscar"}
            </Button>
            {results.length > 0 && (
              <Button variant="outline" onClick={exportCSV} className="gap-2">
                <Download className="h-4 w-4" /> Exportar CSV
              </Button>
            )}
          </div>
          {loading && (
            <p className="text-sm text-muted-foreground mt-3">
              ⏳ A busca pode levar de 30s a 2min dependendo da quantidade de resultados...
            </p>
          )}
        </CardContent>
      </Card>

      {searched && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Resultados ({results.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum resultado encontrado para essa busca.
              </p>
            ) : (
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Avaliação</TableHead>
                      <TableHead>Website</TableHead>
                      <TableHead>Maps</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {r.nome}
                        </TableCell>
                        <TableCell>
                          {r.categoria && (
                            <Badge variant="secondary" className="text-xs">
                              {r.categoria}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.telefone ? (
                            <span className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3" /> {r.telefone}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[250px] truncate text-sm">
                          {r.endereco || "—"}
                        </TableCell>
                        <TableCell>
                          {r.avaliacao ? (
                            <span className="flex items-center gap-1 text-sm">
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                              {r.avaliacao.toFixed(1)}
                              <span className="text-muted-foreground text-xs">
                                ({r.totalAvaliacoes})
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {r.website ? (
                            <a
                              href={r.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1 text-sm"
                            >
                              <Globe className="h-3 w-3" /> Ver
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {r.googleMapsUrl ? (
                            <a
                              href={r.googleMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1 text-sm"
                            >
                              <MapPin className="h-3 w-3" /> Abrir
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
