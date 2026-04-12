import { useState, useEffect } from "react";
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
import { Layers, Send, Plus, Trash2, Loader2, Upload, X } from "lucide-react";
import { Navigate } from "react-router-dom";

const ALLOWED_EMAIL = "edgarrodrigues881@gmail.com";

interface CarouselCard {
  id: string;
  text: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "document" | "audio" | null;
}

export default function GroupCarouselDispatch() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [cards, setCards] = useState<CarouselCard[]>([
    { id: "1", text: "", mediaUrl: "", mediaType: null },
  ]);
  const [headerText, setHeaderText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [uploadingCardId, setUploadingCardId] = useState<string | null>(null);

  const isAllowed = user?.email === ALLOWED_EMAIL;

  // Load devices
  useEffect(() => {
    if (!user || !isAllowed) return;
    supabase
      .from("devices")
      .select("id, name, number, status")
      .eq("user_id", user.id)
      .in("status", ["Ready", "Connected", "authenticated"])
      .then(({ data }) => setDevices(data || []));
  }, [user, isAllowed]);

  // Load groups when device selected
  useEffect(() => {
    if (!selectedDevice) { setGroups([]); setSelectedGroups([]); setGroupSearch(""); return; }
    setLoadingGroups(true);
    setSelectedGroups([]);
    setGroupSearch("");

    // whapi-chats reads action & device_id from query params, returns { chats }
    const params = new URLSearchParams({ device_id: selectedDevice, action: "list_chats", quick: "true" });
    supabase.functions.invoke(`whapi-chats?${params.toString()}`, {
      method: "GET",
    }).then(({ data, error }) => {
      setLoadingGroups(false);
      if (error) { toast.error("Erro ao carregar grupos"); return; }
      const normalizedGroups = normalizeGroupOptions(data?.chats || []);
      setGroups(normalizedGroups);
      setSelectedGroups(prev => prev.filter(groupId => normalizedGroups.some(group => group.id === groupId)));
    }).catch(() => {
      setLoadingGroups(false);
      toast.error("Erro ao carregar grupos");
    });
  }, [selectedDevice]);

  // Gate: only allowed email
  if (!isAllowed) {
    return <Navigate to="/dashboard" replace />;
  }

  const addCard = () => {
    if (cards.length >= 4) { toast.error("Máximo 4 cards"); return; }
    setCards([...cards, { id: Date.now().toString(), text: "", mediaUrl: "", mediaType: null }]);
  };

  const removeCard = (id: string) => {
    if (cards.length <= 1) return;
    setCards(cards.filter(c => c.id !== id));
  };

  const updateCard = (id: string, field: keyof CarouselCard, value: string) => {
    setCards(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, [field]: value };
      if (field === "mediaUrl") {
        updated.mediaType = detectMediaType(value);
      }
      return updated;
    }));
  };

  const handleMediaUpload = async (cardId: string, file: File | null | undefined) => {
    if (!file || !user) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Máximo de 20MB por arquivo");
      return;
    }

    setUploadingCardId(cardId);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/group-carousel/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      setCards(prev => prev.map(card => card.id === cardId
        ? { ...card, mediaUrl: urlData.publicUrl, mediaType: detectMediaType(urlData.publicUrl, file.type) }
        : card));
      toast.success("Mídia carregada");
    } catch (err: any) {
      toast.error(err?.message || "Erro no upload da mídia");
    } finally {
      setUploadingCardId(null);
    }
  };

  const clearCardMedia = (cardId: string) => {
    setCards(prev => prev.map(card => card.id === cardId
      ? { ...card, mediaUrl: "", mediaType: null }
      : card));
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroups(prev =>
      prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]
    );
  };

  const filteredGroups = groups.filter(g =>
    !groupSearch || (g.name || g.id || "").toLowerCase().includes(groupSearch.toLowerCase())
  );
  const selectedGroupDetails = groups.filter(group => selectedGroups.includes(group.id));

  const handleSend = async () => {
    if (!selectedDevice) { toast.error("Selecione uma instância"); return; }
    if (selectedGroups.length === 0) { toast.error("Selecione ao menos um grupo"); return; }
    if (cards.every(c => !c.text.trim() && !c.mediaUrl.trim())) {
      toast.error("Adicione conteúdo aos cards"); return;
    }

    const invalidMediaCard = cards
      .map((card, index) => ({ index, error: getObviousMediaUrlError(card.mediaUrl.trim()) }))
      .find(item => item.error);

    if (invalidMediaCard?.error) {
      toast.error(`Card ${invalidMediaCard.index + 1}: ${invalidMediaCard.error}`);
      return;
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
            assertFunctionSuccess(result, "Falha ao enviar o texto de abertura");
            await delay(1500);
          }

          for (const [cardIndex, card] of cards.entries()) {
            if (card.mediaUrl.trim()) {
              const result = await supabase.functions.invoke("group-carousel-send", {
                body: {
                  deviceId: selectedDevice,
                  groupJid: groupId,
                  content: card.mediaUrl.trim(),
                  type: card.mediaType || "image",
                  caption: card.text.trim() || undefined,
                },
              });
              assertFunctionSuccess(result, `Falha ao enviar o card ${cardIndex + 1}`);
            } else if (card.text.trim()) {
              const result = await supabase.functions.invoke("group-carousel-send", {
                body: { deviceId: selectedDevice, groupJid: groupId, content: card.text.trim(), type: "text" },
              });
              assertFunctionSuccess(result, `Falha ao enviar o card ${cardIndex + 1}`);
            }

            if (cardIndex < cards.length - 1) {
              await delay(2000);
            }
          }

          successCount++;
        } catch (err) {
          console.error("Group send error:", err);
          errorCount++;
          failureMessages.push(err instanceof Error ? err.message : "Erro ao enviar carrossel");
        }

        if (groupIndex < selectedGroups.length - 1) {
          await delay(3000);
        }
      }
    } finally {
      setSending(false);
    }

    if (successCount > 0) toast.success(`Carrossel enviado para ${successCount} grupo(s)`);
    if (errorCount > 0) {
      const detail = failureMessages[0] ? `: ${failureMessages[0]}` : "";
      toast.error(`Falha em ${errorCount} grupo(s)${detail}`);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Layers className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Carrossel em Grupos</h1>
          <p className="text-sm text-muted-foreground">Envie uma sequência simulada de cards dentro do grupo selecionado</p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs border-amber-500/50 text-amber-400">Beta</Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Em grupos, a API não entrega o carrossel nativo do WhatsApp. Aqui o envio acontece como uma sequência de cards, um por vez, no grupo escolhido.
          </p>
        </CardContent>
      </Card>

      {/* Instance selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">1. Selecione a Instância</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedDevice} onValueChange={setSelectedDevice}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha uma instância conectada" />
            </SelectTrigger>
            <SelectContent>
              {devices.map(d => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} {d.number ? `(${d.number})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Group selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">2. Selecione os Grupos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Buscar grupo..."
            value={groupSearch}
            onChange={e => setGroupSearch(e.target.value)}
          />
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
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    className="rounded"
                  />
                  <span className="truncate">{g.name || g.id}</span>
                </label>
              ))}
            </div>
          )}
          {selectedGroupDetails.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{selectedGroupDetails.length} grupo(s) selecionado(s)</p>
              <div className="flex flex-wrap gap-2">
                {selectedGroupDetails.map(group => (
                  <Badge key={group.id} variant="secondary" className="max-w-full">
                    <span className="truncate">{group.name}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Header text */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">3. Texto de Abertura (opcional)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Texto enviado antes dos cards..."
            value={headerText}
            onChange={e => setHeaderText(e.target.value)}
            rows={2}
          />
        </CardContent>
      </Card>

      {/* Carousel cards */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">4. Cards do Carrossel</CardTitle>
            <Button size="sm" variant="outline" onClick={addCard} disabled={cards.length >= 4}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Card
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
            {cards.map((card, i) => {
              const mediaHint = getObviousMediaUrlError(card.mediaUrl.trim());
              const isUploading = uploadingCardId === card.id;

              return (
              <div key={card.id} className="border rounded-xl p-4 space-y-3 relative">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs">Card {i + 1}</Badge>
                {cards.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeCard(card.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">URL direta da mídia</Label>
                <Input
                  placeholder="https://exemplo.com/banner.jpg"
                  value={card.mediaUrl}
                  onChange={e => updateCard(card.id, "mediaUrl", e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <label
                    htmlFor={`carousel-media-${card.id}`}
                    className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" /> Enviar arquivo
                      </>
                    )}
                  </label>
                  <input
                    id={`carousel-media-${card.id}`}
                    type="file"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      void handleMediaUpload(card.id, file);
                      e.currentTarget.value = "";
                    }}
                  />
                  {card.mediaUrl && (
                    <Button size="sm" type="button" variant="ghost" onClick={() => clearCardMedia(card.id)}>
                      <X className="w-4 h-4 mr-1" /> Remover mídia
                    </Button>
                  )}
                </div>
                {mediaHint && (
                  <p className="text-xs text-destructive">{mediaHint}</p>
                )}
                {card.mediaUrl && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    {card.mediaType === "image" && (
                      <img
                        src={card.mediaUrl}
                        alt={`Prévia da mídia do card ${i + 1}`}
                        className="h-32 w-full rounded-md object-cover"
                        loading="lazy"
                      />
                    )}
                    <p className="text-xs text-muted-foreground break-all">{card.mediaUrl}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Texto / Legenda</Label>
                <Textarea
                  placeholder="Texto do card..."
                  value={card.text}
                  onChange={e => updateCard(card.id, "text", e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          );})}
        </CardContent>
      </Card>

      {/* Send button */}
      <Button
        className="w-full"
        size="lg"
        onClick={handleSend}
        disabled={sending || !selectedDevice || selectedGroups.length === 0}
      >
        {sending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...
          </>
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" /> Enviar Carrossel para {selectedGroups.length || 0} Grupo(s)
          </>
        )}
      </Button>
    </div>
  );
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeGroupOptions(rawGroups: any[]) {
  return rawGroups
    .map((group) => {
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
  const message = result.error?.message || result.data?.error || fallbackMessage;

  if (result.error || result.data?.ok === false) {
    throw new Error(message);
  }
}

function getObviousMediaUrlError(mediaUrl: string) {
  if (!mediaUrl) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(mediaUrl);
  } catch {
    return "Use uma URL pública válida começando com http:// ou https://.";
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return "Use uma URL pública válida começando com http:// ou https://.";
  }

  if (parsedUrl.pathname === "/" || parsedUrl.pathname.endsWith("/")) {
    return "Esse link aponta para um site/página. Cole a URL direta do arquivo (.jpg, .png, .mp4, .pdf...).";
  }

  return null;
}
