import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Layers, Loader2, Send, X, Trash2, Type, MousePointerClick,
  Clock, Pause, MessageSquare, Users, Settings2, Rocket,
  CheckCircle2, XCircle, ChevronRight, ChevronLeft,
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
  MAX_CAROUSEL_CARDS,
  createEmptyCard,
  serializeCarouselCards,
  validateCarouselCards,
} from "@/components/campaigns/carousel-types";

const ALLOWED_EMAIL = "edgarrodrigues881@gmail.com";
const STORAGE_KEY = "group-dispatch-draft";

type DispatchType = "text" | "buttons" | "carousel";
type StepKey = "content" | "groups" | "params" | "launch";
type ButtonItem = { id: string; type: "reply" | "url" | "phone"; text: string; value: string };
type SendResultItem = { groupId: string; groupName: string; status: "success" | "error"; message: string };

const STEPS: { key: StepKey; label: string; icon: typeof MessageSquare }[] = [
  { key: "content", label: "Conteúdo", icon: MessageSquare },
  { key: "groups", label: "Público", icon: Users },
  { key: "params", label: "Parâmetros", icon: Settings2 },
  { key: "launch", label: "Lançamento", icon: Rocket },
];

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function isCarouselCardTouched(card: CarouselCard) {
  return Boolean(card.text.trim() || card.mediaUrl.trim() || card.buttons.some((b) => b.text.trim() || b.value.trim()));
}

function isTruthyGroupFlag(v: unknown) { return v === true || v === 1 || v === "1" || (typeof v === "string" && v.trim().toLowerCase() === "true"); }
function isFalsyGroupFlag(v: unknown) { return v === false || v === 0 || v === "0" || (typeof v === "string" && v.trim().toLowerCase() === "false"); }

function isAdminsOnlyGroup(group: any) {
  const pos = [group?.adminOnlyMessage, group?.adminOnlyMessages, group?.adminOnly, group?.onlyAdminsCanSend, group?.onlyAdminCanSend, group?.isGroupAnnouncement, group?.isAnnouncement, group?.announcement, group?.announce, group?.Announce, group?.isAnnounce, group?.IsAnnounce, group?.restrictMessage, group?.restrictMessages, group?.sendMessagesAdminOnly];
  const neg = [group?.OwnerCanSendMessage, group?.ownerCanSendMessage, group?.canSendMessage, group?.canSendMessages, group?.CanSendMessage, group?.CanSendMessages, group?.membersCanSendMessage, group?.membersCanSendMessages];
  return pos.some(isTruthyGroupFlag) || neg.some(isFalsyGroupFlag);
}

function delayMs(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function randomBetween(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── Button Editor ──
function ButtonEditor({ buttons, onChange }: { buttons: ButtonItem[]; onChange: (b: ButtonItem[]) => void }) {
  const add = () => { if (buttons.length < 3) onChange([...buttons, { id: crypto.randomUUID(), type: "reply", text: "", value: "" }]); };
  const remove = (id: string) => onChange(buttons.filter((b) => b.id !== id));
  const update = (id: string, f: string, v: string) => onChange(buttons.map((b) => (b.id === id ? { ...b, [f]: v } : b)));

  return (
    <div className="space-y-3">
      {buttons.map((btn, i) => (
        <div key={btn.id} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Botão {i + 1}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(btn.id)}><X className="h-3 w-3" /></Button>
          </div>
          <Select value={btn.type} onValueChange={(v) => update(btn.id, "type", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reply">Resposta rápida</SelectItem>
              <SelectItem value="url">Link (URL)</SelectItem>
              <SelectItem value="phone">Telefone</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Texto do botão" value={btn.text} onChange={(e) => update(btn.id, "text", e.target.value)} className="h-8 text-sm" />
          {btn.type !== "reply" && (
            <Input placeholder={btn.type === "url" ? "https://..." : "+5511999999999"} value={btn.value} onChange={(e) => update(btn.id, "value", e.target.value)} className="h-8 text-sm" />
          )}
        </div>
      ))}
      {buttons.length < 3 && <Button variant="outline" size="sm" className="w-full" onClick={add}>+ Adicionar botão</Button>}
    </div>
  );
}

// ── Main Component ──
export default function GroupCarouselDispatch() {
  const { user } = useAuth();
  const draft = useRef(loadDraft());

  const [activeStep, setActiveStep] = useState<StepKey>("content");
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(draft.current?.selectedDevice || "");
  const [selectedGroups, setSelectedGroups] = useState<string[]>(draft.current?.selectedGroups || []);
  const [groupSearch, setGroupSearch] = useState("");
  const [dispatchType, setDispatchType] = useState<DispatchType>(draft.current?.dispatchType || "text");
  const [campaignName, setCampaignName] = useState(draft.current?.campaignName || "");
  const [headerText, setHeaderText] = useState(draft.current?.headerText || "");
  const [mediaUrl, setMediaUrl] = useState(draft.current?.mediaUrl || "");
  const [buttons, setButtons] = useState<ButtonItem[]>(draft.current?.buttons || []);
  const [cards, setCards] = useState<CarouselCard[]>(draft.current?.cards?.length ? draft.current.cards : [createEmptyCard(0)]);
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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedDevice, selectedGroups, dispatchType, campaignName, headerText,
      mediaUrl, buttons, cards, minDelay, maxDelay, pauseEveryMin, pauseEveryMax,
      pauseDurationMin, pauseDurationMax,
    }));
  }, [selectedDevice, selectedGroups, dispatchType, campaignName, headerText, mediaUrl, buttons, cards, minDelay, maxDelay, pauseEveryMin, pauseEveryMax, pauseDurationMin, pauseDurationMax]);

  useEffect(() => {
    if (!user || !isAllowed) return;
    supabase.from("devices").select("id, name, number, status").eq("user_id", user.id)
      .in("status", ["Ready", "Connected", "authenticated"])
      .then(({ data }) => setDevices(data || []));
  }, [user, isAllowed]);

  useEffect(() => {
    if (!selectedDevice) { setGroups([]); setSelectedGroups([]); setGroupSearch(""); return; }
    setLoadingGroups(true); setGroupSearch("");
    const params = new URLSearchParams({ device_id: selectedDevice, action: "list_chats", quick: "true" });
    supabase.functions.invoke(`whapi-chats?${params.toString()}`, { method: "GET" })
      .then(({ data, error }) => {
        setLoadingGroups(false);
        if (error) { toast.error("Erro ao carregar grupos"); return; }
        const ng = normalizeGroupOptions(data?.chats || []);
        setGroups(ng);
        setSelectedGroups((prev) => prev.filter((id) => ng.some((g: any) => g.id === id)));
      })
      .catch(() => { setLoadingGroups(false); toast.error("Erro ao carregar grupos"); });
  }, [selectedDevice]);

  const filteredGroups = useMemo(() => groups.filter((g) => !groupSearch || (g.name || g.id || "").toLowerCase().includes(groupSearch.toLowerCase())), [groups, groupSearch]);
  const groupNameMap = useMemo(() => new Map(groups.map((g) => [g.id, g.name || g.id])), [groups]);
  const selectedGroupDetails = useMemo(() => groups.filter((g) => selectedGroups.includes(g.id)), [groups, selectedGroups]);
  const selectedRestrictedGroups = useMemo(() => selectedGroupDetails.filter(isAdminsOnlyGroup), [selectedGroupDetails]);

  const toggleGroup = useCallback((id: string) => {
    setSelectedGroups((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]);
  }, []);

  const clearAll = () => {
    setCampaignName(""); setHeaderText(""); setMediaUrl(""); setButtons([]); setCards([createEmptyCard(0)]);
    setSelectedGroups([]); setSendResults([]); setActiveStep("content");
    sessionStorage.removeItem(STORAGE_KEY);
    toast.success("Tudo limpo!");
  };

  if (!isAllowed) return <Navigate to="/dashboard" replace />;

  const stepIndex = STEPS.findIndex((s) => s.key === activeStep);
  const canGoNext = stepIndex < STEPS.length - 1;
  const canGoPrev = stepIndex > 0;
  const goNext = () => { if (canGoNext) setActiveStep(STEPS[stepIndex + 1].key); };
  const goPrev = () => { if (canGoPrev) setActiveStep(STEPS[stepIndex - 1].key); };

  // ── Send Logic ──
  const handleSend = async () => {
    if (!selectedDevice) { toast.error("Selecione uma instância"); setActiveStep("groups"); return; }
    if (selectedGroups.length === 0) { toast.error("Selecione ao menos um grupo"); setActiveStep("groups"); return; }
    if (!campaignName.trim()) { toast.error("Dê um nome para a campanha"); setActiveStep("content"); return; }
    if (dispatchType === "text" && !headerText.trim()) { toast.error("Digite a mensagem"); setActiveStep("content"); return; }
    if (dispatchType === "buttons") {
      if (!headerText.trim()) { toast.error("Digite a mensagem para os botões"); setActiveStep("content"); return; }
      if (buttons.length === 0) { toast.error("Adicione pelo menos um botão"); setActiveStep("content"); return; }
      if (buttons.some((b) => !b.text.trim())) { toast.error("Preencha o texto de todos os botões"); setActiveStep("content"); return; }
    }
    if (dispatchType === "carousel") {
      const tc = cards.filter(isCarouselCardTouched);
      if (!tc.length && !headerText.trim()) { toast.error("Preencha o conteúdo"); setActiveStep("content"); return; }
      if (tc.length > 0) { const e = validateCarouselCards(tc); if (e.length > 0) { toast.error(e[0]); setActiveStep("content"); return; } }
    }

    setSending(true); setSendResults([]); setProgress({ sent: 0, total: selectedGroups.length });

    let campaignId: string | null = null;
    try {
      const msgType = dispatchType === "carousel" ? "carousel" : dispatchType === "buttons" ? "buttons" : "text";
      const { data: campaign, error: campErr } = await supabase.from("campaigns")
        .insert({
          user_id: user!.id, name: campaignName.trim(), message_type: msgType,
          message_content: headerText.trim() || null, media_url: mediaUrl.trim() || null,
          buttons: dispatchType === "buttons" ? buttons.map((b) => ({ type: b.type, text: b.text, value: b.value })) as any : null,
          carousel_cards: dispatchType === "carousel" ? serializeCarouselCards(cards.filter(isCarouselCardTouched)) as any : null,
          device_id: selectedDevice, status: "processing", total_contacts: selectedGroups.length,
          min_delay_seconds: minDelay, max_delay_seconds: maxDelay,
          pause_every_min: pauseEveryMin, pause_every_max: pauseEveryMax,
          pause_duration_min: pauseDurationMin, pause_duration_max: pauseDurationMax,
        } as any).select("id").single();
      if (campErr) throw campErr;
      campaignId = campaign.id;
    } catch (err: any) {
      toast.error("Erro ao criar campanha: " + (err?.message || "")); setSending(false); return;
    }

    let ok = 0, fail = 0;
    const results: SendResultItem[] = [];
    const pauseEvery = randomBetween(pauseEveryMin, pauseEveryMax);
    let sinceLastPause = 0;

    try {
      for (let i = 0; i < selectedGroups.length; i++) {
        const gid = selectedGroups[i];
        const gname = groupNameMap.get(gid) || gid;
        if (i > 0) await delayMs(randomBetween(minDelay, maxDelay) * 1000);
        sinceLastPause++;
        if (sinceLastPause >= pauseEvery && i < selectedGroups.length - 1) {
          const p = randomBetween(pauseDurationMin, pauseDurationMax) * 1000;
          toast.info(`Pausando por ${Math.round(p / 1000)}s...`);
          await delayMs(p); sinceLastPause = 0;
        }

        let body: Record<string, any>;
        if (dispatchType === "text") {
          body = { deviceId: selectedDevice, groupJid: gid, content: headerText.trim(), type: "text" };
          if (mediaUrl.trim()) body.mediaUrl = mediaUrl.trim();
        } else if (dispatchType === "buttons") {
          body = { deviceId: selectedDevice, groupJid: gid, content: headerText.trim(), type: "buttons", buttons: buttons.map((b) => ({ type: b.type, text: b.text, value: b.value })) };
        } else {
          const tc = cards.filter(isCarouselCardTouched);
          body = tc.length > 0
            ? { deviceId: selectedDevice, groupJid: gid, headerText: headerText.trim() || undefined, cards: serializeCarouselCards(tc) }
            : { deviceId: selectedDevice, groupJid: gid, content: headerText.trim(), type: "text" };
        }

        const res = await supabase.functions.invoke("group-carousel-send", { body });
        try {
          assertFnSuccess(res, "Falha ao enviar."); ok++;
          results.push({ groupId: gid, groupName: gname, status: "success", message: "Enviado com sucesso." });
        } catch (e) {
          fail++;
          results.push({ groupId: gid, groupName: gname, status: "error", message: e instanceof Error ? e.message : "Falha." });
        }
        setProgress({ sent: i + 1, total: selectedGroups.length });
        setSendResults([...results]);
      }
    } finally { setSending(false); }

    if (campaignId) {
      await supabase.from("campaigns").update({
        status: fail === selectedGroups.length ? "failed" : "completed",
        sent_count: ok, failed_count: fail, completed_at: new Date().toISOString(),
      }).eq("id", campaignId);
    }
    if (ok > 0) toast.success(`Enviado para ${ok} grupo(s)`);
    if (fail > 0) toast.error(`Falha em ${fail} grupo(s)`);
  };

  // ── Dispatch type options ──
  const dtOpts: { value: DispatchType; label: string; icon: typeof Type; desc: string }[] = [
    { value: "text", label: "Texto Normal", icon: Type, desc: "Mensagem de texto simples" },
    { value: "buttons", label: "Botões Interativos", icon: MousePointerClick, desc: "Mensagem com botões" },
    { value: "carousel", label: "Carrossel", icon: Layers, desc: "Cards com mídia" },
  ];

  // ── Render ──
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Configuração de Campanha</h1>
        <p className="text-sm text-muted-foreground">Controle total sobre sua entrega e performance.</p>
      </div>

      {/* Step Navigation */}
      <Card>
        <CardContent className="p-2">
          <div className="flex">
            {STEPS.map((step, i) => {
              const isActive = step.key === activeStep;
              const isPast = i < stepIndex;
              return (
                <button
                  key={step.key}
                  onClick={() => setActiveStep(step.key)}
                  className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl transition-all ${
                    isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
                  }`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                    isActive ? "bg-primary-foreground/20" : isPast ? "bg-primary/10" : "bg-muted"
                  }`}>
                    {isPast ? (
                      <CheckCircle2 className={`h-5 w-5 ${isActive ? "text-primary-foreground" : "text-primary"}`} />
                    ) : (
                      <step.icon className={`h-5 w-5 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <span className={`text-xs font-medium ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ═══════════ STEP: CONTEÚDO ═══════════ */}
      {activeStep === "content" && (
        <div className="space-y-6">
          {/* Campaign Name */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Nome da Campanha</CardTitle></CardHeader>
            <CardContent>
              <Input placeholder="Ex: Promoção Black Friday - Grupos" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
            </CardContent>
          </Card>

          {/* Dispatch Type */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Tipo de Conteúdo</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {dtOpts.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDispatchType(opt.value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                      dispatchType === opt.value ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"
                    }`}
                  >
                    <opt.icon className={`h-5 w-5 ${dispatchType === opt.value ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-xs font-medium ${dispatchType === opt.value ? "text-primary" : "text-foreground"}`}>{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground text-center">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Message */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{dispatchType === "carousel" ? "Texto principal" : "Mensagem"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={dispatchType === "carousel" ? "Texto que acompanha o carrossel..." : "Digite sua mensagem..."}
                value={headerText} onChange={(e) => setHeaderText(e.target.value)} rows={4}
              />
              {dispatchType === "text" && (
                <div>
                  <Label className="text-xs text-muted-foreground">URL de mídia (opcional - imagem, vídeo, PDF)</Label>
                  <Input placeholder="https://exemplo.com/imagem.jpg" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} className="mt-1" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Buttons / Carousel editors */}
          {dispatchType === "buttons" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Botões interativos</CardTitle>
                  <Badge variant="secondary">até 3</Badge>
                </div>
              </CardHeader>
              <CardContent><ButtonEditor buttons={buttons} onChange={setButtons} /></CardContent>
            </Card>
          )}

          {dispatchType === "carousel" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm">Cards do carrossel</CardTitle>
                  <Badge variant="secondary">até {MAX_CAROUSEL_CARDS}</Badge>
                </div>
              </CardHeader>
              <CardContent><GroupCarouselEditor cards={cards} onChange={setCards} /></CardContent>
            </Card>
          )}

          {/* Preview */}
          {dispatchType === "carousel" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
              <CardContent><CarouselPreview cards={cards} message={headerText} previewMode="sent" /></CardContent>
            </Card>
          )}
          {dispatchType === "buttons" && buttons.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Preview dos Botões</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                  {headerText && <p className="text-sm whitespace-pre-wrap">{headerText}</p>}
                  <div className="space-y-2">
                    {buttons.map((b) => (
                      <div key={b.id} className="rounded-lg border bg-background px-4 py-2 text-center text-sm font-medium text-primary">
                        {b.text || "Botão sem texto"}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {dispatchType === "text" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                  {mediaUrl && <div className="rounded-lg overflow-hidden border"><div className="bg-muted/50 p-3 text-center text-xs text-muted-foreground">📎 Mídia: {mediaUrl.split("/").pop()?.substring(0, 30) || "arquivo"}</div></div>}
                  <p className="text-sm whitespace-pre-wrap">{headerText || "Nenhuma mensagem digitada..."}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════ STEP: PÚBLICO (GRUPOS) ═══════════ */}
      {activeStep === "groups" && (
        <div className="space-y-6">
          {/* Device */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Instância</CardTitle></CardHeader>
            <CardContent>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger><SelectValue placeholder="Escolha uma instância conectada" /></SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} {d.number ? `(${d.number})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Groups */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Grupos</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Buscar grupo..." value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} />
              {loadingGroups ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos...</div>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {filteredGroups.length === 0 && selectedDevice && <p className="py-2 text-sm text-muted-foreground">Nenhum grupo encontrado</p>}
                  {filteredGroups.map((group) => (
                    <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted/30">
                      <input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => toggleGroup(group.id)} className="rounded" />
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
                          <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">só admins</span>
                        )}
                        <button type="button" onClick={() => toggleGroup(group.id)} className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors">
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
        </div>
      )}

      {/* ═══════════ STEP: PARÂMETROS ═══════════ */}
      {activeStep === "params" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Delay entre cada grupo</CardTitle>
            </CardHeader>
            <CardContent>
              <Label className="text-xs mb-3 block">{minDelay}s - {maxDelay}s</Label>
              <div className="flex gap-4">
                <div className="flex-1 space-y-1">
                  <span className="text-[10px] text-muted-foreground">Mínimo</span>
                  <Slider min={1} max={120} step={1} value={[minDelay]} onValueChange={([v]) => { setMinDelay(v); if (v > maxDelay) setMaxDelay(v); }} />
                </div>
                <div className="flex-1 space-y-1">
                  <span className="text-[10px] text-muted-foreground">Máximo</span>
                  <Slider min={1} max={120} step={1} value={[maxDelay]} onValueChange={([v]) => { setMaxDelay(v); if (v < minDelay) setMinDelay(v); }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Pause className="h-4 w-4" /> Pausa automática</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs">Pausar a cada: {pauseEveryMin} - {pauseEveryMax} disparos</Label>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-muted-foreground">Mínimo</span>
                    <Slider min={1} max={50} step={1} value={[pauseEveryMin]} onValueChange={([v]) => { setPauseEveryMin(v); if (v > pauseEveryMax) setPauseEveryMax(v); }} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-muted-foreground">Máximo</span>
                    <Slider min={1} max={50} step={1} value={[pauseEveryMax]} onValueChange={([v]) => { setPauseEveryMax(v); if (v < pauseEveryMin) setPauseEveryMin(v); }} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Duração da pausa: {pauseDurationMin}s - {pauseDurationMax}s</Label>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-muted-foreground">Mínimo</span>
                    <Slider min={5} max={300} step={5} value={[pauseDurationMin]} onValueChange={([v]) => { setPauseDurationMin(v); if (v > pauseDurationMax) setPauseDurationMax(v); }} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-muted-foreground">Máximo</span>
                    <Slider min={5} max={300} step={5} value={[pauseDurationMax]} onValueChange={([v]) => { setPauseDurationMax(v); if (v < pauseDurationMin) setPauseDurationMin(v); }} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════ STEP: LANÇAMENTO ═══════════ */}
      {activeStep === "launch" && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Resumo da Campanha</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Nome:</span>
                  <p className="font-medium">{campaignName || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tipo:</span>
                  <p className="font-medium capitalize">{dispatchType === "text" ? "Texto" : dispatchType === "buttons" ? "Botões" : "Carrossel"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Grupos:</span>
                  <p className="font-medium">{selectedGroups.length} selecionado(s)</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Instância:</span>
                  <p className="font-medium">{devices.find((d) => d.id === selectedDevice)?.name || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Delay:</span>
                  <p className="font-medium">{minDelay}s - {maxDelay}s</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Pausa:</span>
                  <p className="font-medium">A cada {pauseEveryMin}-{pauseEveryMax} · {pauseDurationMin}s-{pauseDurationMax}s</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Send button */}
          <Button className="w-full" size="lg" onClick={handleSend} disabled={sending || !selectedDevice || selectedGroups.length === 0}>
            {sending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando {progress.sent}/{progress.total}...</>
            ) : (
              <><Rocket className="mr-2 h-4 w-4" />Lançar campanha para {selectedGroups.length} grupo(s)</>
            )}
          </Button>

          {/* Progress */}
          {sending && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span>Progresso</span><span>{progress.sent}/{progress.total}</span></div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${progress.total > 0 ? (progress.sent / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {sendResults.length > 0 && !sending && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Resultado do envio</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {sendResults.map((r) => (
                  <div key={`${r.groupId}-${r.status}`} className={r.status === "success" ? "rounded-lg border border-primary/20 bg-primary/5 p-3" : "rounded-lg border border-destructive/30 bg-destructive/10 p-3"}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{r.groupName}</p>
                      <Badge variant="outline" className={r.status === "success" ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"}>
                        {r.status === "success" ? "enviado" : "falhou"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{r.message}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Bottom navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={clearAll} className="flex items-center gap-2">
          <Trash2 className="h-4 w-4" /> Limpar tudo
        </Button>
        <div className="flex-1" />
        {canGoPrev && (
          <Button variant="outline" onClick={goPrev} className="flex items-center gap-2">
            <ChevronLeft className="h-4 w-4" /> {STEPS[stepIndex - 1].label}
          </Button>
        )}
        {canGoNext && (
          <Button onClick={goNext} className="flex items-center gap-2">
            {STEPS[stepIndex + 1].label} <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function normalizeGroupOptions(rawGroups: any[]) {
  return rawGroups.map((g) => {
    const id = String(g?.id || g?.JID || g?.jid || g?.groupJid || g?.chatId || "").trim();
    if (!id.endsWith("@g.us")) return null;
    return { ...g, id, name: String(g?.name || g?.Name || g?.Subject || g?.subject || g?.groupName || id || "Grupo sem nome").trim() };
  }).filter(Boolean);
}

function assertFnSuccess(r: { data: any; error: any }, fb: string) {
  const m = r.error?.message || r.data?.error || fb;
  if (r.error || r.data?.ok === false) throw new Error(m);
}
