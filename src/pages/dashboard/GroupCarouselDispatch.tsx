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
import { Layers, Send, Plus, Trash2, Image, FileText, Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";

const ALLOWED_EMAIL = "edgarrodrigues881@gmail.com";

interface CarouselCard {
  id: string;
  text: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "document" | null;
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
    if (!selectedDevice) { setGroups([]); return; }
    setLoadingGroups(true);
    const device = devices.find(d => d.id === selectedDevice);
    if (!device) return;

    // Fetch groups from the device via UAZAPI
    supabase.functions.invoke("whapi-chats", {
      body: { deviceId: selectedDevice, action: "list-groups" },
    }).then(({ data, error }) => {
      setLoadingGroups(false);
      if (error) { toast.error("Erro ao carregar grupos"); return; }
      setGroups(data?.groups || []);
    });
  }, [selectedDevice, devices]);

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
    setCards(cards.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, [field]: value };
      if (field === "mediaUrl" && value) {
        const clean = value.toLowerCase().split("?")[0];
        if (/(mp4|mov|webm|3gp)$/.test(clean)) updated.mediaType = "video";
        else if (/(pdf|doc|docx|xls|xlsx)$/.test(clean)) updated.mediaType = "document";
        else updated.mediaType = "image";
      }
      return updated;
    }));
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroups(prev =>
      prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]
    );
  };

  const filteredGroups = groups.filter(g =>
    !groupSearch || (g.name || g.id || "").toLowerCase().includes(groupSearch.toLowerCase())
  );

  const handleSend = async () => {
    if (!selectedDevice) { toast.error("Selecione uma instância"); return; }
    if (selectedGroups.length === 0) { toast.error("Selecione ao menos um grupo"); return; }
    if (cards.every(c => !c.text.trim() && !c.mediaUrl.trim())) {
      toast.error("Adicione conteúdo aos cards"); return;
    }

    setSending(true);
    let successCount = 0;
    let errorCount = 0;

    for (const groupId of selectedGroups) {
      try {
        // Send header text if exists
        if (headerText.trim()) {
          await supabase.functions.invoke("chat-send", {
            body: {
              deviceId: selectedDevice,
              remoteJid: groupId,
              content: headerText.trim(),
              type: "text",
            },
          });
          await delay(1500);
        }

        // Send each card sequentially
        for (const card of cards) {
          if (card.mediaUrl.trim()) {
            await supabase.functions.invoke("chat-send", {
              body: {
                deviceId: selectedDevice,
                remoteJid: groupId,
                content: card.mediaUrl.trim(),
                type: card.mediaType || "image",
                caption: card.text.trim() || undefined,
              },
            });
          } else if (card.text.trim()) {
            await supabase.functions.invoke("chat-send", {
              body: {
                deviceId: selectedDevice,
                remoteJid: groupId,
                content: card.text.trim(),
                type: "text",
              },
            });
          }
          await delay(2000);
        }
        successCount++;
      } catch {
        errorCount++;
      }
      // Delay between groups
      await delay(3000);
    }

    setSending(false);
    if (successCount > 0) toast.success(`Carrossel enviado para ${successCount} grupo(s)`);
    if (errorCount > 0) toast.error(`Falha em ${errorCount} grupo(s)`);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Layers className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Carrossel em Grupos</h1>
          <p className="text-sm text-muted-foreground">Envie cards simulados de carrossel dentro de grupos do WhatsApp</p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs border-amber-500/50 text-amber-400">Beta</Badge>
      </div>

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
          {selectedGroups.length > 0 && (
            <p className="text-xs text-muted-foreground">{selectedGroups.length} grupo(s) selecionado(s)</p>
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
          {cards.map((card, i) => (
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
                <Label className="text-xs">URL da mídia (imagem/vídeo)</Label>
                <Input
                  placeholder="https://exemplo.com/imagem.jpg"
                  value={card.mediaUrl}
                  onChange={e => updateCard(card.id, "mediaUrl", e.target.value)}
                />
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
          ))}
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
