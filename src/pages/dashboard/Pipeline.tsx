import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { GitBranch, User, Phone, Sparkles, GripVertical, Clock, Tag, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/utils/formatters";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── Pipeline stages config ── */
const STAGES = [
  { key: "novo", label: "Novo Lead", color: "border-t-blue-500", bg: "bg-blue-500/10", badge: "bg-blue-500/20 text-blue-400" },
  { key: "respondeu", label: "Respondeu", color: "border-t-cyan-500", bg: "bg-cyan-500/10", badge: "bg-cyan-500/20 text-cyan-400" },
  { key: "interessado", label: "Interessado", color: "border-t-amber-500", bg: "bg-amber-500/10", badge: "bg-amber-500/20 text-amber-400" },
  { key: "negociacao", label: "Negociação", color: "border-t-purple-500", bg: "bg-purple-500/10", badge: "bg-purple-500/20 text-purple-400" },
  { key: "fechado", label: "Fechado", color: "border-t-emerald-500", bg: "bg-emerald-500/10", badge: "bg-emerald-500/20 text-emerald-400" },
  { key: "perdido", label: "Perdido", color: "border-t-red-500/50", bg: "bg-red-500/5", badge: "bg-red-500/20 text-red-400" },
] as const;

type StageKey = typeof STAGES[number]["key"];

const TEMP_CONFIG: Record<string, { icon: string; color: string }> = {
  frio: { icon: "❄️", color: "text-blue-400" },
  morno: { icon: "☀️", color: "text-amber-400" },
  quente: { icon: "🔥", color: "text-red-400" },
  cliente: { icon: "✅", color: "text-emerald-400" },
  perdido: { icon: "💀", color: "text-muted-foreground" },
};

interface PipelineLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  tags: string[];
  lead_temperature: string | null;
  pipeline_stage: string | null;
  last_message_at: string | null;
  last_message_content: string | null;
  created_at: string;
}

export default function Pipeline() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);
  const dragItem = useRef<{ id: string; stage: string } | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [tagPopoverId, setTagPopoverId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");

  const SUGGESTED_TAGS = ["Interessado", "Sem resposta", "Follow-up", "Cliente", "VIP", "Urgente", "Negociação", "Retorno"];

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("service_contacts")
      .select("id, name, phone, email, tags, lead_temperature, pipeline_stage, last_message_at, last_message_content, created_at")
      .eq("user_id", user.id)
      .not("pipeline_stage", "is", null)
      .order("created_at", { ascending: false });
    setLeads((data as any[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const moveToStage = async (leadId: string, newStage: string) => {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, pipeline_stage: newStage } : l)));
    const { error } = await supabase
      .from("service_contacts")
      .update({ pipeline_stage: newStage } as any)
      .eq("id", leadId);
    if (error) {
      setLeads(prev);
      toast.error("Erro ao mover lead");
    }
  };

  /* ── Drag handlers ── */
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

  const onDragLeave = () => setDragOverStage(null);

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
  for (const l of leads) {
    const stage = l.pipeline_stage || "novo";
    if (grouped[stage]) grouped[stage].push(l);
    else grouped["novo"].push(l);
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
          <Badge variant="secondary" className="text-xs">{leads.length} leads</Badge>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-3 min-h-[500px]" style={{ minWidth: STAGES.length * 260 }}>
          {STAGES.map((stage) => {
            const items = grouped[stage.key];
            const isDragOver = dragOverStage === stage.key;
            return (
              <div
                key={stage.key}
                className={cn(
                  "flex flex-col w-[250px] shrink-0 rounded-xl border-t-[3px] border border-border bg-card/50 transition-colors",
                  stage.color,
                  isDragOver && "ring-2 ring-primary/40 bg-primary/5"
                )}
                onDragOver={(e) => onDragOver(e, stage.key)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, stage.key)}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">{stage.label}</span>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", stage.badge)}>
                    {items.length}
                  </span>
                </div>

                {/* Cards */}
                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-2">
                    {items.length === 0 && !loading && (
                      <div className="text-center py-8 text-muted-foreground/40 text-xs">
                        Arraste leads aqui
                      </div>
                    )}
                    {items.map((lead) => {
                      const temp = TEMP_CONFIG[lead.lead_temperature || "frio"] || TEMP_CONFIG.frio;
                      return (
                        <Card
                          key={lead.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, lead)}
                          className={cn(
                            "p-3 cursor-grab active:cursor-grabbing border-border/60 hover:border-primary/30 transition-all hover:shadow-md bg-card group"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              {/* Name + temperature */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-foreground truncate">{lead.name}</span>
                                <span className="text-xs shrink-0">{temp.icon}</span>
                              </div>

                              {/* Phone */}
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Phone className="w-3 h-3" />
                                <span className="text-[11px]">{formatPhone(lead.phone)}</span>
                              </div>

                              {/* Last message preview */}
                              {lead.last_message_content && (
                                <p className="text-[11px] text-muted-foreground/70 line-clamp-2 leading-relaxed">
                                  "{lead.last_message_content}"
                                </p>
                              )}

                              {/* Tags */}
                              {lead.tags && lead.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {lead.tags.slice(0, 2).map((tag) => (
                                    <Badge key={tag} variant="secondary" className="text-[9px] px-1.5 py-0">{tag}</Badge>
                                  ))}
                                  {lead.tags.length > 2 && (
                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">+{lead.tags.length - 2}</Badge>
                                  )}
                                </div>
                              )}

                              {/* Time */}
                              <div className="flex items-center gap-1 text-muted-foreground/50">
                                <Clock className="w-2.5 h-2.5" />
                                <span className="text-[10px]">
                                  {lead.last_message_at
                                    ? formatDistanceToNow(new Date(lead.last_message_at), { addSuffix: true, locale: ptBR })
                                    : format(lead.created_at)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function format(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
}
