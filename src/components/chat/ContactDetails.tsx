import { useState, useEffect } from "react";
import {
  X,
  Pencil,
  RefreshCw,
  Smartphone,
  Calendar,
  Clock,
  MessageSquare,
  Globe,
  Tag,
  StickyNote,
  User,
  ShieldCheck,
  Save,
  Thermometer,
  GitBranch,
  Sparkles,
  ArrowRight,
  Brain,
  Loader2,
  Wand2,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { type Conversation, type AttendingStatus, type LeadTemperature, type PipelineStage } from "./types";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

interface ContactDetailsProps {
  conversation: Conversation;
  onClose: () => void;
  onTagsChange?: (conversationId: string, newTags: string[]) => void;
}

const DEFAULT_CRM_TAGS = [
  { label: "Interessado", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  { label: "Sem resposta", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  { label: "Follow-up", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" },
  { label: "Cliente", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  { label: "VIP", color: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  { label: "Urgente", color: "bg-red-500/15 text-red-400 border-red-500/20" },
  { label: "Negociação", color: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
  { label: "Retorno", color: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  { label: "Novo Lead", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" },
  { label: "Cobrança", color: "bg-red-500/15 text-red-400 border-red-500/20" },
  { label: "Suporte", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
];

const statusLabels: Record<AttendingStatus, { label: string; color: string; dot: string }> = {
  nova: { label: "Nova", color: "text-blue-400", dot: "bg-blue-400" },
  em_atendimento: { label: "Em Atendimento", color: "text-emerald-400", dot: "bg-emerald-400" },
  aguardando: { label: "Aguardando", color: "text-amber-400", dot: "bg-amber-400" },
  finalizado: { label: "Finalizado", color: "text-muted-foreground", dot: "bg-muted-foreground/50" },
  pausado: { label: "Pausado", color: "text-orange-400", dot: "bg-orange-400" },
};

const avatarColors = [
  "from-emerald-500 to-teal-600",
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-blue-600",
];

function getAvatarGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

interface EditFormData {
  name: string;
  phone: string;
  email: string;
  company: string;
  origin: string;
  observations: string;
}

export function ContactDetails({ conversation, onClose, onTagsChange }: ContactDetailsProps) {
  const { user } = useAuth();
  const [activeTags, setActiveTags] = useState<string[]>(conversation.tags);
  const [customTagInput, setCustomTagInput] = useState("");
  const [notes, setNotes] = useState(conversation.notes || "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(notes);
  const [isEditing, setIsEditing] = useState(false);
  const [leadTemp, setLeadTemp] = useState<LeadTemperature>(conversation.leadTemperature || "frio");
  const [aiInterest, setAiInterest] = useState<string | null>(conversation.aiInterest || null);
  const [aiClassifying, setAiClassifying] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{ text: string; tone: string; goal: string }[]>([]);
  const [aiDetectedIntent, setAiDetectedIntent] = useState<string | null>(null);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({
    name: conversation.name,
    phone: conversation.phone,
    email: conversation.email || "",
    company: "",
    origin: "WhatsApp",
    observations: "",
  });

  // Fetch AI lead memory for this conversation
  useEffect(() => {
    if (!conversation.phone) return;
    const digits = conversation.phone.replace(/\D/g, "");
    supabase
      .from("ai_lead_memory")
      .select("interest, stage")
      .like("remote_jid", `%${digits.slice(-8)}%`)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.interest) setAiInterest(data.interest);
        if (data?.stage === "quente") setLeadTemp("quente");
        else if (data?.stage === "morno") setLeadTemp("morno");
      });
  }, [conversation.phone]);

  // Reset edit form when conversation changes
  useEffect(() => {
    setIsEditing(false);
    setLeadTemp(conversation.leadTemperature || "frio");
    setAiInterest(conversation.aiInterest || null);
    setEditForm({
      name: conversation.name,
      phone: conversation.phone,
      email: conversation.email || "",
      company: "",
      origin: "WhatsApp",
      observations: "",
    });
    setActiveTags(conversation.tags);
    setNotes(conversation.notes || "");
    setAiSuggestions([]);
    setAiDetectedIntent(null);
    setAiRecommendation(null);
  }, [conversation.id]);

  // AI Classify lead
  const handleAiClassify = async () => {
    if (!user) return;
    setAiClassifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-ai-classify", {
        body: { user_id: user.id, conversation_id: conversation.id, action: "classify" },
      });
      if (error) throw error;
      if (data?.classification) {
        const c = data.classification;
        if (c.temperature) setLeadTemp(c.temperature);
        if (c.interest) setAiInterest(c.interest);
        if (c.intent) setAiDetectedIntent(c.intent);
        toast.success(`Lead classificado: ${c.temperature} (${c.confidence}% confiança)`);
      }
    } catch (e: any) {
      toast.error("Erro ao classificar: " + (e.message || "Tente novamente"));
    } finally {
      setAiClassifying(false);
    }
  };

  // AI Suggest responses
  const handleAiSuggest = async () => {
    if (!user) return;
    setAiSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-ai-classify", {
        body: { user_id: user.id, conversation_id: conversation.id, action: "suggest" },
      });
      if (error) throw error;
      if (data?.suggestions) {
        setAiSuggestions(data.suggestions);
        if (data.detected_intent) setAiDetectedIntent(data.detected_intent);
        if (data.recommended_action) setAiRecommendation(data.recommended_action);
      }
    } catch (e: any) {
      toast.error("Erro ao sugerir: " + (e.message || "Tente novamente"));
    } finally {
      setAiSuggesting(false);
    }
  };

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      onTagsChange?.(conversation.id, next);
      // Also sync to service_contacts
      if (user && conversation.phone) {
        const digits = conversation.phone.replace(/\D/g, "");
        supabase
          .from("service_contacts")
          .update({ tags: next } as any)
          .eq("user_id", user.id)
          .like("phone", `%${digits.slice(-8)}%`)
          .then(() => {});
      }
      return next;
    });
  };

  const addCustomTag = () => {
    const tag = customTagInput.trim();
    if (!tag || activeTags.includes(tag)) return;
    toggleTag(tag);
    setCustomTagInput("");
  };

  const handleEditSave = () => {
    // Future: persist changes
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditForm({
      name: conversation.name,
      phone: conversation.phone,
      email: conversation.email || "",
      company: "",
      origin: "WhatsApp",
      observations: "",
    });
    setIsEditing(false);
  };

  const updateField = (field: keyof EditFormData, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const gradient = getAvatarGradient(conversation.name);
  const statusCfg = statusLabels[conversation.attendingStatus];
  const firstContact = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const lastMessage = new Date(conversation.lastMessageAt);

  const editFieldClass = "h-8 text-xs bg-muted/30 border-border/50 rounded-lg focus:ring-1 focus:ring-primary/30";

  return (
    <>
      {/* Header */}
      <div className="h-[48px] border-b border-border/40 dark:border-border/30 flex items-center justify-between px-4 shrink-0 bg-slate-50/80 dark:bg-card/40 backdrop-blur-sm">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          {isEditing ? "Editar Contato" : "Detalhes do Contato"}
        </h3>
        <div className="flex items-center gap-1">
          {isEditing && (
            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={handleEditCancel}>
              <X className="w-4 h-4" />
            </Button>
          )}
          {!isEditing && (
            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* ── Avatar + Name + Phone ── */}
          <div className="flex flex-col items-center text-center space-y-3">
            {conversation.avatar_url ? (
              <img src={conversation.avatar_url} alt={conversation.name} className="w-[72px] h-[72px] rounded-full object-cover ring-2 ring-border" />
            ) : (
              <div className={cn("w-[72px] h-[72px] rounded-full bg-gradient-to-br flex items-center justify-center ring-2 ring-border", gradient)}>
                <span className="text-xl font-bold text-white">
                  {(isEditing ? editForm.name : conversation.name).slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-foreground">{isEditing ? editForm.name || conversation.name : conversation.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{isEditing ? editForm.phone || conversation.phone : conversation.phone}</p>
            </div>

            {/* Action Buttons */}
            {isEditing ? (
              <div className="flex gap-2">
                <Button size="sm" className="gap-1.5 text-xs h-8 px-4 bg-blue-600 text-white hover:bg-blue-700" onClick={handleEditSave}>
                  <Save className="w-3 h-3" /> Salvar
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 px-3" onClick={handleEditCancel}>
                  <X className="w-3 h-3" /> Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 px-3" onClick={() => setIsEditing(true)}>
                  <Pencil className="w-3 h-3" /> Editar
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 px-3">
                  <RefreshCw className="w-3 h-3" /> Atualizar
                </Button>
              </div>
            )}
          </div>

          {/* ── Quick Info Cards (hidden in edit mode) ── */}
          {!isEditing && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 bg-white dark:bg-muted/15 rounded-xl px-3.5 py-3 border border-border/30 dark:border-border/20 hover:border-border/50 dark:hover:border-border/40 transition-colors shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">Instância</p>
                  <p className="text-xs font-semibold text-foreground">{conversation.deviceName || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white dark:bg-muted/15 rounded-xl px-3.5 py-3 border border-border/30 dark:border-border/20 hover:border-border/50 dark:hover:border-border/40 transition-colors shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">Primeiro contato</p>
                  <p className="text-xs font-semibold text-foreground">{firstContact.toLocaleDateString("pt-BR")}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white dark:bg-muted/15 rounded-xl px-3.5 py-3 border border-border/30 dark:border-border/20 hover:border-border/50 dark:hover:border-border/40 transition-colors shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">Última mensagem</p>
                  <p className="text-xs font-semibold text-foreground">
                    {lastMessage.toLocaleDateString("pt-BR")} às {lastMessage.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            </div>
          )}

          <Separator className="bg-border/50" />

          {/* ── INFORMAÇÕES / EDIT FORM ── */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Informações
            </h4>

            {isEditing ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Nome</label>
                  <Input value={editForm.name} onChange={(e) => updateField("name", e.target.value)} className={editFieldClass} placeholder="Nome do contato" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Telefone</label>
                  <Input value={editForm.phone} onChange={(e) => updateField("phone", e.target.value)} className={editFieldClass} placeholder="+55 11 99999-0000" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Email</label>
                  <Input value={editForm.email} onChange={(e) => updateField("email", e.target.value)} className={editFieldClass} placeholder="email@exemplo.com" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Empresa</label>
                  <Input value={editForm.company} onChange={(e) => updateField("company", e.target.value)} className={editFieldClass} placeholder="Nome da empresa" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Origem</label>
                  <Input value={editForm.origin} onChange={(e) => updateField("origin", e.target.value)} className={editFieldClass} placeholder="WhatsApp" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Observações</label>
                  <textarea
                    value={editForm.observations}
                    onChange={(e) => updateField("observations", e.target.value)}
                    placeholder="Observações sobre o contato..."
                    className="w-full resize-none rounded-lg bg-muted/30 border border-border/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                    rows={3}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-start gap-3">
                  <span className="text-[11px] text-muted-foreground w-16 shrink-0 pt-0.5">Nome</span>
                  <span className="text-xs font-medium text-foreground">{conversation.name}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-[11px] text-muted-foreground w-16 shrink-0 pt-0.5">Telefone</span>
                  <span className="text-xs font-medium text-foreground">{conversation.phone}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-[11px] text-muted-foreground w-16 shrink-0 pt-0.5">Origem</span>
                  <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                    <Globe className="w-3 h-3 text-emerald-400" /> WhatsApp
                  </span>
                </div>
              </div>
            )}
          </div>

          <Separator className="bg-border/50" />

          {/* ── TEMPERATURA DO LEAD ── */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5" /> Temperatura do Lead
            </h4>
            <div className="flex gap-1.5">
              {([
                { key: "frio" as LeadTemperature, label: "❄️ Frio", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
                { key: "morno" as LeadTemperature, label: "🔥 Morno", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
                { key: "quente" as LeadTemperature, label: "🔥 Quente", color: "bg-red-500/15 text-red-400 border-red-500/30" },
              ]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setLeadTemp(t.key);
                    supabase
                      .from("conversations")
                      .update({ lead_temperature: t.key } as any)
                      .eq("id", conversation.id)
                      .then(() => {});
                  }}
                  className={cn(
                    "text-[11px] px-2.5 py-1.5 rounded-lg font-semibold border transition-all cursor-pointer flex-1 text-center",
                    leadTemp === t.key
                      ? t.color
                      : "bg-muted/20 text-muted-foreground/50 border-border/30 hover:bg-muted/40"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* ── PIPELINE ── */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" /> Pipeline
            </h4>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs h-9 border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => {
                const stage = conversation.pipelineStage || "novo";
                supabase
                  .from("conversations")
                  .update({ pipeline_stage: stage } as any)
                  .eq("id", conversation.id)
                  .then(() => {
                    toast.success("Lead movido para o Pipeline!");
                  });
              }}
            >
              <ArrowRight className="w-3.5 h-3.5" />
              {conversation.pipelineStage ? `Etapa: ${conversation.pipelineStage}` : "Mover para Pipeline"}
            </Button>
          </div>

          {/* ── AI INTERESSE DETECTADO ── */}
          {aiInterest && (
            <>
              <Separator className="bg-border/50" />
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> IA — Interesse Detectado
                </h4>
                <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-foreground font-medium">{aiInterest}</p>
                </div>
              </div>
            </>
          )}

          <Separator className="bg-border/50" />

          {/* ── IA CRM — AÇÕES ── */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" /> IA — Ações CRM
            </h4>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 text-[11px] h-8 border-primary/30 text-primary hover:bg-primary/10"
                onClick={handleAiClassify}
                disabled={aiClassifying}
              >
                {aiClassifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Target className="w-3 h-3" />}
                Classificar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 text-[11px] h-8 border-primary/30 text-primary hover:bg-primary/10"
                onClick={handleAiSuggest}
                disabled={aiSuggesting}
              >
                {aiSuggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                Sugerir Resposta
              </Button>
            </div>

            {/* Detected intent */}
            {aiDetectedIntent && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  Intenção: {aiDetectedIntent === "curious" ? "Curioso" : aiDetectedIntent === "interested" ? "Interessado" : aiDetectedIntent === "ready_to_buy" ? "Pronto p/ comprar" : aiDetectedIntent === "objection" ? "Objeção" : aiDetectedIntent}
                </Badge>
              </div>
            )}

            {/* AI recommendation */}
            {aiRecommendation && (
              <div className="bg-accent/50 border border-accent rounded-lg px-3 py-2">
                <p className="text-[11px] text-accent-foreground font-medium">💡 {aiRecommendation}</p>
              </div>
            )}

            {/* Suggestions */}
            {aiSuggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Sugestões de resposta:</p>
                {aiSuggestions.map((s, i) => (
                  <button
                    key={i}
                    className="w-full text-left p-2.5 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all"
                    onClick={() => {
                      navigator.clipboard.writeText(s.text);
                      toast.success("Resposta copiada!");
                    }}
                  >
                    <p className="text-xs text-foreground leading-relaxed">{s.text}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className="text-[9px] py-0">
                        {s.tone === "amigável" ? "😊" : s.tone === "urgente" ? "⚡" : "💼"} {s.tone}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground/60">{s.goal}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Separator className="bg-border/50" />

          {/* ── TAGS ── */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Tags
            </h4>
            
            {/* Active tags with remove */}
            {activeTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {activeTags.map((tag) => {
                  const tagCfg = DEFAULT_CRM_TAGS.find((t) => t.label.toLowerCase() === tag.toLowerCase());
                  return (
                    <span key={tag} className={cn("text-[10px] px-2 py-1 rounded-md font-semibold border inline-flex items-center gap-1", tagCfg?.color || "bg-muted/30 text-foreground border-border/40")}>
                      {tag}
                      <button onClick={() => toggleTag(tag)} className="hover:text-destructive ml-0.5">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Suggested tags */}
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_CRM_TAGS.filter((tag) => !activeTags.some((t) => t.toLowerCase() === tag.label.toLowerCase())).map((tag) => (
                <button
                  key={tag.label}
                  onClick={() => toggleTag(tag.label)}
                  className="text-[10px] px-2 py-1 rounded-md font-semibold border border-dashed border-border/40 text-muted-foreground/60 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer"
                >
                  + {tag.label}
                </button>
              ))}
            </div>

            {/* Custom tag input */}
            <div className="flex gap-1.5">
              <Input
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                placeholder="Tag personalizada..."
                className="h-7 text-xs flex-1"
                onKeyDown={(e) => e.key === "Enter" && addCustomTag()}
              />
              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={addCustomTag} disabled={!customTagInput.trim()}>
                Adicionar
              </Button>
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* ── NOTAS INTERNAS ── */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5" /> Notas Internas
            </h4>

            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Escreva uma nota sobre este contato..."
                  className="w-full resize-none rounded-lg bg-muted/30 border border-border/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                  rows={4}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-[11px] px-3 bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => { setNotes(notesDraft); setEditingNotes(false); }}
                  >
                    Salvar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] px-3"
                    onClick={() => { setNotesDraft(notes); setEditingNotes(false); }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setNotesDraft(notes); setEditingNotes(true); }}
                className="w-full text-left bg-muted/20 rounded-lg p-3 border border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <p className="text-xs text-muted-foreground">
                  {notes || "Clique para adicionar uma nota..."}
                </p>
              </button>
            )}
          </div>

          <Separator className="bg-border/50" />

          {/* ── ATENDIMENTO ── */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Atendimento
            </h4>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2.5 border border-border/30">
                <User className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Responsável</p>
                  <p className="text-xs font-semibold text-foreground">Você</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2.5 border border-border/30">
                <MessageSquare className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Status atual</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dot)} />
                    <span className={cn("text-xs font-semibold", statusCfg.color)}>{statusCfg.label}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="h-4" />
        </div>
      </ScrollArea>
    </>
  );
}
