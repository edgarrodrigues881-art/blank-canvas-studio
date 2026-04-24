import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Building2, User, Clock, Eye, ArrowRight, ArrowLeft, Pencil, MoreHorizontal, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const STAGES = [
  { key: "novo",       label: "Novo Lead",   dot: "bg-blue-500",     ring: "ring-blue-500/20",   bg: "#eff6ff", fg: "#1d4ed8" },
  { key: "respondeu",  label: "Respondeu",   dot: "bg-cyan-500",     ring: "ring-cyan-500/20",   bg: "#ecfeff", fg: "#0e7490" },
  { key: "interessado",label: "Interessado", dot: "bg-amber-500",    ring: "ring-amber-500/20",  bg: "#fffbeb", fg: "#92400e" },
  { key: "agendado",   label: "Agendado",    dot: "bg-violet-500",   ring: "ring-violet-500/20", bg: "#f5f3ff", fg: "#5b21b6" },
  { key: "negociacao", label: "Negociação",  dot: "bg-orange-500",   ring: "ring-orange-500/20", bg: "#fff7ed", fg: "#c2410c" },
  { key: "fechado",    label: "Fechado",     dot: "bg-emerald-500",  ring: "ring-emerald-500/20",bg: "#f0fdf4", fg: "#15803d" },
  { key: "perdido",    label: "Perdido",     dot: "bg-red-500/60",   ring: "ring-red-500/10",    bg: "#fef2f2", fg: "#991b1b" },
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
  avatar_url: string | null;
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
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("service_contacts")
      .select("id,name,phone,company,interest,estimated_value,lead_temperature,responsible,pipeline_stage,last_message_at,created_at,avatar_url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) {
      console.error("[Pipeline] fetch error:", error);
      toast.error("Erro ao carregar leads: " + error.message);
    }
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

  const getPrevStage = (current: string) => {
    const idx = STAGES.findIndex((s) => s.key === current);
    if (idx <= 0) return null;
    return STAGES[idx - 1].key;
  };

  const navigate = useNavigate();

  const totalValue = filtered.reduce((s, l) => s + (l.estimated_value || 0), 0);
  const isPerdido = (key: string) => key === "perdido";

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-6rem)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Pipeline de Vendas</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} leads · {currency(totalValue) || "R$ 0"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
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
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden -mx-1 px-1 pipeline-scroll">
        <div className="inline-flex gap-3 h-full pb-2" style={{ minWidth: "1200px" }}>
          {STAGES.map((stage) => {
            const items = grouped[stage.key];
            const total = items.reduce((s, l) => s + (l.estimated_value || 0), 0);
            const isOver = overStage === stage.key;
            const lost = isPerdido(stage.key);

            return (
              <div
                key={stage.key}
                className={cn("flex flex-col shrink-0 h-full", lost ? "w-[180px]" : "w-[240px]")}
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
                <div
                  className={cn(
                    "px-3 py-2.5 mb-2 shrink-0 rounded-xl border",
                    lost && "opacity-60"
                  )}
                  style={{
                    backgroundColor: stage.bg,
                    borderColor: `${stage.fg}1f`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", stage.dot)} />
                    <span
                      className="text-[11.5px] font-bold uppercase tracking-wider"
                      style={{ color: stage.fg }}
                    >
                      {stage.label}
                    </span>
                    <span
                      className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
                      style={{ color: stage.fg, backgroundColor: `${stage.fg}1a` }}
                    >
                      {items.length}
                    </span>
                  </div>
                  {total > 0 && (
                    <p
                      className="text-[11px] font-semibold mt-1 tabular-nums"
                      style={{ color: stage.fg }}
                    >
                      {currencyShort(total)}
                    </p>
                  )}
                </div>

                {/* Column body */}
                <div
                  className={cn(
                    "flex-1 min-h-0 rounded-xl p-2 overflow-y-auto transition-all duration-200 pipeline-column-scroll",
                    "border",
                    lost && "opacity-50",
                  )}
                  style={
                    isOver
                      ? { backgroundColor: `${stage.fg}14`, borderColor: `${stage.fg}55`, boxShadow: `inset 0 0 0 1px ${stage.fg}33` }
                      : { backgroundColor: "hsl(var(--muted) / 0.15)", borderColor: "hsl(var(--border) / 0.3)" }
                  }
                >
                  <div className="space-y-2">
                    {items.length === 0 && !loading && (
                      <p className="text-center text-[11px] text-muted-foreground/30 py-16 select-none">
                        Arraste leads aqui
                      </p>
                    )}
                    {items.map((lead) => {
                      const temp = TEMP_CONFIG[lead.lead_temperature || ""];
                      // Fallback: derive temperature from days since last activity if not set in DB
                      const _lastTs = lead.last_message_at || lead.created_at;
                      const _ageDays = _lastTs ? Math.floor((Date.now() - new Date(_lastTs).getTime()) / 86400000) : 0;
                      const effectiveTemp = lead.lead_temperature
                        ? lead.lead_temperature
                        : _ageDays > 7 ? "quente" : _ageDays >= 3 ? "morno" : "frio";
                      const isHot = effectiveTemp === "quente";
                      const isWarm = effectiveTemp === "morno";
                      const hasName = lead.name && lead.name !== lead.phone;
                      const rawDisplay = hasName ? lead.name! : (lead.company || formatPhone(lead.phone));
                      // Truncate names (not phone numbers) longer than 15 chars to first word + "..."
                      const isPhoneDisplay = !hasName && !lead.company;
                      const displayName = (!isPhoneDisplay && rawDisplay.length > 15)
                        ? `${rawDisplay.trim().split(/\s+/)[0]}...`
                        : rawDisplay;
                      const val = currency(lead.estimated_value);
                      const ago = timeShort(lead.last_message_at || lead.created_at);
                      const nextStage = getNextStage(lead.pipeline_stage || "novo");
                      const prevStage = getPrevStage(lead.pipeline_stage || "novo");

                      // Avatar — initials from name; if no name, 2 first letters of phone (without 55 prefix). Never show full number.
                      let initials = "?";
                      if (hasName && lead.name) {
                        initials = lead.name
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join("")
                          .toUpperCase() || "?";
                      } else if (lead.company) {
                        initials = lead.company
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join("")
                          .toUpperCase() || "?";
                      } else if (lead.phone) {
                        const digits = lead.phone.replace(/\D/g, "");
                        initials = digits.slice(-2) || "?";
                      }
                      const avatarPalette = ["#3b82f6", "#06b6d4", "#8b5cf6", "#f59e0b", "#22c55e", "#ec4899", "#f97316", "#14b8a6", "#6366f1", "#ef4444"];
                      const avatarColor = avatarPalette[(initials.charCodeAt(0) || 0) % avatarPalette.length];

                      // Tempo parado — cor escalonada (3-7d laranja, 7d+ vermelho)
                      const lastTs = lead.last_message_at || lead.created_at;
                      const ageDays = lastTs ? Math.floor((Date.now() - new Date(lastTs).getTime()) / 86400000) : 0;
                      const ageColor =
                        ageDays > 7 ? "text-red-500" :
                        ageDays >= 3 ? "text-orange-500" :
                        "text-muted-foreground/40";

                      // Card bg always white/default. Avatar receives the temperature color.
                      const isDragging = draggingId === lead.id;
                      const cardStyle: React.CSSProperties = {};
                      if (isDragging) {
                        cardStyle.opacity = 0.95;
                        cardStyle.boxShadow = "0 4px 12px -2px rgba(0,0,0,0.12), 0 2px 4px -1px rgba(0,0,0,0.06)";
                      }

                      // Avatar bg by first letter of name
                      const letterColorMap: Record<string, string> = {
                        A: "#3b82f6", H: "#3b82f6", N: "#3b82f6", U: "#3b82f6",
                        B: "#8b5cf6", I: "#8b5cf6", O: "#8b5cf6", V: "#8b5cf6",
                        C: "#22c55e", J: "#22c55e", P: "#22c55e", W: "#22c55e",
                        D: "#f97316", K: "#f97316", Q: "#f97316", X: "#f97316",
                        E: "#06b6d4", L: "#06b6d4", R: "#06b6d4", Y: "#06b6d4",
                        F: "#ec4899", M: "#ec4899", S: "#ec4899", Z: "#ec4899",
                        G: "#f59e0b", T: "#f59e0b",
                      };
                      const firstLetter = (initials[0] || "").toUpperCase();
                      const avatarBg = letterColorMap[firstLetter] || "#6b7280";
                      const avatarFg = "#ffffff";

                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => {
                            dragRef.current = { id: lead.id, from: lead.pipeline_stage || "novo" };
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", lead.id);
                            setDraggingId(lead.id);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setOverStage(null);
                          }}
                          style={cardStyle}
                          className={cn(
                            "group/card relative rounded-xl px-3 py-2.5 cursor-grab active:cursor-grabbing",
                            "transition-shadow duration-150",
                            "bg-card border border-border/40",
                            !isDragging && "hover:shadow-md hover:shadow-black/5 hover:border-border/60",
                          )}
                        >
                          {/* "···" hover menu — top right */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="absolute top-1.5 right-1.5 opacity-0 group-hover/card:opacity-100 data-[state=open]:opacity-100 transition-opacity p-1 rounded-md hover:bg-muted/60 text-muted-foreground"
                                title="Ações"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem
                                disabled={!nextStage}
                                onClick={() => nextStage && move(lead.id, nextStage)}
                              >
                                <ArrowRight className="w-3.5 h-3.5 mr-2" />
                                Avançar etapa
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!prevStage}
                                onClick={() => prevStage && move(lead.id, prevStage)}
                              >
                                <ArrowLeft className="w-3.5 h-3.5 mr-2" />
                                Voltar etapa
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => navigate(`/dashboard/conversations?phone=${encodeURIComponent(lead.phone)}`)}
                              >
                                <MessageCircle className="w-3.5 h-3.5 mr-2" />
                                Abrir conversa
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => navigate(`/dashboard/leads?id=${lead.id}`)}
                              >
                                <Eye className="w-3.5 h-3.5 mr-2" />
                                Ver detalhes
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>


                          <div className="flex items-start gap-2.5">
                            {/* Avatar — color reflects temperature (Frio=cinza, Morno=âmbar, Quente=vermelho) */}
                            <div
                              className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold uppercase"
                              style={{ backgroundColor: avatarBg, color: avatarFg }}
                            >
                              {initials}
                            </div>

                            <div className="min-w-0 flex-1">
                              {/* Name */}
                              <div className="flex items-start justify-between gap-2 pr-5">
                                <p className={cn(
                                  "text-[13px] font-bold leading-snug",
                                  lost ? "text-muted-foreground/60" : "text-foreground"
                                )}>
                                  {displayName}
                                </p>
                              </div>

                              {/* Phone (only if name shown) */}
                              {lead.phone && hasName && (
                                <p className="text-[10px] text-muted-foreground/55 mt-0.5 tabular-nums">
                                  {formatPhone(lead.phone)}
                                </p>
                              )}

                              {/* Meta row — sem valor R$ */}
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {ago && (
                                  <span className={cn(
                                    "text-[10px] flex items-center gap-0.5 tabular-nums font-medium",
                                    ageColor
                                  )}>
                                    <Clock className="w-2.5 h-2.5" />{ago}
                                  </span>
                                )}
                                {lead.responsible && (
                                  <span className="text-[10px] text-muted-foreground/55 flex items-center gap-0.5 ml-auto truncate max-w-[80px]">
                                    <User className="w-2.5 h-2.5 shrink-0" />{lead.responsible}
                                  </span>
                                )}
                              </div>
                            </div>
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
