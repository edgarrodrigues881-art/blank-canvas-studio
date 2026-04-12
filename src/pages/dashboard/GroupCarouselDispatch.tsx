import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Layers, Send, Plus, Trash2, Loader2, X, ImageIcon,
  Link, MousePointerClick, ArrowUp, ArrowDown, Copy,
} from "lucide-react";
import { Navigate } from "react-router-dom";

const ALLOWED_EMAIL = "edgarrodrigues881@gmail.com";

interface CardButton {
  id: number;
  type: "reply" | "url";
  text: string;
  value: string;
}

interface CarouselCard {
  id: string;
  text: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "document" | "audio" | null;
  mediaFileName: string;
  buttons: CardButton[];
}

function createEmptyCard(): CarouselCard {
  return {
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text: "",
    mediaUrl: "",
    mediaType: null,
    mediaFileName: "",
    buttons: [],
  };
}

// Compress images client-side
const compressImage = (file: File, maxWidth = 1200, quality = 0.8): Promise<File> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
      resolve(file);
      return;
    }
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const outputExt = outputType === "image/png" ? ".png" : ".jpg";
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, outputExt), { type: outputType }));
          } else {
            resolve(file);
          }
        },
        outputType,
        outputType === "image/jpeg" ? quality : undefined,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
};

export default function GroupCarouselDispatch() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [cards, setCards] = useState<CarouselCard[]>([createEmptyCard()]);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [headerText, setHeaderText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRef = useRef<HTMLInputElement>(null);

  const isAllowed = user?.email === ALLOWED_EMAIL;
  const activeCard = cards[activeCardIndex] || cards[0];

  useEffect(() => {
    if (!user || !isAllowed) return;
    supabase
      .from("devices")
      .select("id, name, number, status")
      .eq("user_id", user.id)
      .in("status", ["Ready", "Connected", "authenticated"])
      .then(({ data }) => setDevices(data || []));
  }, [user, isAllowed]);

  useEffect(() => {
    if (!selectedDevice) { setGroups([]); setSelectedGroups([]); setGroupSearch(""); return; }
    setLoadingGroups(true);
    setSelectedGroups([]);
    setGroupSearch("");
    const params = new URLSearchParams({ device_id: selectedDevice, action: "list_chats", quick: "true" });
    supabase.functions.invoke(`whapi-chats?${params.toString()}`, { method: "GET" })
      .then(({ data, error }) => {
        setLoadingGroups(false);
        if (error) { toast.error("Erro ao carregar grupos"); return; }
        const normalized = normalizeGroupOptions(data?.chats || []);
        setGroups(normalized);
        setSelectedGroups(prev => prev.filter(id => normalized.some(g => g.id === id)));
      })
      .catch(() => { setLoadingGroups(false); toast.error("Erro ao carregar grupos"); });
  }, [selectedDevice]);

  if (!isAllowed) return <Navigate to="/dashboard" replace />;

  // Card CRUD
  const addCard = () => {
    if (cards.length >= 4) { toast.error("Máximo 4 cards"); return; }
    const newCards = [...cards, createEmptyCard()];
    setCards(newCards);
    setActiveCardIndex(newCards.length - 1);
  };

  const removeCard = (index: number) => {
    if (cards.length <= 1) { toast.error("Mínimo 1 card"); return; }
    const newCards = cards.filter((_, i) => i !== index);
    setCards(newCards);
    setActiveCardIndex(Math.min(activeCardIndex, newCards.length - 1));
  };

  const duplicateCard = (index: number) => {
    if (cards.length >= 4) { toast.error("Máximo 4 cards"); return; }
    const source = cards[index];
    const copy: CarouselCard = {
      ...source,
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      buttons: source.buttons.map(b => ({ ...b, id: Date.now() + Math.floor(Math.random() * 10000) })),
    };
    const newCards = [...cards];
    newCards.splice(index + 1, 0, copy);
    setCards(newCards);
    setActiveCardIndex(index + 1);
  };

  const moveCard = (index: number, dir: "up" | "down") => {
    const newIndex = dir === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= cards.length) return;
    const newCards = [...cards];
    [newCards[index], newCards[newIndex]] = [newCards[newIndex], newCards[index]];
    setCards(newCards);
    setActiveCardIndex(newIndex);
  };

  const updateCard = (index: number, updates: Partial<CarouselCard>) => {
    setCards(prev => prev.map((c, i) => i === index ? { ...c, ...updates } : c));
  };

  // Button CRUD
  const addButton = (type: "reply" | "url") => {
    if (activeCard.buttons.length >= 3) { toast.error("Máximo 3 botões por card"); return; }
    const btn: CardButton = { id: Date.now() + Math.floor(Math.random() * 10000), type, text: "", value: "" };
    updateCard(activeCardIndex, { buttons: [...activeCard.buttons, btn] });
  };

  const removeButton = (btnId: number) => {
    updateCard(activeCardIndex, { buttons: activeCard.buttons.filter(b => b.id !== btnId) });
  };

  const updateButton = (btnId: number, field: keyof CardButton, val: string) => {
    updateCard(activeCardIndex, {
      buttons: activeCard.buttons.map(b => b.id === btnId ? { ...b, [field]: val } : b),
    });
  };

  // Media upload
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("Máximo 20MB por arquivo"); return; }

    setUploading(true);
    try {
      const optimized = await compressImage(file);
      const ext = optimized.name.split(".").pop() || "bin";
      const path = `${user.id}/group-carousel/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(path, optimized, {
        upsert: true,
        contentType: optimized.type || undefined,
      });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      updateCard(activeCardIndex, {
        mediaUrl: urlData.publicUrl,
        mediaType: detectMediaType(urlData.publicUrl, optimized.type),
        mediaFileName: file.name,
      });
      toast.success("Mídia carregada");
    } catch (err: any) {
      toast.error(err?.message || "Erro no upload da mídia");
    } finally {
      setUploading(false);
      if (mediaRef.current) mediaRef.current.value = "";
    }
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroups(prev => prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]);
  };

  const filteredGroups = groups.filter(g =>
    !groupSearch || (g.name || g.id || "").toLowerCase().includes(groupSearch.toLowerCase()),
  );
  const selectedGroupDetails = groups.filter(g => selectedGroups.includes(g.id));

  // Build caption with buttons appended as text links
  const buildCaptionWithButtons = (card: CarouselCard): string => {
    let caption = card.text.trim();
    const urlButtons = card.buttons.filter(b => b.type === "url" && b.text.trim() && b.value.trim());
    const replyButtons = card.buttons.filter(b => b.type === "reply" && b.text.trim());

    if (urlButtons.length > 0 || replyButtons.length > 0) {
      if (caption) caption += "\n\n";
      urlButtons.forEach(b => { caption += `🔗 ${b.text}: ${b.value}\n`; });
      replyButtons.forEach(b => { caption += `💬 ${b.text}\n`; });
    }
    return caption.trim();
  };

  const handleSend = async () => {
    if (!selectedDevice) { toast.error("Selecione uma instância"); return; }
    if (selectedGroups.length === 0) { toast.error("Selecione ao menos um grupo"); return; }
    if (cards.every(c => !c.text.trim() && !c.mediaUrl)) {
      toast.error("Adicione conteúdo aos cards"); return;
    }

    setSending(true);
    let successCount = 0;
    let errorCount = 0;
    const failureMessages: string[] = [];

    try {
      for (const [groupIndex, groupId] of selectedGroups.entries()) {
        try {
          if (headerText.trim()) {
            const result = await supabase.functions.invoke("group-carousel-send", {
              body: { deviceId: selectedDevice, groupJid: groupId, content: headerText.trim(), type: "text" },
            });
            assertFunctionSuccess(result, "Falha ao enviar texto de abertura");
            await delay(1500);
          }

          for (const [cardIndex, card] of cards.entries()) {
            const caption = buildCaptionWithButtons(card);

            if (card.mediaUrl) {
              const result = await supabase.functions.invoke("group-carousel-send", {
                body: {
                  deviceId: selectedDevice,
                  groupJid: groupId,
                  content: card.mediaUrl,
                  type: card.mediaType || "image",
                  caption: caption || undefined,
                },
              });
              assertFunctionSuccess(result, `Falha ao enviar card ${cardIndex + 1}`);
            } else if (caption) {
              const result = await supabase.functions.invoke("group-carousel-send", {
                body: { deviceId: selectedDevice, groupJid: groupId, content: caption, type: "text" },
              });
              assertFunctionSuccess(result, `Falha ao enviar card ${cardIndex + 1}`);
            }

            if (cardIndex < cards.length - 1) await delay(2000);
          }
          successCount++;
        } catch (err) {
          errorCount++;
          failureMessages.push(err instanceof Error ? err.message : "Erro ao enviar");
        }
        if (groupIndex < selectedGroups.length - 1) await delay(3000);
      }
    } finally {
      setSending(false);
    }

    if (successCount > 0) toast.success(`Carrossel enviado para ${successCount} grupo(s)`);
    if (errorCount > 0) toast.error(`Falha em ${errorCount} grupo(s): ${failureMessages[0] || ""}`);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Layers className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Carrossel em Grupos</h1>
          <p className="text-sm text-muted-foreground">Envie cards sequenciais com imagem, texto e botões</p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs border-amber-500/50 text-amber-400">Beta</Badge>
      </div>

      {/* 1. Instance */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">1. Selecione a Instância</CardTitle></CardHeader>
        <CardContent>
          <Select value={selectedDevice} onValueChange={setSelectedDevice}>
            <SelectTrigger><SelectValue placeholder="Escolha uma instância conectada" /></SelectTrigger>
            <SelectContent>
              {devices.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name} {d.number ? `(${d.number})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 2. Groups */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">2. Selecione os Grupos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Buscar grupo..." value={groupSearch} onChange={e => setGroupSearch(e.target.value)} />
          {loadingGroups ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando grupos...
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredGroups.length === 0 && selectedDevice && (
                <p className="text-sm text-muted-foreground py-2">Nenhum grupo encontrado</p>
              )}
              {filteredGroups.map(g => (
                <label key={g.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 cursor-pointer text-sm">
                  <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} className="rounded" />
                  <span className="truncate">{g.name || g.id}</span>
                </label>
              ))}
            </div>
          )}
          {selectedGroupDetails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <p className="text-xs text-muted-foreground w-full">{selectedGroupDetails.length} grupo(s)</p>
              {selectedGroupDetails.map(g => (
                <Badge key={g.id} variant="secondary" className="max-w-full"><span className="truncate">{g.name}</span></Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Header text */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">3. Texto de Abertura (opcional)</CardTitle></CardHeader>
        <CardContent>
          <Textarea placeholder="Texto enviado antes dos cards..." value={headerText} onChange={e => setHeaderText(e.target.value)} rows={2} />
        </CardContent>
      </Card>

      {/* 4. Cards */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">4. Cards do Carrossel</CardTitle>
            <span className="text-xs text-muted-foreground">{cards.length}/4</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Card tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {cards.map((card, i) => {
              const hasContent = card.text.trim() || card.mediaUrl;
              return (
                <button
                  key={card.id}
                  onClick={() => setActiveCardIndex(i)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                    activeCardIndex === i
                      ? "bg-primary/15 text-primary"
                      : hasContent
                        ? "bg-muted/20 text-foreground/70 hover:bg-muted/30"
                        : "bg-muted/10 text-muted-foreground/40 hover:bg-muted/15"
                  }`}
                >
                  Card {i + 1}
                  {hasContent && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
                </button>
              );
            })}
            <button
              onClick={addCard}
              disabled={cards.length >= 4}
              className="px-2.5 py-1.5 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-semibold flex items-center gap-1 disabled:opacity-40"
            >
              <Plus className="w-3 h-3" /> Card
            </button>
          </div>

          {/* Card actions */}
          <div className="flex items-center gap-1 flex-wrap">
            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => moveCard(activeCardIndex, "up")} disabled={activeCardIndex === 0}>
              <ArrowUp className="w-3 h-3" /> Mover
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => moveCard(activeCardIndex, "down")} disabled={activeCardIndex === cards.length - 1}>
              <ArrowDown className="w-3 h-3" /> Mover
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => duplicateCard(activeCardIndex)}>
              <Copy className="w-3 h-3" /> Duplicar
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => removeCard(activeCardIndex)} disabled={cards.length <= 1}>
              <Trash2 className="w-3 h-3" /> Excluir
            </Button>
          </div>

          {/* Media upload (file only, no URL input) */}
          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Mídia do Card {activeCardIndex + 1}
            </Label>
            <input type="file" ref={mediaRef} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt" className="hidden" onChange={handleMediaUpload} />
            {!activeCard.mediaUrl ? (
              <button
                onClick={() => mediaRef.current?.click()}
                disabled={uploading}
                className="w-full py-6 rounded-xl border-2 border-dashed border-border/30 hover:border-primary/40 bg-muted/5 flex flex-col items-center justify-center gap-1.5 transition-colors hover:bg-primary/5 group"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <ImageIcon className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary transition-colors" />}
                <span className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                  {uploading ? "Enviando..." : "Clique para enviar imagem, vídeo ou documento"}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/60 shadow-sm">
                {activeCard.mediaType === "image" && (
                  <img src={activeCard.mediaUrl} alt="preview" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                )}
                {activeCard.mediaType !== "image" && (
                  <div className="w-12 h-12 rounded-lg bg-muted/20 flex items-center justify-center shrink-0">
                    <Layers className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{activeCard.mediaFileName || "Mídia"}</p>
                  <p className="text-[10px] text-muted-foreground/60">{activeCard.mediaType || "arquivo"}</p>
                </div>
                <button
                  onClick={() => updateCard(activeCardIndex, { mediaUrl: "", mediaType: null, mediaFileName: "" })}
                  className="text-muted-foreground/50 hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Card text */}
          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Texto / Legenda do Card {activeCardIndex + 1}
            </Label>
            <Textarea
              value={activeCard.text}
              onChange={e => updateCard(activeCardIndex, { text: e.target.value })}
              placeholder="Texto deste card..."
              rows={3}
            />
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                Botões do Card {activeCardIndex + 1}
              </Label>
              <Badge variant="secondary" className="text-[10px] h-5 bg-primary/10 text-primary border-primary/20">
                {activeCard.buttons.length}/3
              </Badge>
            </div>

            {activeCard.buttons.map(btn => {
              const TypeIcon = btn.type === "url" ? Link : MousePointerClick;
              return (
                <div key={btn.id} className="rounded-xl border border-border/30 bg-muted/15 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                        <TypeIcon className="w-3 h-3 text-primary" />
                      </div>
                      <select
                        value={btn.type}
                        onChange={e => updateButton(btn.id, "type", e.target.value)}
                        className="text-[10px] bg-transparent border-none text-muted-foreground focus:outline-none cursor-pointer"
                      >
                        <option value="reply">Resposta Rápida</option>
                        <option value="url">Link (URL)</option>
                      </select>
                    </div>
                    <button onClick={() => removeButton(btn.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors p-1">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <Input
                    value={btn.text}
                    onChange={e => updateButton(btn.id, "text", e.target.value)}
                    placeholder="Texto do botão"
                    className="h-8 text-xs"
                    maxLength={25}
                  />
                  {btn.type === "url" && (
                    <Input
                      value={btn.value}
                      onChange={e => updateButton(btn.id, "value", e.target.value)}
                      placeholder="https://..."
                      className="h-8 text-xs"
                    />
                  )}
                </div>
              );
            })}

            {activeCard.buttons.length < 3 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => addButton("reply")}>
                  <MousePointerClick className="w-3 h-3" /> Resposta
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => addButton("url")}>
                  <Link className="w-3 h-3" /> Link URL
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Send */}
      <Button className="w-full" size="lg" onClick={handleSend} disabled={sending || !selectedDevice || selectedGroups.length === 0}>
        {sending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
        ) : (
          <><Send className="w-4 h-4 mr-2" /> Enviar Carrossel para {selectedGroups.length || 0} Grupo(s)</>
        )}
      </Button>
    </div>
  );
}

/* ── helpers ── */

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeGroupOptions(rawGroups: any[]) {
  return rawGroups
    .map(group => {
      const id = String(group?.id || group?.JID || group?.jid || group?.groupJid || group?.chatId || "").trim();
      if (!id.endsWith("@g.us")) return null;
      return {
        ...group,
        id,
        name: String(group?.name || group?.Name || group?.Subject || group?.subject || group?.groupName || id || "Grupo sem nome").trim(),
      };
    })
    .filter(Boolean);
}

function detectMediaType(value: string, mimeType?: string): CarouselCard["mediaType"] {
  const clean = value.toLowerCase().split("?")[0];
  if (!clean.trim()) return null;
  if (mimeType?.startsWith("video/") || /(mp4|mov|webm|3gp)$/i.test(clean)) return "video";
  if (mimeType?.startsWith("audio/") || /(mp3|ogg|wav|m4a|aac)$/i.test(clean)) return "audio";
  if (mimeType?.startsWith("application/") || /(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(clean)) return "document";
  return "image";
}

function assertFunctionSuccess(result: { data: any; error: any }, fallbackMessage: string) {
  if (result.error || result.data?.ok === false) {
    throw new Error(result.error?.message || result.data?.error || fallbackMessage);
  }
}
