import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "novo", label: "Novo Lead", dot: "#3b82f6" },
  { key: "respondeu", label: "Respondeu", dot: "#06b6d4" },
  { key: "interessado", label: "Interessado", dot: "#f59e0b" },
  { key: "negociacao", label: "Negociação", dot: "#a855f7" },
  { key: "fechado", label: "Fechado", dot: "#22c55e" },
  { key: "perdido", label: "Perdido", dot: "#ef4444" },
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
  created_at: string;
}

const TEMP_CONFIG: Record<string, { label: string; cls: string }> = {
  frio:   { label: "Frio",   cls: "text-sky-600 bg-sky-50 border-sky-200/60" },
  morno:  { label: "Morno",  cls: "text-amber-600 bg-amber-50 border-amber-200/60" },
  quente: { label: "Quente", cls: "text-rose-600 bg-rose-50 border-rose-200/60" },
};

function currency(v: number | null) {
  if (!v) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatPhone(phone: string) {
  if (!phone) return "";
  return phone.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, "+$1 $2 $3-$4");
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
      .select("id,name,phone,company,interest,estimated_value,lead_temperature,responsible,pipeline_stage,created_at")
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

  return (
    <div className="h-full flex flex-col gap-5">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead..."
            className="pl-9 h-9 text-sm rounded-lg border-border/60 bg-background shadow-none focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/20"
          />
        </div>
        <Select value={respFilter} onValueChange={setRespFilter}>
          <SelectTrigger className="w-[170px] h-9 text-sm rounded-lg border-border/60 bg-background shadow-none">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {responsibles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[150px] h-9 text-sm rounded-lg border-border/60 bg-background shadow-none">
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
        <div className="inline-flex gap-3.5 min-w-full pb-4 h-full" style={{ minWidth: "1020px" }}>
          {STAGES.map((stage) => {
            const items = grouped[stage.key];
            const total = items.reduce((s, l) => s + (l.estimated_value || 0), 0);
            const isOver = overStage === stage.key;

            return (
              <div
                key={stage.key}
                className="flex flex-col w-[220px] shrink-0"
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
                <div className="flex items-center gap-2 px-1 mb-0.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.dot }} />
                  <span className="text-[13px] font-semibold text-foreground/80 uppercase tracking-wide">{stage.label}</span>
                  <span className="ml-auto text-[11px] font-medium text-muted-foreground/50 tabular-nums">
                    {items.length}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground/40 mb-2.5 px-1 pl-5 tabular-nums h-4">
                  {total > 0 ? currency(total) : ""}
                </p>

                {/* Column body */}
                <div
                  className={cn(
                    "flex-1 rounded-xl p-2.5 overflow-y-auto transition-colors duration-200",
                    "bg-muted/25 border border-border/25",
                    isOver && "bg-primary/[0.04] border-primary/20"
                  )}
                >
                  <div className="space-y-3">
                    {items.length === 0 && !loading && (
                      <p className="text-center text-[11px] text-muted-foreground/25 py-14 select-none">
                        Arraste leads aqui
                      </p>
                    )}
                    {items.map((lead) => {
                      const temp = TEMP_CONFIG[lead.lead_temperature || ""];
                      const hasName = lead.name && lead.name !== lead.phone;
                      const displayName = hasName ? lead.name : (lead.company || formatPhone(lead.phone));
                      const val = currency(lead.estimated_value);

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
                            "bg-background rounded-lg border border-border/50 p-4 cursor-grab active:cursor-grabbing",
                            "transition-all duration-150",
                            "hover:shadow-[0_3px_12px_-3px_rgba(0,0,0,0.08)] hover:border-border/70",
                            "active:scale-[0.98]"
                          )}
                        >
                          {/* Name */}
                          <p className="text-[14px] font-semibold text-foreground leading-snug truncate">
                            {displayName}
                          </p>

                          {/* Company + Interest */}
                          {(lead.company || lead.interest) && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <Building2 className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                              <p className="text-[11.5px] text-muted-foreground/60 truncate leading-snug">
                                {[hasName ? lead.company : null, lead.interest].filter(Boolean).join(" · ") || lead.interest}
                              </p>
                            </div>
                          )}

                          {/* Phone (always visible, discrete) */}
                          {lead.phone && (
                            <p className="text-[11px] text-muted-foreground/40 mt-1 tabular-nums">
                              {formatPhone(lead.phone)}
                            </p>
                          )}

                          {/* Divider */}
                          <div className="border-t border-border/30 my-3" />

                          {/* Value + Temperature */}
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn(
                              "text-[13px] font-bold tabular-nums",
                              val ? "text-emerald-600" : "text-muted-foreground/25"
                            )}>
                              {val || "—"}
                            </span>

                            {temp && (
                              <span className={cn(
                                "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                                temp.cls
                              )}>
                                {temp.label}
                              </span>
                            )}
                          </div>

                          {/* Responsible */}
                          {lead.responsible && (
                            <div className="flex items-center gap-1.5 mt-2.5">
                              <User className="w-3 h-3 text-muted-foreground/35 shrink-0" />
                              <p className="text-[11px] text-muted-foreground/50 truncate">
                                {lead.responsible}
                              </p>
                            </div>
                          )}
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
