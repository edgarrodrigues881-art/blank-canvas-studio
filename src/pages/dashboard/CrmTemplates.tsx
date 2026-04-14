import { useState, useRef, useMemo } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight, Link, Phone,
  MessageSquare, X, Upload, Image as ImageIcon, Loader2, FileText, Video, Mic,
  ArrowUp, ArrowDown, GripVertical, Eye, Bold, Italic, Strikethrough, Code,
  Smile, MousePointerClick, Sparkles
} from "lucide-react";
import { useCrmTemplates, useCreateCrmTemplate, useUpdateCrmTemplate, useDeleteCrmTemplate } from "@/hooks/useCrmTemplates";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface TemplateButton {
  id: number;
  type: "reply" | "url" | "phone";
  text: string;
  value: string;
}

interface MediaFile {
  id: number;
  url: string;
  type: "image" | "video" | "audio" | "document";
  name: string;
  sendMode: "before" | "with" | "after";
}

const SurfaceCard = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-xl sm:rounded-2xl border border-border/50 bg-card shadow-sm", "dark:border-[hsl(220_10%_16%)] dark:bg-[hsl(220_13%_9%)] dark:shadow-lg dark:shadow-black/30", className)} {...props}>{children}</div>
);

const commonEmojis: Record<string, string[]> = {
  "Mais usados": ["😀", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤩", "😘", "🤗", "😁", "😉", "🥺", "😢", "😤", "🤔"],
  "Gestos": ["👍", "👋", "🙏", "💪", "🤝", "👏", "✌️", "🤞", "👊", "🫶", "☝️", "👆", "👇", "👉", "👈", "🫡"],
  "Negócios": ["✅", "⭐", "💰", "🚀", "📱", "💬", "📢", "🎯", "⚡", "🏆", "💎", "📞", "✨", "🛒", "🎁", "📊"],
  "Símbolos": ["❤️", "💙", "💚", "💛", "🧡", "💜", "🖤", "🤍", "🔥", "💥", "⚠️", "🔔", "🎉", "🎊", "💯", "🆕"],
};

const CrmTemplates = () => {
  const { toast } = useToast();
  const { session } = useAuth();
  const { resolvedTheme } = useTheme();
  const { data: templates = [], isLoading } = useCrmTemplates();
  const createTemplate = useCreateCrmTemplate();
  const updateTemplate = useUpdateCrmTemplate();
  const deleteTemplate = useDeleteCrmTemplate();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formMediaFiles, setFormMediaFiles] = useState<MediaFile[]>([]);
  const [formButtons, setFormButtons] = useState<TemplateButton[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState("Mais usados");
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  const filtered = templates.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || t.message_type === filterType;
    return matchSearch && matchType;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormContent("");
    setFormMediaFiles([]);
    setFormButtons([]);
    setDialogOpen(true);
  };

  const getAutoType = () => {
    if (formButtons.length > 0) return "buttons";
    if (formMediaFiles.length > 0) return "text-media";
    return "text";
  };

  const parseMediaFiles = (mediaUrl: string | null): MediaFile[] => {
    if (!mediaUrl) return [];
    try {
      const parsed = JSON.parse(mediaUrl);
      if (Array.isArray(parsed)) return parsed.map((p: any, i: number) => ({ ...p, id: i + 1, sendMode: p.sendMode || "with" }));
    } catch {}
    return [{ id: 1, url: mediaUrl, type: "image", name: mediaUrl.split("/").pop() || "arquivo", sendMode: "with" }];
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormContent(t.content);
    setFormMediaFiles(parseMediaFiles(t.media_url));
    setFormButtons(
      (t.buttons || []).map((b: any, i: number) => ({ id: Date.now() + i, type: b.type || "reply", text: b.text || "", value: b.value || "" }))
    );
    setDialogOpen(true);
  };

  const handleMediaUpload = async (file: File) => {
    if (!session) return;
    if (file.size > 20 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "Máximo 20MB", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";
      setFormMediaFiles(prev => [...prev, { id: Date.now(), url: urlData.publicUrl, type: type as any, name: file.name, sendMode: "with" }]);
      toast({ title: "Arquivo enviado" });
    } catch (err: any) { toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const handleSave = () => {
    if (!formName.trim() || !formContent.trim()) return;
    const autoType = getAutoType();
    const mediaValue = formMediaFiles.length > 0 ? JSON.stringify(formMediaFiles.map(f => ({ url: f.url, type: f.type, name: f.name, sendMode: f.sendMode }))) : undefined;
    const payload = {
      name: formName,
      message_type: autoType,
      content: formContent,
      media_url: mediaValue,
      buttons: formButtons.map(b => ({ type: b.type, text: b.text, value: b.value })),
    };
    if (editingId) {
      updateTemplate.mutate({ id: editingId, ...payload }, { onSuccess: () => { setDialogOpen(false); toast({ title: "Template CRM atualizado" }); } });
    } else {
      createTemplate.mutate(payload, { onSuccess: () => { setDialogOpen(false); toast({ title: "Template CRM criado" }); } });
    }
  };

  const handleDelete = (id: string) => {
    deleteTemplate.mutate(id, { onSuccess: () => toast({ title: "Template CRM excluído" }) });
  };

  const addButton = (type: "reply" | "url" | "phone") => {
    if (formButtons.length < 10) setFormButtons(prev => [...prev, { id: Date.now(), type, text: "", value: "" }]);
  };
  const removeButton = (id: number) => setFormButtons(prev => prev.filter(b => b.id !== id));
  const updateButton = (id: number, field: keyof TemplateButton, val: string) => {
    setFormButtons(prev => prev.map(b => b.id === id ? { ...b, [field]: val } : b));
  };

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setFormContent(prev => prev + text); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = formContent.substring(0, start) + text + formContent.substring(end);
    setFormContent(newText);
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + text.length, start + text.length); }, 0);
  };

  const wrapSelectedText = (before: string, after: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setFormContent(prev => prev + before + after); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = formContent.substring(start, end);
    const newText = formContent.substring(0, start) + before + selected + after + formContent.substring(end);
    setFormContent(newText);
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + before.length, end + before.length); }, 0);
  };

  const typeLabel = (type: string) => {
    const map: Record<string, string> = { text: "Texto", "text-media": "Texto com mídia", buttons: "Botões" };
    return map[type] || type;
  };

  const buttonTypeLabel = (type: string) => {
    const map: Record<string, string> = { reply: "Resposta Rápida", url: "Link (URL)" };
    return map[type] || type;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Templates CRM</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Gerencie seus templates de mensagem do CRM</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5 rounded-xl px-5 shadow-sm">
          <Plus className="w-4 h-4" /> Adicionar
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar template..." className="pl-9 h-10 text-sm rounded-xl bg-muted/30 border-border/50 focus:bg-background transition-colors" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-10 w-36 sm:w-44 text-sm rounded-xl bg-muted/30 border-border/50"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="text">Texto</SelectItem>
            <SelectItem value="text-media">Texto com mídia</SelectItem>
            <SelectItem value="buttons">Botões</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-sm text-muted-foreground">Carregando...</div>
      ) : paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <FileText className="w-10 h-10 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">Nenhum template CRM encontrado</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {paginated.map((t, idx) => (
            <div key={t.id} className="group flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border/40 bg-card hover:border-primary/20 hover:shadow-[0_2px_12px_-4px_hsl(var(--primary)/0.08)] transition-all duration-200">
              <span className="text-xs font-mono text-muted-foreground/40 w-6 text-right tabular-nums shrink-0">{(currentPage - 1) * perPage + idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">{typeLabel(t.message_type)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-md">{t.content.substring(0, 80)}{t.content.length > 80 ? "..." : ""}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-xs text-muted-foreground">{currentPage} / {totalPages}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Editar Template CRM" : "Novo Template CRM"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Nome</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Follow-up CRM" className="h-9" />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Mensagem</Label>
              <div className="flex items-center gap-1 mb-1.5">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelectedText("*", "*")} title="Negrito"><Bold className="w-3.5 h-3.5" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelectedText("_", "_")} title="Itálico"><Italic className="w-3.5 h-3.5" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelectedText("~", "~")} title="Riscado"><Strikethrough className="w-3.5 h-3.5" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelectedText("```", "```")} title="Código"><Code className="w-3.5 h-3.5" /></Button>
                <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                  <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7"><Smile className="w-3.5 h-3.5" /></Button></PopoverTrigger>
                  <PopoverContent className="w-72 p-2" align="start">
                    <div className="flex gap-1 mb-2 flex-wrap">
                      {Object.keys(commonEmojis).map(cat => (
                        <Button key={cat} variant={emojiCategory === cat ? "default" : "ghost"} size="sm" className="h-6 text-[10px] px-2" onClick={() => setEmojiCategory(cat)}>{cat}</Button>
                      ))}
                    </div>
                    <div className="grid grid-cols-8 gap-0.5">
                      {commonEmojis[emojiCategory]?.map(emoji => (
                        <button key={emoji} className="text-lg p-1 hover:bg-muted rounded" onClick={() => { insertAtCursor(emoji); setShowEmojiPicker(false); }}>{emoji}</button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="flex-1" />
                <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => insertAtCursor("{{nome}}")}>
                  <Sparkles className="w-3 h-3" /> Variável
                </Button>
              </div>
              <Textarea ref={textareaRef} value={formContent} onChange={e => setFormContent(e.target.value)} placeholder="Digite a mensagem..." className="min-h-[120px] text-sm" />
            </div>

            {/* Media upload */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Mídia (opcional)</Label>
              <input type="file" ref={mediaFileRef} className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={e => { if (e.target.files?.[0]) handleMediaUpload(e.target.files[0]); e.target.value = ""; }} />
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => mediaFileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Enviar arquivo
              </Button>
              {formMediaFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {formMediaFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-2 text-xs bg-muted/30 px-2 py-1 rounded">
                      {f.type === "image" ? <ImageIcon className="w-3 h-3" /> : f.type === "video" ? <Video className="w-3 h-3" /> : f.type === "audio" ? <Mic className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                      <span className="truncate flex-1">{f.name}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setFormMediaFiles(prev => prev.filter(x => x.id !== f.id))}><X className="w-3 h-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Buttons */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Botões (opcional)</Label>
              {formButtons.map(b => (
                <div key={b.id} className="flex items-center gap-2 mb-1.5">
                  <Select value={b.type} onValueChange={v => updateButton(b.id, "type", v)}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reply">Resposta Rápida</SelectItem>
                      <SelectItem value="url">Link (URL)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={b.text} onChange={e => updateButton(b.id, "text", e.target.value)} placeholder="Texto do botão" className="h-8 text-xs flex-1" />
                  {b.type === "url" && <Input value={b.value} onChange={e => updateButton(b.id, "value", e.target.value)} placeholder="https://..." className="h-8 text-xs flex-1" />}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeButton(b.id)}><X className="w-3 h-3" /></Button>
                </div>
              ))}
              {formButtons.length < 10 && (
                <Button type="button" variant="outline" size="sm" className="gap-1 text-xs mt-1" onClick={() => addButton("reply")}>
                  <Plus className="w-3 h-3" /> Botão
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={!formName.trim() || !formContent.trim() || createTemplate.isPending || updateTemplate.isPending}>
              {(createTemplate.isPending || updateTemplate.isPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CrmTemplates;
