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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type Conversation, type AttendingStatus } from "./types";
import { cn } from "@/lib/utils";

interface ContactDetailsProps {
  conversation: Conversation;
  onClose: () => void;
}

const allTags = [
  { label: "Aguardando Retorno", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  { label: "Cliente VIP", color: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  { label: "Interessado", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  { label: "Cobrança", color: "bg-red-500/15 text-red-400 border-red-500/20" },
  { label: "Fechado", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  { label: "Novo Lead", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" },
  { label: "Suporte", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  { label: "Urgente", color: "bg-red-500/15 text-red-400 border-red-500/20" },
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

export function ContactDetails({ conversation, onClose }: ContactDetailsProps) {
  const [activeTags, setActiveTags] = useState<string[]>(conversation.tags);
  const [notes, setNotes] = useState(conversation.notes || "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(notes);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormData>({
    name: conversation.name,
    phone: conversation.phone,
    email: conversation.email || "",
    company: "",
    origin: "WhatsApp",
    observations: "",
  });

  // Reset edit form when conversation changes
  useEffect(() => {
    setIsEditing(false);
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
  }, [conversation.id]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
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
      <div className="h-[52px] border-b border-border flex items-center justify-between px-4 shrink-0">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {isEditing ? "Editar Contato" : "Detalhes"}
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
              <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2.5 border border-border/30">
                <Smartphone className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Instância</p>
                  <p className="text-xs font-semibold text-foreground">{conversation.deviceName || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2.5 border border-border/30">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Primeiro contato</p>
                  <p className="text-xs font-semibold text-foreground">{firstContact.toLocaleDateString("pt-BR")}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2.5 border border-border/30">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Última mensagem</p>
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

          {/* ── TAGS ── */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Tags
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => {
                const isActive = activeTags.some((t) => t.toLowerCase() === tag.label.toLowerCase());
                return (
                  <button
                    key={tag.label}
                    onClick={() => toggleTag(tag.label)}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-md font-semibold border transition-all cursor-pointer",
                      isActive
                        ? tag.color
                        : "bg-muted/20 text-muted-foreground/50 border-border/30 hover:bg-muted/40 hover:text-muted-foreground"
                    )}
                  >
                    {tag.label}
                  </button>
                );
              })}
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
