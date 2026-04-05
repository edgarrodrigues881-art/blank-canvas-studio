import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Search, Download, MapPin, Phone, Globe, Star, Loader2, Building2,
  Mail, Instagram, RefreshCw, Database, History, Clock, Coins,
  Copy, Eye, ChevronRight, Target
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import SearchAreaMap from "@/components/prospeccao/SearchAreaMap";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ESTADOS_BR: { sigla: string; nome: string }[] = [
  { sigla: "AC", nome: "Acre" }, { sigla: "AL", nome: "Alagoas" }, { sigla: "AM", nome: "Amazonas" },
  { sigla: "AP", nome: "Amapá" }, { sigla: "BA", nome: "Bahia" }, { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" }, { sigla: "ES", nome: "Espírito Santo" }, { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" }, { sigla: "MG", nome: "Minas Gerais" }, { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MT", nome: "Mato Grosso" }, { sigla: "PA", nome: "Pará" }, { sigla: "PB", nome: "Paraíba" },
  { sigla: "PE", nome: "Pernambuco" }, { sigla: "PI", nome: "Piauí" }, { sigla: "PR", nome: "Paraná" },
  { sigla: "RJ", nome: "Rio de Janeiro" }, { sigla: "RN", nome: "Rio Grande do Norte" }, { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" }, { sigla: "RS", nome: "Rio Grande do Sul" }, { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SE", nome: "Sergipe" }, { sigla: "SP", nome: "São Paulo" }, { sigla: "TO", nome: "Tocantins" },
];

interface ProspectResult {
  nome: string; endereco: string; telefone: string; website: string;
  avaliacao: number | null; totalAvaliacoes: number; categoria: string;
  categorias: string[]; horario: any; googleMapsUrl: string; imagem: string;
  email: string; instagram: string; facebook: string; descricao: string;
  faixaPreco: string; permanentementeFechado: boolean;
}

interface Campaign {
  id: string; name: string; nicho: string; nichos_relacionados: string[];
  estado: string; cidade: string; max_results: number; status: string;
  total_leads: number; credits_used: number; execution_time_ms: number;
  city_radius_km: number | null; created_at: string; completed_at: string | null;
}

interface CampaignLog {
  id: string; phase: string; query_term: string; location_info: string;
  leads_added: number; leads_total: number; credits_spent: number;
  score: number | null; tier: string | null; created_at: string;
}

export default function Prospeccao() {
  const [nicho, setNicho] = useState("");
  const [nichosRelacionados, setNichosRelacionados] = useState("");
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
  const [activeTab, setActiveTab] = useState("busca");
  const [searchLat, setSearchLat] = useState<number | null>(null);
  const [searchLng, setSearchLng] = useState<number | null>(null);
  const [searchRadius, setSearchRadius] = useState(12);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  const [areaConfirmed, setAreaConfirmed] = useState(false);

  const handleAreaChange = useCallback((lat: number, lng: number, radiusKm: number) => {
    setSearchLat(lat);
    setSearchLng(lng);
    setSearchRadius(radiusKm);
    setAreaConfirmed(false);
  }, []);

  const handleAreaConfirm = useCallback((lat: number, lng: number, radiusKm: number) => {
    setSearchLat(lat);
    setSearchLng(lng);
    setSearchRadius(radiusKm);
    setAreaConfirmed(true);
  }, []);

  // Campaign history
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignLogs, setCampaignLogs] = useState<CampaignLog[]>([]);
  const [campaignLeads, setCampaignLeads] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [savingContacts, setSavingContacts] = useState(false);

  // Load credit balance
  const loadCredits = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("prospeccao_credits")
        .select("balance")
        .maybeSingle();
      setCreditBalance(data?.balance ?? 0);
    } catch { setCreditBalance(0); }
  }, []);

  useEffect(() => { loadCredits(); }, [loadCredits]);

  useEffect(() => {
    if (!estado) { setCidades([]); setCidade(""); return; }
    const fetchCidades = async () => {
      setLoadingCidades(true); setCidade("");
      try {
        const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estado}/municipios?orderBy=nome`);
        const data = await res.json();
        setCidades(data.map((c: any) => c.nome));
      } catch { toast.error("Erro ao carregar cidades"); setCidades([]); }
      finally { setLoadingCidades(false); }
    };
    fetchCidades();
  }, [estado]);

  useEffect(() => {
    if (activeTab === "historico") loadCampaigns();
  }, [activeTab]);

  const loadCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const { data, error } = await supabase
        .from("prospeccao_campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setCampaigns((data || []) as Campaign[]);
    } catch (err: any) {
      toast.error("Erro ao carregar campanhas");
    } finally { setLoadingCampaigns(false); }
  };

  const openCampaignDetail = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setDetailOpen(true);
    setLoadingDetail(true);
    try {
      const [logsRes, leadsRes] = await Promise.all([
        supabase.from("prospeccao_campaign_logs")
          .select("*").eq("campaign_id", campaign.id).order("created_at"),
        supabase.from("prospeccao_campaign_leads")
          .select("*").eq("campaign_id", campaign.id).order("created_at").limit(500),
      ]);
      setCampaignLogs((logsRes.data || []) as CampaignLog[]);
      setCampaignLeads(leadsRes.data || []);
    } catch { toast.error("Erro ao carregar detalhes"); }
    finally { setLoadingDetail(false); }
  };

  const duplicateCampaign = (c: Campaign) => {
    setNicho(c.nicho);
    setNichosRelacionados((c.nichos_relacionados || []).join(", "));
    setEstado(c.estado);
    setTimeout(() => setCidade(c.cidade), 500);
    setMaxResults(String(c.max_results));
    setActiveTab("busca");
    toast.success("Parâmetros copiados! Clique em Buscar.");
  };

  const handleSearch = async (forceRefresh = false) => {
    if (!nicho.trim() || !estado || !cidade.trim()) {
      toast.error("Preencha todos os campos obrigatórios"); return;
    }
    setLoading(true); setSearched(true);
    try {
      const relacionados = nichosRelacionados.split(",").map(n => n.trim()).filter(Boolean);
      const body: any = { nicho: nicho.trim(), nichosRelacionados: relacionados, estado, cidade: cidade.trim(), maxResults: Number(maxResults), forceRefresh };
      if (searchLat !== null && searchLng !== null) {
        body.customCenter = { lat: searchLat, lng: searchLng };
        body.customRadiusKm = searchRadius;
      }
      const { data, error } = await supabase.functions.invoke("prospeccao", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResults(data.results || []);
      setFromCache(!!data.fromCache);
      setCachedAt(data.cachedAt || null);
      if (data.fromCache) {
        toast.success(`${data.total || 0} resultados (do cache)`);
      } else {
        const execSec = data.executionTimeMs ? `em ${(data.executionTimeMs / 1000).toFixed(1)}s` : "";
        toast.success(`${data.total || 0} leads encontrados ${execSec} — ${data.creditsUsed || 0} créditos`);
      }
    } catch (err: any) {
      console.error("Erro:", err);
      toast.error(err.message || "Erro ao buscar dados");
      setResults([]);
    } finally { setLoading(false); }
  };

  const exportCSV = (data?: any[], filename?: string) => {
    const rows = data || results;
    if (!rows.length) return;
    const headers = ["Nome","Categoria","Telefone","Email","Website","Instagram","Facebook","Endereço","Avaliação","Total Avaliações","Faixa de Preço","Descrição","Google Maps"];
    const csvRows = rows.map((r: any) => [
      r.nome || r.name || "", r.categoria || "", r.telefone || r.phone || "",
      r.email || "", r.website || "", r.instagram || "", r.facebook || "",
      r.endereco || "", r.avaliacao ?? "", r.totalAvaliacoes || r.total_avaliacoes || "",
      r.faixaPreco || r.faixa_preco || "", r.descricao || "",
      r.googleMapsUrl || r.google_maps_url || "",
    ]);
    const csv = [headers, ...csvRows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `prospeccao_${nicho}_${cidade}_${estado}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };


  const saveToContacts = async (data?: any[]) => {
    const rows = data || results;
    if (!rows.length) { toast.error("Sem leads para salvar"); return; }
    const leadsWithPhone = rows.filter((r: any) => (r.telefone || r.phone));
    if (!leadsWithPhone.length) { toast.error("Nenhum lead possui telefone"); return; }

    setSavingContacts(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const contacts = leadsWithPhone.map((r: any) => ({
        user_id: user.id,
        name: r.nome || r.name || "Sem nome",
        phone: (r.telefone || r.phone || "").replace(/\D/g, ""),
        email: r.email || null,
        tags: [r.categoria || nicho].filter(Boolean),
        notes: r.descricao || null,
        var1: r.categoria || "",
        var2: r.endereco || "",
        var3: r.website || "",
        var4: r.instagram || "",
        var5: r.facebook || "",
        var6: r.googleMapsUrl || r.google_maps_url || "",
        var7: r.avaliacao != null ? String(r.avaliacao) : "",
        var8: r.totalAvaliacoes || r.total_avaliacoes ? String(r.totalAvaliacoes || r.total_avaliacoes) : "",
        var9: r.faixaPreco || r.faixa_preco || "",
        var10: "",
      }));

      // Insert in batches of 50
      let saved = 0;
      for (let i = 0; i < contacts.length; i += 50) {
        const batch = contacts.slice(i, i + 50);
        const { error } = await supabase.from("contacts").insert(batch);
        if (error) throw error;
        saved += batch.length;
      }

      toast.success(`${saved} contatos salvos na sua base!`);
    } catch (err: any) {
      console.error("Erro ao salvar contatos:", err);
      toast.error(err.message || "Erro ao salvar contatos");
    } finally { setSavingContacts(false); }
  };

  const tierBadge = (tier: string | null) => {
    if (tier === "hot") return <Badge className="bg-red-500/20 text-red-400 text-[10px]">🔥 hot</Badge>;
    if (tier === "warm") return <Badge className="bg-yellow-500/20 text-yellow-400 text-[10px]">🟡 warm</Badge>;
    return <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">🔵 cold</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Prospecção</h1>
            <p className="text-muted-foreground text-sm">Busque comércios e negócios por nicho e localização</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2">
          <Coins className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{creditBalance ?? "—"}</span>
          <span className="text-xs text-muted-foreground">créditos</span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="busca" className="gap-1.5"><Search className="h-4 w-4" /> Nova Busca</TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5"><History className="h-4 w-4" /> Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="busca" className="space-y-6 mt-4">
          {/* Search form */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Filtros de Busca</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label>Nicho / Segmento *</Label>
                  <Input placeholder="Ex: pizzaria, dentista..." value={nicho} onChange={e => setNicho(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Nichos relacionados</Label>
                  <Input placeholder="Ex: hamburgueria, restaurante..." value={nichosRelacionados} onChange={e => setNichosRelacionados(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Separe por vírgula (opcional)</p>
                </div>
                <div className="space-y-2">
                  <Label>Estado *</Label>
                  <Select value={estado} onValueChange={setEstado}>
                    <SelectTrigger><SelectValue placeholder="Selecione o estado" /></SelectTrigger>
                    <SelectContent>{ESTADOS_BR.map(uf => <SelectItem key={uf.sigla} value={uf.sigla}>{uf.nome} ({uf.sigla})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cidade *</Label>
                  <Select value={cidade} onValueChange={setCidade} disabled={!estado || loadingCidades}>
                    <SelectTrigger><SelectValue placeholder={loadingCidades ? "Carregando..." : estado ? "Selecione a cidade" : "Selecione o estado primeiro"} /></SelectTrigger>
                    <SelectContent>{cidades.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Máx. resultados</Label>
                  <Select value={maxResults} onValueChange={setMaxResults}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["20","50","100","200","500","1000","2000","5000"].map(v => (
                        <SelectItem key={v} value={v}>{Number(v).toLocaleString("pt-BR")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Search Area Map */}
              <div className="mt-4">
                <SearchAreaMap
                  cidade={cidade}
                  estado={estado}
                  onAreaChange={handleAreaChange}
                  onAreaConfirm={handleAreaConfirm}
                  initialRadiusKm={12}
                />
              </div>

              <div className="flex gap-3 mt-4">
                <Button onClick={() => handleSearch()} disabled={loading} className="gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {loading ? "Buscando..." : "Buscar"}
                </Button>
                {results.length > 0 && (
                  <>
                    <Button variant="outline" onClick={() => exportCSV()} className="gap-2">
                      <Download className="h-4 w-4" /> Exportar CSV
                    </Button>
                    <Button variant="outline" onClick={() => saveToContacts()} disabled={savingContacts} className="gap-2">
                      {savingContacts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                      {savingContacts ? "Salvando..." : "Salvar nos Contatos"}
                    </Button>
                  </>
                )}
              </div>
              {loading && <p className="text-sm text-muted-foreground mt-3">⏳ A busca pode levar de 30s a vários minutos...</p>}
            </CardContent>
          </Card>

          {/* Results */}
          {searched && !loading && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5" /> Resultados ({results.length})
                    {fromCache && (
                      <Badge variant="outline" className="ml-2 gap-1 text-xs font-normal">
                        <Database className="h-3 w-3" /> Cache {cachedAt ? `(${new Date(cachedAt).toLocaleDateString('pt-BR')})` : ''}
                      </Badge>
                    )}
                  </CardTitle>
                  {fromCache && (
                    <Button variant="outline" size="sm" onClick={() => handleSearch(true)} disabled={loading} className="gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" /> Nova busca
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {results.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum resultado encontrado.</p>
                ) : (
                  <div className="overflow-auto max-h-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Telefone</TableHead>
                          <TableHead>Email</TableHead><TableHead>Endereço</TableHead><TableHead>Avaliação</TableHead>
                          <TableHead>Preço</TableHead><TableHead>Website</TableHead><TableHead>Redes</TableHead><TableHead>Maps</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium max-w-[200px]">
                              <div className="truncate">{r.nome}</div>
                              {r.descricao && <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={r.descricao}>{r.descricao}</div>}
                            </TableCell>
                            <TableCell>{r.categoria && <Badge variant="secondary" className="text-xs">{r.categoria}</Badge>}</TableCell>
                            <TableCell>{r.telefone ? <span className="flex items-center gap-1 text-sm"><Phone className="h-3 w-3" /> {r.telefone}</span> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                            <TableCell>{r.email ? <a href={`mailto:${r.email}`} className="flex items-center gap-1 text-sm text-primary hover:underline"><Mail className="h-3 w-3" /> {r.email}</a> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                            <TableCell className="max-w-[250px] truncate text-sm">{r.endereco || "—"}</TableCell>
                            <TableCell>{r.avaliacao ? <span className="flex items-center gap-1 text-sm"><Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />{r.avaliacao.toFixed(1)}<span className="text-muted-foreground text-xs">({r.totalAvaliacoes})</span></span> : "—"}</TableCell>
                            <TableCell className="text-sm">{r.faixaPreco || "—"}</TableCell>
                            <TableCell>{r.website ? <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-sm"><Globe className="h-3 w-3" /> Ver</a> : "—"}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {r.instagram && <a href={r.instagram} target="_blank" rel="noopener noreferrer"><Instagram className="h-4 w-4 text-pink-500" /></a>}
                                {r.facebook && <a href={r.facebook} target="_blank" rel="noopener noreferrer"><Globe className="h-4 w-4 text-blue-500" /></a>}
                                {!r.instagram && !r.facebook && "—"}
                              </div>
                            </TableCell>
                            <TableCell>{r.googleMapsUrl ? <a href={r.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-sm"><MapPin className="h-3 w-3" /> Abrir</a> : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== CAMPAIGN HISTORY TAB ===== */}
        <TabsContent value="historico" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5" /> Campanhas de Prospecção</CardTitle>
                <Button variant="outline" size="sm" onClick={loadCampaigns} disabled={loadingCampaigns} className="gap-1.5">
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingCampaigns ? "animate-spin" : ""}`} /> Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingCampaigns ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : campaigns.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhuma campanha encontrada. Faça sua primeira busca!</p>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Leads</TableHead>
                        <TableHead>Créditos</TableHead>
                        <TableHead>Tempo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            <div>{c.name}</div>
                            <div className="text-xs text-muted-foreground">{c.nicho} — {c.cidade}/{c.estado}</div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(c.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1"><Target className="h-3 w-3" /> {c.total_leads}</span>
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1"><Coins className="h-3 w-3" /> {c.credits_used}</span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {c.execution_time_ms ? `${(c.execution_time_ms / 1000).toFixed(1)}s` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.status === "completed" ? "default" : c.status === "running" ? "secondary" : "destructive"} className="text-xs">
                              {c.status === "completed" ? "Concluída" : c.status === "running" ? "Em andamento" : c.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCampaignDetail(c)} title="Ver detalhes">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateCampaign(c)} title="Duplicar busca">
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
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

      {/* Campaign Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedCampaign?.name}
            </DialogTitle>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Tabs defaultValue="detail-resumo" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="w-fit">
                <TabsTrigger value="detail-resumo">Resumo</TabsTrigger>
                <TabsTrigger value="detail-logs">Logs ({campaignLogs.length})</TabsTrigger>
                <TabsTrigger value="detail-leads">Leads ({campaignLeads.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="detail-resumo" className="mt-4 space-y-4">
                {selectedCampaign && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card><CardContent className="pt-4 text-center">
                      <Target className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-2xl font-bold">{selectedCampaign.total_leads}</div>
                      <div className="text-xs text-muted-foreground">Leads</div>
                    </CardContent></Card>
                    <Card><CardContent className="pt-4 text-center">
                      <Coins className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-2xl font-bold">{selectedCampaign.credits_used}</div>
                      <div className="text-xs text-muted-foreground">Créditos</div>
                    </CardContent></Card>
                    <Card><CardContent className="pt-4 text-center">
                      <Clock className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-2xl font-bold">{selectedCampaign.execution_time_ms ? `${(selectedCampaign.execution_time_ms / 1000).toFixed(1)}s` : "—"}</div>
                      <div className="text-xs text-muted-foreground">Tempo</div>
                    </CardContent></Card>
                    <Card><CardContent className="pt-4 text-center">
                      <ChevronRight className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-2xl font-bold">{selectedCampaign.total_leads > 0 && selectedCampaign.credits_used > 0 ? (selectedCampaign.total_leads / selectedCampaign.credits_used).toFixed(1) : "—"}</div>
                      <div className="text-xs text-muted-foreground">Leads/Crédito</div>
                    </CardContent></Card>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Nicho:</span> {selectedCampaign?.nicho}</div>
                  <div><span className="text-muted-foreground">Cidade:</span> {selectedCampaign?.cidade}/{selectedCampaign?.estado}</div>
                  <div><span className="text-muted-foreground">Relacionados:</span> {selectedCampaign?.nichos_relacionados?.join(", ") || "—"}</div>
                  <div><span className="text-muted-foreground">Raio:</span> {selectedCampaign?.city_radius_km ? `${selectedCampaign.city_radius_km}km` : "—"}</div>
                </div>
              </TabsContent>

              <TabsContent value="detail-logs" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fase</TableHead><TableHead>Termo</TableHead><TableHead>Local</TableHead>
                        <TableHead>+Leads</TableHead><TableHead>Total</TableHead><TableHead>Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaignLogs.map(l => (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs font-mono">{l.phase}</TableCell>
                          <TableCell className="text-xs">{l.query_term}</TableCell>
                          <TableCell className="text-xs max-w-[150px] truncate">{l.location_info || "—"}</TableCell>
                          <TableCell className="text-xs font-medium text-green-400">+{l.leads_added}</TableCell>
                          <TableCell className="text-xs">{l.leads_total}</TableCell>
                          <TableCell>{l.tier ? tierBadge(l.tier) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="detail-leads" className="flex-1 overflow-hidden mt-4">
                <div className="flex justify-end gap-2 mb-2">
                  <Button variant="outline" size="sm" onClick={() => saveToContacts(campaignLeads)} disabled={savingContacts} className="gap-1.5">
                    {savingContacts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                    {savingContacts ? "Salvando..." : "Salvar nos Contatos"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportCSV(campaignLeads, `leads_${selectedCampaign?.name}.csv`)} className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Exportar CSV
                  </Button>
                </div>
                <ScrollArea className="h-[350px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Categoria</TableHead>
                        <TableHead>Endereço</TableHead><TableHead>Avaliação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaignLeads.map((l: any) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium text-sm">{l.nome}</TableCell>
                          <TableCell className="text-sm">{l.telefone || "—"}</TableCell>
                          <TableCell className="text-sm">{l.categoria || "—"}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{l.endereco || "—"}</TableCell>
                          <TableCell>{l.avaliacao ? <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />{Number(l.avaliacao).toFixed(1)}</span> : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
