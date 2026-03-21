import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAdminAction } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Key, Trash2, Loader2, Search, RefreshCw, Wifi, WifiOff, Server } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface UazapiInstance {
  provider_instance_id: string | null;
  name: string;
  token: string;
  token_full: string;
  status: string;
  phone: string;
  profile_name: string;
  connected: boolean;
  db_token_id: string | null;
  db_user_id: string | null;
  db_status: string | null;
  client_name: string;
}

const AdminTokensGlobal = () => {
  const { toast } = useToast();
  const { mutate, isPending } = useAdminAction();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [cleaningIdle, setCleaningIdle] = useState(false);

  // Fetch directly from UAZAPI
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-uazapi-instances"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-data?action=fetch-uazapi-instances");
      if (error) throw error;
      return data as { instances: UazapiInstance[]; total: number; connected: number; disconnected: number };
    },
    staleTime: 15_000,
  });

  const instances = data?.instances || [];

  const filtered = useMemo(() => {
    let result = instances;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.client_name.toLowerCase().includes(q) ||
        i.phone.toLowerCase().includes(q) ||
        i.profile_name.toLowerCase().includes(q)
      );
    }
    if (statusFilter === "connected") result = result.filter(i => i.connected);
    if (statusFilter === "disconnected") result = result.filter(i => !i.connected);
    if (statusFilter === "no_link") result = result.filter(i => !i.db_token_id);
    return result;
  }, [instances, search, statusFilter]);

  const getInstanceKey = (instance: Pick<UazapiInstance, "provider_instance_id" | "db_token_id" | "token_full" | "name">) => (
    instance.db_token_id || instance.provider_instance_id || instance.token_full || instance.name
  );

  const toggleSelect = (instance: UazapiInstance) => {
    const key = getInstanceKey(instance);
    setSelectedNames(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedNames.size === filtered.length) {
      setSelectedNames(new Set());
    } else {
      setSelectedNames(new Set(filtered.map(getInstanceKey)));
    }
  };

  const selectDisconnected = () => {
    setSelectedNames(new Set(instances.filter(i => !i.connected).map(getInstanceKey)));
  };

  const handleBulkDelete = () => {
    if (selectedNames.size === 0) return;
    const selectedInstances = instances
      .filter(inst => selectedNames.has(getInstanceKey(inst)))
      .map(inst => ({
        provider_instance_id: inst.provider_instance_id,
        name: inst.name,
        token_full: inst.token_full,
        db_token_id: inst.db_token_id,
      }));

    setDeleting(true);
    mutate(
      { action: "bulk-delete-uazapi-instances", body: { instances: selectedInstances, instance_names: [...selectedNames] } },
      {
        onSuccess: (d: any) => {
          const deleted = d?.deleted ?? 0;
          const dbCleaned = d?.db_cleaned ?? 0;
          const title = deleted > 0
            ? `${deleted} instância(s) deletada(s) da UAZAPI | ${dbCleaned} token(s) limpos no DB`
            : dbCleaned > 0
              ? `Nenhuma instância apagada no provedor | ${dbCleaned} token(s) ocultados no sistema`
              : "Nenhuma instância deletada";
          toast({ title });
          setSelectedNames(new Set());
          setDeleting(false);
          refetch();
        },
        onError: (e) => {
          toast({ title: "Erro", description: e.message, variant: "destructive" });
          setDeleting(false);
        },
      }
    );
  };

  const handleDeleteOne = (instance: UazapiInstance) => {
    setDeleting(true);
    mutate(
      {
        action: "bulk-delete-uazapi-instances",
        body: {
          instances: [{
            provider_instance_id: instance.provider_instance_id,
            name: instance.name,
            token_full: instance.token_full,
            db_token_id: instance.db_token_id,
          }],
          instance_names: [instance.name],
        },
      },
      {
        onSuccess: (d: any) => {
          const deleted = d?.deleted ?? 0;
          const dbCleaned = d?.db_cleaned ?? 0;
          const title = deleted > 0
            ? `Instância "${instance.name}" deletada da UAZAPI`
            : dbCleaned > 0
              ? `Instância "${instance.name}" ocultada no sistema`
              : `A instância "${instance.name}" não foi deletada`;
          const description = dbCleaned > 0 ? `${dbCleaned} token(s) limpos no DB` : undefined;
          toast({ title, description });
          setDeleting(false);
          refetch();
        },
        onError: (e) => {
          toast({ title: "Erro", description: e.message, variant: "destructive" });
          setDeleting(false);
        },
      }
    );
  };

  const handleCleanIdleTokens = () => {
    setCleaningIdle(true);
    mutate(
      { action: "bulk-delete-idle-tokens", body: {} },
      {
        onSuccess: (d: any) => {
          toast({ title: `${d?.deleted ?? 0} token(s) ocioso(s) removidos do banco` });
          setCleaningIdle(false);
          refetch();
        },
        onError: (e) => {
          toast({ title: "Erro", description: e.message, variant: "destructive" });
          setCleaningIdle(false);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Buscando instâncias da UAZAPI...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Server size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Instâncias UAZAPI</h2>
            <p className="text-xs text-muted-foreground">Dados do provedor com fallback automático dos tokens do banco</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5 text-xs rounded-lg h-8">
          {isFetching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><Key size={14} className="text-primary" /></div>
          <div><p className="text-[10px] text-muted-foreground uppercase font-medium">Total</p><p className="text-xl font-bold tabular-nums">{data?.total ?? 0}</p></div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><Wifi size={14} className="text-primary" /></div>
          <div><p className="text-[10px] text-muted-foreground uppercase font-medium">Conectadas</p><p className="text-xl font-bold tabular-nums">{data?.connected ?? 0}</p></div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(data?.disconnected ?? 0) > 0 ? "bg-destructive/10" : "bg-muted/50"}`}>
            <WifiOff size={14} className={(data?.disconnected ?? 0) > 0 ? "text-destructive" : "text-muted-foreground/40"} />
          </div>
          <div><p className="text-[10px] text-muted-foreground uppercase font-medium">Desconectadas</p><p className="text-xl font-bold tabular-nums">{data?.disconnected ?? 0}</p></div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {(data?.disconnected ?? 0) > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={selectDisconnected}
            className="gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 rounded-lg h-8"
          >
            <WifiOff size={13} />
            Selecionar {data?.disconnected} desconectada(s)
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={cleaningIdle || isPending}
              className="gap-1.5 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10 rounded-lg h-8"
            >
              {cleaningIdle ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />}
              Limpar tokens ociosos
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle>Limpar tokens ociosos?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                Remove apenas tokens com status <strong>available</strong> ou <strong>blocked</strong> que <strong>não estão vinculados</strong> a nenhuma instância. Tokens <strong>in_use</strong> serão preservados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleCleanIdleTokens} className="bg-amber-600 text-white hover:bg-amber-700">
                Limpar ociosos
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, cliente, telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-muted/30 border-border text-xs h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="connected">Conectadas</SelectItem>
            <SelectItem value="disconnected">Desconectadas</SelectItem>
            <SelectItem value="no_link">Sem vínculo DB</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions */}
      {selectedNames.size > 0 && (
        <div className="flex items-center gap-3 bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-2.5">
          <span className="text-xs text-foreground font-medium">{selectedNames.size} selecionada(s)</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" className="gap-1.5 text-xs h-7 ml-auto" disabled={isPending || deleting}>
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Apagar {selectedNames.size} da UAZAPI
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar {selectedNames.size} instância(s) da UAZAPI?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  As instâncias serão desconectadas e deletadas do provedor UAZAPI. Tokens correspondentes no banco de dados também serão removidos. <strong>Esta ação é permanente.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Apagar da UAZAPI
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setSelectedNames(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2.5 text-left w-8">
                  <input
                    type="checkbox"
                    checked={selectedNames.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">#</th>
                <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Nome instância</th>
                <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Status</th>
                <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Telefone</th>
                <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Perfil</th>
                <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Cliente (DB)</th>
                <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Token</th>
                <th className="px-3 py-2.5 text-right text-muted-foreground font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    {instances.length === 0 ? "Nenhuma instância encontrada na UAZAPI" : "Nenhum resultado para o filtro"}
                  </td>
                </tr>
              ) : (
                filtered.map((inst, idx) => {
                  const instanceKey = getInstanceKey(inst);
                  return (
                  <tr
                    key={instanceKey}
                    className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${
                      !inst.connected ? "bg-destructive/[0.02]" : ""
                    } ${selectedNames.has(instanceKey) ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedNames.has(instanceKey)}
                        onChange={() => toggleSelect(inst)}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground/50 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-foreground max-w-[180px] truncate font-mono text-[11px]">{inst.name}</td>
                    <td className="px-3 py-2">
                      {inst.connected ? (
                        <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                          <Wifi size={8} className="mr-0.5" /> Online
                        </Badge>
                      ) : (
                        <Badge className="text-[10px] px-1.5 py-0 bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10">
                          <WifiOff size={8} className="mr-0.5" /> Offline
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{inst.phone || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">{inst.profile_name || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={inst.db_token_id ? "text-foreground" : "text-muted-foreground/50 italic"}>
                        {inst.client_name}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <code className="text-[10px] font-mono bg-muted/40 px-1.5 py-0.5 rounded max-w-[100px] truncate block">
                        {inst.token}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10" disabled={isPending || deleting}>
                            <Trash2 size={12} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-card border-border">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Apagar instância?</AlertDialogTitle>
                            <AlertDialogDescription className="text-muted-foreground">
                              A instância <strong>{inst.name}</strong> será desconectada e deletada da UAZAPI.
                              {inst.db_token_id && " O token correspondente no banco também será removido."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteOne(inst)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Apagar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
            Exibindo {filtered.length} de {instances.length} instâncias
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminTokensGlobal;
