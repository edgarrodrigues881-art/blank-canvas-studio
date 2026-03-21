import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Mail, Clock, AlertTriangle, XCircle, Skull, Loader2, Pencil,
  Save, Eye, EyeOff, Sparkles, RefreshCw, Bold, Italic,
  Strikethrough, Code, Smile, Plus, Trash2, Link, Phone,
  MessageSquare, ClipboardPaste
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface TemplateButton {
  id: number;
  type: "reply" | "url" | "phone";
  text: string;
  value: string;
}

interface AutoTemplate {
  id: string;
  message_type: string;
  label: string;
  content: string;
  buttons: TemplateButton[];
  variables: any[];
  is_active: boolean;
  updated_at: string;
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; description: string }> = {
  WELCOME:    { icon: Mail,          color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", description: "Enviada ao novo cliente após o cadastro" },
  DUE_3_DAYS: { icon: Clock,         color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/20",  description: "Aviso 3 dias antes do vencimento" },
  DUE_TODAY:  { icon: AlertTriangle,  color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  description: "Alerta no dia do vencimento" },
  OVERDUE_1:  { icon: XCircle,        color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20",     description: "1 dia após o vencimento" },
  OVERDUE_7:  { icon: XCircle,        color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20",     description: "7 dias após o vencimento" },
  OVERDUE_30: { icon: Skull,          color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20",     description: "30 dias após o vencimento · Oferta de retorno" },
};

const VARIABLES = [
  { key: "{{nome}}", label: "Nome do cliente" },
  { key: "{{plano}}", label: "Nome do plano" },
  { key: "{{vencimento}}", label: "Data de vencimento" },
  { key: "{{suporte}}", label: "Número do suporte" },
];

const commonEmojis: Record<string, string[]> = {
  "Mais usados": ["😀", "😂", "😊", "😍", "😎", "🤩", "😘", "🤗", "😁", "😉", "🥺", "😢", "🤔", "👍", "👋", "🙏"],
  "Negócios": ["✅", "⭐", "💰", "🚀", "📱", "💬", "📢", "🎯", "⚡", "🏆", "💎", "📞", "✨", "🎁", "📊", "🔥"],
};

const AdminAutoTemplates = () => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<AutoTemplate | null>(null);
  const [dialogContent, setDialogContent] = useState("");
  const [dialogButtons, setDialogButtons] = useState<TemplateButton[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: templates = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["auto-message-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_message_templates" as any)
        .select("*")
        .order("message_type");
      if (error) throw error;
      return (data || []) as unknown as AutoTemplate[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content, buttons, is_active }: { id: string; content?: string; buttons?: TemplateButton[]; is_active?: boolean }) => {
      const updates: any = { updated_at: new Date().toISOString(), updated_by: session?.user?.id };
      if (content !== undefined) updates.content = content;
      if (buttons !== undefined) updates.buttons = buttons;
      if (is_active !== undefined) updates.is_active = is_active;
      const { error } = await (supabase
        .from("auto_message_templates" as any)
        .update(updates) as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-message-templates"] });
    },
  });

  const handleToggle = async (tpl: AutoTemplate) => {
    try {
      await updateMutation.mutateAsync({ id: tpl.id, is_active: !tpl.is_active });
      toast.success(`${tpl.label} ${!tpl.is_active ? "ativado" : "desativado"}`);
    } catch {
      toast.error("Erro ao alterar status");
    }
  };

  const openEditor = (tpl: AutoTemplate) => {
    setEditingTemplate(tpl);
    setDialogContent(tpl.content);
    setDialogButtons(tpl.buttons || []);
    setShowEmojiPicker(false);
  };

  const handleDialogSave = async () => {
    if (!editingTemplate) return;
    const contentChanged = dialogContent !== editingTemplate.content;
    const buttonsChanged = JSON.stringify(dialogButtons) !== JSON.stringify(editingTemplate.buttons || []);
    if (!contentChanged && !buttonsChanged) {
      toast.info("Nenhuma alteração detectada");
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: editingTemplate.id, content: dialogContent, buttons: dialogButtons });
      toast.success(`Modelo "${editingTemplate.label}" salvo com sucesso`);
      setEditingTemplate(null);
    } catch {
      toast.error("Erro ao salvar modelo");
    }
  };

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = dialogContent.slice(0, start);
      const after = dialogContent.slice(end);
      setDialogContent(before + text + after);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + text.length, start + text.length);
      }, 0);
    } else {
      setDialogContent(prev => prev + text);
    }
  };

  const wrapSelection = (prefix: string, suffix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = dialogContent.slice(start, end);
    const before = dialogContent.slice(0, start);
    const after = dialogContent.slice(end);
    setDialogContent(before + prefix + selected + suffix + after);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const getPreviewContent = (content: string) => {
    return content
      .replace(/\{\{nome\}\}/g, "João Silva")
      .replace(/\{\{plano\}\}/g, "Pro")
      .replace(/\{\{vencimento\}\}/g, "25/03/2026")
      .replace(/\{\{suporte\}\}/g, "(62) 99419-2500");
  };

  const sortOrder = ["WELCOME", "DUE_3_DAYS", "DUE_TODAY", "OVERDUE_1", "OVERDUE_7", "OVERDUE_30"];
  const sorted = [...templates].sort((a, b) => sortOrder.indexOf(a.message_type) - sortOrder.indexOf(b.message_type));
  const activeCount = templates.filter(t => t.is_active).length;

  const editConfig = editingTemplate ? (TYPE_CONFIG[editingTemplate.message_type] || TYPE_CONFIG.WELCOME) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles size={17} className="text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground tracking-tight">Modelo Automático</h2>
            <p className="text-[11px] text-muted-foreground/50">
              Gerencie mensagens automáticas do ciclo de vida · {activeCount}/{templates.length} ativos
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}
          className="text-[11px] h-8 gap-1.5 rounded-lg border-border/50 hover:bg-muted/20">
          {isFetching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Atualizar
        </Button>
      </div>

      {/* Variables legend */}
      <div className="flex flex-wrap gap-1.5 px-1">
        <span className="text-[10px] text-muted-foreground/50 font-medium mr-1">Variáveis disponíveis:</span>
        {VARIABLES.map(v => (
          <span key={v.key} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-primary/8 text-primary/80 border border-primary/15 font-mono">
            {v.key} <span className="text-muted-foreground/40 font-sans">= {v.label}</span>
          </span>
        ))}
      </div>

      {/* Templates list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((tpl) => {
            const config = TYPE_CONFIG[tpl.message_type] || TYPE_CONFIG.WELCOME;
            const Icon = config.icon;
            const currentContent = tpl.content;

            return (
              <div
                key={tpl.id}
                className={cn(
                  "border rounded-xl overflow-hidden transition-all",
                  tpl.is_active ? "border-border/40 bg-card/40" : "border-border/20 bg-card/20 opacity-60"
                )}
              >
                {/* Header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", config.bg)}>
                    <Icon size={15} className={config.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{tpl.label}</span>
                      <Badge variant="outline" className={cn("text-[9px] px-1.5", config.border, config.color, config.bg)}>
                        {tpl.message_type}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground/50 mt-0.5">{config.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Eye preview toggle */}
                    <button
                      onClick={() => setPreviewId(previewId === tpl.id ? null : tpl.id)}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        previewId === tpl.id ? "text-primary bg-primary/10" : "text-muted-foreground/40 hover:text-primary hover:bg-primary/10"
                      )}
                      title="Pré-visualizar"
                    >
                      {previewId === tpl.id ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    {/* Pencil edit dialog */}
                    <button
                      onClick={() => openEditor(tpl)}
                      className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Editar modelo"
                    >
                      <Pencil size={14} />
                    </button>
                    {/* Active toggle */}
                    <span className={cn("text-[10px] font-medium ml-1", tpl.is_active ? "text-emerald-400" : "text-muted-foreground/40")}>
                      {tpl.is_active ? "Ativo" : "Inativo"}
                    </span>
                    <Switch
                      checked={tpl.is_active}
                      onCheckedChange={() => handleToggle(tpl)}
                      disabled={updateMutation.isPending}
                    />
                  </div>
                </div>

                {/* Inline preview */}
                {previewId === tpl.id && (
                  <div className="px-4 pb-4 border-t border-border/30 pt-3">
                    <div className="bg-muted/10 border border-border/30 rounded-xl p-4 relative">
                      <div className="absolute top-2 right-3 text-[9px] text-muted-foreground/30 font-medium">Preview</div>
                      <pre className="text-[13px] text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                        {getPreviewContent(currentContent)}
                      </pre>
                      {/* Buttons preview */}
                      {Array.isArray(tpl.buttons) && tpl.buttons.length > 0 && (
                        <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-border/20">
                          {tpl.buttons.map((btn: TemplateButton) => {
                            const btnIcon = btn.type === "url" ? <Link size={13} /> : btn.type === "phone" ? <Phone size={13} /> : <MessageSquare size={13} />;
                            return (
                              <div
                                key={btn.id}
                                className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[13px] font-medium"
                              >
                                {btnIcon}
                                <span>{btn.text || "Botão sem texto"}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ EDIT DIALOG ═══ */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => { if (!open) setEditingTemplate(null); }}>
        <DialogContent className="max-w-[600px] max-h-[90vh] overflow-y-auto bg-card border-border p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              Editar modelo
              {editingTemplate && editConfig && (
                <Badge variant="outline" className={cn("text-[9px] px-1.5", editConfig.border, editConfig.color, editConfig.bg)}>
                  {editingTemplate.label}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {editingTemplate && (
            <div className="px-6 pb-6 space-y-4">
              {/* Label display */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary mb-1.5 block">
                  Nome do modelo
                </label>
                <div className="h-11 flex items-center px-4 rounded-xl border border-primary/40 bg-muted/10 text-foreground text-sm font-medium">
                  {editingTemplate.label}
                </div>
              </div>

              {/* Message section */}
              <div className="border border-border/40 rounded-xl p-4 space-y-3 bg-muted/5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
                  MENSAGEM
                </h3>

                {/* Formatting toolbar */}
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => insertAtCursor("{{nome}}")}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-primary/8 text-primary/80 border border-primary/15 hover:bg-primary/15 transition-colors font-medium"
                  >
                    <ClipboardPaste size={11} /> Variável
                  </button>
                  <div className="w-px h-5 bg-border/30 mx-1" />
                  <button onClick={() => wrapSelection("*", "*")} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors" title="Negrito">
                    <Bold size={14} />
                  </button>
                  <button onClick={() => wrapSelection("_", "_")} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors" title="Itálico">
                    <Italic size={14} />
                  </button>
                  <button onClick={() => wrapSelection("~", "~")} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors" title="Tachado">
                    <Strikethrough size={14} />
                  </button>
                  <button onClick={() => wrapSelection("```", "```")} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors" title="Código">
                    <Code size={14} />
                  </button>
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={cn("p-1.5 rounded-lg transition-colors", showEmojiPicker ? "text-primary bg-primary/10" : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/20")}
                    title="Emojis"
                  >
                    <Smile size={14} />
                  </button>
                </div>

                {/* Emoji picker */}
                {showEmojiPicker && (
                  <div className="border border-border/40 rounded-xl p-3 bg-muted/10 max-h-[180px] overflow-y-auto">
                    {Object.entries(commonEmojis).map(([group, emojis]) => (
                      <div key={group} className="mb-2">
                        <p className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">{group}</p>
                        <div className="flex flex-wrap gap-1">
                          {emojis.map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => insertAtCursor(emoji)}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted/30 transition-colors text-base"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Textarea editor */}
                <Textarea
                  ref={textareaRef}
                  value={dialogContent}
                  onChange={e => setDialogContent(e.target.value)}
                  className="min-h-[220px] bg-muted/15 border-border/30 text-sm resize-y rounded-xl"
                  placeholder="Olá, {{nome}} \n\nEscreva sua mensagem aqui..."
                />

                {/* Variable chips */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] text-muted-foreground/40 font-medium">Variáveis:</span>
                  {VARIABLES.map(v => (
                    <button
                      key={v.key}
                      onClick={() => insertAtCursor(v.key)}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-mono hover:bg-primary/20 transition-colors"
                    >
                      {v.key}
                    </button>
                  ))}
                </div>
              </div>

              {/* ═══ BUTTONS SECTION ═══ */}
              <div className="border border-border/40 rounded-xl p-4 space-y-3 bg-muted/5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
                    BOTÕES INTERATIVOS
                  </h3>
                  <span className="text-[10px] text-muted-foreground/40">{dialogButtons.length}/3 ativos</span>
                </div>

                {dialogButtons.length === 0 && (
                  <p className="text-[11px] text-muted-foreground/30 py-2">Nenhum botão adicionado</p>
                )}

                {dialogButtons.map((btn, idx) => (
                  <div key={btn.id} className="flex items-start gap-2 bg-muted/10 border border-border/30 rounded-lg p-3">
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <Select
                          value={btn.type}
                          onValueChange={(val: "reply" | "url" | "phone") => {
                            setDialogButtons(prev => prev.map((b, i) => i === idx ? { ...b, type: val, value: val === "reply" ? "" : b.value } : b));
                          }}
                        >
                          <SelectTrigger className="h-8 w-[130px] text-[11px] bg-background border-border/40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="reply"><div className="flex items-center gap-1.5"><MessageSquare size={11} /> Resposta</div></SelectItem>
                            <SelectItem value="url"><div className="flex items-center gap-1.5"><Link size={11} /> URL</div></SelectItem>
                            <SelectItem value="phone"><div className="flex items-center gap-1.5"><Phone size={11} /> Telefone</div></SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={btn.text}
                          onChange={e => setDialogButtons(prev => prev.map((b, i) => i === idx ? { ...b, text: e.target.value } : b))}
                          placeholder="Texto do botão"
                          className="h-8 text-[11px] flex-1 bg-background border-border/40"
                        />
                      </div>
                      {btn.type !== "reply" && (
                        <Input
                          value={btn.value}
                          onChange={e => setDialogButtons(prev => prev.map((b, i) => i === idx ? { ...b, value: e.target.value } : b))}
                          placeholder={btn.type === "url" ? "https://..." : "+5562999999999"}
                          className="h-8 text-[11px] bg-background border-border/40"
                        />
                      )}
                    </div>
                    <button
                      onClick={() => setDialogButtons(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors mt-0.5"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                {dialogButtons.length < 3 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialogButtons(prev => [...prev, { id: Date.now(), type: "reply", text: "", value: "" }])}
                    className="h-8 text-[11px] gap-1.5 rounded-lg border-dashed border-border/40 text-muted-foreground/60 hover:text-foreground w-full"
                  >
                    <Plus size={12} /> Adicionar botão
                  </Button>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2">
                <p className="text-[10px] text-muted-foreground/30">
                  Última edição: {new Date(editingTemplate.updated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingTemplate(null)} className="h-9 text-[11px] rounded-lg">
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleDialogSave}
                    disabled={(dialogContent === editingTemplate.content && JSON.stringify(dialogButtons) === JSON.stringify(editingTemplate.buttons || [])) || updateMutation.isPending}
                    className="h-9 text-[11px] gap-1.5 rounded-lg"
                  >
                    {updateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Salvar alterações
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAutoTemplates;
