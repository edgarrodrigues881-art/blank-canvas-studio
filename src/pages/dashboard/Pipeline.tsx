import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Building2, User, Clock, Eye, ArrowRight, ArrowLeft, Pencil, MoreHorizontal, MessageCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const STAGE_COLORS = [
  { key: "azul",    label: "Azul",    hex: "#3b82f6" },
  { key: "ciano",   label: "Ciano",   hex: "#06b6d4" },
  { key: "ambar",   label: "Âmbar",   hex: "#f59e0b" },
  { key: "roxo",    label: "Roxo",    hex: "#8b5cf6" },
  { key: "laranja", label: "Laranja", hex: "#f97316" },
  { key: "verde",   label: "Verde",   hex: "#22c55e" },
];

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

interface CustomStage {
  id: string;
  key: string;
  label: string;
  color: string;
  position: number;
}

const COLOR_TO_PALETTE: Record<string, { bg: string; fg: string; dot: string }> = {
  azul:    { bg: "#eff6ff", fg: "#1d4ed8", dot: "bg-blue-500" },
  ciano:   { bg: "#ecfeff", fg: "#0e7490", dot: "bg-cyan-500" },
  ambar:   { bg: "#fffbeb", fg: "#92400e", dot: "bg-amber-500" },
  roxo:    { bg: "#f5f3ff", fg: "#5b21b6", dot: "bg-violet-500" },
  laranja: { bg: "#fff7ed", fg: "#c2410c", dot: "bg-orange-500" },
  verde:   { bg: "#f0fdf4", fg: "#15803d", dot: "bg-emerald-500" },
};

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
  const [stageDragKey, setStageDragKey] = useState<string | null>(null);
  const [stageOverKey, setStageOverKey] = useState<string | null>(null);
  const [newStageOpen, setNewStageOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0].key);
  const [stageLabels, setStageLabels] = useState<Record<string, string>>({});
  const [editingStageKey, setEditingStageKey] = useState<string | null>(null);
  const [editingStageDraft, setEditingStageDraft] = useState("");
  const [deleteStage, setDeleteStage] = useState<{ key: string; label: string } | null>(null);
  const [moveTargetKey, setMoveTargetKey] = useState<string>("");
  const [deletingStage, setDeletingStage] = useState(false);
  const [customStages, setCustomStages] = useState<CustomStage[]>([]);
  const [creatingStage, setCreatingStage] = useState(false);
  const [hiddenDefaults, setHiddenDefaults] = useState<Set<string>>(() => {
    try {
      const initialized = localStorage.getItem("pipeline_initialized_v2");
      if (!initialized) {
        // First-time setup: hide all default stages except "novo"
        const defaults = ["respondeu","interessado","agendado","negociacao","fechado","perdido"];
        localStorage.setItem("pipeline_hidden_defaults", JSON.stringify(defaults));
        localStorage.setItem("pipeline_initialized_v2", "1");
        return new Set(defaults);
      }
      const raw = localStorage.getItem("pipeline_hidden_defaults");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });

  const DEFAULT_STAGE_KEYS = new Set(["novo","respondeu","interessado","agendado","negociacao","fechado","perdido"]);

  const persistHiddenDefaults = (next: Set<string>) => {
    setHiddenDefaults(new Set(next));
    try { localStorage.setItem("pipeline_hidden_defaults", JSON.stringify([...next])); } catch {}
  };

  // Build merged stage list: defaults (Novo..Negociacao) + custom + Fechado + Perdido at the end
  const allStages = (() => {
    const defaults = STAGES.filter(s => s.key !== "fechado" && s.key !== "perdido" && !hiddenDefaults.has(s.key));
    const tail = STAGES.filter(s => (s.key === "fechado" || s.key === "perdido") && !hiddenDefaults.has(s.key));
    const custom = customStages.map(c => {
      const pal = COLOR_TO_PALETTE[c.color] || COLOR_TO_PALETTE.azul;
      return { key: c.key, label: c.label, dot: pal.dot, ring: "", bg: pal.bg, fg: pal.fg };
    });
    return [...defaults, ...custom, ...tail];
  })();

  const fetchCustomStages = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("pipeline_stages")
      .select("id,key,label,color,position")
      .eq("user_id", user.id)
      .order("position", { ascending: true });
    if (error) {
      console.error("[Pipeline] custom stages fetch error:", error);
      return;
    }
    setCustomStages((data as CustomStage[]) || []);
  }, [user]);

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

  useEffect(() => { fetchLeads(); fetchCustomStages(); }, [fetchLeads, fetchCustomStages]);

  const handleCreateStage = async () => {
    if (!user || !newStageName.trim()) return;
    setCreatingStage(true);
    const label = newStageName.trim();
    const baseKey = "custom_" + label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const key = `${baseKey}_${Date.now().toString(36)}`;
    const maxPos = customStages.reduce((m, s) => Math.max(m, s.position), 0);
    const { error } = await supabase.from("pipeline_stages").insert({
      user_id: user.id, key, label, color: newStageColor, position: maxPos + 1,
    } as any);
    setCreatingStage(false);
    if (error) {
      toast.error("Erro ao criar etapa: " + error.message);
      return;
    }
    toast.success(`Etapa "${label}" criada`);
    setNewStageOpen(false);
    await fetchCustomStages();
  };

  const handleDeleteStage = async () => {
    if (!user || !deleteStage) return;
    const key = deleteStage.key;
    if (key === "novo") {
      toast.error('A etapa "Novo Lead" é fixa e não pode ser excluída');
      return;
    }
    const stageLeadCount = leads.filter(l => (l.pipeline_stage || "novo") === key).length;
    const hasLeads = stageLeadCount > 0;
    if (hasLeads && !moveTargetKey) return;
    const target = moveTargetKey;
    if (hasLeads && target === key) {
      toast.error("Escolha uma etapa diferente");
      return;
    }
    setDeletingStage(true);
    // Move leads only if there are any
    if (hasLeads) {
      const { error: moveErr } = await supabase
        .from("service_contacts")
        .update({ pipeline_stage: target } as any)
        .eq("user_id", user.id)
        .eq("pipeline_stage", key);
      if (moveErr) {
        setDeletingStage(false);
        toast.error("Erro ao mover leads: " + moveErr.message);
        return;
      }
    }
    if (DEFAULT_STAGE_KEYS.has(key)) {
      // Hide default stage locally (per-user persistence)
      const next = new Set(hiddenDefaults); next.add(key);
      persistHiddenDefaults(next);
    } else {
      const { error: delErr } = await supabase
        .from("pipeline_stages").delete().eq("user_id", user.id).eq("key", key);
      if (delErr) {
        setDeletingStage(false);
        toast.error("Erro ao excluir etapa: " + delErr.message);
        return;
      }
      setCustomStages(prev => prev.filter(s => s.key !== key));
    }
    toast.success(`Etapa "${deleteStage.label}" excluída`);
    if (hasLeads) {
      setLeads(prev => prev.map(l => l.pipeline_stage === key ? { ...l, pipeline_stage: target } : l));
    }
    setDeleteStage(null);
    setMoveTargetKey("");
    setDeletingStage(false);
  };

  const reorderCustomStage = async (fromKey: string, toKey: string) => {
    if (!user || fromKey === toKey) return;
    const list = [...customStages].sort((a, b) => a.position - b.position);
    const fromIdx = list.findIndex(s => s.key === fromKey);
    const toIdx = list.findIndex(s => s.key === toKey);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    const reindexed = list.map((s, i) => ({ ...s, position: i + 1 }));
    setCustomStages(reindexed);
    // Persist new positions
    await Promise.all(
      reindexed.map(s =>
        supabase.from("pipeline_stages")
          .update({ position: s.position } as any)
          .eq("user_id", user.id).eq("key", s.key)
      )
    );
  };

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
  for (const s of allStages) grouped[s.key] = [];
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
    const idx = allStages.findIndex((s) => s.key === current);
    if (idx < 0 || idx >= allStages.length - 1) return null;
    return allStages[idx + 1].key;
  };

  const getPrevStage = (current: string) => {
    const idx = allStages.findIndex((s) => s.key === current);
    if (idx <= 0) return null;
    return allStages[idx - 1].key;
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
        <Button
          size="sm"
          onClick={() => { setNewStageName(""); setNewStageColor(STAGE_COLORS[0].key); setNewStageOpen(true); }}
          className="gap-1.5 h-9 rounded-xl"
        >
          <Plus className="w-4 h-4" />
          Nova etapa
        </Button>
      </div>

      {/* New Stage Modal */}
      <Dialog open={newStageOpen} onOpenChange={setNewStageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova etapa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="stage-name">Nome da etapa</Label>
              <Input
                id="stage-name"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Ex: Qualificação"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {STAGE_COLORS.map((c) => {
                  const selected = newStageColor === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setNewStageColor(c.key)}
                      title={c.label}
                      className={cn(
                        "h-8 w-8 rounded-full transition-all",
                        selected ? "ring-2 ring-offset-2 ring-foreground/40 scale-110" : "hover:scale-105"
                      )}
                      style={{ backgroundColor: c.hex }}
                      aria-label={c.label}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setNewStageOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!newStageName.trim() || creatingStage}
              onClick={handleCreateStage}
            >
              {creatingStage ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Stage Confirmation */}
      <Dialog open={!!deleteStage} onOpenChange={(o) => { if (!o) { setDeleteStage(null); setMoveTargetKey(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir etapa</DialogTitle>
          </DialogHeader>
          {(() => {
            const stageLeadCount = deleteStage ? leads.filter(l => (l.pipeline_stage || "novo") === deleteStage.key).length : 0;
            const hasLeads = stageLeadCount > 0;
            return (
              <>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">
                    Tem certeza que deseja excluir a etapa <span className="font-semibold text-foreground">{deleteStage?.label}</span>?
                    {hasLeads ? " Escolha para qual etapa os leads serão movidos." : " Esta etapa não possui leads."}
                  </p>
                  {hasLeads && (
                    <div className="space-y-2">
                      <Label>Mover leads para</Label>
                      <Select value={moveTargetKey} onValueChange={setMoveTargetKey}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma etapa" />
                        </SelectTrigger>
                        <SelectContent>
                          {allStages.filter(s => s.key !== deleteStage?.key).map(s => (
                            <SelectItem key={s.key} value={s.key}>
                              {stageLabels[s.key] ?? s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button variant="outline" onClick={() => { setDeleteStage(null); setMoveTargetKey(""); }}>
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={(hasLeads && !moveTargetKey) || deletingStage}
                    onClick={handleDeleteStage}
                  >
                    {deletingStage ? "Excluindo..." : "Excluir"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
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
        {/* Stage filter removed — Kanban columns already represent stages */}
      </div>

      {/* Kanban */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden -mx-1 px-1 pipeline-scroll">
        <div className="inline-flex gap-3 h-full pb-2" style={{ minWidth: "1200px" }}>
          {allStages.map((stage) => {
            const items = grouped[stage.key];
            const total = items.reduce((s, l) => s + (l.estimated_value || 0), 0);
            const isOver = overStage === stage.key;
            const lost = isPerdido(stage.key);
            const isCustomStage = !DEFAULT_STAGE_KEYS.has(stage.key);
            const isFixedNovo = stage.key === "novo";
            const isStageDragOver = stageDragKey && stageOverKey === stage.key && stageDragKey !== stage.key && isCustomStage;

            return (
              <div key={stage.key} className="flex h-full shrink-0 items-stretch">
                {/* Drop indicator placeholder (only when reordering custom stages) */}
                {isStageDragOver && (
                  <div
                    className="w-[240px] shrink-0 mr-3 rounded-xl border-2 border-dashed transition-all duration-150"
                    style={{ borderColor: `${stage.fg}80`, backgroundColor: `${stage.fg}0d` }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (stageDragKey && stageDragKey !== stage.key) {
                        reorderCustomStage(stageDragKey, stage.key);
                      }
                      setStageDragKey(null);
                      setStageOverKey(null);
                      setOverStage(null);
                    }}
                  />
                )}
                <div
                  className={cn(
                    "flex flex-col shrink-0 h-full transition-opacity duration-150",
                    lost ? "w-[180px]" : "w-[240px]",
                    stageDragKey === stage.key && "opacity-30"
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overStage !== stage.key) setOverStage(stage.key);
                    if (stageDragKey && isCustomStage && stageOverKey !== stage.key) {
                      setStageOverKey(stage.key);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverStage(null);
                    // Stage reorder takes priority
                    if (stageDragKey && isCustomStage && stageDragKey !== stage.key) {
                      reorderCustomStage(stageDragKey, stage.key);
                      setStageDragKey(null);
                      setStageOverKey(null);
                      return;
                    }
                    const id = e.dataTransfer.getData("text/plain");
                    if (id && dragRef.current && dragRef.current.from !== stage.key) move(id, stage.key);
                    dragRef.current = null;
                  }}
                >
                {/* Column header */}
                <div
                  draggable={isCustomStage && editingStageKey !== stage.key}
                  onDragStart={(e) => {
                    if (!isCustomStage) return;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/x-stage", stage.key);
                    setStageDragKey(stage.key);
                  }}
                  onDragEnd={() => { setStageDragKey(null); setStageOverKey(null); }}
                  className={cn(
                    "group/header px-3 py-2.5 mb-2 shrink-0 rounded-xl border transition-all",
                    lost && "opacity-60",
                    isCustomStage && "cursor-grab active:cursor-grabbing",
                    isStageDragOver && "ring-2 ring-offset-1 scale-[1.02]"
                  )}
                  style={{
                    backgroundColor: stage.bg,
                    borderColor: `${stage.fg}1f`,
                    ...(isStageDragOver ? { boxShadow: `0 0 0 2px ${stage.fg}66` } : {}),
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", stage.dot)} />
                    {editingStageKey === stage.key ? (
                      <input
                        autoFocus
                        value={editingStageDraft}
                        onChange={(e) => setEditingStageDraft(e.target.value)}
                        onBlur={async () => {
                          const v = editingStageDraft.trim();
                          if (v) {
                            setStageLabels((p) => ({ ...p, [stage.key]: v }));
                            if (!DEFAULT_STAGE_KEYS.has(stage.key) && user) {
                              await supabase.from("pipeline_stages")
                                .update({ label: v } as any)
                                .eq("user_id", user.id).eq("key", stage.key);
                              setCustomStages(prev => prev.map(s => s.key === stage.key ? { ...s, label: v } : s));
                            }
                          }
                          setEditingStageKey(null);
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") {
                            const v = editingStageDraft.trim();
                            if (v) {
                              setStageLabels((p) => ({ ...p, [stage.key]: v }));
                              if (!DEFAULT_STAGE_KEYS.has(stage.key) && user) {
                                await supabase.from("pipeline_stages")
                                  .update({ label: v } as any)
                                  .eq("user_id", user.id).eq("key", stage.key);
                                setCustomStages(prev => prev.map(s => s.key === stage.key ? { ...s, label: v } : s));
                              }
                            }
                            setEditingStageKey(null);
                          } else if (e.key === "Escape") {
                            setEditingStageKey(null);
                          }
                        }}
                        className="flex-1 min-w-0 bg-white/70 border border-black/10 rounded px-1.5 py-0.5 text-[11.5px] font-bold uppercase tracking-wider outline-none focus:ring-1"
                        style={{ color: stage.fg }}
                      />
                    ) : (
                      <span
                        className="text-[11.5px] font-bold uppercase tracking-wider truncate"
                        style={{ color: stage.fg }}
                      >
                        {stageLabels[stage.key] ?? stage.label}
                      </span>
                    )}
                    <span
                      className={cn(
                        "ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums",
                        editingStageKey !== stage.key && "group-hover/header:hidden"
                      )}
                      style={{ color: stage.fg, backgroundColor: `${stage.fg}1a` }}
                    >
                      {items.length}
                    </span>
                    {/* Hover actions — pencil for all stages; trash only for custom */}
                    {editingStageKey !== stage.key && !isFixedNovo && (
                      <div className="ml-auto hidden group-hover/header:flex items-center gap-0.5">
                        <button
                          type="button"
                          title="Renomear etapa"
                          onClick={() => {
                            setEditingStageDraft(stageLabels[stage.key] ?? stage.label);
                            setEditingStageKey(stage.key);
                          }}
                          className="p-1 rounded-md hover:bg-black/5 transition-colors"
                          style={{ color: stage.fg }}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title="Excluir etapa"
                          onClick={() => { setMoveTargetKey(""); setDeleteStage({ key: stage.key, label: stageLabels[stage.key] ?? stage.label }); }}
                          className="p-1 rounded-md hover:bg-red-500/10 transition-colors text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {/* total value removed */}
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
                      const palette = ["#3b82f6","#8b5cf6","#22c55e","#f97316","#06b6d4","#ec4899","#f59e0b"];
                      const avatarBg = letterColorMap[firstLetter]
                        || palette[(initials.charCodeAt(0) || 0) % palette.length];
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
