import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Layers, Loader2, Send, X, Trash2, Type, MousePointerClick,
  Clock, Pause, MessageSquare, Users, Settings2,
  Check, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
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
type ButtonItem = { id: string; type: "reply" | "url" | "phone"; text: string; value: string };
type SendResultItem = { groupId: string; groupName: string; status: "success" | "error"; message: string };

// ─── Surface Card (same as Campaigns) ───
const SurfaceCard = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-xl sm:rounded-2xl border border-border/50 bg-card shadow-sm",
      "dark:border-[hsl(220_10%_16%)] dark:bg-[hsl(220_13%_9%)] dark:shadow-lg dark:shadow-black/30",
      className
    )}
    {...props}
  >{children}</div>
);

const SectionLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h3 className={cn("text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70", className)}>
    {children}
  </h3>
);

const STEPS = [
  { num: 1, label: "Conteúdo", desc: "Mensagem & Mídia", icon: MessageSquare },
  { num: 2, label: "Público", desc: "Grupos & Instância", icon: Users },
  { num: 3, label: "Parâmetros", desc: "Controle de Envio", icon: Settings2 },
  { num: 4, label: "Lançamento", desc: "Revisão & Envio", icon: Send },
];

function loadDraft() {
  try { const r = sessionStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}

function isCarouselCardTouched(c: CarouselCard) {
  return Boolean(c.text.trim() || c.mediaUrl.trim() || c.buttons.some((b) => b.text.trim() || b.value.trim()));
}
function isTruthyGroupFlag(v: unknown) { return v === true || v === 1 || v === "1" || (typeof v === "string" && v.trim().toLowerCase() === "true"); }
function isFalsyGroupFlag(v: unknown) { return v === false || v === 0 || v === "0" || (typeof v === "string" && v.trim().toLowerCase() === "false"); }
function isAdminsOnlyGroup(g: any) {
  const pos = [g?.adminOnlyMessage, g?.adminOnlyMessages, g?.adminOnly, g?.onlyAdminsCanSend, g?.onlyAdminCanSend, g?.isGroupAnnouncement, g?.isAnnouncement, g?.announcement, g?.announce, g?.Announce, g?.isAnnounce, g?.IsAnnounce, g?.restrictMessage, g?.restrictMessages, g?.sendMessagesAdminOnly];
  const neg = [g?.OwnerCanSendMessage, g?.ownerCanSendMessage, g?.canSendMessage, g?.canSendMessages, g?.CanSendMessage, g?.CanSendMessages, g?.membersCanSendMessage, g?.membersCanSendMessages];
  return pos.some(isTruthyGroupFlag) || neg.some(isFalsyGroupFlag);
}
function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── Button Editor ──
function ButtonEditor({ buttons, onChange }: { buttons: ButtonItem[]; onChange: (b: ButtonItem[]) => void }) {
  const add = () => { if (buttons.length < 3) onChange([...buttons, { id: crypto.randomUUID(), type: "reply", text: "", value: "" }]); };
  const remove = (id: string) => onChange(buttons.filter((b) => b.id !== id));
  const update = (id: string, f: string, v: string) => onChange(buttons.map((b) => (b.id === id ? { ...b, [f]: v } : b)));

  return (
    <div className="space-y-3">
      {buttons.map((btn, i) => (
        <div key={btn.id} className="rounded-lg border border-border/30 p-3 space-y-2">
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
      {buttons.length < 3 && (
        <Button variant="outline" size="sm" className="w-full" onClick={add}>
          <Plus className="w-4 h-4 mr-1" /> Adicionar Botão
        </Button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════
export default function GroupCarouselDispatch() {
  const { user } = useAuth();
  const draft = useRef(loadDraft());

  const [step, setStep] = useState(1);
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
    const p = new URLSearchParams({ device_id: selectedDevice, action: "list_chats", quick: "true" });
    supabase.functions.invoke(`whapi-chats?${p.toString()}`, { method: "GET" })
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
    setSelectedGroups([]); setSendResults([]); setStep(1);
    sessionStorage.removeItem(STORAGE_KEY);
    toast.success("Tudo limpo!");
  };

  if (!isAllowed) return <Navigate to="/dashboard" replace />;

  // ── Send Logic ──
  const handleSend = async () => {
    if (!campaignName.trim()) { toast.error("Dê um nome para a campanha"); setStep(1); return; }
    if (!selectedDevice) { toast.error("Selecione uma instância"); setStep(2); return; }
    if (selectedGroups.length === 0) { toast.error("Selecione ao menos um grupo"); setStep(2); return; }
    if (dispatchType === "text" && !headerText.trim()) { toast.error("Digite a mensagem"); setStep(1); return; }
    if (dispatchType === "buttons") {
      if (!headerText.trim()) { toast.error("Digite a mensagem"); setStep(1); return; }
      if (buttons.length === 0) { toast.error("Adicione pelo menos um botão"); setStep(1); return; }
      if (buttons.some((b) => !b.text.trim())) { toast.error("Preencha todos os botões"); setStep(1); return; }
    }
    if (dispatchType === "carousel") {
      const tc = cards.filter(isCarouselCardTouched);
      if (!tc.length && !headerText.trim()) { toast.error("Preencha o conteúdo"); setStep(1); return; }
      if (tc.length > 0) { const e = validateCarouselCards(tc); if (e.length > 0) { toast.error(e[0]); setStep(1); return; } }
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
    const pauseEvery = rand(pauseEveryMin, pauseEveryMax);
    let sinceLastPause = 0;

    try {
      for (let i = 0; i < selectedGroups.length; i++) {
        const gid = selectedGroups[i];
        const gname = groupNameMap.get(gid) || gid;
        if (i > 0) await wait(rand(minDelay, maxDelay) * 1000);
        sinceLastPause++;
        if (sinceLastPause >= pauseEvery && i < selectedGroups.length - 1) {
          const p = rand(pauseDurationMin, pauseDurationMax) * 1000;
          toast.info(`Pausando por ${Math.round(p / 1000)}s...`);
          await wait(p); sinceLastPause = 0;
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
          if (res.error || res.data?.ok === false) throw new Error(res.error?.message || res.data?.error || "Falha ao enviar.");
          ok++; results.push({ groupId: gid, groupName: gname, status: "success", message: "Enviado com sucesso." });
        } catch (e) {
          fail++; results.push({ groupId: gid, groupName: gname, status: "error", message: e instanceof Error ? e.message : "Falha." });
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

  const dtOpts: { value: DispatchType; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: "text", label: "Texto Normal", icon: <Type className="w-4 h-4 mr-1.5" />, desc: "Mensagem de texto simples" },
    { value: "buttons", label: "Botões Interativos", icon: <MousePointerClick className="w-4 h-4 mr-1.5" />, desc: "Mensagem com botões de ação" },
    { value: "carousel", label: "Carrossel", icon: <Layers className="w-4 h-4 mr-1.5" />, desc: "Cards com mídia e botões" },
  ];

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <div className="w-full pb-16">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground tracking-tight leading-tight">
            Configuração de Campanha
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground/60 mt-1 sm:mt-1.5">Controle total sobre sua entrega e performance.</p>
        </div>
      </div>

      {/* ═══ Stepper ═══ */}
      <div className="mb-4 sm:mb-8">
        <SurfaceCard className="px-2.5 py-2 sm:p-5">
          <div className="items-start justify-center flex flex-row">
            {STEPS.map((s, i) => {
              const isActive = step === s.num;
              const isDone = step > s.num;
              const Icon = s.icon;
              return (
                <React.Fragment key={s.num}>
                  <button
                    onClick={() => setStep(s.num)}
                    className="flex flex-col items-center gap-0.5 sm:gap-2 group transition-all duration-150 cursor-pointer"
                  >
                    <div className={cn(
                      "w-7 h-7 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 transition-all duration-200",
                      isActive && "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110",
                      isDone && "bg-primary/15 text-primary",
                      !isActive && !isDone && "bg-muted/20 dark:bg-muted/10 text-muted-foreground/30 group-hover:bg-muted/40 group-hover:text-muted-foreground/60",
                    )}>
                      {isDone ? <Check className="w-3 h-3 sm:w-5 sm:h-5" strokeWidth={2.5} /> : <Icon className="w-3 h-3 sm:w-5 sm:h-5" />}
                    </div>
                    <span className={cn(
                      "text-[9px] sm:text-[11px] font-medium transition-colors leading-tight",
                      isActive ? "text-foreground" : isDone ? "text-foreground/60" : "text-muted-foreground/30 group-hover:text-muted-foreground/60"
                    )}>{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 mx-1 sm:mx-3">
                      <div className={cn(
                        "h-[2px] rounded-full transition-colors duration-300",
                        isDone ? "bg-primary/40" : "bg-muted/15 dark:bg-muted/10"
                      )} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </SurfaceCard>
      </div>

      {/* ═══ Step Content ═══ */}
      <div key={step} className="animate-fade-in">

        {/* ===== STEP 1: Conteúdo ===== */}
        {step === 1 && (
          <div className="space-y-6 sm:space-y-8">
            {/* Campaign Name */}
            <SurfaceCard className="p-4 sm:p-5 space-y-3">
              <SectionLabel>Nome da Campanha</SectionLabel>
              <Input
                placeholder="Ex: Promoção Black Friday - Grupos"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </SurfaceCard>

            {/* Content Type */}
            <SurfaceCard className="p-4 sm:p-5">
              <SectionLabel className="mb-3">Tipo de Conteúdo</SectionLabel>
              <div className="flex gap-2">
                {dtOpts.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDispatchType(opt.value)}
                    className={cn(
                      "flex-1 text-center p-3 rounded-xl border text-xs transition-all",
                      dispatchType === opt.value
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border/20 text-muted-foreground hover:border-border/40"
                    )}
                  >
                    <div className="flex items-center justify-center">{opt.icon}{opt.label}</div>
                    <p className="text-[9px] text-muted-foreground/50 mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </SurfaceCard>

            {/* Message */}
            <SurfaceCard className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              <SectionLabel>{dispatchType === "carousel" ? "Texto Principal" : "Mensagem"}</SectionLabel>
              <Textarea
                placeholder={dispatchType === "carousel" ? "Texto que acompanha o carrossel..." : "Digite sua mensagem..."}
                value={headerText} onChange={(e) => setHeaderText(e.target.value)} rows={5}
                className="min-h-[120px] resize-none"
              />
            </SurfaceCard>

            {/* Media (text mode) */}
            {dispatchType === "text" && (
              <SurfaceCard className="p-4 sm:p-5 space-y-3">
                <SectionLabel>Mídia</SectionLabel>
                <Input
                  placeholder="URL da mídia (imagem, vídeo, PDF) — opcional"
                  value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)}
                />
                {mediaUrl && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>📎 {mediaUrl.split("/").pop()?.substring(0, 40)}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setMediaUrl("")}><X className="h-3 w-3" /></Button>
                  </div>
                )}
              </SurfaceCard>
            )}

            {/* Buttons (buttons mode) */}
            {dispatchType === "buttons" && (
              <SurfaceCard className="p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <SectionLabel>Botões Interativos</SectionLabel>
                  <Badge variant="secondary" className="text-[10px]">até 3</Badge>
                </div>
                <ButtonEditor buttons={buttons} onChange={setButtons} />
              </SurfaceCard>
            )}

            {/* Carousel (carousel mode) */}
            {dispatchType === "carousel" && (
              <>
                <SurfaceCard className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <SectionLabel>Cards do Carrossel</SectionLabel>
                    <Badge variant="secondary" className="text-[10px]">até {MAX_CAROUSEL_CARDS}</Badge>
                  </div>
                  <GroupCarouselEditor cards={cards} onChange={setCards} />
                </SurfaceCard>
                <SurfaceCard className="p-4 sm:p-5">
                  <SectionLabel className="mb-3">Preview</SectionLabel>
                  <CarouselPreview cards={cards} message={headerText} previewMode="sent" />
                </SurfaceCard>
              </>
            )}

            {/* Preview (text/buttons) */}
            {dispatchType !== "carousel" && (
              <SurfaceCard className="p-4 sm:p-5">
                <SectionLabel className="mb-3">Preview</SectionLabel>
                <div className="rounded-lg bg-muted/20 dark:bg-black/20 p-4 space-y-3">
                  {mediaUrl && (
                    <div className="rounded-lg overflow-hidden border border-border/30">
                      <div className="bg-muted/30 p-3 text-center text-xs text-muted-foreground">📎 Mídia: {mediaUrl.split("/").pop()?.substring(0, 30)}</div>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{headerText || "Nenhuma mensagem digitada..."}</p>
                  {dispatchType === "buttons" && buttons.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border/20">
                      {buttons.map((b) => (
                        <div key={b.id} className="rounded-lg border bg-background px-4 py-2 text-center text-sm font-medium text-primary">
                          {b.text || "Botão sem texto"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SurfaceCard>
            )}

            {/* Next */}
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} className="px-8">
                Próximo <Send className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ===== STEP 2: Público (Grupos) ===== */}
        {step === 2 && (
          <div className="space-y-6 sm:space-y-8">
            {/* Device */}
            <SurfaceCard className="p-4 sm:p-5 space-y-3">
              <SectionLabel>Instância</SectionLabel>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger><SelectValue placeholder="Escolha uma instância conectada" /></SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} {d.number ? `(${d.number})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SurfaceCard>

            {/* Groups */}
            <SurfaceCard className="p-4 sm:p-5 space-y-3">
              <SectionLabel>Grupos</SectionLabel>
              <Input placeholder="Buscar grupo..." value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} />
              {loadingGroups ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos...</div>
              ) : (
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {filteredGroups.length === 0 && selectedDevice && <p className="py-2 text-sm text-muted-foreground">Nenhum grupo encontrado</p>}
                  {filteredGroups.map((g) => (
                    <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted/30">
                      <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} className="rounded" />
                      <span className="truncate">{g.name || g.id}</span>
                    </label>
                  ))}
                </div>
              )}

              {selectedGroupDetails.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-border/20">
                  <p className="text-xs text-muted-foreground">{selectedGroupDetails.length} grupo(s) selecionado(s)</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedGroupDetails.map((g) => (
                      <Badge key={g.id} variant="secondary" className="max-w-full flex items-center gap-1 pr-1">
                        <span className="truncate">{g.name}</span>
                        {isAdminsOnlyGroup(g) && (
                          <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">só admins</span>
                        )}
                        <button type="button" onClick={() => toggleGroup(g.id)} className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors">
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
            </SurfaceCard>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button onClick={() => setStep(3)} className="px-8">
                Próximo <Send className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ===== STEP 3: Parâmetros ===== */}
        {step === 3 && (
          <div className="space-y-6 sm:space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Delay */}
              <SurfaceCard className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Delay entre grupos</p>
                    <p className="text-[10px] text-muted-foreground">{minDelay}s - {maxDelay}s</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Mínimo ({minDelay}s)</span>
                    <Slider min={1} max={120} step={1} value={[minDelay]} onValueChange={([v]) => { setMinDelay(v); if (v > maxDelay) setMaxDelay(v); }} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Máximo ({maxDelay}s)</span>
                    <Slider min={1} max={120} step={1} value={[maxDelay]} onValueChange={([v]) => { setMaxDelay(v); if (v < minDelay) setMinDelay(v); }} />
                  </div>
                </div>
              </SurfaceCard>

              {/* Pause every */}
              <SurfaceCard className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <Pause className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Pausa automática</p>
                    <p className="text-[10px] text-muted-foreground">A cada {pauseEveryMin}-{pauseEveryMax} disparos</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Mínimo ({pauseEveryMin})</span>
                    <Slider min={1} max={50} step={1} value={[pauseEveryMin]} onValueChange={([v]) => { setPauseEveryMin(v); if (v > pauseEveryMax) setPauseEveryMax(v); }} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Máximo ({pauseEveryMax})</span>
                    <Slider min={1} max={50} step={1} value={[pauseEveryMax]} onValueChange={([v]) => { setPauseEveryMax(v); if (v < pauseEveryMin) setPauseEveryMin(v); }} />
                  </div>
                </div>
              </SurfaceCard>

              {/* Pause duration */}
              <SurfaceCard className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Duração da pausa</p>
                    <p className="text-[10px] text-muted-foreground">{pauseDurationMin}s - {pauseDurationMax}s</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Mínimo ({pauseDurationMin}s)</span>
                    <Slider min={5} max={300} step={5} value={[pauseDurationMin]} onValueChange={([v]) => { setPauseDurationMin(v); if (v > pauseDurationMax) setPauseDurationMax(v); }} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Máximo ({pauseDurationMax}s)</span>
                    <Slider min={5} max={300} step={5} value={[pauseDurationMax]} onValueChange={([v]) => { setPauseDurationMax(v); if (v < pauseDurationMin) setPauseDurationMin(v); }} />
                  </div>
                </div>
              </SurfaceCard>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
              <Button onClick={() => setStep(4)} className="px-8">
                Próximo <Send className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ===== STEP 4: Lançamento ===== */}
        {step === 4 && (
          <div className="space-y-6 sm:space-y-8">
            {/* Summary */}
            <SurfaceCard className="p-5 sm:p-6 space-y-4">
              <SectionLabel>Resumo da Campanha</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div><span className="text-muted-foreground text-xs">Nome</span><p className="font-medium">{campaignName || "—"}</p></div>
                <div><span className="text-muted-foreground text-xs">Tipo</span><p className="font-medium capitalize">{dispatchType === "text" ? "Texto" : dispatchType === "buttons" ? "Botões" : "Carrossel"}</p></div>
                <div><span className="text-muted-foreground text-xs">Grupos</span><p className="font-medium">{selectedGroups.length} selecionado(s)</p></div>
                <div><span className="text-muted-foreground text-xs">Instância</span><p className="font-medium">{devices.find((d) => d.id === selectedDevice)?.name || "—"}</p></div>
                <div><span className="text-muted-foreground text-xs">Delay</span><p className="font-medium">{minDelay}s - {maxDelay}s</p></div>
                <div><span className="text-muted-foreground text-xs">Pausa</span><p className="font-medium">A cada {pauseEveryMin}-{pauseEveryMax} · {pauseDurationMin}s-{pauseDurationMax}s</p></div>
              </div>
            </SurfaceCard>

            {/* Send */}
            <Button className="w-full h-12 text-base" onClick={handleSend} disabled={sending || !selectedDevice || selectedGroups.length === 0}>
              {sending ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Enviando {progress.sent}/{progress.total}...</>
              ) : (
                <><Send className="mr-2 h-5 w-5" />Lançar campanha para {selectedGroups.length} grupo(s)</>
              )}
            </Button>

            {/* Progress */}
            {sending && (
              <SurfaceCard className="p-5">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span>Progresso</span><span>{progress.sent}/{progress.total}</span></div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${progress.total > 0 ? (progress.sent / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              </SurfaceCard>
            )}

            {/* Results */}
            {sendResults.length > 0 && !sending && (
              <SurfaceCard className="p-5 space-y-3">
                <SectionLabel>Resultado do envio</SectionLabel>
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
              </SurfaceCard>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>Voltar</Button>
              <Button variant="outline" size="sm" onClick={clearAll} className="flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Limpar tudo
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeGroupOptions(raw: any[]) {
  return raw.map((g) => {
    const id = String(g?.id || g?.JID || g?.jid || g?.groupJid || g?.chatId || "").trim();
    if (!id.endsWith("@g.us")) return null;
    return { ...g, id, name: String(g?.name || g?.Name || g?.Subject || g?.subject || g?.groupName || id || "Grupo sem nome").trim() };
  }).filter(Boolean);
}
