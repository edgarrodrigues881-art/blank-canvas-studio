import { useState, useRef, useMemo } from "react";
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
import { useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from "@/hooks/useTemplates";
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

// ─── Surface Card wrapper ───
const SurfaceCard = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-xl sm:rounded-2xl border border-border/50 bg-card shadow-sm",
      "dark:border-[hsl(220_10%_16%)] dark:bg-[hsl(220_13%_9%)] dark:shadow-lg dark:shadow-black/30",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

const SectionLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h3 className={cn("text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70", className)}>
    {children}
  </h3>
);

const commonEmojis: Record<string, string[]> = {
  "Mais usados": ["😀", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤩", "😘", "🤗", "😁", "😉", "🥺", "😢", "😤", "🤔"],
  "Gestos": ["👍", "👋", "🙏", "💪", "🤝", "👏", "✌️", "🤞", "👊", "🫶", "☝️", "👆", "👇", "👉", "👈", "🫡"],
  "Negócios": ["✅", "⭐", "💰", "🚀", "📱", "💬", "📢", "🎯", "⚡", "🏆", "💎", "📞", "✨", "🛒", "🎁", "📊"],
  "Símbolos": ["❤️", "💙", "💚", "💛", "🧡", "💜", "🖤", "🤍", "🔥", "💥", "⚠️", "🔔", "🎉", "🎊", "💯", "🆕"],
};

const Templates = () => {
  const { toast } = useToast();
  const { session } = useAuth();
  const { data: templates = [], isLoading } = useTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formMessages, setFormMessages] = useState<string[]>(["", "", "", "", ""]);
  const [activeMessageTab, setActiveMessageTab] = useState(0);
  const [rotationMode, setRotationMode] = useState<"random" | "all">("random");
  const [formMediaFiles, setFormMediaFiles] = useState<MediaFile[]>([]);
  const [formButtons, setFormButtons] = useState<TemplateButton[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState("Mais usados");
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState<"sent" | "received">("sent");
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  const formContent = formMessages[activeMessageTab];
  const setFormContent = (val: string | ((prev: string) => string)) => {
    setFormMessages(prev => {
      const copy = [...prev];
      copy[activeMessageTab] = typeof val === "function" ? val(copy[activeMessageTab]) : val;
      return copy;
    });
  };
  const allMessages = formMessages.filter(m => m.trim());

  // Detected variables
  const detectedVars = useMemo(() => {
    const allText = formMessages.join(" ");
    const matches = allText.match(/{{[^}]+}}/g);
    return matches ? [...new Set(matches)] : [];
  }, [formMessages]);

  const filtered = templates.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || t.type === filterType;
    return matchSearch && matchType;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormMessages(["", "", "", "", ""]);
    setActiveMessageTab(0);
    setRotationMode("random");
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
    const ext = mediaUrl.split(".").pop()?.toLowerCase() || "";
    const type = ["mp4", "webm", "mov", "avi"].includes(ext) ? "video"
      : ["mp3", "wav", "ogg", "m4a", "opus"].includes(ext) ? "audio"
      : ["pdf", "doc", "docx", "xls", "xlsx"].includes(ext) ? "document"
      : "image";
    return [{ id: 1, url: mediaUrl, type, name: mediaUrl.split("/").pop() || "arquivo", sendMode: "with" as const }];
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setFormName(t.name);
    // Parse content back into message tabs
    const contentParts = t.content.includes("|||") ? t.content.split("|||") : t.content.includes("|&&|") ? t.content.split("|&&|") : [t.content];
    const msgs = ["", "", "", "", ""];
    contentParts.forEach((p: string, i: number) => { if (i < 5) msgs[i] = p; });
    setFormMessages(msgs);
    setActiveMessageTab(0);
    setRotationMode(t.content.includes("|&&|") ? "all" : "random");
    const files = parseMediaFiles(t.media_url);
    setFormMediaFiles(files);
    setFormButtons(
      (t.buttons || []).map((b: any, i: number) => ({
        id: Date.now() + i,
        type: b.type || "reply",
        text: b.text || "",
        value: b.value || "",
      }))
    );
    setDialogOpen(true);
  };

  const detectFileType = (file: File): MediaFile["type"] => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "document";
  };

  // Compress images client-side before uploading
  const compressImage = (file: File, maxWidth = 1200, quality = 0.8): Promise<File> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/") || file.type === "image/gif") {
        resolve(file);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }));
            } else {
              resolve(file);
            }
          },
          "image/webp",
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  const handleMediaUpload = async (file: File) => {
    if (!session) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 20MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      // Compress images before uploading
      const optimized = await compressImage(file);
      const ext = optimized.name.split(".").pop() || "bin";
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(path, optimized);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      const newFile: MediaFile = {
        id: Date.now(),
        url: urlData.publicUrl,
        type: detectFileType(file),
        name: file.name,
        sendMode: "with",
      };
      setFormMediaFiles(prev => [...prev, newFile]);
      const sizeMB = (optimized.size / 1024 / 1024).toFixed(1);
      toast({ title: "Arquivo enviado", description: `${sizeMB}MB enviados` });
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removeMediaFile = (id: number) => {
    setFormMediaFiles(prev => prev.filter(f => f.id !== id));
  };

  const moveMediaFile = (id: number, direction: "up" | "down") => {
    setFormMediaFiles(prev => {
      const idx = prev.findIndex(f => f.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  const cycleSendMode = (id: number) => {
    setFormMediaFiles(prev => {
      const current = prev.find(f => f.id === id);
      if (!current) return prev;
      const order: Array<MediaFile["sendMode"]> = ["before", "with", "after"];
      let nextIdx = (order.indexOf(current.sendMode) + 1) % order.length;
      let nextMode = order[nextIdx];
      // If trying to set "with" but another already has it, skip to "after"
      if (nextMode === "with" && prev.some(f => f.id !== id && f.sendMode === "with")) {
        nextMode = "after";
      }
      return prev.map(f => f.id === id ? { ...f, sendMode: nextMode } : f);
    });
  };

  const handleSave = () => {
    if (!formName.trim() || allMessages.length === 0) return;
    const autoType = getAutoType();
    const combinedContent = allMessages.length > 1
      ? (rotationMode === "random" ? allMessages.join("|||") : allMessages.join("|&&|"))
      : allMessages[0] || "";
    const mediaValue = formMediaFiles.length > 0
      ? JSON.stringify(formMediaFiles.map(f => ({ url: f.url, type: f.type, name: f.name, sendMode: f.sendMode })))
      : undefined;
    const payload = {
      name: formName,
      type: autoType,
      content: combinedContent,
      media_url: mediaValue,
      buttons: formButtons.map(b => ({ type: b.type, text: b.text, value: b.value })),
    };
    if (editingId) {
      updateTemplate.mutate({ id: editingId, ...payload }, {
        onSuccess: () => { setDialogOpen(false); toast({ title: "Modelo atualizado" }); },
      });
    } else {
      createTemplate.mutate(payload, {
        onSuccess: () => { setDialogOpen(false); toast({ title: "Modelo criado" }); },
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteTemplate.mutate(id, { onSuccess: () => toast({ title: "Modelo excluído" }) });
  };

  const addButton = (type: "reply" | "url" | "phone") => {
    if (formButtons.length < 10) setFormButtons(prev => [...prev, { id: Date.now(), type, text: "", value: "" }]);
  };
  const removeButton = (id: number) => setFormButtons(prev => prev.filter(b => b.id !== id));
  const updateButton = (id: number, field: keyof TemplateButton, val: string) => {
    setFormButtons(prev => prev.map(b => b.id === id ? { ...b, [field]: val } : b));
  };
  const moveButton = (id: number, direction: "up" | "down") => {
    setFormButtons(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  const wrapSelectedText = (before: string, after: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setFormContent(prev => prev + before + after); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = formContent.substring(start, end);
    const newText = formContent.substring(0, start) + before + selected + after + formContent.substring(end);
    setFormContent(newText);
    setTimeout(() => {
      textarea.focus();
      if (selected.length > 0) {
        textarea.setSelectionRange(start + before.length, end + before.length);
      } else {
        textarea.setSelectionRange(start + before.length, start + before.length);
      }
    }, 0);
  };

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setFormContent(prev => prev + text); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = formContent.substring(0, start) + text + formContent.substring(end);
    setFormContent(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const typeLabel = (type: string) => {
    const map: Record<string, string> = { text: "Texto", "text-media": "Texto com mídia", buttons: "Botões", list: "Lista" };
    return map[type] || type;
  };

  const buttonTypeLabel = (type: string) => {
    const map: Record<string, string> = { reply: "Resposta Rápida", url: "Link (URL)" };
    return map[type] || type;
  };

  const buttonTypeIcon = (type: string) => {
    if (type === "url") return Link;
    if (type === "phone") return Phone;
    return MousePointerClick;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Modelos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Gerencie seus templates de mensagem</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5 rounded-xl px-5 shadow-sm">
          <Plus className="w-4 h-4" /> Adicionar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar modelo..." className="pl-9 h-10 text-sm rounded-xl bg-muted/30 border-border/50 focus:bg-background transition-colors" />
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

      {/* Templates List */}
      {isLoading ? (
        <div className="flex justify-center py-16 text-sm text-muted-foreground">Carregando...</div>
      ) : paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <FileText className="w-10 h-10 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">Nenhum modelo encontrado</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {paginated.map((t, idx) => (
            <div
              key={t.id}
              className="group flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border/40 bg-card hover:border-primary/20 hover:shadow-[0_2px_12px_-4px_hsl(var(--primary)/0.08)] transition-all duration-200"
            >
              <span className="text-xs font-mono text-muted-foreground/40 w-6 text-right tabular-nums shrink-0">
                {(currentPage - 1) * perPage + idx + 1}
              </span>
              <Badge variant="outline" className="text-[10px] font-medium shrink-0 rounded-lg px-2 py-0.5 border-border/60 bg-muted/40 hidden sm:flex">
                {typeLabel(t.type)}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                <p className="text-xs text-muted-foreground/60 truncate mt-0.5 max-w-[300px]">{t.content}</p>
              </div>
              <span className="text-[11px] text-muted-foreground/40 shrink-0 hidden lg:block tabular-nums">
                {new Date(t.created_at).toLocaleDateString("pt-BR")}
              </span>
              <div className="flex items-center gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => { setPreviewTemplate(t); setPreviewOpen(true); }} title="Pré-visualizar">
                  <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => openEdit(t)} title="Editar">
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-destructive/10 transition-colors" onClick={() => handleDelete(t.id)} title="Excluir">
                  <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > perPage && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground pt-1">
          <span className="text-muted-foreground/50">
            {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, filtered.length)} de {filtered.length}
          </span>
          <div className="flex items-center gap-1 ml-2">
            <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border/40 hover:bg-muted/40 disabled:opacity-30 transition-colors" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-semibold">{currentPage}</span>
            <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border/40 hover:bg-muted/40 disabled:opacity-30 transition-colors" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Create/Edit Dialog — Full Content Editor ═══ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/30">
            <DialogTitle className="text-lg">{editingId ? "Editar modelo" : "Adicionar modelo"}</DialogTitle>
          </DialogHeader>

          <div className="px-6 py-5 space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nome do modelo</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Boas-vindas, Promoção..." className="h-11 text-sm bg-background/50 dark:bg-muted/20 border-border/30" />
            </div>

            {/* ── Message Editor (same as Campaigns) ── */}
            <SurfaceCard className="p-4 sm:p-5 space-y-4">
              <SectionLabel>Mensagem</SectionLabel>

              {/* Message Tabs */}
              <div className="flex items-center gap-1 flex-wrap">
                {[0, 1, 2, 3, 4].map(i => {
                  const hasText = formMessages[i]?.trim();
                  return (
                    <button
                      key={i}
                      onClick={() => setActiveMessageTab(i)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border",
                        activeMessageTab === i
                          ? "bg-primary/15 text-primary border-primary/30"
                          : hasText
                            ? "bg-muted/20 text-foreground/70 border-border/20 hover:bg-muted/30"
                            : "bg-muted/8 text-muted-foreground/40 border-border/10 hover:bg-muted/15"
                      )}
                    >
                      Msg {i + 1}
                      {hasText && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
                    </button>
                  );
                })}
                <span className="text-[9px] text-muted-foreground/40 ml-2">
                  {allMessages.length}/5 ativas
                </span>
              </div>

              {/* Rotation toggle */}
              {allMessages.length > 1 && (
                <div className="flex flex-col gap-2 p-3 rounded-xl bg-muted/10 border border-border/10">
                  <p className="text-[11px] font-medium text-foreground/70">Modo de envio das mensagens</p>
                  <div className="flex gap-2">
                    {([
                      { value: "random" as const, label: "Aleatório", icon: <Sparkles className="w-3 h-3 mr-1" />, desc: "Uma mensagem aleatória para cada contato" },
                      { value: "all" as const, label: "Todas", icon: <ArrowDown className="w-3 h-3 mr-1" />, desc: "Todas as mensagens para cada contato" },
                    ]).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setRotationMode(opt.value)}
                        className={`flex-1 text-center p-2 rounded-lg border text-[10px] transition-all ${
                          rotationMode === opt.value
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border/20 text-muted-foreground hover:border-border/40"
                        }`}
                      >
                        <div className="flex items-center justify-center">{opt.icon}{opt.label}</div>
                        <p className="text-[9px] text-muted-foreground/50 mt-1">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Toolbar */}
              <div className="flex items-center gap-0.5 flex-wrap p-1.5 rounded-xl bg-muted/15 dark:bg-muted/8 border border-border/10">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground hover:bg-background/60 font-medium rounded-lg">
                      <FileText className="w-3.5 h-3.5" /> Variável
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1.5 bg-popover border-border z-50" align="start">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1">Contato</p>
                    {[{ label: "Nome", tag: "{{nome}}" }, { label: "Número", tag: "{{numero}}" }].map(v => (
                      <button key={v.tag} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-accent transition-colors flex items-center justify-between"
                        onClick={() => insertAtCursor(v.tag)}>
                        <span>{v.label}</span>
                        <code className="text-[9px] text-muted-foreground">{v.tag}</code>
                      </button>
                    ))}
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1 mt-1">Personalizadas</p>
                    {["Variável 1", "Variável 2", "Variável 3", "Variável 4", "Variável 5", "Variável 6", "Variável 7"].map((v, i) => (
                      <button key={v} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-accent transition-colors flex items-center justify-between"
                        onClick={() => insertAtCursor(`{{var${i + 1}}}`)}>
                        <span>{v}</span>
                        <code className="text-[9px] text-muted-foreground">{`{{var${i + 1}}}`}</code>
                      </button>
                    ))}
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1 mt-1">Dinâmicas</p>
                    {[
                      { label: "Número Aleatório (4 dígitos)", tag: "{{rand4}}" },
                      { label: "Texto Aleatório (3 letras)", tag: "{{rand3}}" },
                    ].map(v => (
                      <button key={v.tag} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-accent transition-colors flex items-center justify-between"
                        onClick={() => insertAtCursor(v.tag)}>
                        <span>{v.label}</span>
                        <code className="text-[9px] text-muted-foreground">{v.tag}</code>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                <div className="h-5 w-px bg-border/20 mx-0.5" />
                {[
                  { icon: Bold, label: "Negrito", wrap: ["*", "*"] },
                  { icon: Italic, label: "Itálico", wrap: ["_", "_"] },
                  { icon: Strikethrough, label: "Tachado", wrap: ["~", "~"] },
                  { icon: Code, label: "Código", wrap: ["```", "```"] },
                ].map(({ icon: Icon, label, wrap }) => (
                  <Button key={label} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 hover:text-foreground hover:bg-background/60 rounded-lg transition-colors" title={label}
                    onClick={() => wrapSelectedText(wrap[0], wrap[1])}>
                    <Icon className="w-3.5 h-3.5" />
                  </Button>
                ))}
                <div className="h-5 w-px bg-border/20 mx-0.5" />

                <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 hover:text-foreground hover:bg-background/60 rounded-lg" title="Emoji">
                      <Smile className="w-3.5 h-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-2 bg-popover border-border z-50" align="start">
                    <div className="flex items-center gap-0.5 mb-2 border-b border-border/20 pb-1.5">
                      {Object.keys(commonEmojis).map(cat => (
                        <button key={cat} onClick={() => setEmojiCategory(cat)}
                          className={cn("px-2 py-1 rounded text-[10px] transition-colors",
                            emojiCategory === cat ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent"
                          )}>{cat}</button>
                      ))}
                    </div>
                    <div className="grid grid-cols-8 gap-0.5">
                      {(commonEmojis[emojiCategory] || []).map(emoji => (
                        <button key={emoji} className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-base"
                          onClick={() => { insertAtCursor(emoji); setShowEmojiPicker(false); }}>{emoji}</button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Textarea */}
              <Textarea
                ref={textareaRef}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Olá, {{nome}}.\n\nEscreva sua mensagem aqui..."
                rows={8}
                className="text-sm leading-[1.8] bg-muted/8 dark:bg-muted/4 border-border/15 resize-none focus-visible:ring-1 focus-visible:ring-primary/30 px-4 py-3 text-foreground/90 placeholder:text-muted-foreground/30 rounded-xl"
              />

              {/* Detected variables */}
              {detectedVars.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground/50 font-medium">Variáveis:</span>
                  {detectedVars.map(v => (
                    <span key={v} className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 dark:bg-primary/15 text-primary text-[10px] font-mono font-medium border border-primary/20">
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </SurfaceCard>

            {/* ── Mídia ── */}
            <SurfaceCard className="p-4 sm:p-5 space-y-3">
              <SectionLabel>Mídia</SectionLabel>
              {formMediaFiles.length === 0 ? (
                <button
                  onClick={() => mediaFileRef.current?.click()}
                  disabled={uploading}
                  className="w-full py-6 rounded-xl border-2 border-dashed border-border/30 dark:border-border/15 hover:border-primary/40 bg-muted/5 dark:bg-muted/3 flex flex-col items-center justify-center gap-2 transition-colors duration-100 hover:bg-primary/5 group"
                >
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <ImageIcon className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary transition-colors" />}
                  <span className="text-[11px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">{uploading ? "Enviando..." : "Imagem, vídeo, áudio ou documento — até 20MB"}</span>
                </button>
              ) : (
                <div className="space-y-2">
                  {formMediaFiles.map((file, idx) => (
                    <div key={file.id} className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        {/* Thumbnail */}
                        {file.type === "image" && <img src={file.url} alt={file.name} className="w-12 h-12 rounded-lg object-cover shrink-0" loading="lazy" />}
                        {file.type === "video" && (
                          <div className="w-12 h-12 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                            <Video className="w-5 h-5 text-muted-foreground/60" />
                          </div>
                        )}
                        {file.type === "audio" && (
                          <div className="w-12 h-12 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                            <Mic className="w-5 h-5 text-primary" />
                          </div>
                        )}
                        {file.type === "document" && (
                          <div className="w-12 h-12 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-primary" />
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{file.name}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge variant="outline" className="text-[9px] h-4 border-border/60 bg-muted/30 px-1.5">
                              {file.type === "image" ? "Imagem" : file.type === "video" ? "Vídeo" : file.type === "audio" ? "Áudio" : "Doc"}
                            </Badge>
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button className="text-muted-foreground/50 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/50 disabled:opacity-20" disabled={idx === 0} onClick={() => moveMediaFile(file.id, "up")}><ArrowUp className="w-3.5 h-3.5" /></button>
                          <button className="text-muted-foreground/50 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/50 disabled:opacity-20" disabled={idx === formMediaFiles.length - 1} onClick={() => moveMediaFile(file.id, "down")}><ArrowDown className="w-3.5 h-3.5" /></button>
                          <button
                            type="button"
                            onClick={() => cycleSendMode(file.id)}
                            className={cn(
                              "h-7 px-2.5 rounded-lg text-[10px] font-medium transition-all border ml-1",
                              file.sendMode === "before"
                                ? "bg-primary text-primary-foreground border-primary"
                                : file.sendMode === "with"
                                  ? "bg-primary/15 text-primary border-primary/40"
                                  : "bg-muted/40 text-foreground/70 border-border/60"
                            )}
                          >
                            {file.sendMode === "before" ? "Antes da msg" : file.sendMode === "with" ? "Com a msg" : "Depois da msg"}
                          </button>
                          <button className="text-muted-foreground/50 hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10" onClick={() => removeMediaFile(file.id)}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full h-9 text-xs gap-1.5 border-dashed border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5"
                    onClick={() => mediaFileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Adicionar mídia
                  </Button>
                </div>
              )}
              <input
                ref={mediaFileRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await handleMediaUpload(file);
                  e.target.value = "";
                }}
              />
            </SurfaceCard>

            {/* ── Botões Interativos ── */}
            <SurfaceCard className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <SectionLabel>Botões Interativos</SectionLabel>
                <Badge variant="secondary" className="text-[10px] h-5 bg-primary/10 text-primary border-primary/20">
                  {formButtons.length}/10
                </Badge>
              </div>

              <div className="space-y-3">
                {formButtons.map((btn, idx) => {
                  const TypeIcon = buttonTypeIcon(btn.type);
                  return (
                    <div key={btn.id} className="rounded-xl border border-border/30 dark:border-border/15 bg-muted/15 dark:bg-muted/8 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                            <TypeIcon className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <span className="text-[11px] font-semibold text-foreground/70">{buttonTypeLabel(btn.type)}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/30 disabled:opacity-20" disabled={idx === 0} onClick={() => moveButton(btn.id, "up")}><ArrowUp className="w-3.5 h-3.5" /></button>
                          <button className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/30 disabled:opacity-20" disabled={idx === formButtons.length - 1} onClick={() => moveButton(btn.id, "down")}><ArrowDown className="w-3.5 h-3.5" /></button>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="text-muted-foreground/40 hover:text-primary transition-colors p-1 rounded-lg hover:bg-primary/10"><Pencil className="w-3.5 h-3.5" /></button>
                            </PopoverTrigger>
                            <PopoverContent className="w-44 p-1.5 bg-popover border-border z-50" align="end">
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1">Alterar tipo</p>
                              {[
                                { t: "reply" as const, label: "Resposta Rápida", Ic: MousePointerClick },
                                { t: "url" as const, label: "Link (URL)", Ic: Link },
                              ].map(opt => (
                                <button key={opt.t} className={cn("w-full text-left px-2.5 py-2 text-xs rounded-lg hover:bg-accent transition-colors flex items-center gap-2", btn.type === opt.t && "bg-accent")}
                                  onClick={() => updateButton(btn.id, "type", opt.t)}>
                                  <opt.Ic className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="font-medium">{opt.label}</span>
                                </button>
                              ))}
                            </PopoverContent>
                          </Popover>
                          <button className="text-muted-foreground/30 hover:text-destructive transition-colors p-1 rounded-lg hover:bg-destructive/10" onClick={() => removeButton(btn.id)}><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      {btn.type === "reply" ? (
                        <Input value={btn.text} onChange={(e) => updateButton(btn.id, "text", e.target.value)} placeholder="Texto exibido no botão" className="h-10 text-sm bg-background/50 dark:bg-background/20 border-border/15 font-medium" maxLength={20} />
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <Input value={btn.text} onChange={(e) => updateButton(btn.id, "text", e.target.value)} placeholder="Texto exibido" className="h-10 text-sm bg-background/50 dark:bg-background/20 border-border/15 font-medium" maxLength={20} />
                          <Input value={btn.value} onChange={(e) => updateButton(btn.id, "value", e.target.value)} placeholder={btn.type === "url" ? "https://..." : "+5511999999999"} className="h-10 text-sm bg-background/50 dark:bg-background/20 border-border/15 font-mono" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button variant="outline" size="sm" disabled={formButtons.length >= 10}
                className="w-full h-11 gap-2 border-dashed border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors duration-100 text-xs font-medium"
                onClick={() => addButton("reply")}>
                <Plus className="w-4 h-4" /> Adicionar Botão
              </Button>
            </SurfaceCard>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/30">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createTemplate.isPending || updateTemplate.isPending || !formName.trim() || allMessages.length === 0}>
              {(createTemplate.isPending || updateTemplate.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Preview Dialog ═══ */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[380px] max-h-[85vh] overflow-y-auto p-0 border-0 bg-transparent shadow-none [&>button]:hidden">
          <div className="rounded-2xl overflow-hidden border border-[#ffffff0a] shadow-[0_8px_30px_rgba(0,0,0,0.4)]" style={{ background: "#0b141a" }}>
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-[#ffffff08]" style={{ background: "#1f2c34" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#2a3942" }}>
                  <MessageSquare className="w-4.5 h-4.5" style={{ color: "#aebac1" }} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold leading-tight" style={{ color: "#e9edef" }}>Destinatário</p>
                  <p className="text-[10px]" style={{ color: "#8696a0" }}>online</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {(["sent", "received"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setPreviewMode(mode)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150"
                    style={{
                      background: previewMode === mode ? "hsl(var(--primary) / 0.15)" : "transparent",
                      color: previewMode === mode ? "hsl(var(--primary))" : "#8696a0",
                      border: previewMode === mode ? "1px solid hsl(var(--primary) / 0.3)" : "1px solid transparent",
                    }}
                  >
                    {mode === "sent" ? "Enviada" : "Recebida"}
                  </button>
                ))}
                <button onClick={() => setPreviewOpen(false)} className="ml-1 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#ffffff10] transition-colors">
                  <X className="w-3.5 h-3.5" style={{ color: "#8696a0" }} />
                </button>
              </div>
            </div>

            {/* Chat area */}
            <div
              className="px-5 py-8 min-h-[320px] flex flex-col justify-end gap-2"
              style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'0.8\' fill=\'%23ffffff06\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect fill=\'url(%23p)\' width=\'200\' height=\'200\'/%3E%3C/svg%3E")',
              }}
            >
              {previewTemplate && (() => {
                const files = parseMediaFiles(previewTemplate.media_url);
                const beforeFiles = files.filter((f: MediaFile) => f.sendMode === "before");
                const withFile = files.find((f: MediaFile) => f.sendMode === "with");
                const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const isSent = previewMode === "sent";
                const bubbleBg = isSent ? "#005c4b" : "#1f2c34";
                const align = isSent ? "self-end" : "self-start";
                const buttons = previewTemplate.buttons || [];

                return (
                  <>
                    {beforeFiles.map((file: MediaFile, i: number) => (
                      <div key={`before-${i}`} className={`${align} max-w-[82%]`}>
                        <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: bubbleBg }}>
                          {file.type === "image" && <img src={file.url} alt={file.name} className="w-full max-h-44 object-cover" style={{ aspectRatio: 'auto' }} />}
                          {file.type === "video" && <video src={file.url} controls className="w-full max-h-48" />}
                          {file.type === "audio" && (
                            <div className="px-3 py-2.5 flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "#00a884" }}>
                                <Mic className="w-4 h-4 text-white" />
                              </div>
                              <audio src={file.url} controls className="w-full h-7 [&::-webkit-media-controls-panel]:bg-transparent" />
                            </div>
                          )}
                          {file.type === "document" && (
                            <div className="px-3 py-2.5 flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(0,168,132,0.15)" }}>
                                <FileText className="w-4 h-4" style={{ color: "#00a884" }} />
                              </div>
                              <span className="text-[11px] truncate" style={{ color: "#e9edef" }}>{file.name}</span>
                            </div>
                          )}
                          <div className="flex justify-end px-2.5 pb-1.5">
                            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>{time} {isSent && "✓✓"}</span>
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className={`${align} max-w-[82%]`}>
                      <div className="rounded-xl overflow-hidden shadow-md" style={{ background: bubbleBg }}>
                        {withFile && (
                          <>
                            {withFile.type === "image" && <img src={withFile.url} alt={withFile.name} className="w-full max-h-44 object-cover" style={{ aspectRatio: 'auto' }} />}
                            {withFile.type === "video" && <video src={withFile.url} controls className="w-full max-h-48" />}
                          </>
                        )}
                        <div className="px-3 py-2">
                          <p className="text-[13px] whitespace-pre-wrap leading-[1.4]" style={{ color: "#e9edef" }}>
                            {(() => {
                              const raw = previewTemplate.content || "";
                              const parts = raw.includes("|||") ? raw.split("|||") : raw.includes("|&&|") ? raw.split("|&&|") : [raw];
                              return parts[0];
                            })()}
                          </p>
                          <div className="flex justify-end mt-1 gap-1 items-center">
                            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>{time}</span>
                            {isSent && <span className="text-[10px]" style={{ color: "#53bdeb" }}>✓✓</span>}
                          </div>
                        </div>
                        {buttons.length > 0 && (
                          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            {buttons.map((btn: any, i: number) => (
                              <div
                                key={i}
                                className="px-3 py-2.5 flex items-center justify-center gap-1.5 text-center cursor-pointer transition-colors"
                                style={{ borderBottom: i < buttons.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                              >
                                {btn.type === "url" ? <Link className="w-3.5 h-3.5" style={{ color: "#00a884" }} /> : btn.type === "phone" ? <Phone className="w-3.5 h-3.5" style={{ color: "#00a884" }} /> : <MessageSquare className="w-3.5 h-3.5" style={{ color: "#00a884" }} />}
                                <span className="text-[13px] font-medium" style={{ color: "#00a884" }}>{btn.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Templates;
