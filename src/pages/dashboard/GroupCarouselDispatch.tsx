import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Layers, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GroupCarouselEditor } from "@/components/campaigns/GroupCarouselEditor";
import { CarouselPreview } from "@/components/campaigns/CarouselPreview";
import {
  CarouselCard,
  MAX_CAROUSEL_CARDS,
  createEmptyCard,
  serializeCarouselCards,
  validateCarouselCards,
} from "@/components/campaigns/carousel-types";

const ALLOWED_EMAIL = "edgarrodrigues881@gmail.com";
const STORAGE_KEY = "group-carousel-draft";

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      selectedDevice: string;
      selectedGroups: string[];
      headerText: string;
      cards: CarouselCard[];
    };
  } catch {
    return null;
  }
}

export default function GroupCarouselDispatch() {
  const { user } = useAuth();
  const draft = useRef(loadDraft());
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(draft.current?.selectedDevice || "");
  const [selectedGroups, setSelectedGroups] = useState<string[]>(draft.current?.selectedGroups || []);
  const [groupSearch, setGroupSearch] = useState("");
  
  const [headerText, setHeaderText] = useState(draft.current?.headerText || "");
  const [cards, setCards] = useState<CarouselCard[]>(draft.current?.cards?.length ? draft.current.cards : [createEmptyCard(0)]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [sending, setSending] = useState(false);

  // Persist draft to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedDevice, selectedGroups, headerText, cards }));
  }, [selectedDevice, selectedGroups, headerText, cards]);

  const isAllowed = user?.email === ALLOWED_EMAIL;

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
    if (!selectedDevice) {
      setGroups([]);
      setSelectedGroups([]);
      setGroupSearch("");
      return;
    }

    setLoadingGroups(true);
    setGroupSearch("");

    const params = new URLSearchParams({
      device_id: selectedDevice,
      action: "list_chats",
      quick: "true",
    });

    supabase.functions
      .invoke(`whapi-chats?${params.toString()}`, { method: "GET" })
      .then(({ data, error }) => {
        setLoadingGroups(false);
        if (error) {
          toast.error("Erro ao carregar grupos");
          return;
        }

        const normalizedGroups = normalizeGroupOptions(data?.chats || []);
        setGroups(normalizedGroups);
        setSelectedGroups((prev) => prev.filter((groupId) => normalizedGroups.some((group) => group.id === groupId)));
      })
      .catch(() => {
        setLoadingGroups(false);
        toast.error("Erro ao carregar grupos");
      });
  }, [selectedDevice]);

  const filteredGroups = useMemo(
    () => groups.filter((group) => !groupSearch || (group.name || group.id || "").toLowerCase().includes(groupSearch.toLowerCase())),
    [groups, groupSearch],
  );
  const selectedGroupDetails = useMemo(
    () => groups.filter((group) => selectedGroups.includes(group.id)),
    [groups, selectedGroups],
  );

  const toggleGroup = useCallback((groupId: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((value) => value !== groupId) : [...prev, groupId],
    );
  }, []);


  if (!isAllowed) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSend = async () => {
    if (!selectedDevice) {
      toast.error("Selecione uma instância");
      return;
    }

    if (selectedGroups.length === 0) {
      toast.error("Selecione ao menos um grupo");
      return;
    }

    const cardErrors = validateCarouselCards(cards);
    const invalidMediaIndex = cards.findIndex((card) => card.mediaUrl && card.mediaType && card.mediaType !== "image");

    if (invalidMediaIndex >= 0) {
      cardErrors.unshift(`Card ${invalidMediaIndex + 1}: para carrossel em grupo use imagem.`);
    }

    if (cardErrors.length > 0) {
      toast.error(cardErrors[0]);
      return;
    }

    setSending(true);
    let successCount = 0;
    let errorCount = 0;
    const failures: string[] = [];

    try {
      for (const groupId of selectedGroups) {
        const result = await supabase.functions.invoke("group-carousel-send", {
          body: {
            deviceId: selectedDevice,
            groupJid: groupId,
            headerText: headerText.trim() || undefined,
            cards: serializeCarouselCards(cards),
          },
        });

        try {
          assertFunctionSuccess(result, "Falha ao enviar carrossel para o grupo.");
          successCount += 1;
        } catch (error) {
          errorCount += 1;
          failures.push(error instanceof Error ? error.message : "Falha ao enviar carrossel.");
        }
      }
    } finally {
      setSending(false);
    }

    if (successCount > 0) {
      toast.success(`Carrossel enviado para ${successCount} grupo(s)`);
    }

    if (errorCount > 0) {
      toast.error(failures[0] || `Falha em ${errorCount} grupo(s)`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Carrossel em Grupos</h1>
          <p className="text-sm text-muted-foreground">Mesmo editor do carrossel principal, em uma área separada no menu.</p>
        </div>
        <Badge variant="outline" className="ml-auto">Experimental</Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Aqui o sistema tenta enviar o <strong className="text-foreground">carrossel nativo</strong> com imagem e botões.
            Se a UAZAPI/WhatsApp não aceitar carrossel em grupo, ele vai retornar erro e <strong className="text-foreground">não vai mais cair para mensagem comum</strong>.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">1. Instância</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma instância conectada" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.name} {device.number ? `(${device.number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">2. Grupos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Buscar grupo..."
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
              />

              {loadingGroups ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos...
                </div>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {filteredGroups.length === 0 && selectedDevice && (
                    <p className="py-2 text-sm text-muted-foreground">Nenhum grupo encontrado</p>
                  )}

                  {filteredGroups.map((group) => (
                    <label
                      key={group.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroups.includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                        className="rounded"
                      />
                      <span className="truncate">{group.name || group.id}</span>
                    </label>
                  ))}
                </div>
              )}

              <div className="border-t pt-3 mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">Adicionar grupo por JID (grupos privados/restritos)</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Cole o JID do grupo (ex: 5511999...@g.us)"
                    value={manualJid}
                    onChange={(e) => setManualJid(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addManualJid()}
                    className="text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={addManualJid} disabled={!manualJid.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {selectedGroupDetails.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{selectedGroupDetails.length} grupo(s) selecionado(s)</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedGroupDetails.map((group) => (
                      <Badge key={group.id} variant="secondary" className="max-w-full">
                        <span className="truncate">{group.name}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">3. Texto principal</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Texto que acompanha o carrossel..."
                value={headerText}
                onChange={(event) => setHeaderText(event.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">4. Cards do carrossel</CardTitle>
                <Badge variant="secondary">até {MAX_CAROUSEL_CARDS}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <GroupCarouselEditor cards={cards} onChange={setCards} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <CarouselPreview cards={cards} message={headerText} previewMode="sent" />
            </CardContent>
          </Card>
        </div>
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={handleSend}
        disabled={sending || !selectedDevice || selectedGroups.length === 0}
      >
        {sending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" /> Enviar carrossel para {selectedGroups.length || 0} grupo(s)
          </>
        )}
      </Button>
    </div>
  );
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

function assertFunctionSuccess(result: { data: any; error: any }, fallbackMessage: string) {
  const message = result.error?.message || result.data?.error || fallbackMessage;

  if (result.error || result.data?.ok === false) {
    throw new Error(message);
  }
}
