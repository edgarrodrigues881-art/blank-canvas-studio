import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Layers, Loader2, Send, X, Trash2, Type, MousePointerClick,
  Clock, Pause, MessageSquare, Users, Settings2, Zap, Activity,
  Check, Plus, Bold, Italic, Strikethrough, Code, Smile, Timer, Eraser, ChevronRight,
  FileText, ImageIcon, Link, Phone, Smartphone,
  ArrowUp, ArrowDown, Pencil, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useTemplates } from "@/hooks/useTemplates";
import { useCarouselTemplates } from "@/hooks/useCarouselTemplates";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GroupCarouselEditor } from "@/components/campaigns/GroupCarouselEditor";
import { CarouselPreview } from "@/components/campaigns/CarouselPreview";
import {
  CarouselCard,
  MAX_CAROUSEL_CARDS,
  createEmptyCard,
  detectMediaType,
  serializeCarouselCards,
  validateCarouselCards,
} from "@/components/campaigns/carousel-types";

const ALLOWED_EMAIL = "edgarrodrigues881@gmail.com";
const STORAGE_KEY = "group-dispatch-draft";

type DispatchType = "text" | "buttons" | "carousel";
type ButtonItem = { id: number; type: "reply" | "url" | "phone"; text: string; value: string };
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

const commonEmojis = {
  "Mais usados": ["😀", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤩", "😘", "🤗", "😁", "😉", "🥺", "😢", "😤", "🤔"],
  "Gestos": ["👍", "👋", "🙏", "💪", "🤝", "👏", "✌️", "🤞", "👊", "🫶", "☝️", "👆", "👇", "👉", "👈", "🫡"],
  "Negócios": ["✅", "⭐", "💰", "🚀", "📱", "💬", "📢", "🎯", "⚡", "🏆", "💎", "📞", "✨", "🛒", "🎁", "📊"],
  "Símbolos": ["❤️", "💙", "💚", "💛", "🧡", "💜", "🖤", "🤍", "🔥", "💥", "⚠️", "🔔", "🎉", "🎊", "💯", "🆕"],
};

// Compress images client-side before uploading
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
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const outputExt = outputType === "image/png" ? ".png" : ".jpg";

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, outputExt), { type: outputType }));
          } else {
            resolve(file);
          }
        },
        outputType,
        outputType === "image/jpeg" ? quality : undefined,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
};

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

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════
export default function GroupCarouselDispatch() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const draft = useRef(loadDraft());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const carouselTextareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(draft.current?.selectedDevice || "");
  const [selectedGroups, setSelectedGroups] = useState<string[]>(draft.current?.selectedGroups || []);
  const [groupSearch, setGroupSearch] = useState("");
  const [dispatchType, setDispatchType] = useState<DispatchType>(draft.current?.dispatchType === "text" ? "buttons" : (draft.current?.dispatchType || "buttons"));
  const [campaignName, setCampaignName] = useState(draft.current?.campaignName || "");

  // Single message
  const [message, setMessage] = useState<string>(draft.current?.message || draft.current?.messages?.[0] || "");
  const combinedMessage = message.trim();

  // Carousel message
  const [carouselMessage, setCarouselMessage] = useState<string>(draft.current?.carouselMessage || draft.current?.carouselMessages?.[0] || "");

  const [mediaUrl, setMediaUrl] = useState(draft.current?.mediaUrl || "");
  const [mediaFileName, setMediaFileName] = useState(draft.current?.mediaFileName || "");
  const [mediaUploading, setMediaUploading] = useState(false);
  const [buttons, setButtons] = useState<ButtonItem[]>(draft.current?.buttons || [{ id: Date.now(), type: "reply" as const, text: "", value: "" }]);
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCarouselEmojiPicker, setShowCarouselEmojiPicker] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState<string>("Mais usados");
  const [buttonAddedFlash, setButtonAddedFlash] = useState(false);
  const [previewMode, setPreviewMode] = useState<"sent" | "received">("sent");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("nova");
  const [mentionAll, setMentionAll] = useState(draft.current?.mentionAll ?? false);

  const { data: savedTemplates = [] } = useTemplates();
  const { data: carouselTemplates = [] } = useCarouselTemplates();
  const isAllowed = user?.email === ALLOWED_EMAIL;

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedDevice, selectedGroups, dispatchType, campaignName, message,
      mediaUrl, mediaFileName, buttons, cards, minDelay, maxDelay, pauseEveryMin, pauseEveryMax,
      pauseDurationMin, pauseDurationMax, carouselMessage, mentionAll,
    }));
  }, [selectedDevice, selectedGroups, dispatchType, campaignName, message, mediaUrl, mediaFileName, buttons, cards, minDelay, maxDelay, pauseEveryMin, pauseEveryMax, pauseDurationMin, pauseDurationMax, carouselMessage, mentionAll]);

  useEffect(() => {
    if (!user || !isAllowed) return;
    supabase.from("devices").select("id, name, number, status").eq("user_id", user.id)
      .in("status", ["Ready", "Connected", "authenticated"])
      .then(({ data }) => setDevices(data || []));
  }, [user, isAllowed]);

  const prevDeviceRef = useRef(selectedDevice);
  useEffect(() => {
    const deviceChanged = prevDeviceRef.current !== selectedDevice;
    prevDeviceRef.current = selectedDevice;
    if (!selectedDevice) { setGroups([]); if (deviceChanged) setSelectedGroups([]); setGroupSearch(""); return; }
    if (deviceChanged) setSelectedGroups([]);
    setLoadingGroups(true); setGroupSearch("");
    const p = new URLSearchParams({ device_id: selectedDevice, action: "list_chats", quick: "true" });
    supabase.functions.invoke(`whapi-chats?${p.toString()}`, { method: "GET" })
      .then(({ data, error }) => {
        setLoadingGroups(false);
        if (error) { toast.error("Erro ao carregar grupos"); return; }
        const ng = normalizeGroupOptions(data?.chats || []);
        setGroups(ng);
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

  // ── Text helpers (same as Campaigns) ──
  const wrapSelectedText = (before: string, after: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setMessage(prev => prev + before + after); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = message.substring(start, end);
    const newText = message.substring(0, start) + before + selected + after + message.substring(end);
    setMessage(newText);
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + before.length, (selected.length > 0 ? end : start) + before.length); }, 0);
  };

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setMessage(prev => prev + text); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = message.substring(0, start) + text + message.substring(end);
    setMessage(newText);
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + text.length, start + text.length); }, 0);
  };

  const wrapSelectedTextCarousel = (before: string, after: string) => {
    const textarea = carouselTextareaRef.current;
    if (!textarea) { setCarouselMessage(prev => prev + before + after); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = carouselMessage.substring(start, end);
    const newText = carouselMessage.substring(0, start) + before + selected + after + carouselMessage.substring(end);
    setCarouselMessage(newText);
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + before.length, (selected.length > 0 ? end : start) + before.length); }, 0);
  };

  const insertAtCursorCarousel = (text: string) => {
    const textarea = carouselTextareaRef.current;
    if (!textarea) { setCarouselMessage(prev => prev + text); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = carouselMessage.substring(0, start) + text + carouselMessage.substring(end);
    setCarouselMessage(newText);
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + text.length, start + text.length); }, 0);
  };

  // ── Button helpers ──
  const triggerButtonFlash = () => { setButtonAddedFlash(true); setTimeout(() => setButtonAddedFlash(false), 600); };
  const addButton = (type: "reply" | "url" | "phone") => { if (buttons.length < 10) { setButtons([...buttons, { id: Date.now(), type, text: "", value: "" }]); triggerButtonFlash(); } };
  const removeButton = (id: number) => setButtons(buttons.filter(b => b.id !== id));
  const updateButton = (id: number, field: keyof ButtonItem, val: string) => setButtons(buttons.map(b => b.id === id ? { ...b, [field]: val } : b));
  const moveButton = (id: number, direction: "up" | "down") => {
    setButtons(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  const hasButtons = buttons.filter(b => b.text.trim()).length > 0;

  const clearAll = () => {
    if (step === 1) {
      setCampaignName(""); setMessage("");
      setMediaUrl(""); setMediaFileName(""); setButtons([{ id: Date.now(), type: "reply", text: "", value: "" }]);
      setCards([createEmptyCard(0)]); setCarouselMessage("");
      toast.success("Conteúdo limpo!");
    } else if (step === 2) {
      setSelectedDevice(""); setSelectedGroups([]);
      toast.success("Público limpo!");
    } else if (step === 3) {
      setMinDelay(15); setMaxDelay(45);
      setPauseEveryMin(5); setPauseEveryMax(10);
      setPauseDurationMin(30); setPauseDurationMax(60);
      toast.success("Parâmetros resetados!");
    }
    setSendResults([]);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  if (!isAllowed) return <Navigate to="/dashboard" replace />;

  // ── Send Logic ──
  const handleSend = async () => {
    if (!campaignName.trim()) { toast.error("Dê um nome para a campanha"); setStep(1); return; }
    if (!selectedDevice) { toast.error("Selecione uma instância"); setStep(2); return; }
    if (selectedGroups.length === 0) { toast.error("Selecione ao menos um grupo"); setStep(2); return; }

    const storedHeaderText = dispatchType === "carousel"
      ? carouselMessage.trim()
      : combinedMessage;

    const trimmedText = message.trim();
    const trimmedCarouselHeader = carouselMessage.trim();
    const touchedCards = dispatchType === "carousel" ? cards.filter(isCarouselCardTouched) : [];
    const trimmedMediaUrl = mediaUrl.trim();

    if (dispatchType === "buttons") {
      if (!trimmedText && !trimmedMediaUrl) { toast.error("Digite a mensagem ou adicione mídia"); setStep(1); return; }
    }
    if (dispatchType === "carousel") {
      if (!touchedCards.length && !storedHeaderText.trim()) { toast.error("Preencha o conteúdo"); setStep(1); return; }
      if (touchedCards.length > 0) { const e = validateCarouselCards(touchedCards); if (e.length > 0) { toast.error(e[0]); setStep(1); return; } }
    }

    setSending(true); setSendResults([]); setProgress({ sent: 0, total: selectedGroups.length });

    let campaignId: string | null = null;
    const activeButtons = buttons
      .filter((b) => b.text.trim())
      .map((b) => ({ type: b.type, text: b.text.trim(), value: b.value.trim() }));

    try {
      const hasActiveButtons = activeButtons.length > 0;
      const msgType = dispatchType === "carousel" ? "carousel" : hasActiveButtons ? "buttons" : "text";
      const startedAt = new Date().toISOString();
      const { data: campaign, error: campErr } = await supabase.from("campaigns")
        .insert({
          user_id: user!.id, name: campaignName.trim(), message_type: msgType,
          message_content: storedHeaderText.trim() || null, media_url: trimmedMediaUrl || null,
          buttons: hasActiveButtons ? activeButtons as any : null,
          carousel_cards: dispatchType === "carousel" ? serializeCarouselCards(touchedCards) as any : null,
          device_id: selectedDevice, status: "processing", total_contacts: selectedGroups.length,
          started_at: startedAt,
          min_delay_seconds: minDelay, max_delay_seconds: maxDelay,
          pause_every_min: pauseEveryMin, pause_every_max: pauseEveryMax,
          pause_duration_min: pauseDurationMin, pause_duration_max: pauseDurationMax,
        } as any).select("id").single();
      if (campErr) throw campErr;
      campaignId = campaign.id;

      const { error: targetsErr } = await supabase.from("campaign_contacts").insert(
        selectedGroups.map((gid) => ({
          campaign_id: campaign.id,
          phone: gid,
          name: groupNameMap.get(gid) || gid,
          status: "pending",
          device_id: selectedDevice,
        })) as any,
      );
      if (targetsErr) throw targetsErr;

      const campaignRoute = `/dashboard/campaign/${campaign.id}`;
      toast.success(
        `${selectedGroups.length} grupo(s). Iniciando envio...`,
        {
          description: "Campanha criada com sucesso!",
          action: {
            label: "Ver campanha",
            onClick: () => navigate(campaignRoute),
          },
          duration: 10000,
        }
      );

      // Clear draft so the form is clean when user returns
      sessionStorage.removeItem(STORAGE_KEY);
      setCampaignName("");
      setMessage("");
      setCarouselMessage("");
      setMediaUrl("");
      setMediaFileName("");
      setButtons([{ id: Date.now(), type: "reply" as const, text: "", value: "" }]);
      setCards([createEmptyCard(0)]);
      setSelectedGroups([]);
      setDispatchType("buttons");
      setStep(1);
      setSendResults([]);
      setProgress({ sent: 0, total: 0 });

      navigate(campaignRoute);
      await wait(0);
    } catch (err: any) {
      if (campaignId) {
        await supabase.from("campaigns").update({
          status: "failed",
          completed_at: new Date().toISOString(),
        }).eq("id", campaignId);
      }
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

        const plan = { text: dispatchType === "carousel" ? trimmedCarouselHeader : trimmedText, withExtras: true };

        try {
            let body: Record<string, any>;
            if (dispatchType === "buttons" && activeButtons.length > 0) {
              body = {
                deviceId: selectedDevice,
                groupJid: gid,
                content: plan.text.trim(),
                type: "buttons",
                buttons: activeButtons,
                ...(trimmedMediaUrl ? { mediaUrl: trimmedMediaUrl } : {}),
              };
            } else if (dispatchType !== "carousel") {
              if (trimmedMediaUrl) {
                body = {
                  deviceId: selectedDevice,
                  groupJid: gid,
                  content: trimmedMediaUrl,
                  caption: plan.text.trim() || undefined,
                  type: detectMediaType(trimmedMediaUrl) || "image",
                };
              } else {
                body = { deviceId: selectedDevice, groupJid: gid, content: plan.text.trim(), type: "text" };
              }
            } else {
              body = touchedCards.length > 0
                ? { deviceId: selectedDevice, groupJid: gid, headerText: plan.text.trim() || undefined, cards: serializeCarouselCards(touchedCards) }
                : { deviceId: selectedDevice, groupJid: gid, content: plan.text.trim(), type: "text" };
            }

            const res = await supabase.functions.invoke("group-carousel-send", { body });
            if (res.error || res.data?.ok === false) {
              throw new Error(res.error?.message || res.data?.error || "Falha ao enviar.");
            }

          const sentAt = new Date().toISOString();
          const resolvedName = res.data?.groupName || gname;
          ok++;
          results.push({ groupId: gid, groupName: resolvedName, status: "success", message: "Enviado com sucesso." });
          const updateFields: Record<string, any> = {
            status: "sent",
            sent_at: sentAt,
            error_message: null,
            device_id: selectedDevice,
          };
          if (resolvedName && resolvedName !== gid && !resolvedName.includes("@g.us")) {
            updateFields.name = resolvedName;
          }
          await supabase.from("campaign_contacts").update(updateFields as any).eq("campaign_id", campaignId).eq("phone", gid);
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : "Falha.";
          fail++;
          results.push({ groupId: gid, groupName: gname, status: "error", message: errorMessage });
          await supabase.from("campaign_contacts").update({
            status: "failed",
            error_message: errorMessage,
            device_id: selectedDevice,
          } as any).eq("campaign_id", campaignId).eq("phone", gid);
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
    { value: "buttons", label: "Texto / Botões", icon: <MousePointerClick className="w-4 h-4 mr-1.5" />, desc: "Mensagem com mídia e botões opcionais" },
    { value: "carousel", label: "Carrossel", icon: <Layers className="w-4 h-4 mr-1.5" />, desc: "Cards com imagem, texto e botões" },
  ];

  // ── WhatsApp Preview ──
  const WhatsAppPreview = () => {
    const displayMessage = dispatchType === "carousel" ? carouselMessage : message;
    const hasContent = displayMessage || mediaUrl;
    const hasAnyButtons = dispatchType !== "carousel" && buttons.filter(b => b.text.trim()).length > 0;
    const bubbleMaxW = "max-w-[70%] sm:max-w-[75%]";
    const isSent = previewMode === "sent";

    const resolvedTheme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    const isLight = resolvedTheme === "light";

    const p = isLight ? {
      shellBorder: "border-border", shellShadow: "shadow-black/10",
      header: "bg-card border-border/60", avatarBg: "bg-muted", avatarIcon: "text-muted-foreground",
      titleColor: "text-foreground", subtitleColor: "text-muted-foreground",
      chatBg: "#efeae2", pattern: "%23d6d0c8",
      bubbleSent: "bg-[#d9fdd3]", bubbleReceived: "bg-card",
      textColor: "text-foreground", metaColor: "text-muted-foreground/60",
      checkColor: "text-[#53BDEB]", accentColor: "text-[#027eb5]",
      divider: "border-border/40", hoverSent: "hover:bg-[#c8efc3]", hoverReceived: "hover:bg-muted",
    } : {
      shellBorder: "border-[hsl(210_10%_18%)]", shellShadow: "shadow-black/40",
      header: "bg-[#202C33] border-[#313D45]", avatarBg: "bg-[#6B7B8D]/30", avatarIcon: "text-[#AEBAC1]",
      titleColor: "text-[#E9EDEF]", subtitleColor: "text-[#8696A0]",
      chatBg: "#0B141A", pattern: "%23ffffff",
      bubbleSent: "bg-[#0b7a69]", bubbleReceived: "bg-[#202C33]",
      textColor: "text-[#E9EDEF]", metaColor: "text-[#8696A0]/65",
      checkColor: "text-[#53BDEB]/70", accentColor: "text-[#00A5F4]",
      divider: "border-[#313D45]/40", hoverSent: "hover:bg-[#006B57]", hoverReceived: "hover:bg-[#2A3942]",
    };

    return (
      <div className={cn("rounded-[20px] overflow-hidden border-2 shadow-2xl flex flex-col", p.shellBorder, p.shellShadow)} style={{ height: '520px' }}>
        <div className={cn("px-4 py-3 flex items-center gap-3 border-b", p.header)}>
          <div className={cn("w-9 h-9 rounded-full flex items-center justify-center", p.avatarBg)}>
            <Smartphone className={cn("w-4 h-4", p.avatarIcon)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn("text-[14px] font-medium leading-tight", p.titleColor)}>Grupo</p>
            <p className={cn("text-[11px]", p.subtitleColor)}>online</p>
          </div>
        </div>

        <div
          className="p-4 flex-1 min-h-0 overflow-y-auto flex flex-col"
          style={{
            backgroundColor: p.chatBg,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='${p.pattern}' fill-opacity='0.02'%3E%3Cpath d='M50 50v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm-30 0v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm30-30v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm-30 0v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4z'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        >
          <div className={cn("flex flex-col gap-[6px] mt-auto", isSent ? "items-end" : "items-start")}>
            <div className={cn(bubbleMaxW, "flex flex-col rounded-[12px] overflow-hidden shadow-md", isSent ? p.bubbleSent : p.bubbleReceived)}>
              {mediaUrl && (
                /\.(ogg|mp3|wav|m4a|aac|opus|mpeg)(\?|$)/i.test(mediaUrl) ? (
                  <div className="px-3 py-2.5 flex items-center gap-3 bg-black/10 rounded-lg mx-2 mt-2">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 text-primary" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="h-1.5 bg-black/10 rounded-full overflow-hidden"><div className="h-full w-1/3 bg-primary rounded-full" /></div>
                      <p className={cn("text-[10px] mt-1", p.metaColor)}>0:00 / --:--</p>
                    </div>
                  </div>
                ) : (
                  <img src={mediaUrl} alt="media" className="w-full max-h-48 object-cover rounded-t-[12px]" style={{ maxWidth: '100%', aspectRatio: 'auto' }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )
              )}
              <div className="px-[14px] py-[10px]">
                <p className={cn("text-[14px] whitespace-pre-wrap leading-[1.65] break-words", p.textColor)}>
                  {hasContent ? displayMessage : (
                    <span className={cn("italic", p.metaColor)}>Sua mensagem aparecerá aqui…</span>
                  )}
                </p>
                <div className="flex items-center justify-end gap-1 mt-[4px]">
                  <span className={cn("text-[11px] leading-none", p.metaColor)}>12:00</span>
                  {isSent && <span className={cn("text-[11px] leading-none", p.checkColor)}>✓✓</span>}
                </div>
              </div>
              {hasAnyButtons && (
                <div className={cn("flex flex-col gap-[1px] border-t", p.divider)}>
                  {buttons.filter(b => b.text.trim()).map((btn) => (
                    <button
                      key={btn.id}
                      className={cn(
                        "w-full px-3 py-[10px] flex items-center justify-center gap-2 transition-colors duration-100",
                        isSent ? p.hoverSent : p.hoverReceived,
                        buttonAddedFlash && "ring-1 ring-primary/30 ring-inset"
                      )}
                    >
                      {btn.type === "url" && <Link className={cn("w-[14px] h-[14px]", p.accentColor)} />}
                      {btn.type === "phone" && <Phone className={cn("w-[14px] h-[14px]", p.accentColor)} />}
                      <span className={cn("text-[14px] font-medium", p.accentColor)}>{btn.text || "Botão"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Toolbar component (reused for text & carousel) ──
  const MessageToolbar = ({ mode }: { mode: "text" | "carousel" }) => {
    const insertFn = mode === "text" ? insertAtCursor : insertAtCursorCarousel;
    const wrapFn = mode === "text" ? wrapSelectedText : wrapSelectedTextCarousel;
    const isEmojiOpen = mode === "text" ? showEmojiPicker : showCarouselEmojiPicker;
    const setEmojiOpen = mode === "text" ? setShowEmojiPicker : setShowCarouselEmojiPicker;

    return (
      <div className="flex items-center gap-0.5 flex-wrap p-1.5 rounded-xl bg-muted/15 dark:bg-muted/8 border border-border/10">
        {[
          { icon: Bold, label: "Negrito", wrap: ["*", "*"] },
          { icon: Italic, label: "Itálico", wrap: ["_", "_"] },
          { icon: Strikethrough, label: "Tachado", wrap: ["~", "~"] },
          { icon: Code, label: "Código", wrap: ["```", "```"] },
        ].map(({ icon: Icon, label, wrap }) => (
          <Button key={label} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 hover:text-foreground hover:bg-background/60 rounded-lg transition-colors" title={label}
            onClick={() => wrapFn(wrap[0], wrap[1])}>
            <Icon className="w-3.5 h-3.5" />
          </Button>
        ))}
        <div className="h-5 w-px bg-border/20 mx-0.5" />

        <Popover open={isEmojiOpen} onOpenChange={setEmojiOpen}>
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
              {(commonEmojis[emojiCategory as keyof typeof commonEmojis] || []).map(emoji => (
                <button key={emoji} className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-base"
                  onClick={() => { insertFn(emoji); setEmojiOpen(false); }}>{emoji}</button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  };

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

        {/* ===== STEP 1: Conteúdo (identical to Campaigns) ===== */}
        {step === 1 && (
          <div className="space-y-6 sm:space-y-12">
            {/* Content Type Selector */}
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

            {/* Editor + Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-8 items-start">
              {/* Editor column */}
              <div className="lg:col-span-3 space-y-4 sm:space-y-8">
                {/* Carousel Editor */}
                {dispatchType === "carousel" ? (
                  <div className="space-y-4 sm:space-y-5">
                    {/* Modelo Base (Carrossel) */}
                    <SurfaceCard className="p-5 space-y-3">
                      <SectionLabel>Modelo Base</SectionLabel>
                      <Select value={selectedTemplate} onValueChange={(val) => {
                        setSelectedTemplate(val);
                        if (val !== "nova") {
                          const tmpl = carouselTemplates.find(t => t.id === val);
                          if (tmpl) {
                            setCarouselMessage(tmpl.message || "");
                            if (Array.isArray(tmpl.cards) && tmpl.cards.length > 0) {
                            setCards(tmpl.cards.map((c: any, i: number) => ({
                                id: c.id || `card-${i}`,
                                position: c.position ?? i,
                                text: c.text || "",
                                mediaUrl: c.mediaUrl || "",
                                mediaType: c.mediaType || null,
                                mediaFileName: c.mediaFileName || "",
                                buttons: Array.isArray(c.buttons) ? c.buttons : [],
                              })));
                            } else {
                              setCards([createEmptyCard(0)]);
                            }
                          }
                        } else {
                          setCarouselMessage("");
                          setCards([createEmptyCard(0)]);
                        }
                      }}>
                        <SelectTrigger className="h-11 text-sm font-medium bg-background/50 dark:bg-muted/20 border-border/30 hover:border-primary/40 transition-colors">
                          <SelectValue placeholder="Template Padrão" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border z-50">
                          <SelectItem value="nova">Template Padrão</SelectItem>
                          {carouselTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </SurfaceCard>

                  <SurfaceCard className="p-4 sm:p-6 space-y-4 sm:space-y-5">
                    <SectionLabel>Mensagem do Carrossel</SectionLabel>
                    <p className="text-xs text-muted-foreground -mt-2">Texto enviado junto com o carrossel (aparece acima dos cards)</p>
                    <p className="text-[11px] text-muted-foreground/70 -mt-1">Limite atual: até {MAX_CAROUSEL_CARDS} cards por envio compatível.</p>

                    <MessageToolbar mode="carousel" />

                    <Textarea
                      ref={carouselTextareaRef}
                      value={carouselMessage}
                      onChange={e => setCarouselMessage(e.target.value)}
                      placeholder="Escreva a mensagem do carrossel aqui..."
                      rows={5}
                      className="text-sm leading-[1.8] bg-muted/8 dark:bg-muted/4 border-border/15 resize-none focus-visible:ring-1 focus-visible:ring-primary/30 px-4 py-3 text-foreground/90 placeholder:text-muted-foreground/30 rounded-xl"
                    />

                    <SectionLabel>Cards</SectionLabel>
                    <GroupCarouselEditor cards={cards} onChange={setCards} />
                  </SurfaceCard>
                  </div>
                ) : (
                  /* Normal message editor (text/buttons) */
                  <SurfaceCard className="p-4 sm:p-6 space-y-4 sm:space-y-5">
                    <SectionLabel>Mensagem</SectionLabel>

                    <MessageToolbar mode="text" />

                    <Textarea
                      ref={textareaRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Escreva sua mensagem aqui..."
                      rows={10}
                      className="text-sm leading-[1.8] bg-muted/8 dark:bg-muted/4 border-border/15 resize-none focus-visible:ring-1 focus-visible:ring-primary/30 px-4 py-3 text-foreground/90 placeholder:text-muted-foreground/30 rounded-xl"
                    />
                  </SurfaceCard>
                )}
              </div>

              {/* Preview column */}
              <div className="lg:col-span-2 lg:sticky lg:top-4 self-start">
                {dispatchType === "carousel" ? (
                  <CarouselPreview cards={cards} message={carouselMessage} />
                ) : (
                  <WhatsAppPreview />
                )}
              </div>
            </div>

            {/* Template + Mídia + Botões (below editor, hidden in carousel mode) */}
            {dispatchType !== "carousel" && (
              <div className="space-y-5">
                {/* Modelo Base */}
                <SurfaceCard className="p-5 space-y-3">
                  <SectionLabel>Modelo Base</SectionLabel>
                  <Select value={selectedTemplate} onValueChange={(val) => {
                    setSelectedTemplate(val);
                    if (val !== "nova") {
                      const tmpl = savedTemplates.find(t => t.id === val);
                      if (tmpl) {
                        setMessage(tmpl.content || "");
                        setMediaUrl(tmpl.media_url || "");
                        setMediaFileName(tmpl.media_url ? "Mídia do template" : "");
                        const tmplButtons = Array.isArray(tmpl.buttons) && tmpl.buttons.length > 0
                          ? tmpl.buttons.map((b: any, i: number) => ({ id: Date.now() + i, type: b.type || "reply", text: b.text || "", value: b.value || "" }))
                          : [{ id: Date.now(), type: "reply" as const, text: "", value: "" }];
                        setButtons(tmplButtons);
                      }
                    } else {
                      setMessage("");
                      setMediaUrl("");
                      setMediaFileName("");
                      setButtons([{ id: Date.now(), type: "reply" as const, text: "", value: "" }]);
                    }
                  }}>
                    <SelectTrigger className="h-11 text-sm font-medium bg-background/50 dark:bg-muted/20 border-border/30 hover:border-primary/40 transition-colors">
                      <SelectValue placeholder="Campanha Padrão" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border z-50">
                      <SelectItem value="nova">Campanha Padrão</SelectItem>
                      {savedTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </SurfaceCard>

                {/* Mídia */}
                <SurfaceCard className="p-5 space-y-3">
                  <SectionLabel>Mídia</SectionLabel>
                  {!mediaUrl ? (
                    <>
                      <input type="file" ref={mediaFileRef} accept="image/*,video/*,audio/*,.pdf,.doc,.docx" className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 20 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 20MB."); return; }
                          setMediaUploading(true);
                          try {
                            const optimized = await compressImage(file);
                            const ext = optimized.name.split(".").pop() || "bin";
                            const path = `${session!.user.id}/campaigns/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
                            const { error: uploadError } = await supabase.storage.from("media").upload(path, optimized);
                            if (uploadError) throw uploadError;
                            const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
                            setMediaUrl(urlData.publicUrl);
                            setMediaFileName(file.name);
                            toast.success("Mídia enviada!");
                          } catch (err: any) { toast.error("Erro no upload: " + (err.message || "")); }
                          finally { setMediaUploading(false); if (mediaFileRef.current) mediaFileRef.current.value = ""; }
                        }}
                      />
                      <button
                        onClick={() => mediaFileRef.current?.click()}
                        disabled={mediaUploading}
                        className="w-full py-6 rounded-xl border-2 border-dashed border-border/30 dark:border-border/15 hover:border-primary/40 bg-muted/5 dark:bg-muted/3 flex flex-col items-center justify-center gap-2 transition-colors duration-100 hover:bg-primary/5 group"
                      >
                        {mediaUploading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <ImageIcon className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary transition-colors" />}
                        <span className="text-[11px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">{mediaUploading ? "Enviando..." : "Imagem, vídeo ou documento"}</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/60 shadow-sm">
                      <img src={mediaUrl} alt="preview" className="w-12 h-12 rounded-lg object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{mediaFileName || "Mídia"}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">Anexado</p>
                      </div>
                      <button onClick={() => { setMediaUrl(""); setMediaFileName(""); }} className="text-muted-foreground/50 hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </SurfaceCard>

                {/* Botões Interativos */}
                <SurfaceCard className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <SectionLabel>Botões Interativos</SectionLabel>
                    <Badge variant="secondary" className="text-[10px] h-5 bg-primary/10 text-primary border-primary/20">
                      {buttons.length}/10
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {buttons.map((btn, idx) => {
                      const typeLabel = btn.type === "reply" ? "Resposta Rápida" : btn.type === "phone" ? "Telefone" : "Link (URL)";
                      const TypeIcon = btn.type === "reply" ? MousePointerClick : btn.type === "phone" ? Phone : Link;
                      return (
                        <div key={btn.id} className="rounded-xl border border-border/30 dark:border-border/15 bg-muted/15 dark:bg-muted/8 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                                <TypeIcon className="w-3.5 h-3.5 text-primary" />
                              </div>
                              <span className="text-[11px] font-semibold text-foreground/70">{typeLabel}</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <button className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/30 disabled:opacity-20" disabled={idx === 0} onClick={() => moveButton(btn.id, "up")}><ArrowUp className="w-3.5 h-3.5" /></button>
                              <button className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/30 disabled:opacity-20" disabled={idx === buttons.length - 1} onClick={() => moveButton(btn.id, "down")}><ArrowDown className="w-3.5 h-3.5" /></button>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="text-muted-foreground/40 hover:text-primary transition-colors p-1 rounded-lg hover:bg-primary/10"><Pencil className="w-3.5 h-3.5" /></button>
                                </PopoverTrigger>
                                <PopoverContent className="w-44 p-1.5 bg-popover border-border z-50" align="end">
                                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1">Alterar tipo</p>
                                  {[
                                    { t: "reply" as const, label: "Resposta Rápida", Ic: MousePointerClick },
                                    { t: "url" as const, label: "Link (URL)", Ic: Link },
                                    { t: "phone" as const, label: "Telefone", Ic: Phone },
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

                  <Button variant="outline" size="sm" disabled={buttons.length >= 10}
                    className="w-full h-11 gap-2 border-dashed border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors duration-100 text-xs font-medium"
                    onClick={() => addButton("reply")}>
                    <Plus className="w-4 h-4" /> Adicionar Botão
                  </Button>
                </SurfaceCard>
              </div>
            )}


          </div>
        )}

        {/* ===== STEP 2: Público (Grupos) ===== */}
        {step === 2 && (
          <div className="space-y-6 sm:space-y-8">
            {/* Device */}
            <SurfaceCard className="p-4 sm:p-5 space-y-3">
              <SectionLabel>Instância</SectionLabel>
              <Select value={selectedDevice || "__none__"} onValueChange={(v) => setSelectedDevice(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Escolha uma instância conectada" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem instância (selecionar depois)</SelectItem>
                  {devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} {d.number ? `(${d.number})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SurfaceCard>

            {/* Groups */}
            <SurfaceCard className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <SectionLabel>Grupos</SectionLabel>
                {selectedGroups.length > 0 && (
                  <span className="text-xs font-medium text-primary">{selectedGroups.length} selecionado(s)</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Buscar grupo..." value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs shrink-0 h-9"
                  onClick={() => {
                    const visibleIds = filteredGroups.map(g => g.id);
                    const allSelected = visibleIds.every(id => selectedGroups.includes(id));
                    if (allSelected) {
                      setSelectedGroups(prev => prev.filter(id => !visibleIds.includes(id)));
                    } else {
                      setSelectedGroups(prev => [...new Set([...prev, ...visibleIds])]);
                    }
                  }}
                >
                  {filteredGroups.length > 0 && filteredGroups.every(g => selectedGroups.includes(g.id)) ? "Desmarcar todos" : "Selecionar todos"}
                </Button>
              </div>
              {loadingGroups ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos...</div>
              ) : (
                <div className="max-h-72 space-y-0.5 overflow-y-auto">
                  {filteredGroups.length === 0 && selectedDevice && <p className="py-2 text-sm text-muted-foreground">Nenhum grupo encontrado</p>}
                  {filteredGroups.map((g) => {
                    const isSelected = selectedGroups.includes(g.id);
                    return (
                      <label key={g.id} className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm transition-colors",
                        isSelected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/30"
                      )}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleGroup(g.id)} className="rounded" />
                        <span className="truncate">{g.name || g.id}</span>
                        {isSelected && isAdminsOnlyGroup(g) && (
                          <span className="ml-auto rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive shrink-0">só admins</span>
                        )}
                      </label>
                    );
                  })}
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

          </div>
        )}

        {/* ===== STEP 3: Parâmetros (identical to Campaigns) ===== */}
        {step === 3 && (
          <div className="space-y-8">
            {/* Send Control Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Delay */}
              <SurfaceCard className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                    <Clock className="w-4.5 h-4.5 text-teal-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Intervalo</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">Entre cada grupo</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Mín (s)</label>
                      <Input type="number" value={minDelay || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setMinDelay(v); }} onBlur={() => { const v = Math.max(minDelay || 1, 1); setMinDelay(v); if (v > maxDelay) setMaxDelay(v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Máx (s)</label>
                      <Input type="number" value={maxDelay || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setMaxDelay(v); }} onBlur={() => { const v = Math.max(maxDelay || 1, 1); setMaxDelay(v < minDelay ? minDelay : v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 tabular-nums">{minDelay}s – {maxDelay}s a cada envio</p>
                </div>
              </SurfaceCard>

              {/* Pause every X */}
              <SurfaceCard className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Zap className="w-4.5 h-4.5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Pausa</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">A cada X grupos</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Mín</label>
                      <Input type="number" value={pauseEveryMin || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setPauseEveryMin(v); }} onBlur={() => { const v = Math.max(pauseEveryMin || 1, 1); setPauseEveryMin(v); if (v > pauseEveryMax) setPauseEveryMax(v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Máx</label>
                      <Input type="number" value={pauseEveryMax || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setPauseEveryMax(v); }} onBlur={() => { const v = Math.max(pauseEveryMax || 1, 1); setPauseEveryMax(v < pauseEveryMin ? pauseEveryMin : v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 tabular-nums">A cada {pauseEveryMin}–{pauseEveryMax} grupos</p>
                </div>
              </SurfaceCard>

              {/* Pause duration */}
              <SurfaceCard className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Activity className="w-4.5 h-4.5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Duração</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">Tempo da pausa</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Mín (s)</label>
                      <Input type="number" value={pauseDurationMin || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setPauseDurationMin(v); }} onBlur={() => { const v = Math.max(pauseDurationMin || 1, 1); setPauseDurationMin(v); if (v > pauseDurationMax) setPauseDurationMax(v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Máx (s)</label>
                      <Input type="number" value={pauseDurationMax || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setPauseDurationMax(v); }} onBlur={() => { const v = Math.max(pauseDurationMax || 1, 1); setPauseDurationMax(v < pauseDurationMin ? pauseDurationMin : v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 tabular-nums">{pauseDurationMin}s – {pauseDurationMax}s de pausa</p>
                </div>
              </SurfaceCard>
            </div>

            {/* Estimated Time */}
            <SurfaceCard className="relative p-5 flex flex-col items-center justify-center text-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.06] to-transparent pointer-events-none" />
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
                  <Timer className="w-5 h-5 text-accent-foreground/70" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold mb-1.5">Tempo estimado</p>
                  <p className="text-3xl font-black text-foreground tabular-nums tracking-tight">
                    {(() => {
                      const count = selectedGroups.length;
                      if (count === 0) return "—";
                      const avgDelay = (minDelay + maxDelay) / 2;
                      const avgPauseEvery = (pauseEveryMin + pauseEveryMax) / 2;
                      const avgPauseDur = (pauseDurationMin + pauseDurationMax) / 2;
                      const numPauses = avgPauseEvery > 0 ? Math.floor(count / avgPauseEvery) : 0;
                      const totalSeconds = (count * avgDelay) + (numPauses * avgPauseDur);
                      const hours = Math.floor(totalSeconds / 3600);
                      const minutes = Math.floor((totalSeconds % 3600) / 60);
                      const days = Math.floor(hours / 24);
                      const remainingHours = hours % 24;
                      if (days > 0) return `≈ ${days}d ${remainingHours}h ${minutes}min`;
                      if (hours > 0) return `≈ ${hours}h ${minutes}min`;
                      if (minutes > 0) return `≈ ${minutes}min`;
                      return "≈ < 1min";
                    })()}
                  </p>
                </div>
                {selectedGroups.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/40">{selectedGroups.length} grupo{selectedGroups.length !== 1 ? "s" : ""} • 1 instância</p>
                )}
              </div>
            </SurfaceCard>
          </div>
        )}

        {/* ===== STEP 4: Lançamento (identical to Campaigns) ===== */}
        {step === 4 && (
          <div className="space-y-8">
            {/* Campaign name */}
            <SurfaceCard className="p-6 space-y-3">
              <SectionLabel>Nome da Campanha</SectionLabel>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Ex: Promoção Black Friday - Grupos"
                className="h-13 text-base font-semibold bg-muted/15 dark:bg-muted/8 border-border/15 focus-visible:ring-primary/30 px-4" />
            </SurfaceCard>

            {/* Review panel */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Technical summary */}
              <SurfaceCard className="lg:col-span-3 p-6 space-y-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none" />
                <div className="relative z-10 space-y-5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Eye className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">Resumo Técnico</h3>
                  </div>

                  {/* Top stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Grupos", value: String(selectedGroups.length), icon: Users, accent: "text-primary" },
                      { label: "Instância", value: devices.find(d => d.id === selectedDevice)?.name || "—", icon: Smartphone, accent: "text-emerald-400" },
                      { label: "Tipo", value: dispatchType === "text" ? "Texto" : dispatchType === "buttons" ? "Botões" : "Carrossel", icon: MessageSquare, accent: "text-amber-400" },
                    ].map(item => (
                      <div key={item.label} className="text-center p-4 rounded-xl bg-card border border-border/15">
                        <item.icon className={cn("w-4 h-4 mx-auto mb-2", item.accent)} />
                        <p className="text-lg font-black text-foreground tabular-nums">{item.value}</p>
                        <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/40 font-semibold mt-1">{item.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Delay config row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Intervalo", value: `${minDelay}–${maxDelay}s`, icon: Clock },
                      { label: "Pausa a cada", value: `${pauseEveryMin}–${pauseEveryMax} grupos`, icon: Zap },
                      { label: "Duração pausa", value: `${pauseDurationMin}–${pauseDurationMax}s`, icon: Activity },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/8 border border-border/10">
                        <item.icon className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/35 font-semibold">{item.label}</p>
                          <p className="text-[12px] font-bold text-foreground tabular-nums">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Warnings */}
                  {(!campaignName || !selectedDevice || selectedGroups.length === 0 || (!combinedMessage && !mediaUrl && dispatchType !== "carousel")) && (
                    <div className="flex items-center gap-3 text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-xl px-4 py-3">
                      <span className="text-[12px]">
                        {!campaignName && "Nome ausente. "}
                        {!selectedDevice && "Sem instância. "}
                        {selectedGroups.length === 0 && "Sem grupos. "}
                        {!combinedMessage && !mediaUrl && dispatchType !== "carousel" && "Mensagem vazia."}
                      </span>
                    </div>
                  )}
                </div>
              </SurfaceCard>

              {/* Preview */}
              <div className="lg:col-span-2 space-y-3">
                {dispatchType === "carousel" ? (
                  <CarouselPreview cards={cards} message={carouselMessage} />
                ) : (
                  <WhatsAppPreview />
                )}
              </div>
            </div>

            {/* Security checklist */}
            <SurfaceCard className="relative p-6 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Pronto para enviar</p>
                    <p className="text-[11px] text-muted-foreground/50">Revise e inicie sua campanha</p>
                  </div>
                </div>
                <div className="space-y-2 pl-[52px]">
                  {[
                    { ok: !!campaignName.trim(), text: "Nome definido" },
                    { ok: !!selectedDevice, text: "Instância selecionada" },
                    { ok: selectedGroups.length > 0, text: `${selectedGroups.length} grupo(s) selecionado(s)` },
                    { ok: dispatchType === "carousel" ? cards.some(c => c.text.trim() || c.mediaUrl) : (!!combinedMessage || !!mediaUrl), text: "Mensagem configurada" },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {c.ok ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-destructive/50" />
                      )}
                      <span className={cn("text-[11px] font-medium", c.ok ? "text-foreground/70" : "text-muted-foreground/40")}>{c.text}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/30 pl-[52px]">O envio pode ser cancelado a qualquer momento.</p>
              </div>
            </SurfaceCard>


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
          </div>
        )}
      </div>

      {/* ═══ Bottom Navigation (identical to Campaigns) ═══ */}
      <div className="mt-6 sm:mt-8 mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 h-9 w-full sm:w-[170px] justify-center border-border/40 text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:border-destructive/30 transition-colors duration-100 order-3 sm:order-1"
            onClick={clearAll}
          >
            <Eraser className="w-3.5 h-3.5" /> Limpar {step === 1 ? "conteúdo" : step === 2 ? "público" : step === 3 ? "parâmetros" : "tudo"}
          </Button>
          <div className="flex items-center gap-2 sm:gap-3 order-1 sm:order-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} className="gap-1.5 sm:gap-2.5 h-10 sm:h-11 flex-1 sm:flex-none sm:px-10 text-xs sm:text-sm font-bold tracking-wide">
                ← VOLTAR
              </Button>
            )}
            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)} className="gap-1.5 sm:gap-3 h-10 sm:h-11 flex-1 sm:flex-none sm:px-14 text-xs sm:text-[15px] font-bold tracking-wide shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:brightness-110 transition-all duration-150">
                CONTINUAR <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={sending || !selectedDevice || selectedGroups.length === 0 || !campaignName.trim()}
                className="gap-1.5 sm:gap-2.5 h-10 sm:h-11 flex-1 sm:flex-none sm:px-10 text-xs sm:text-sm font-bold tracking-wide shadow-lg shadow-primary/25 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                ENVIAR AGORA
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeGroupOptions(raw: any[]) {
  return raw.map((g) => {
    const id = String(g?.id || g?.JID || g?.jid || g?.groupJid || g?.chatId || "").trim();
    if (!id.endsWith("@g.us")) return null;
    const rawName = String(g?.name || g?.Name || g?.Subject || g?.subject || g?.groupName || "").trim();
    const name = rawName && rawName !== id ? rawName : "Grupo sem nome";
    return { ...g, id, name };
  }).filter(Boolean);
}
