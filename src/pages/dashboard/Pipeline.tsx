import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitBranch, Search, User, Building2, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/utils/formatters";

/* ── Stages ── */
const STAGES = [
  { key: "novo", label: "Novo Lead", dot: "bg-blue-500" },
  { key: "respondeu", label: "Respondeu", dot: "bg-cyan-500" },
  { key: "interessado", label: "Interessado", dot: "bg-amber-500" },
  { key: "negociacao", label: "Negociação", dot: "bg-purple-500" },
  { key: "fechado", label: "Fechado", dot: "bg-emerald-500" },
  { key: "perdido", label: "Perdido", dot: "bg-red-400" },
] as const;

type StageKey = typeof STAGES[number]["key"];

const PRIORITY_BADGE: Record<string, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "bg-slate-100 text-slate-500 border-slate-200" },
  media: { label: "Média", color: "bg-yellow-100 text-yellow-600 border-yellow-200" },
  alta: { label: "Alta", color: "bg-orange-100 text-orange-600 border-orange-200" },
  urgente: { label: "Urgente", color: "bg-red-100 text-red-600 border-red-200" },
};

interface PipelineLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  interest: string | null;
  estimated_value: number | null;
  priority: string | null;
  responsible: string | null;
  pipeline_stage: string | null;
  created_at: string;
}

function formatCurrency(v: number | null) {
  if (!v) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function Pipeline() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const dragItem = useRef<{ id: string; stage: string } | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("service_contacts")
      .select("id, name, phone, email, company, interest, estimated_value, priority, responsible, pipeline_stage, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setLeads((data as any[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  /* ── Filters ── */
  const allResponsibles = [...new Set(leads.map((l) => l.responsible).filter(Boolean))] as string[];

  const filtered = leads.filter((l) => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      l.name?.toLowerCase().includes(s) ||
      l.company?.toLowerCase().includes(s);
    const matchResp = responsibleFilter === "all" || l.responsible === responsibleFilter;
    const matchPri = priorityFilter === "all" || (l.priority || "media") === priorityFilter;
    return matchSearch && matchResp && matchPri;
  });

  /* ── Drag & Drop ── */
  const moveToStage = async (leadId: string, newStage: string) => {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, pipeline_stage: newStage } : l)));
    const { error } = await supabase
      .from("service_contacts")
      .update({ pipeline_stage: newStage } as any)
      .eq("id", leadId);
    if (error) { setLeads(prev); toast.error("Erro ao mover lead"); }
  };

  const onDragStart = (e: React.DragEvent, lead: PipelineLead) => {
    dragItem.current = { id: lead.id, stage: lead.pipeline_stage || "novo" };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lead.id);
  };

  const onDragOver = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stageKey);
  };

  const onDrop = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    setDragOverStage(null);
    const leadId = e.dataTransfer.getData("text/plain");
    if (leadId && dragItem.current && dragItem.current.stage !== stageKey) {
      moveToStage(leadId, stageKey);
    }
    dragItem.current = null;
  };

  /* ── Group by stage ── */
  const grouped: Record<string, PipelineLead[]> = {};
  for (const s of STAGES) grouped[s.key] = [];
  for (const l of filtered) {
    const stage = l.pipeline_stage || "novo";
    if (grouped[stage]) grouped[stage].push(l);
    else grouped["novo"].push(l);
  }

  /* ── Stage value totals ── */
  const stageTotals: Record<string, number> = {};
  for (const s of STAGES) {
    stageTotals[s.key] = grouped[s.key].reduce((sum, l) => sum + (l.estimated_value || 0), 0);
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            placeholder="Filtrar por nome ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-muted/30 border-border/50"
          />
        </div>
        <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
          <SelectTrigger className="w-[180px] h-10 rounded-xl bg-muted/30 border-border/50 text-sm">
            <SelectValue placeholder="Todos responsáveis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos responsáveis</SelectItem>
            {allResponsibles.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[130px] h-10 rounded-xl bg-muted/30 border-border/50 text-sm">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stage headers (horizontal strip) */}
      <div className="grid grid-cols-6 gap-3 shrink-0">
        {STAGES.map((stage) => (
          <div key={stage.key} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full shrink-0", stage.dot)} />
              <span className="text-[11px] font-bold text-foreground uppercase tracking-wider truncate">{stage.label}</span>
              <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">{grouped[stage.key].length}</span>
            </div>
            {stageTotals[stage.key] > 0 && (
              <span className="text-[11px] text-muted-foreground/60 pl-4 tabular-nums">
                {formatCurrency(stageTotals[stage.key])}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-6 gap-3 flex-1 min-h-0">
        {STAGES.map((stage) => {
          const items = grouped[stage.key];
          const isDragOver = dragOverStage === stage.key;
          return (
            <div
              key={stage.key}
              className={cn(
                "flex flex-col rounded-xl bg-muted/20 border border-border/40 transition-colors min-h-[300px]",
                isDragOver && "ring-2 ring-primary/30 bg-primary/5"
              )}
              onDragOver={(e) => onDragOver(e, stage.key)}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => onDrop(e, stage.key)}
            >
              <ScrollArea className="flex-1 p-2">
                <div className="space-y-2">
                  {items.length === 0 && !loading && (
                    <div className="text-center py-10 text-muted-foreground/30 text-[11px]">
                      Arraste leads aqui
                    </div>
                  )}
                  {items.map((lead) => {
                    const priCfg = PRIORITY_BADGE[lead.priority || "media"] || PRIORITY_BADGE.media;
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, lead)}
                        className="rounded-lg border border-border/50 bg-card p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-primary/20 transition-all space-y-2"
                      >
                        {/* Name */}
                        <p className="text-sm font-semibold text-foreground truncate">{lead.name || "Sem nome"}</p>

                        {/* Company + Interest */}
                        {(lead.company || lead.interest) && (
                          <div className="space-y-0.5">
                            {lead.company && (
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Building2 className="w-3 h-3 shrink-0" />
                                <span className="truncate">{lead.company}</span>
                              </div>
                            )}
                            {lead.interest && (
                              <p className="text-[11px] text-primary/70 truncate">{lead.interest}</p>
                            )}
                          </div>
                        )}

                        {/* Value + Priority */}
                        <div className="flex items-center justify-between gap-1">
                          {lead.estimated_value ? (
                            <span className="text-xs font-bold text-foreground tabular-nums">
                              {formatCurrency(lead.estimated_value)}
                            </span>
                          ) : <span />}
                          <Badge variant="outline" className={cn("text-[9px] font-medium rounded-md px-1.5 py-0", priCfg.color)}>
                            {priCfg.label}
                          </Badge>
                        </div>

                        {/* Responsible */}
                        {lead.responsible && (
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                            <User className="w-3 h-3" />
                            <span className="truncate">{lead.responsible}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </div>
  );
}
