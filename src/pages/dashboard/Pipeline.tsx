import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
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

const TEMP: Record<string, string> = { frio: "Frio", morno: "Morno", quente: "Quente" };
const TEMP_COLOR: Record<string, string> = {
  frio: "text-blue-500 bg-blue-50",
  morno: "text-amber-600 bg-amber-50",
  quente: "text-red-500 bg-red-50",
};

function currency(v: number | null) {
  if (!v) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
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

  const fetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("service_contacts")
      .select("id,name,phone,company,interest,estimated_value,lead_temperature,responsible,pipeline_stage,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setLeads((data as any[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

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
    <div className="h-full flex flex-col gap-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por nome ou empresa..."
            className="pl-9 h-9 text-sm bg-white border-gray-200 rounded-lg shadow-none focus:border-gray-300"
          />
        </div>
        <Select value={respFilter} onValueChange={setRespFilter}>
          <SelectTrigger className="w-[170px] h-9 text-sm bg-white border-gray-200 rounded-lg shadow-none">
            <SelectValue placeholder="Todos responsáveis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos responsáveis</SelectItem>
            {responsibles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm bg-white border-gray-200 rounded-lg shadow-none">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Column headers */}
      <div className="overflow-x-auto flex-1 min-h-0">
        <div className="inline-flex gap-4 min-w-full pb-4 h-full" style={{ minWidth: "960px" }}>
          {STAGES.map((stage) => {
            const items = grouped[stage.key];
            const total = items.reduce((s, l) => s + (l.estimated_value || 0), 0);
            return (
              <div
                key={stage.key}
                className={cn(
                  "flex flex-col w-[220px] shrink-0 transition-colors",
                  overStage === stage.key && "opacity-90"
                )}
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
                {/* Header */}
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.dot }} />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{stage.label}</span>
                  <span className="text-[11px] text-gray-400 ml-auto">{items.length}</span>
                </div>
                {total > 0 && (
                  <p className="text-[11px] text-gray-400 mb-2 px-1 pl-5">{currency(total)}</p>
                )}
                {total === 0 && <div className="mb-2" />}

                {/* Column body */}
                <div
                  className={cn(
                    "flex-1 rounded-lg bg-gray-50/80 border border-dashed border-gray-200/80 p-2 overflow-y-auto transition-colors",
                    overStage === stage.key && "bg-blue-50/40 border-blue-200/60"
                  )}
                >
                  <div className="space-y-2.5">
                    {items.length === 0 && !loading && (
                      <p className="text-center text-[11px] text-gray-300 py-10">Arraste leads aqui</p>
                    )}
                    {items.map((lead) => {
                      const temp = lead.lead_temperature || "";
                      const tempLabel = TEMP[temp];
                      const tempColor = TEMP_COLOR[temp] || "";
                      const displayName = lead.name && lead.name !== lead.phone
                        ? lead.name
                        : `+${lead.phone?.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, "$1 $2 $3-$4")}`;
                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => {
                            dragRef.current = { id: lead.id, from: lead.pipeline_stage || "novo" };
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", lead.id);
                          }}
                          className="bg-white rounded-lg border border-gray-100 p-3 cursor-grab active:cursor-grabbing hover:border-gray-200 hover:shadow-sm transition-all group"
                        >
                          <p className="text-[13px] font-medium text-gray-800 truncate leading-tight">
                            {displayName}
                          </p>

                          {(lead.company || lead.interest) && (
                            <p className="text-[11px] text-gray-400 truncate mt-1 leading-tight">
                              {[lead.company, lead.interest].filter(Boolean).join(" · ")}
                            </p>
                          )}

                          <div className="flex items-center justify-between mt-2.5">
                            {lead.estimated_value ? (
                              <span className="text-[12px] font-semibold text-gray-700 tabular-nums">
                                {currency(lead.estimated_value)}
                              </span>
                            ) : <span />}

                            {tempLabel && (
                              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", tempColor)}>
                                {tempLabel}
                              </span>
                            )}
                          </div>

                          {lead.responsible && (
                            <p className="text-[10px] text-gray-400 mt-1.5 truncate">
                              👤 {lead.responsible}
                            </p>
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
