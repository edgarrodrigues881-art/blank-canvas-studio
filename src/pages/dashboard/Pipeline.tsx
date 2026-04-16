import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Building2, User, Clock, Eye, ArrowRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "novo", label: "Novo Lead", dot: "bg-blue-500", ring: "ring-blue-500/20" },
  { key: "respondeu", label: "Respondeu", dot: "bg-cyan-500", ring: "ring-cyan-500/20" },
  { key: "interessado", label: "Interessado", dot: "bg-amber-500", ring: "ring-amber-500/20" },
  { key: "agendado", label: "Agendado", dot: "bg-indigo-500", ring: "ring-indigo-500/20" },
  { key: "negociacao", label: "Negociação", dot: "bg-purple-500", ring: "ring-purple-500/20" },
  { key: "fechado", label: "Fechado", dot: "bg-emerald-500", ring: "ring-emerald-500/20" },
  { key: "perdido", label: "Perdido", dot: "bg-red-500/60", ring: "ring-red-500/10" },
] as const;

interface Lead {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  interest: string | null;
  estimated_value: number | null;
  lead_temperature: string | null;
  responsible: string | null;
  pipeline_stage: string | null;
  last_message_at: string | null;
  created_at: string;
}

const TEMP_CONFIG: Record<string, { label: string; cls: string; glow?: string }> = {
  frio:   { label: "❄️", cls: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  morno:  { label: "🔥", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  quente: { label: "🔥", cls: "text-rose-400 bg-rose-500/10 border-rose-500/20", glow: "shadow-[0_0_12px_-2px_hsl(0_80%_60%/0.15)]" },
};

function currency(v: number | null) {
  if (!v) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

function currencyShort(v: number) {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${v}`;
}

function formatPhone(phone: string) {
  if (!phone) return "";
  return phone.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, "+$1 $2 $3-$4");
}

function timeShort(date: string | null) {
  if (!date) return null;
  try {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    return `${Math.floor(days / 30)}mo`;
  } catch { return null; }
}

export default function Pipeline() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [respFilter, setRespFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const dragRef = useRef<{ id: string; from: string } | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("service_contacts")
      .select("id,name,phone,company,interest,estimated_value,lead_temperature,responsible,pipeline_stage,last_message_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setLeads((data as any[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const responsibles = [...new Set(leads.map((l) => l.responsible).filter(Boolean))] as string[];

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    return (
      (!search || l.name?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q) || l.phone?.includes(search)) &&
      (respFilter === "all" || l.responsible === respFilter) &&
      (stageFilter === "all" || (l.pipeline_stage || "novo") === stageFilter)
    );
  });

  const grouped: Record<string, Lead[]> = {};
  for (const s of STAGES) grouped[s.key] = [];
  for (const l of filtered) {
    const k = l.pipeline_stage || "novo";
    (grouped[k] || grouped["novo"]).push(l);
  }

  const move = async (id: string, to: string) => {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, pipeline_stage: to } : l)));
    const { error } = await supabase.from("service_contacts").update({ pipeline_stage: to } as any).eq("id", id);
    if (error) { setLeads(prev); toast.error("Erro ao mover"); }
  };

  const getNextStage = (current: string) => {
    const idx = STAGES.findIndex((s) => s.key === current);
    if (idx < 0 || idx >= STAGES.length - 1) return null;
    return STAGES[idx + 1].key;
  };

  const totalValue = filtered.reduce((s, l) => s + (l.estimated_value || 0), 0);
  const isPerdido = (key: string) => key === "perdido";

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Pipeline de Vendas</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} leads · {currency(totalValue) || "R$ 0"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead..."
            className="pl-9 h-9 text-sm rounded-xl border-border/40 bg-muted/20 shadow-none focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/20"
          />
        </div>
        <Select value={respFilter} onValueChange={setRespFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm rounded-xl border-border/40 bg-muted/20 shadow-none">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {responsibles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm rounded-xl border-border/40 bg-muted/20 shadow-none">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban */}
      <div className="overflow-x-auto flex-1 min-h-0 -mx-1 px-1">
        <div className="inline-flex gap-3 min-w-full pb-4 h-full" style={{ minWidth: "1200px" }}>
          {STAGES.map((stage) => {
            const items = grouped[stage.key];
            const total = items.reduce((s, l) => s + (l.estimated_value || 0), 0);
            const isOver = overStage === stage.key;
            const lost = isPerdido(stage.key);

            return (
              <div
                key={stage.key}
                className={cn("flex flex-col shrink-0", lost ? "w-[180px]" : "w-[240px]")}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverStage(stage.key); }}
                onDragLeave={() => setOverStage(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverStage(null);
                  const id = e.dataTransfer.getData("text/plain");
                  if (id && dragRef.current && dragRef.current.from !== stage.key) move(id, stage.key);
                  dragRef.current = null;
                }}
              >
                {/* Column header */}
                <div className={cn("px-2.5 mb-2", lost && "opacity-60")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", stage.dot)} />
                    <span className="text-[12px] font-semibold text-foreground uppercase tracking-wider">
                      {stage.label}
                    </span>
                    <span className="ml-auto text-[11px] font-bold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-md tabular-nums">
                      {items.length}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5 tabular-nums">
                    {items.length} {items.length === 1 ? "lead" : "leads"}{total > 0 ? ` · ${currencyShort(total)}` : ""}
                  </p>
                </div>

                {/* Column body */}
                <div
                  className={cn(
                    "flex-1 rounded-xl p-2 overflow-y-auto transition-all duration-200",
                    "bg-muted/15 border border-border/30",
                    lost && "opacity-50",
                    isOver && "bg-primary/[0.06] border-primary/30 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.1)]"
                  )}
                >
                  <div className="space-y-2">
                    {items.length === 0 && !loading && (
                      <p className="text-center text-[11px] text-muted-foreground/30 py-16 select-none">
                        Arraste leads aqui
                      </p>
                    )}
                    {items.map((lead) => {
                      const temp = TEMP_CONFIG[lead.lead_temperature || ""];
                      const isHot = lead.lead_temperature === "quente";
                      const hasName = lead.name && lead.name !== lead.phone;
                      const displayName = hasName ? lead.name : (lead.company || formatPhone(lead.phone));
                      const val = currency(lead.estimated_value);
                      const ago = timeShort(lead.last_message_at || lead.created_at);
                      const nextStage = getNextStage(lead.pipeline_stage || "novo");

                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => {
                            dragRef.current = { id: lead.id, from: lead.pipeline_stage || "novo" };
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", lead.id);
                          }}
                          className={cn(
                            "group/card bg-card rounded-xl border border-border/40 px-3.5 py-3 cursor-grab active:cursor-grabbing",
                            "transition-all duration-150",
                            "hover:shadow-md hover:shadow-black/5 hover:border-border/60",
                            "active:scale-[0.97]",
                            isHot && "border-rose-500/20",
                            isHot && temp?.glow
                          )}
                        >
                          {/* Top row: Name + Temp */}
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn(
                              "text-[13px] font-semibold leading-snug truncate",
                              lost ? "text-muted-foreground/60" : "text-foreground"
                            )}>
                              {displayName}
                            </p>
                            {temp && (
                              <span className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0",
                                temp.cls
                              )}>
                                {temp.label}
                              </span>
                            )}
                          </div>

                          {/* Phone */}
                          {lead.phone && hasName && (
                            <p className="text-[10px] text-muted-foreground/35 mt-0.5 tabular-nums">
                              {formatPhone(lead.phone)}
                            </p>
                          )}

                          {/* Meta row */}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {val && (
                              <span className="text-[11px] font-bold text-emerald-500 tabular-nums">{val}</span>
                            )}
                            {ago && (
                              <span className="text-[10px] text-muted-foreground/40 flex items-center gap-0.5 tabular-nums">
                                <Clock className="w-2.5 h-2.5" />{ago}
                              </span>
                            )}
                            {lead.responsible && (
                              <span className="text-[10px] text-muted-foreground/40 flex items-center gap-0.5 ml-auto truncate max-w-[80px]">
                                <User className="w-2.5 h-2.5 shrink-0" />{lead.responsible}
                              </span>
                            )}
                          </div>

                          {/* Hover actions */}
                          <div className="hidden group-hover/card:flex items-center gap-1 mt-2 pt-2 border-t border-border/20">
                            {nextStage && (
                              <button
                                onClick={(e) => { e.stopPropagation(); move(lead.id, nextStage); }}
                                className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-0.5 transition-colors"
                                title="Avançar etapa"
                              >
                                <ArrowRight className="w-3 h-3" /> Avançar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
