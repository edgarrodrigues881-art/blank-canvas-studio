import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Layers, Loader2, Send, X, Trash2, Type, MousePointerClick,
  Image as ImageIcon, Clock, Pause,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GroupCarouselEditor } from "@/components/campaigns/GroupCarouselEditor";
import { CarouselPreview } from "@/components/campaigns/CarouselPreview";
import {
  CarouselCard,
  CarouselCardButton,
  MAX_CAROUSEL_CARDS,
  createEmptyCard,
  serializeCarouselCards,
  validateCarouselCards,
} from "@/components/campaigns/carousel-types";

const ALLOWED_EMAIL = "edgarrodrigues881@gmail.com";
const STORAGE_KEY = "group-dispatch-draft";

type DispatchType = "text" | "buttons" | "carousel";

type ButtonItem = { id: string; type: "reply" | "url" | "phone"; text: string; value: string };

type SendResultItem = {
  groupId: string;
  groupName: string;
  status: "success" | "error";
  message: string;
};

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isCarouselCardTouched(card: CarouselCard) {
  return Boolean(
    card.text.trim()
    || card.mediaUrl.trim()
    || card.buttons.some((b) => b.text.trim() || b.value.trim()),
  );
}

function isTruthyGroupFlag(value: unknown) {
  if (value === true || value === 1 || value === "1") return true;
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

function isFalsyGroupFlag(value: unknown) {
  if (value === false || value === 0 || value === "0") return true;
  return typeof value === "string" && value.trim().toLowerCase() === "false";
}

function isAdminsOnlyGroup(group: any) {
  const positiveFlags = [
    group?.adminOnlyMessage, group?.adminOnlyMessages, group?.adminOnly,
    group?.onlyAdminsCanSend, group?.onlyAdminCanSend, group?.isGroupAnnouncement,
    group?.isAnnouncement, group?.announcement, group?.announce, group?.Announce,
    group?.isAnnounce, group?.IsAnnounce, group?.restrictMessage,
    group?.restrictMessages, group?.sendMessagesAdminOnly,
  ];
  const negativeFlags = [
    group?.OwnerCanSendMessage, group?.ownerCanSendMessage, group?.canSendMessage,
    group?.canSendMessages, group?.CanSendMessage, group?.CanSendMessages,
    group?.membersCanSendMessage, group?.membersCanSendMessages,
  ];
  return positiveFlags.some(isTruthyGroupFlag) || negativeFlags.some(isFalsyGroupFlag);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Button Editor ──
function ButtonEditor({ buttons, onChange }: { buttons: ButtonItem[]; onChange: (b: ButtonItem[]) => void }) {
  const addButton = () => {
    if (buttons.length >= 3) return;
    onChange([...buttons, { id: crypto.randomUUID(), type: "reply", text: "", value: "" }]);
  };
  const remove = (id: string) => onChange(buttons.filter((b) => b.id !== id));
  const update = (id: string, field: string, val: string) =>
    onChange(buttons.map((b) => (b.id === id ? { ...b, [field]: val } : b)));

  return (
    <div className="space-y-3">
      {buttons.map((btn, i) => (
        <div key={btn.id} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Botão {i + 1}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(btn.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <Select value={btn.type} onValueChange={(v) => update(btn.id, "type", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reply">Resposta rápida</SelectItem>
              <SelectItem value="url">Link (URL)</SelectItem>
              <SelectItem value="phone">Telefone</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Texto do botão"
            value={btn.text}
            onChange={(e) => update(btn.id, "text", e.target.value)}
            className="h-8 text-sm"
          />
          {btn.type !== "reply" && (
            <Input
              placeholder={btn.type === "url" ? "https://..." : "+5511999999999"}
              value={btn.value}
              onChange={(e) => update(btn.id, "value", e.target.value)}
              className="h-8 text-sm"
            />
          )}
        </div>
      ))}
      {buttons.length < 3 && (
        <Button variant="outline" size="sm" className="w-full" onClick={addButton}>
          + Adicionar botão
        </Button>
      )}
    </div>
  );
}

// ── Main Component ──
export default function GroupCarouselDispatch() {
  const { user } = useAuth();
  const draft = useRef(loadDraft());

  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(draft.current?.selectedDevice || "");
  const [selectedGroups, setSelectedGroups] = useState<string[]>(draft.current?.selectedGroups || []);
  const [groupSearch, setGroupSearch] = useState("");

  // Dispatch type
  const [dispatchType, setDispatchType] = useState<DispatchType>(draft.current?.dispatchType || "text");

  // Campaign name
  const [campaignName, setCampaignName] = useState(draft.current?.campaignName || "");

  // Content
  const [headerText, setHeaderText] = useState(draft.current?.headerText || "");
  const [mediaUrl, setMediaUrl] = useState(draft.current?.mediaUrl || "");
  const [buttons, setButtons] = useState<ButtonItem[]>(draft.current?.buttons || []);
  const [cards, setCards] = useState<CarouselCard[]>(
    draft.current?.cards?.length ? draft.current.cards : [createEmptyCard(0)],
  );

  // Delay settings
  const [minDelay, setMinDelay] = useState(draft.current?.minDelay ?? 5);
  const [maxDelay, setMaxDelay] = useState(draft.current?.maxDelay ?? 15);
  const [pauseEveryMin, setPauseEveryMin] = useState(draft.current?.pauseEveryMin ?? 5);
  const [pauseEveryMax, setPauseEveryMax] = useState(draft.current?.pauseEveryMax ?? 10);
  const [pauseDurationMin, setPauseDurationMin] = useState(draft.current?.pauseDurationMin ?? 30);
  const [pauseDurationMax, setPauseDurationMax] = useState(draft.current?.pauseDurationMax ?? 60);

  const [loadingGroups, setLoadingGroups] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendResultItem[]>([]);
  const [progress, setProgress] = useState({ sent: 0, total: 0 });

  const isAllowed = user?.email === ALLOWED_EMAIL;

  // Persist draft
  useEffect(() => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedDevice, selectedGroups, dispatchType, campaignName, headerText,
        mediaUrl, buttons, cards, minDelay, maxDelay, pauseEveryMin, pauseEveryMax,
        pauseDurationMin, pauseDurationMax,
      }),
    );
  }, [
    selectedDevice, selectedGroups, dispatchType, campaignName, headerText,
    mediaUrl, buttons, cards, minDelay, maxDelay, pauseEveryMin, pauseEveryMax,
    pauseDurationMin, pauseDurationMax,
  ]);

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
    const params = new URLSearchParams({ device_id: selectedDevice, action: "list_chats", quick: "true" });
    supabase.functions
      .invoke(`whapi-chats?${params.toString()}`, { method: "GET" })
      .then(({ data, error }) => {
        setLoadingGroups(false);
        if (error) { toast.error("Erro ao carregar grupos"); return; }
        const normalizedGroups = normalizeGroupOptions(data?.chats || []);
        setGroups(normalizedGroups);
        setSelectedGroups((prev) => prev.filter((id) => normalizedGroups.some((g: any) => g.id === id)));
      })
      .catch(() => { setLoadingGroups(false); toast.error("Erro ao carregar grupos"); });
  }, [selectedDevice]);

  const filteredGroups = useMemo(
    () => groups.filter((g) => !groupSearch || (g.name || g.id || "").toLowerCase().includes(groupSearch.toLowerCase())),
    [groups, groupSearch],
  );
  const hasConfiguredCards = useMemo(() => cards.some(isCarouselCardTouched), [cards]);
  const groupNameMap = useMemo(() => new Map(groups.map((g) => [g.id, g.name || g.id])), [groups]);
  const selectedGroupDetails = useMemo(
    () => groups.filter((g) => selectedGroups.includes(g.id)),
    [groups, selectedGroups],
  );
  const selectedRestrictedGroups = useMemo(
    () => selectedGroupDetails.filter(isAdminsOnlyGroup),
    [selectedGroupDetails],
  );

  const toggleGroup = useCallback((groupId: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((v) => v !== groupId) : [...prev, groupId],
    );
  }, []);

  const clearAll = () => {
    setCampaignName("");
    setHeaderText("");
    setMediaUrl("");
    setButtons([]);
    setCards([createEmptyCard(0)]);
    setSelectedGroups([]);
    setSendResults([]);
    sessionStorage.removeItem(STORAGE_KEY);
    toast.success("Tudo limpo!");
  };

  if (!isAllowed) return <Navigate to="/dashboard" replace />;

  const handleSend = async () => {
    if (!selectedDevice) { toast.error("Selecione uma instância"); return; }
    if (selectedGroups.length === 0) { toast.error("Selecione ao menos um grupo"); return; }
    if (!campaignName.trim()) { toast.error("Dê um nome para a campanha"); return; }

    // Validate based on dispatch type
    if (dispatchType === "text" && !headerText.trim()) {
      toast.error("Digite a mensagem de texto"); return;
    }
    if (dispatchType === "buttons") {
      if (!headerText.trim()) { toast.error("Digite a mensagem para os botões"); return; }
      if (buttons.length === 0) { toast.error("Adicione pelo menos um botão"); return; }
      if (buttons.some((b) => !b.text.trim())) { toast.error("Preencha o texto de todos os botões"); return; }
    }
    if (dispatchType === "carousel") {
      const touchedCards = cards.filter(isCarouselCardTouched);
      if (!touchedCards.length && !headerText.trim()) {
        toast.error("Digite o texto ou preencha pelo menos 1 card"); return;
      }
      if (touchedCards.length > 0) {
        const errs = validateCarouselCards(touchedCards);
        if (errs.length > 0) { toast.error(errs[0]); return; }
      }
    }

    setSending(true);
    setSendResults([]);
    setProgress({ sent: 0, total: selectedGroups.length });

    // Create campaign record
    let campaignId: string | null = null;
    try {
      const msgType = dispatchType === "carousel" ? "carousel" : dispatchType === "buttons" ? "buttons" : "text";
      const { data: campaign, error: campErr } = await supabase
        .from("campaigns")
        .insert({
          user_id: user!.id,
          name: campaignName.trim(),
          message_type: msgType,
          message_content: headerText.trim() || null,
          media_url: mediaUrl.trim() || null,
          buttons: dispatchType === "buttons" ? buttons.map((b) => ({ type: b.type, text: b.text, value: b.value })) : null,
          carousel_cards: dispatchType === "carousel" ? serializeCarouselCards(cards.filter(isCarouselCardTouched)) : null,
          device_id: selectedDevice,
          status: "processing",
          total_contacts: selectedGroups.length,
          min_delay_seconds: minDelay,
          max_delay_seconds: maxDelay,
          pause_every_min: pauseEveryMin,
          pause_every_max: pauseEveryMax,
          pause_duration_min: pauseDurationMin,
          pause_duration_max: pauseDurationMax,
        })
        .select("id")
        .single();

      if (campErr) throw campErr;
      campaignId = campaign.id;
    } catch (err: any) {
      toast.error("Erro ao criar campanha: " + (err?.message || ""));
      setSending(false);
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const results: SendResultItem[] = [];
    const pauseEvery = randomBetween(pauseEveryMin, pauseEveryMax);
    let messagesSinceLastPause = 0;

    try {
      for (let i = 0; i < selectedGroups.length; i++) {
        const groupId = selectedGroups[i];
        const groupName = groupNameMap.get(groupId) || groupId;

        // Delay between groups (skip first)
        if (i > 0) {
          const delayMs = randomBetween(minDelay, maxDelay) * 1000;
          await delay(delayMs);
        }

        // Pause after X dispatches
        messagesSinceLastPause++;
        if (messagesSinceLastPause >= pauseEvery && i < selectedGroups.length - 1) {
          const pauseMs = randomBetween(pauseDurationMin, pauseDurationMax) * 1000;
          toast.info(`Pausando por ${Math.round(pauseMs / 1000)}s...`);
          await delay(pauseMs);
          messagesSinceLastPause = 0;
        }

        // Build body based on dispatch type
        let body: Record<string, any>;
        if (dispatchType === "text") {
          body = { deviceId: selectedDevice, groupJid: groupId, content: headerText.trim(), type: "text" };
        } else if (dispatchType === "buttons") {
          body = {
            deviceId: selectedDevice, groupJid: groupId,
            content: headerText.trim(), type: "buttons",
            buttons: buttons.map((b) => ({ type: b.type, text: b.text, value: b.value })),
          };
        } else {
          const touchedCards = cards.filter(isCarouselCardTouched);
          if (touchedCards.length > 0) {
            body = {
              deviceId: selectedDevice, groupJid: groupId,
              headerText: headerText.trim() || undefined,
              cards: serializeCarouselCards(touchedCards),
            };
          } else {
            body = { deviceId: selectedDevice, groupJid: groupId, content: headerText.trim(), type: "text" };
          }
        }

        const result = await supabase.functions.invoke("group-carousel-send", { body });

        try {
          assertFunctionSuccess(result, "Falha ao enviar para o grupo.");
          successCount++;
          results.push({ groupId, groupName, status: "success", message: "Enviado com sucesso." });
        } catch (error) {
          errorCount++;
          results.push({
            groupId, groupName, status: "error",
            message: error instanceof Error ? error.message : "Falha ao enviar.",
          });
        }

        setProgress({ sent: i + 1, total: selectedGroups.length });
        setSendResults([...results]);
      }
    } finally {
      setSending(false);
    }

    // Update campaign status
    if (campaignId) {
      await supabase.from("campaigns").update({
        status: errorCount === selectedGroups.length ? "failed" : "completed",
        sent_count: successCount,
        failed_count: errorCount,
        completed_at: new Date().toISOString(),
      }).eq("id", campaignId);
    }

    if (successCount > 0) toast.success(`Enviado para ${successCount} grupo(s)`);
    if (errorCount > 0) toast.error(`Falha em ${errorCount} grupo(s)`);
  };

  const dispatchTypeOptions: { value: DispatchType; label: string; icon: any; desc: string }[] = [
    { value: "text", label: "Texto Normal", icon: Type, desc: "Mensagem de texto simples" },
    { value: "buttons", label: "Botões Interativos", icon: MousePointerClick, desc: "Mensagem com botões de ação" },
    { value: "carousel", label: "Carrossel", icon: Layers, desc: "Cards com imagem, vídeo ou PDF" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Send className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Disparo em Grupo</h1>
          <p className="text-sm text-muted-foreground">Envie mensagens para seus grupos do WhatsApp.</p>
        </div>
      </div>

      {/* Dispatch Type Selector */}
      <div className="grid grid-cols-3 gap-3">
        {dispatchTypeOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDispatchType(opt.value)}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
              dispatchType === opt.value
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            <opt.icon className={`h-6 w-6 ${dispatchType === opt.value ? "text-primary" : "text-muted-foreground"}`} />
            <span className={`text-sm font-medium ${dispatchType === opt.value ? "text-primary" : "text-foreground"}`}>
              {opt.label}
            </span>
            <span className="text-[11px] text-muted-foreground text-center">{opt.desc}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          {/* Campaign Name */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Nome da Campanha</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Ex: Promoção Black Friday - Grupos"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Device */}
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
                  {devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} {d.number ? `(${d.number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Groups */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">2. Grupos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Buscar grupo..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
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

              {selectedGroupDetails.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{selectedGroupDetails.length} grupo(s) selecionado(s)</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedGroupDetails.map((group) => (
                      <Badge key={group.id} variant="secondary" className="max-w-full flex items-center gap-1 pr-1">
                        <span className="truncate">{group.name}</span>
                        {isAdminsOnlyGroup(group) && (
                          <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                            só admins
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.id)}
                          className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedRestrictedGroups.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-sm font-semibold text-destructive">Atenção: grupo com envio restrito</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pelo menos um grupo selecionado está marcado como <strong className="text-foreground">somente admins</strong>.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Message Content */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                3. {dispatchType === "carousel" ? "Texto principal" : "Mensagem"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={
                  dispatchType === "carousel"
                    ? "Texto que acompanha o carrossel..."
                    : "Digite sua mensagem..."
                }
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                rows={4}
              />

              {dispatchType === "text" && (
                <div>
                  <Label className="text-xs text-muted-foreground">URL de mídia (opcional - imagem, vídeo, PDF)</Label>
                  <Input
                    placeholder="https://exemplo.com/imagem.jpg"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Buttons Editor (only for buttons type) */}
          {dispatchType === "buttons" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">4. Botões interativos</CardTitle>
                  <Badge variant="secondary">até 3</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ButtonEditor buttons={buttons} onChange={setButtons} />
              </CardContent>
            </Card>
          )}

          {/* Carousel Editor (only for carousel type) */}
          {dispatchType === "carousel" && (
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
          )}

          {/* Delay Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" /> Configuração de Delay
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs">Delay entre cada grupo: {minDelay}s - {maxDelay}s</Label>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-muted-foreground">Mínimo</span>
                    <Slider
                      min={1} max={120} step={1}
                      value={[minDelay]}
                      onValueChange={([v]) => { setMinDelay(v); if (v > maxDelay) setMaxDelay(v); }}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-muted-foreground">Máximo</span>
                    <Slider
                      min={1} max={120} step={1}
                      value={[maxDelay]}
                      onValueChange={([v]) => { setMaxDelay(v); if (v < minDelay) setMinDelay(v); }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2">
                  <Pause className="h-3 w-3" /> Pausar a cada: {pauseEveryMin} - {pauseEveryMax} disparos
                </Label>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-muted-foreground">Mínimo</span>
                    <Slider
                      min={1} max={50} step={1}
                      value={[pauseEveryMin]}
                      onValueChange={([v]) => { setPauseEveryMin(v); if (v > pauseEveryMax) setPauseEveryMax(v); }}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-muted-foreground">Máximo</span>
                    <Slider
                      min={1} max={50} step={1}
                      value={[pauseEveryMax]}
                      onValueChange={([v]) => { setPauseEveryMax(v); if (v < pauseEveryMin) setPauseEveryMin(v); }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Duração da pausa: {pauseDurationMin}s - {pauseDurationMax}s</Label>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-muted-foreground">Mínimo</span>
                    <Slider
                      min={5} max={300} step={5}
                      value={[pauseDurationMin]}
                      onValueChange={([v]) => { setPauseDurationMin(v); if (v > pauseDurationMax) setPauseDurationMax(v); }}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-muted-foreground">Máximo</span>
                    <Slider
                      min={5} max={300} step={5}
                      value={[pauseDurationMax]}
                      onValueChange={([v]) => { setPauseDurationMax(v); if (v < pauseDurationMin) setPauseDurationMin(v); }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Preview */}
        <div className="space-y-6">
          {dispatchType === "carousel" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <CarouselPreview cards={cards} message={headerText} previewMode="sent" />
              </CardContent>
            </Card>
          )}

          {dispatchType === "buttons" && buttons.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Preview dos Botões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                  {headerText && <p className="text-sm whitespace-pre-wrap">{headerText}</p>}
                  <div className="space-y-2">
                    {buttons.map((btn) => (
                      <div
                        key={btn.id}
                        className="rounded-lg border bg-background px-4 py-2 text-center text-sm font-medium text-primary"
                      >
                        {btn.text || "Botão sem texto"}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {dispatchType === "text" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                  {mediaUrl && (
                    <div className="rounded-lg overflow-hidden border">
                      <div className="bg-muted/50 p-3 text-center text-xs text-muted-foreground">
                        📎 Mídia: {mediaUrl.split("/").pop()?.substring(0, 30) || "arquivo"}
                      </div>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{headerText || "Nenhuma mensagem digitada..."}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Send progress */}
          {sending && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progresso</span>
                    <span>{progress.sent}/{progress.total}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all rounded-full"
                      style={{ width: `${progress.total > 0 ? (progress.sent / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          className="flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" /> Limpar tudo
        </Button>

        <Button
          className="flex-1"
          size="lg"
          onClick={handleSend}
          disabled={sending || !selectedDevice || selectedGroups.length === 0}
        >
          {sending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando {progress.sent}/{progress.total}...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Enviar para {selectedGroups.length || 0} grupo(s)
            </>
          )}
        </Button>
      </div>

      {/* Results */}
      {sendResults.length > 0 && !sending && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Resultado do envio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sendResults.map((result) => (
              <div
                key={`${result.groupId}-${result.status}`}
                className={
                  result.status === "success"
                    ? "rounded-lg border border-primary/20 bg-primary/5 p-3"
                    : "rounded-lg border border-destructive/30 bg-destructive/10 p-3"
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{result.groupName}</p>
                  <Badge
                    variant="outline"
                    className={
                      result.status === "success"
                        ? "border-primary/30 text-primary"
                        : "border-destructive/30 text-destructive"
                    }
                  >
                    {result.status === "success" ? "enviado" : "falhou"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
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
        name: String(
          group?.name || group?.Name || group?.Subject || group?.subject || group?.groupName || id || "Grupo sem nome",
        ).trim(),
      };
    })
    .filter(Boolean);
}

function assertFunctionSuccess(result: { data: any; error: any }, fallbackMessage: string) {
  const message = result.error?.message || result.data?.error || fallbackMessage;
  if (result.error || result.data?.ok === false) throw new Error(message);
}
