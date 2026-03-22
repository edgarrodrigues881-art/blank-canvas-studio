import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Megaphone, Search, Trash2, Plus, Send, Clock, CheckCircle2, XCircle, Pause, Ban, Save, Loader2,
} from "lucide-react";
import { useCampaigns, useDeleteCampaign } from "@/hooks/useCampaigns";
import { useCreateTemplate } from "@/hooks/useTemplates";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:    { label: "Pendente",   color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: <Clock className="w-3 h-3" /> },
  scheduled:  { label: "Agendada",   color: "bg-teal-500/10 text-teal-400 border-teal-500/20",      icon: <Clock className="w-3 h-3" /> },
  queued:     { label: "Na fila",    color: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: <Clock className="w-3 h-3" /> },
  running:    { label: "Enviando",   color: "bg-primary/10 text-primary border-primary/20",         icon: <Send className="w-3 h-3" /> },
  processing: { label: "Enviando",   color: "bg-primary/10 text-primary border-primary/20",         icon: <Send className="w-3 h-3" /> },
  paused:     { label: "Pausada",    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: <Pause className="w-3 h-3" /> },
  completed:  { label: "Concluída",  color: "bg-primary/10 text-primary border-primary/20",         icon: <CheckCircle2 className="w-3 h-3" /> },
  canceled:   { label: "Cancelada",  color: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20", icon: <Ban className="w-3 h-3" /> },
  failed:     { label: "Falhou",     color: "bg-destructive/10 text-destructive border-destructive/20", icon: <XCircle className="w-3 h-3" /> },
};

const CampaignList = () => {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const deleteCampaign = useDeleteCampaign();
  const createTemplate = useCreateTemplate();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [savingCampaign, setSavingCampaign] = useState<any>(null);

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [campaigns, search, statusFilter]);

  const protectedStatuses = ["running", "processing", "scheduled", "queued"];

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const campaign = campaigns.find((c) => c.id === id);
    if (campaign && protectedStatuses.includes(campaign.status)) {
      toast({ title: "Não é possível excluir", description: "Pause ou cancele a campanha antes.", variant: "destructive" });
      return;
    }
    deleteCampaign.mutate(id, {
      onSuccess: () => toast({ title: "Campanha excluída" }),
      onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const handleClearAll = async () => {
    try {
      const deletable = campaigns.filter((c) => !protectedStatuses.includes(c.status));
      if (deletable.length === 0) {
        toast({ title: "Nenhuma campanha pode ser excluída", description: "Todas estão em envio ou agendadas.", variant: "destructive" });
        setClearAllOpen(false);
        return;
      }
      for (const c of deletable) {
        await supabase.from("campaign_contacts").delete().eq("campaign_id", c.id);
        await supabase.from("campaigns").delete().eq("id", c.id);
      }
      const skipped = campaigns.length - deletable.length;
      setClearAllOpen(false);
      toast({ title: `${deletable.length} campanhas excluídas${skipped > 0 ? `, ${skipped} protegidas` : ""}` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleSaveAsTemplate = () => {
    if (!saveTemplateName.trim() || !savingCampaign) return;
    createTemplate.mutate({
      name: saveTemplateName.trim(),
      content: savingCampaign.message_content || "",
      type: savingCampaign.message_type || "texto",
      media_url: savingCampaign.media_url || undefined,
      buttons: Array.isArray(savingCampaign.buttons) ? savingCampaign.buttons : [],
    }, {
      onSuccess: () => {
        toast({ title: "Template salvo!", description: `"${saveTemplateName.trim()}" salvo em Templates.` });
        setSaveTemplateOpen(false);
        setSaveTemplateName("");
        setSavingCampaign(null);
      },
      onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const canSaveAsTemplate = (status: string) => ["paused", "completed"].includes(status);

  const getProgress = (c: any) => {
    const total = c.total_contacts || 0;
    if (total === 0) return 0;
    return Math.round(((c.sent_count || 0) + (c.failed_count || 0)) / total * 100);
  };

  // Stats
  const stats = useMemo(() => {
    const total = campaigns.length;
    const active = campaigns.filter(c => ["running", "processing", "queued"].includes(c.status)).length;
    const completed = campaigns.filter(c => c.status === "completed").length;
    const failed = campaigns.filter(c => c.status === "failed").length;
    return { total, active, completed, failed };
  }, [campaigns]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 5rem)" }}>
      {/* Fixed header area */}
      <div className="shrink-0 space-y-5 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Campanhas</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Gerencie e acompanhe seus envios</p>
          </div>
          <div className="flex items-center gap-2">
            {campaigns.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setClearAllOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpar todas
              </Button>
            )}
            <Button
              size="sm"
              className="gap-1.5 text-xs bg-primary hover:bg-primary/90 shadow-sm"
              onClick={() => navigate("/dashboard/campaigns")}
            >
              <Plus className="w-3.5 h-3.5" /> Nova Campanha
            </Button>
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Ativas", value: stats.active, color: "text-primary" },
            { label: "Concluídas", value: stats.completed, color: "text-primary" },
            { label: "Falhas", value: stats.failed, color: "text-destructive" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border/30 bg-card/50 px-3 py-2.5 text-center">
              <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-card/50 border-border/30"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-card/50 border-border/30">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="scheduled">Agendada</SelectItem>
              <SelectItem value="queued">Na fila</SelectItem>
              <SelectItem value="running">Enviando</SelectItem>
              <SelectItem value="paused">Pausada</SelectItem>
              <SelectItem value="completed">Concluída</SelectItem>
              <SelectItem value="canceled">Cancelada</SelectItem>
              <SelectItem value="failed">Falhou</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Scrollable list area - optimized for 60fps */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-xl border border-border/30 bg-card/30"
        style={{ contain: "layout style", willChange: "scroll-position" }}
      >
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <Megaphone className="w-5 h-5 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground/60">Nenhuma campanha encontrada</p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {filtered.map((c) => {
              const cfg = statusConfig[c.status] || statusConfig.pending;
              const progress = getProgress(c);
              return (
                <div
                  key={c.id}
                  className="group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-100 hover:bg-muted/20"
                  onClick={() => navigate(`/dashboard/campaign/${c.id}`)}
                >
                  {/* Name + Status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[13px] font-medium text-foreground truncate">{c.name}</p>
                      <Badge variant="outline" className={`text-[9px] font-semibold shrink-0 gap-0.5 px-1.5 py-0 h-4 ${cfg.color}`}>
                        {cfg.icon}
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 flex-1 max-w-[160px]">
                        <Progress value={progress} className="h-1 flex-1" />
                        <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">{progress}%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {c.sent_count || 0}/{c.total_contacts || 0}
                      </span>
                      {(c.failed_count || 0) > 0 && (
                        <span className="text-[10px] text-destructive tabular-nums">
                          {c.failed_count} falhas
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Date */}
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 hidden sm:block">
                    {format(new Date(c.created_at), "dd/MM/yy HH:mm")}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {canSaveAsTemplate(c.status) && c.message_content && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity duration-100 text-muted-foreground/40 hover:text-primary hover:bg-primary/10"
                        title="Salvar como Template"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSavingCampaign(c);
                          setSaveTemplateName(c.name || "");
                          setSaveTemplateOpen(true);
                        }}
                      >
                        <Save className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity duration-100 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDelete(c.id, e)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Clear All Confirmation */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todas as campanhas?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso excluirá permanentemente todas as {campaigns.length} campanhas e seus contatos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll} className="bg-destructive hover:bg-destructive/90">
              Excluir todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save as Template Dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar como Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Nome do template</Label>
              <Input
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                placeholder="Ex: Promoção Black Friday"
                className="h-9"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveAsTemplate(); }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              O template ficará disponível em <strong>Templates</strong> para uso em futuras campanhas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveAsTemplate} disabled={createTemplate.isPending} className="gap-1.5">
              {createTemplate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CampaignList;
