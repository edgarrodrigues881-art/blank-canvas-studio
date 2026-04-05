import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Download, MapPin, Phone, Globe, Star, Loader2, Building2, Mail, Clock, Instagram, RefreshCw, Database } from "lucide-react";

const ESTADOS_BR: { sigla: string; nome: string }[] = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "TO", nome: "Tocantins" },
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
  email: string;
  instagram: string;
  facebook: string;
  descricao: string;
  faixaPreco: string;
  permanentementeFechado: boolean;
}

export default function Prospeccao() {
  const [nicho, setNicho] = useState("");
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [cidades, setCidades] = useState<string[]>([]);
  const [loadingCidades, setLoadingCidades] = useState(false);
  const [maxResults, setMaxResults] = useState("50");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProspectResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  // Fetch cities from IBGE API when state changes
  useEffect(() => {
    if (!estado) {
      setCidades([]);
      setCidade("");
      return;
    }

    const fetchCidades = async () => {
      setLoadingCidades(true);
      setCidade("");
      try {
        const res = await fetch(
          `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estado}/municipios?orderBy=nome`
        );
        const data = await res.json();
        setCidades(data.map((c: any) => c.nome));
      } catch {
        toast.error("Erro ao carregar cidades");
        setCidades([]);
      } finally {
        setLoadingCidades(false);
      }
    };

    fetchCidades();
  }, [estado]);

  const handleSearch = async (forceRefresh = false) => {
    if (!nicho.trim() || !estado || !cidade.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const { data, error } = await supabase.functions.invoke("prospeccao", {
        body: { nicho: nicho.trim(), estado, cidade: cidade.trim(), maxResults: Number(maxResults), forceRefresh },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResults(data.results || []);
      setFromCache(!!data.fromCache);
      setCachedAt(data.cachedAt || null);

      if (data.fromCache) {
        toast.success(`${data.total || 0} resultados (do cache — sem gastar créditos!)`);
      } else {
        toast.success(`${data.total || 0} resultados encontrados e salvos no cache`);
      }
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
    const headers = [
      "Nome", "Categoria", "Telefone", "Email", "Website", "Instagram", "Facebook",
      "Endereço", "Avaliação", "Total Avaliações", "Faixa de Preço", "Descrição", "Google Maps"
    ];
    const rows = results.map((r) => [
      r.nome, r.categoria, r.telefone, r.email, r.website, r.instagram, r.facebook,
      r.endereco, r.avaliacao ?? "", r.totalAvaliacoes, r.faixaPreco, r.descricao, r.googleMapsUrl,
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

  const estadoNome = ESTADOS_BR.find(e => e.sigla === estado)?.nome || "";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Prospecção</h1>
          <p className="text-muted-foreground text-sm">
            Busque comércios e negócios por nicho e localização
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
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_BR.map((uf) => (
                    <SelectItem key={uf.sigla} value={uf.sigla}>
                      {uf.nome} ({uf.sigla})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cidade *</Label>
              <Select value={cidade} onValueChange={setCidade} disabled={!estado || loadingCidades}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingCidades ? "Carregando..." : estado ? "Selecione a cidade" : "Selecione o estado primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  {cidades.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1.000</SelectItem>
                  <SelectItem value="2000">2.000</SelectItem>
                  <SelectItem value="5000">5.000</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button onClick={() => handleSearch()} disabled={loading} className="gap-2">
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
              ⏳ A busca pode levar de 30s a vários minutos dependendo da quantidade de resultados...
            </p>
          )}
        </CardContent>
      </Card>

      {searched && !loading && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Resultados ({results.length})
                {fromCache && (
                  <Badge variant="outline" className="ml-2 gap-1 text-xs font-normal">
                    <Database className="h-3 w-3" />
                    Cache {cachedAt ? `(${new Date(cachedAt).toLocaleDateString('pt-BR')})` : ''}
                  </Badge>
                )}
              </CardTitle>
              {fromCache && (
                <Button variant="outline" size="sm" onClick={() => handleSearch(true)} disabled={loading} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Nova busca
                </Button>
              )}
            </div>
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
                      <TableHead>Email</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Avaliação</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Website</TableHead>
                      <TableHead>Redes</TableHead>
                      <TableHead>Maps</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium max-w-[200px]">
                          <div className="truncate">{r.nome}</div>
                          {r.descricao && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={r.descricao}>
                              {r.descricao}
                            </div>
                          )}
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
                        <TableCell>
                          {r.email ? (
                            <a href={`mailto:${r.email}`} className="flex items-center gap-1 text-sm text-primary hover:underline">
                              <Mail className="h-3 w-3" /> {r.email}
                            </a>
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
                        <TableCell className="text-sm">
                          {r.faixaPreco || "—"}
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
                          <div className="flex gap-1">
                            {r.instagram && (
                              <a href={r.instagram} target="_blank" rel="noopener noreferrer" title="Instagram">
                                <Instagram className="h-4 w-4 text-pink-500 hover:text-pink-400" />
                              </a>
                            )}
                            {r.facebook && (
                              <a href={r.facebook} target="_blank" rel="noopener noreferrer" title="Facebook">
                                <Globe className="h-4 w-4 text-blue-500 hover:text-blue-400" />
                              </a>
                            )}
                            {!r.instagram && !r.facebook && "—"}
                          </div>
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
