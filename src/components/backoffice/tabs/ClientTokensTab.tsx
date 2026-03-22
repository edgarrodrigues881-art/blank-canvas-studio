import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAdminAction, type AdminUser } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Key, Copy, Check, Radio, Save, ShieldCheck, ShieldX, ShieldQuestion, RefreshCw, CircleDot, Zap, AlertTriangle, Unlock, Lock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props { client: AdminUser; detail: any; }

const ClientTokensTab = ({ client, detail }: Props) => {
  const tokens = detail?.api_tokens || [];
  const { mutate, isPending, invalidateClient } = useAdminAction();
  const { toast } = useToast();
  const [newTokens, setNewTokens] = useState("");
  const [monitorToken, setMonitorToken] = useState(detail?.profile?.whatsapp_monitor_token || "");
  const [validating, setValidating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAddArea, setShowAddArea] = useState(false);

  useEffect(() => {
    setMonitorToken(detail?.profile?.whatsapp_monitor_token || "");
  }, [detail?.profile?.whatsapp_monitor_token]);

  const handleAddTokens = () => {
    const lines = newTokens.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      toast({ title: "Informe ao menos um token", variant: "destructive" });
      return;
    }
    mutate(
      { action: "add-tokens", body: { target_user_id: client.id, tokens: lines } },
      {
        onSuccess: (data: any) => {
          const info = data?.healthy !== undefined
            ? `${data.total} token(s) adicionado(s) — ${data.healthy} válidos, ${data.invalid} inválidos`
            : `${lines.length} token(s) adicionado(s)`;
          toast({ title: info });
          setNewTokens("");
          setShowAddArea(false);
          invalidateClient(client.id);
        },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleValidateAll = () => {
    setValidating(true);
    mutate(
      { action: "validate-tokens", body: { target_user_id: client.id } },
      {
        onSuccess: (data: any) => {
          toast({ title: `${data.total} tokens validados — ${data.healthy} válidos, ${data.invalid} inválidos` });
          setValidating(false);
          invalidateClient(client.id);
        },
        onError: (e) => {
          toast({ title: "Erro", description: e.message, variant: "destructive" });
          setValidating(false);
        },
      }
    );
  };

  const handleDelete = (tokenId: string) => {
    mutate(
      { action: "delete-token", body: { token_id: tokenId, target_user_id: client.id } },
      {
        onSuccess: (data: any) => {
          const providerMsg = data?.provider_deleted ? " + instância removida da UAZAPI" : "";
          toast({ title: `Token removido${providerMsg}` });
          invalidateClient(client.id);
        },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleDeleteAll = () => {
    mutate(
      { action: "delete-all-tokens", body: { target_user_id: client.id } },
      {
        onSuccess: (data: any) => {
          const providerMsg = data?.provider_deleted ? ` (${data.provider_deleted} removidos da UAZAPI)` : "";
          toast({ title: `${data?.removed ?? 0} token(s) removido(s)${providerMsg}` });
          invalidateClient(client.id);
        },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const copyToken = (token: string, id: string) => {
    navigator.clipboard.writeText(token);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleSaveMonitorToken = () => {
    mutate(
      { action: "update-monitor-token", body: { target_user_id: client.id, whatsapp_monitor_token: monitorToken.trim() } },
      {
        onSuccess: () => { toast({ title: monitorToken.trim() ? "Token de monitoramento salvo" : "Token de monitoramento removido" }); invalidateClient(client.id); },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const available = tokens.filter((t: any) => t.status === "available").length;
  const inUse = tokens.filter((t: any) => t.status === "in_use").length;
  const blocked = tokens.filter((t: any) => t.status === "blocked").length;
  const invalidCount = tokens.filter((t: any) => t.healthy === false).length;

  const handleBulkUnblock = () => {
    mutate(
      { action: "bulk-unblock-tokens", body: { target_user_id: client.id } },
      {
        onSuccess: (data: any) => {
          toast({ title: `${data?.unblocked ?? 0} token(s) desbloqueado(s)` });
          invalidateClient(client.id);
        },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const getHealthBadge = (healthy: boolean | null) => {
    if (healthy === true) return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
        <ShieldCheck size={12} /> Válido
      </span>
    );
    if (healthy === false) return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
        <ShieldX size={12} /> Inválido
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/50">
        <ShieldQuestion size={12} /> Pendente
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    if (status === "in_use") return (
      <Badge className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/10">
        <CircleDot size={8} className="mr-1" /> Em uso
      </Badge>
    );
    if (status === "blocked") return (
      <Badge className="text-[10px] px-2 py-0.5 bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10">
        <Lock size={8} className="mr-1" /> Bloqueado
      </Badge>
    );
    return (
      <Badge className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
        <Zap size={8} className="mr-1" /> Disponível
      </Badge>
    );
  };

  return (
    <div className="space-y-5">

      {/* ─── Monitor Token Section ─── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Radio size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Monitoramento WhatsApp</h3>
              {monitorToken.trim() ? (
                <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">Ativo</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">Inativo</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Token usado para enviar alertas e notificações via WhatsApp
            </p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Token da instância</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <Input
              placeholder="Cole o token aqui..."
              value={monitorToken}
              onChange={e => setMonitorToken(e.target.value)}
              className="bg-muted/30 border-border font-mono text-xs flex-1"
            />
            <Button size="sm" onClick={handleSaveMonitorToken} disabled={isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 rounded-lg h-9 px-4">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save size={13} />}
              Salvar
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Instance Tokens Section ─── */}
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Key size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Pool de Tokens</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{tokens.length} token{tokens.length !== 1 ? "s" : ""} no pool</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidateAll}
              disabled={validating || isPending || tokens.length === 0}
              className="gap-1.5 text-xs rounded-lg h-8"
            >
              {validating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Validar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending || tokens.length === 0}
                  className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 rounded-lg h-8"
                >
                  <Trash2 size={13} />
                  Limpar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover todos os tokens?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">
                    Isso removerá todos os {tokens.length} token(s) deste cliente. Esta ação é permanente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Remover todos
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Stats mini-cards */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap size={14} className="text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Disponíveis</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{available}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <CircleDot size={14} className="text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Em uso</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{inUse}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${blocked > 0 ? "bg-destructive/10" : "bg-muted/50"}`}>
              <Lock size={14} className={blocked > 0 ? "text-destructive" : "text-muted-foreground/40"} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Bloqueados</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{blocked}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${invalidCount > 0 ? "bg-destructive/10" : "bg-muted/50"}`}>
              <AlertTriangle size={14} className={invalidCount > 0 ? "text-destructive" : "text-muted-foreground/40"} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Inválidos</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{invalidCount}</p>
            </div>
          </div>
        </div>

        {/* Bulk Unblock */}
        {blocked > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                className="w-full gap-2 text-xs border-primary/30 text-primary hover:bg-primary/10 rounded-xl h-9"
              >
                <Unlock size={14} />
                Desbloquear {blocked} token(s) em massa
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle>Desbloquear todos os tokens?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  {blocked} token(s) bloqueado(s) serão alterados para "disponível". Eles poderão ser atribuídos a novas instâncias.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkUnblock} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Desbloquear todos
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Add Tokens */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowAddArea(!showAddArea)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Plus size={14} className="text-primary" />
              <span className="text-sm font-medium text-foreground">Adicionar tokens</span>
            </div>
            <span className={`text-muted-foreground text-xs transition-transform ${showAddArea ? "rotate-180" : ""}`}>▼</span>
          </button>

          {showAddArea && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              <Textarea
                placeholder={"token_abc123\ntoken_def456\ntoken_ghi789"}
                value={newTokens}
                onChange={e => setNewTokens(e.target.value)}
                className="bg-muted/20 border-border font-mono text-xs min-h-[80px] resize-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">Um token por linha • Validação automática ao adicionar</p>
                <Button size="sm" onClick={handleAddTokens} disabled={isPending || !newTokens.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 rounded-lg h-8 text-xs">
                  {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus size={13} />}
                  Adicionar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Token List */}
        {tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Key size={32} className="mb-2 opacity-20" />
            <p className="text-sm">Nenhum token cadastrado</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Adicione tokens acima para começar</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {tokens.map((t: any, idx: number) => (
              <div
                key={t.id}
                className={`group bg-card border rounded-xl px-4 py-3 flex items-center justify-between hover:border-primary/20 hover:shadow-sm transition-all duration-200 ${
                  t.healthy === false ? "border-destructive/20 bg-destructive/[0.02]" : "border-border"
                }`}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  {/* Index */}
                  <span className="text-xs font-mono text-muted-foreground/50 w-5 text-right tabular-nums">{idx + 1}</span>

                  {/* Token value */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <code className="text-[11px] font-mono text-foreground/80 bg-muted/40 px-2 py-1 rounded-md max-w-[220px] truncate block">
                      {t.token}
                    </code>
                    <button
                      onClick={() => copyToken(t.token, t.id)}
                      className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
                    >
                      {copiedId === t.id ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                    </button>
                  </div>

                  {/* Health */}
                  <div className="shrink-0">
                    {getHealthBadge(t.healthy)}
                  </div>

                  {/* Status */}
                  <div className="shrink-0">
                    {getStatusBadge(t.status)}
                  </div>

                  {/* Device name */}
                  {t.device_name && (
                    <span className="text-[11px] text-muted-foreground truncate max-w-[120px] hidden lg:block">
                      {t.device_name}
                    </span>
                  )}

                  {/* Date */}
                  <span className="text-[11px] text-muted-foreground/60 tabular-nums hidden md:block shrink-0">
                    {new Date(t.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>

                {/* Delete */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground/40 hover:text-destructive h-7 w-7 rounded-lg">
                        <Trash2 size={13} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-card border-border">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover token?</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">Esta ação é permanente.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientTokensTab;
