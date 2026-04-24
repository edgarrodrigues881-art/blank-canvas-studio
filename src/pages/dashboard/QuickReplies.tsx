import { useState, useRef } from "react";
import {
  useQuickReplies,
  type QuickReply,
  type QuickReplyBlock,
  type QuickReplyBlockType,
  QUICK_REPLY_CATEGORIES,
} from "@/hooks/chat/useQuickReplies";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  Zap,
  Type,
  Image as ImageIcon,
  Mic,
  FileText as FileIcon,
  ArrowUp,
  ArrowDown,
  Clock,
  Upload,
  Loader2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BLOCK_TYPES: {
  type: QuickReplyBlockType;
  label: string;
  icon: any;
  accent: string;
}[] = [
  { type: "text", label: "Texto", icon: Type, accent: "text-foreground" },
  { type: "image", label: "Imagem", icon: ImageIcon, accent: "text-blue-500" },
  { type: "audio", label: "Áudio", icon: Mic, accent: "text-violet-500" },
  { type: "file", label: "Arquivo", icon: FileIcon, accent: "text-amber-500" },
];

const ACCEPT_BY_TYPE: Record<QuickReplyBlockType, string> = {
  text: "",
  image: "image/*",
  audio: "audio/*",
  file: "*/*",
};

export default function QuickReplies() {
  const { user } = useAuth();
  const { replies, isLoading, upsert, remove } = useQuickReplies();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<QuickReply> | null>(null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingTypeRef = useRef<QuickReplyBlockType>("image");
  const pendingIdxRef = useRef<number>(-1);

  const filtered = replies.filter(
    (r) =>
      !search ||
      r.label.toLowerCase().includes(search.toLowerCase()) ||
      r.content.toLowerCase().includes(search.toLowerCase()),
  );

  const startNew = () => {
    setEditing({
      label: "",
      content: "",
      category: "geral",
      blocks: [{ type: "text", content: "", delayMs: 0 }],
    });
  };

  const startEdit = (r: QuickReply) => {
    const blocks = r.blocks && r.blocks.length > 0
      ? r.blocks
      : [{ type: "text" as const, content: r.content, delayMs: 0 }];
    setEditing({ ...r, blocks });
  };

  const updateBlock = (idx: number, patch: Partial<QuickReplyBlock>) => {
    if (!editing) return;
    const next = [...(editing.blocks || [])];
    next[idx] = { ...next[idx], ...patch };
    setEditing({ ...editing, blocks: next });
  };

  const addBlock = (type: QuickReplyBlockType) => {
    if (!editing) return;
    const next = [
      ...(editing.blocks || []),
      { type, content: "", delayMs: 1500 } as QuickReplyBlock,
    ];
    setEditing({ ...editing, blocks: next });
  };

  const removeBlock = (idx: number) => {
    if (!editing) return;
    const next = [...(editing.blocks || [])];
    next.splice(idx, 1);
    setEditing({ ...editing, blocks: next });
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    if (!editing) return;
    const next = [...(editing.blocks || [])];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setEditing({ ...editing, blocks: next });
  };

  const triggerUpload = (idx: number, type: QuickReplyBlockType) => {
    if (!fileInputRef.current) return;
    pendingIdxRef.current = idx;
    pendingTypeRef.current = type;
    fileInputRef.current.accept = ACCEPT_BY_TYPE[type];
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const idx = pendingIdxRef.current;
    if (!file || !user || idx < 0) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Arquivo muito grande", { description: "Máximo: 20MB." });
      return;
    }
    setUploadingIdx(idx);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/quick-replies/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      updateBlock(idx, { mediaUrl: pub.publicUrl, fileName: file.name });
      toast.success("Mídia carregada");
    } catch (err: any) {
      toast.error("Falha no upload", { description: err.message });
    } finally {
      setUploadingIdx(null);
    }
  };

  const save = async () => {
    if (!editing) return;
    const label = (editing.label || "").trim().replace(/^\//, "").toLowerCase().replace(/\s+/g, "-");
    if (!label) {
      toast.error("Defina um atalho (ex: /saudacao)");
      return;
    }
    const blocks = (editing.blocks || []).filter((b) => {
      if (b.type === "text") return Boolean((b.content || "").trim());
      return Boolean(b.mediaUrl);
    });
    if (blocks.length === 0) {
      toast.error("Adicione pelo menos 1 bloco com conteúdo");
      return;
    }
    const firstText = blocks.find((b) => b.type === "text")?.content || "";
    try {
      await upsert.mutateAsync({
        id: editing.id,
        label,
        content: firstText,
        category: editing.category || "geral",
        blocks,
      });
      toast.success(editing.id ? "Resposta atualizada" : "Resposta criada");
      setEditing(null);
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta resposta rápida?")) return;
    try {
      await remove.mutateAsync(id);
      toast.success("Removida");
    } catch (e: any) {
      toast.error("Erro ao remover", { description: e.message });
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Respostas Rápidas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie sequências de mensagens (texto, imagem, áudio, arquivo) e dispare no chat com{" "}
            <code className="px-1 py-0.5 rounded bg-muted text-foreground text-xs">/atalho</code>
          </p>
        </div>
        {!editing && (
          <Button onClick={startNew} className="gap-2">
            <Plus className="w-4 h-4" /> Nova resposta
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileSelected}
      />

      {editing && (
        <Card className="p-5 space-y-5 border-primary/30 shadow-md shadow-primary/5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">
              {editing.id ? "Editar resposta" : "Nova resposta rápida"}
            </h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={save} disabled={upsert.isPending}>
                <Save className="w-4 h-4 mr-1" /> Salvar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Atalho</Label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-muted-foreground font-mono text-sm">/</span>
                <Input
                  value={editing.label || ""}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  placeholder="saudacao"
                  className="font-mono"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select
                value={editing.category || "geral"}
                onValueChange={(v) => setEditing({ ...editing, category: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUICK_REPLY_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs">Sequência de mensagens</Label>
            {(editing.blocks || []).map((block, idx) => {
              const meta = BLOCK_TYPES.find((b) => b.type === block.type)!;
              const Icon = meta.icon;
              return (
                <Card key={idx} className="p-3 bg-muted/30 border-border/60">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground bg-background w-5 h-5 rounded-full flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <Icon className={cn("w-4 h-4", meta.accent)} />
                      <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveBlock(idx, -1)} disabled={idx === 0}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveBlock(idx, 1)} disabled={idx === (editing.blocks!.length - 1)}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeBlock(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {block.type === "text" ? (
                    <Textarea
                      value={block.content || ""}
                      onChange={(e) => updateBlock(idx, { content: e.target.value })}
                      placeholder="Olá {nome}! Como posso ajudar?"
                      rows={3}
                      className="bg-background"
                    />
                  ) : (
                    <div className="space-y-2">
                      {block.mediaUrl ? (
                        <div className="flex items-center gap-3 p-2 rounded-md bg-background border border-border">
                          {block.type === "image" && (
                            <img src={block.mediaUrl} alt="" className="w-16 h-16 object-cover rounded" />
                          )}
                          {block.type === "audio" && (
                            <audio src={block.mediaUrl} controls className="flex-1 h-9" />
                          )}
                          {block.type === "file" && (
                            <FileIcon className="w-8 h-8 text-amber-500" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">
                              {block.fileName || "arquivo"}
                            </p>
                            <button
                              onClick={() => triggerUpload(idx, block.type)}
                              className="text-[10px] text-primary hover:underline"
                            >
                              Substituir
                            </button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerUpload(idx, block.type)}
                          disabled={uploadingIdx === idx}
                          className="gap-2"
                        >
                          {uploadingIdx === idx ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          Carregar {meta.label.toLowerCase()}
                        </Button>
                      )}
                      {(block.type === "image" || block.type === "file") && block.mediaUrl && (
                        <Input
                          value={block.content || ""}
                          onChange={(e) => updateBlock(idx, { content: e.target.value })}
                          placeholder="Legenda (opcional)"
                          className="bg-background"
                        />
                      )}
                    </div>
                  )}

                  {idx > 0 && (
                    <div className="flex items-center gap-2 mt-2 text-xs">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Esperar antes de enviar:</span>
                      <Input
                        type="number"
                        min={0}
                        max={60000}
                        step={500}
                        value={block.delayMs ?? 1500}
                        onChange={(e) => updateBlock(idx, { delayMs: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-24 h-7 text-xs"
                      />
                      <span className="text-muted-foreground">ms</span>
                    </div>
                  )}
                </Card>
              );
            })}

            <div className="flex flex-wrap gap-2 pt-1">
              {BLOCK_TYPES.map((b) => {
                const Icon = b.icon;
                return (
                  <Button
                    key={b.type}
                    variant="outline"
                    size="sm"
                    onClick={() => addBlock(b.type)}
                    className="gap-1.5"
                  >
                    <Plus className="w-3 h-3" />
                    <Icon className={cn("w-3.5 h-3.5", b.accent)} />
                    {b.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Use <code className="px-1 rounded bg-muted">{"{nome}"}</code> e{" "}
            <code className="px-1 rounded bg-muted">{"{telefone}"}</code> nos textos para
            personalizar.
          </p>
        </Card>
      )}

      {!editing && replies.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar atalho ou texto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {!editing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {isLoading && (
            <Card className="p-6 text-center text-muted-foreground">Carregando...</Card>
          )}
          {!isLoading && replies.length === 0 && (
            <Card className="p-8 text-center col-span-full">
              <Zap className="w-10 h-10 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma resposta rápida ainda. Crie a primeira para agilizar seu atendimento.
              </p>
            </Card>
          )}
          {filtered.map((r) => {
            const blocks = r.blocks && r.blocks.length > 0 ? r.blocks : [{ type: "text" as const, content: r.content }];
            const cat = QUICK_REPLY_CATEGORIES.find((c) => c.value === r.category);
            return (
              <Card key={r.id} className="p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="text-sm font-bold text-primary truncate">/{r.label}</code>
                    {cat && (
                      <Badge variant="outline" className={cn("text-[9px]", cat.color)}>
                        {cat.label}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(r)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(r.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {blocks.map((b, i) => {
                    const meta = BLOCK_TYPES.find((m) => m.type === b.type)!;
                    const Icon = meta.icon;
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        <Icon className={cn("w-3 h-3", meta.accent)} />
                        {meta.label}
                      </span>
                    );
                  })}
                </div>
                {blocks[0]?.content && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {blocks[0].content}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
