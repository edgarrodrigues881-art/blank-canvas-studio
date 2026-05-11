import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Send, Smartphone, Users, Check, MessagesSquare, Loader2, Plus, X, Reply, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { GroupChatComposer, type GroupReplyTo, type ButtonTemplateItem, type CarouselTemplateItem, type GroupTemplate } from "@/components/group-chat/GroupChatComposer";

interface DeviceRow { id: string; name: string; created_at: string }
interface GroupRow {
  id: string;
  device_id: string;
  jid: string;
  name: string | null;
  participants_count: number | null;
  image_url?: string | null;
}
interface GroupMessageButtonPayload {
  id?: string | number;
  label?: string;
  text?: string;
  type?: string;
  valor?: string;
  value?: string;
  url?: string;
  phone?: string;
  copyCode?: string;
}

interface GroupCarouselCardPayload {
  kind?: "carousel_card";
  id?: string;
  position?: number;
  text?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  buttons?: GroupMessageButtonPayload[];
}

type GroupMessageActionPayload = GroupMessageButtonPayload | GroupCarouselCardPayload;

interface MessageRow {
  id: string;
  device_id: string | null;
  group_jid: string;
  sender_jid: string | null;
  sender_name: string | null;
  content: string | null;
  media_type: string | null;
  media_url: string | null;
  direction: "sent" | "received";
  whatsapp_message_id: string | null;
  sent_at: string;
  buttons?: GroupMessageActionPayload[] | null;
}

type PendingGroupMessage = MessageRow & { pending?: boolean };

interface SelectedGroup {
  jid: string;
  device_id: string;
  name: string;
  participants_count: number;
  device_name: string;
  image_url?: string | null;
}

const getButtonLabel = (button: GroupMessageButtonPayload) => {
  const raw = button.label || button.text || button.valor || button.value || button.copyCode || "Botão";
  return String(raw).trim() || "Botão";
};

const isCarouselCardPayload = (item: GroupMessageActionPayload): item is GroupCarouselCardPayload => {
  return (item as GroupCarouselCardPayload)?.kind === "carousel_card";
};

const normalizeCarouselCardsForChat = (cards: any[] = []): GroupCarouselCardPayload[] => {
  return cards
    .map((card, index) => ({
      kind: "carousel_card" as const,
      id: typeof card?.id === "string" ? card.id : `card-${index + 1}`,
      position: typeof card?.position === "number" ? card.position : index,
      text: typeof card?.text === "string" ? card.text.trim() : "",
      mediaUrl: typeof card?.mediaUrl === "string" ? card.mediaUrl.trim() : null,
      mediaType: typeof card?.mediaType === "string" ? card.mediaType : (card?.mediaUrl ? "image" : null),
      buttons: Array.isArray(card?.buttons)
        ? card.buttons
            .map((button: any, buttonIndex: number) => ({
              id: button?.id || button?.value || button?.text || `btn-${buttonIndex + 1}`,
              type: button?.type || "reply",
              text: button?.text || button?.label || "",
              label: button?.label || button?.text || "",
              value: button?.value || button?.valor || "",
              url: button?.url,
              phone: button?.phone,
              copyCode: button?.copyCode,
            }))
            .filter((button: GroupMessageButtonPayload) => getButtonLabel(button) !== "Botão")
        : [],
    }))
    .filter((card) => card.text || card.mediaUrl || (card.buttons?.length || 0) > 0)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
};

const GroupChat = () => {
  const { user } = useAuth();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [lastByGroup, setLastByGroup] = useState<Record<string, MessageRow | undefined>>({});
  const [openDeviceIds, setOpenDeviceIds] = useState<string[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [tabsHydrated, setTabsHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedGroup | null>(null);
  const [messages, setMessages] = useState<PendingGroupMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [replyTo, setReplyTo] = useState<GroupReplyTo | null>(null);
  const [buttonTemplates, setButtonTemplates] = useState<ButtonTemplateItem[]>([]);
  const [carouselTemplates, setCarouselTemplates] = useState<CarouselTemplateItem[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ── Load devices (creation-order) ──
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, name, created_at, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled || !data) return;
      const CONNECTED = ["Ready", "Connected", "authenticated", "open", "active"];
      const filtered = (data as (DeviceRow & { status?: string })[]).filter(
        (d) =>
          !/^relat[oó]rio/i.test((d.name || "").trim()) &&
          CONNECTED.includes((d.status || "").trim())
      );
      setDevices(filtered);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Hydrate open tabs from localStorage once devices are loaded
  useEffect(() => {
    if (!user?.id || tabsHydrated || devices.length === 0) return;
    try {
      const raw = window.localStorage.getItem(`group-chat-tabs:${user.id}`);
      if (raw) {
        const saved = JSON.parse(raw) as { open: string[]; active: string | null };
        const validIds = new Set(devices.map((d) => d.id));
        const open = (saved.open || []).filter((id) => validIds.has(id));
        const active = saved.active && validIds.has(saved.active) ? saved.active : (open[open.length - 1] || null);
        if (open.length > 0) {
          setOpenDeviceIds(open);
          setActiveDeviceId(active);
        }
      }
    } catch { /* ignore */ }
    setTabsHydrated(true);
  }, [user?.id, devices, tabsHydrated]);

  // Persist open tabs to localStorage
  useEffect(() => {
    if (!user?.id || !tabsHydrated) return;
    try {
      window.localStorage.setItem(
        `group-chat-tabs:${user.id}`,
        JSON.stringify({ open: openDeviceIds, active: activeDeviceId }),
      );
    } catch { /* ignore */ }
  }, [user?.id, tabsHydrated, openDeviceIds, activeDeviceId]);

  // ── Load templates (buttons + carousel) for "/" command ──
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [{ data: tpl }, { data: car }] = await Promise.all([
        supabase
          .from("templates")
          .select("id, name, content, media_url, type, buttons")
          .eq("user_id", user.id)
          .order("name", { ascending: true })
          .limit(500),
        supabase
          .from("carousel_templates")
          .select("id, name, message, cards")
          .eq("user_id", user.id)
          .order("name", { ascending: true })
          .limit(500),
      ]);
      if (cancelled) return;
      const btns = ((tpl as any[]) || [])
        .map((t) => ({ ...t, buttons: Array.isArray(t.buttons) ? t.buttons : [] }))
        .filter((t) => t.buttons.length > 0) as ButtonTemplateItem[];
      const cars = ((car as any[]) || [])
        .map((c) => ({ ...c, cards: Array.isArray(c.cards) ? c.cards : [] }))
        .filter((c) => c.cards.length > 0) as CarouselTemplateItem[];
      setButtonTemplates(btns);
      setCarouselTemplates(cars);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Load groups ──
  const loadGroups = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("device_groups_cache")
      .select("id, device_id, jid, name, participants_count, image_url")
      .eq("user_id", user.id)
      .order("name", { ascending: true })
      .limit(2000);
    if (data) setGroups(data as GroupRow[]);
  }, [user?.id]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // ── Fetch group profile pictures for the active device (background) ──
  useEffect(() => {
    if (!user?.id || !activeDeviceId) return;
    let cancelled = false;
    (async () => {
      try {
        await supabase.functions.invoke("group-chat-fetch-images", {
          body: { device_id: activeDeviceId },
        });
        if (!cancelled) await loadGroups();
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id, activeDeviceId, loadGroups]);

  // ── Last message per group (single query, group by jid client-side) ──
  const refreshLastByGroup = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("group_messages")
      .select("id, device_id, group_jid, sender_jid, sender_name, content, media_type, media_url, direction, whatsapp_message_id, sent_at, buttons")
      .eq("user_id", user.id)
      .order("sent_at", { ascending: false })
      .limit(1000);
    if (!data) return;
    const map: Record<string, MessageRow> = {};
    for (const m of data as MessageRow[]) {
      if (!map[m.group_jid]) map[m.group_jid] = m;
    }
    setLastByGroup(map);
  }, [user?.id]);

  useEffect(() => { refreshLastByGroup(); }, [refreshLastByGroup]);

  // ── Realtime: any new group message → refresh lastByGroup + active chat ──
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`group-messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const m = payload.new as MessageRow;
          setLastByGroup((prev) => {
            const cur = prev[m.group_jid];
            if (!cur || new Date(m.sent_at) > new Date(cur.sent_at)) {
              return { ...prev, [m.group_jid]: m };
            }
            return prev;
          });
          if (selected && m.group_jid === selected.jid && m.device_id === selected.device_id) {
            setMessages((prev) => {
              if (prev.some((x) => x.id === m.id)) return prev;
              return [...prev, m];
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, selected]);

  // ── Load messages when group selected + periodic sync fallback ──
  const loadMessages = useCallback(async (showLoading = false) => {
    if (!user?.id || !selected) return;
    if (showLoading) setLoadingMsgs(true);
    const { data } = await supabase
      .from("group_messages")
      .select("id, device_id, group_jid, sender_jid, sender_name, content, media_type, media_url, direction, whatsapp_message_id, sent_at, deleted_at, buttons")
      .eq("user_id", user.id)
      .eq("group_jid", selected.jid)
      .eq("device_id", selected.device_id)
      .is("deleted_at", null)
      .order("sent_at", { ascending: true })
      .limit(1000);
    setMessages((data as MessageRow[]) || []);
    if (showLoading) setLoadingMsgs(false);
  }, [user?.id, selected]);

  useEffect(() => {
    if (!selected) return;
    loadMessages(true);
    const interval = setInterval(() => {
      if (!document.hidden) loadMessages(false);
    }, 8000);
    return () => clearInterval(interval);
  }, [selected, loadMessages]);

  // ── Auto-scroll on new messages ──
  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, [messages.length, selected?.jid]);

  // ── Filtered + decorated group list ──
  const deviceById = useMemo(() => {
    const m = new Map<string, DeviceRow>();
    devices.forEach((d) => m.set(d.id, d));
    return m;
  }, [devices]);

  const decoratedGroups = useMemo(() => {
    let list = groups.map((g) => {
      const dev = deviceById.get(g.device_id);
      const last = lastByGroup[g.jid];
      return {
        ...g,
        deviceName: dev?.name || g.device_id.slice(0, 8),
        deviceCreatedAt: dev?.created_at || "",
        last,
      };
    });
    if (activeDeviceId) {
      list = list.filter((g) => g.device_id === activeDeviceId);
    } else {
      list = [];
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((g) => (g.name || "").toLowerCase().includes(q));
    }
    // Order: groups with last message first (recent), then alphabetical
    list.sort((a, b) => {
      const ta = a.last?.sent_at ? new Date(a.last.sent_at).getTime() : 0;
      const tb = b.last?.sent_at ? new Date(b.last.sent_at).getTime() : 0;
      if (ta !== tb) return tb - ta;
      return (a.name || "").localeCompare(b.name || "");
    });
    return list;
  }, [groups, deviceById, lastByGroup, activeDeviceId, search]);

  // ── Send helpers ──
  const createPendingMessage = useCallback((payload: Record<string, any>, fallbackContent?: string): PendingGroupMessage | null => {
    if (!selected) return null;
    const mediaType = payload.type && payload.type !== "text" ? String(payload.type) : null;
    return {
      id: `pending-${crypto.randomUUID()}`,
      device_id: selected.device_id,
      group_jid: selected.jid,
      sender_jid: null,
      sender_name: "Você",
      content: mediaType ? (payload.caption || "") : (fallbackContent || payload.content || ""),
      media_type: mediaType,
      media_url: mediaType ? payload.content : null,
      direction: "sent",
      whatsapp_message_id: null,
      sent_at: new Date().toISOString(),
      pending: true,
    };
  }, [selected]);

  const callSend = useCallback(async (payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("group-chat-send", { body: payload });
    // supabase.functions.invoke surfaces a FunctionsHttpError on non-2xx and hides the JSON body.
    // Try to read the response body to surface the real PT-BR message.
    if (error) {
      let msg = error.message || "Falha ao enviar";
      try {
        const ctx: any = (error as any).context;
        if (ctx?.json) {
          const parsed = await ctx.json();
          if (parsed?.error) msg = parsed.error;
        } else if (ctx?.text) {
          const txt = await ctx.text();
          try { const j = JSON.parse(txt); if (j?.error) msg = j.error; } catch { if (txt) msg = txt; }
        }
      } catch { /* keep generic */ }
      if (/disconnected/i.test(msg) && /not reconnectable/i.test(msg)) {
        msg = "Instância desconectada. Reconecte o WhatsApp (QR Code) para enviar mensagens neste grupo.";
      } else if (/sem credenciais/i.test(msg)) {
        msg = "Esta instância não tem credenciais válidas. Reconecte o WhatsApp.";
      } else if (msg === "true" || msg === "{\"error\":true}") {
        msg = "A instância do WhatsApp recusou o envio. Reconecte o QR Code e tente novamente.";
      }
      throw new Error(msg);
    }
    if ((data as any)?.error) {
      throw new Error((data as any).error);
    }
  }, []);

  const sendOptimistic = useCallback((payload: Record<string, any>, fallbackContent?: string) => {
    const pending = createPendingMessage(payload, fallbackContent);
    if (pending) setMessages((prev) => [...prev, pending]);
    void callSend(payload)
      .then(() => {
        if (pending) setMessages((prev) => prev.filter((m) => m.id !== pending.id));
        void loadMessages(false);
        void refreshLastByGroup();
      })
      .catch((e: any) => {
        if (pending) setMessages((prev) => prev.filter((m) => m.id !== pending.id));
        toast.error(e?.message || "Erro ao enviar mensagem");
      });
  }, [callSend, createPendingMessage, loadMessages, refreshLastByGroup]);

  const uploadMedia = useCallback(async (file: Blob, ext: string, folder: string) => {
    if (!user?.id) throw new Error("não autenticado");
    const path = `${user.id}/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
      contentType: (file as any).type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) throw new Error("Upload falhou: " + upErr.message);
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return data.publicUrl;
  }, [user?.id]);

  const sendText = useCallback(async (text: string, reply: GroupReplyTo | null) => {
    if (!selected) return;
    sendOptimistic({
      device_id: selected.device_id,
      group_jid: selected.jid,
      type: "text",
      content: text,
      quoted_message_id: reply?.whatsappMessageId || undefined,
    }, text);
  }, [selected, sendOptimistic]);

  const sendFile = useCallback(async (file: File, caption: string | undefined, reply: GroupReplyTo | null) => {
    if (!selected) return;
    try {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const url = await uploadMedia(file, ext, "group-chat-files");
      sendOptimistic({
        device_id: selected.device_id,
        group_jid: selected.jid,
        type: isImage ? "image" : isVideo ? "video" : "document",
        content: url,
        file_name: file.name,
        caption,
        quoted_message_id: reply?.whatsappMessageId || undefined,
      });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar arquivo");
    }
  }, [selected, sendOptimistic, uploadMedia]);

  const sendAudio = useCallback(async (blob: Blob, _duration: number, reply: GroupReplyTo | null) => {
    if (!selected) return;
    try {
      const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
      const url = await uploadMedia(blob, ext, "group-chat-audio");
      sendOptimistic({
        device_id: selected.device_id,
        group_jid: selected.jid,
        type: "audio",
        content: url,
        quoted_message_id: reply?.whatsappMessageId || undefined,
      });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar áudio");
    }
  }, [selected, sendOptimistic, uploadMedia]);

  const sendTemplate = useCallback(async (tpl: GroupTemplate) => {
    if (!selected) return;
    try {
      let body: Record<string, any>;
      let pending: PendingGroupMessage;
      if (tpl.kind === "buttons") {
        const t = tpl.tpl;
        const mediaUrl = (t.media_url || "").trim();
        const hasValidMedia = /^https?:\/\//i.test(mediaUrl);
        body = {
          deviceId: selected.device_id,
          groupJid: selected.jid,
          type: "buttons",
          content: t.content || "",
          mediaUrl: hasValidMedia ? mediaUrl : undefined,
          buttons: t.buttons || [],
        };
        pending = {
          id: `pending-template-${crypto.randomUUID()}`,
          device_id: selected.device_id,
          group_jid: selected.jid,
          sender_jid: null,
          sender_name: "Você",
          content: t.content || "",
          media_type: hasValidMedia ? "image" : null,
          media_url: hasValidMedia ? mediaUrl : null,
          direction: "sent",
          whatsapp_message_id: null,
          sent_at: new Date().toISOString(),
          pending: true,
          buttons: (t.buttons || []) as any,
        };
      } else {
        const t = tpl.tpl;
        body = {
          deviceId: selected.device_id,
          groupJid: selected.jid,
          type: "text",
          headerText: t.message || "",
          cards: t.cards || [],
        };
        pending = {
          id: `pending-template-${crypto.randomUUID()}`,
          device_id: selected.device_id,
          group_jid: selected.jid,
          sender_jid: null,
          sender_name: "Você",
          content: `🎠 Carrossel: ${t.name || ""}`,
          media_type: null,
          media_url: null,
          direction: "sent",
          whatsapp_message_id: null,
          sent_at: new Date().toISOString(),
          pending: true,
        };
      }
      setMessages((prev) => [...prev, pending]);
      toast.success(tpl.kind === "buttons" ? "Template de botões em envio" : "Carrossel em envio");
      void supabase.functions.invoke("group-carousel-send", { body })
        .then(async ({ data, error }) => {
          if (error) {
            let msg = error.message || "Falha ao enviar template";
            try {
              const ctx: any = (error as any).context;
              if (ctx?.json) { const p = await ctx.json(); if (p?.error) msg = p.error; }
              else if (ctx?.text) { const txt = await ctx.text(); try { const j = JSON.parse(txt); if (j?.error) msg = j.error; } catch { if (txt) msg = txt; } }
            } catch {}
            throw new Error(msg);
          }
          if ((data as any)?.error) throw new Error((data as any).error);
          setMessages((prev) => prev.filter((m) => m.id !== pending.id));
          void loadMessages(false);
          void refreshLastByGroup();
        })
        .catch((e: any) => {
          setMessages((prev) => prev.filter((m) => m.id !== pending.id));
          toast.error(e?.message || "Erro ao enviar template");
        });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar template");
    }
  }, [selected, loadMessages, refreshLastByGroup]);

  const handleDeleteForEveryone = useCallback(async (msgId: string) => {
    const prev = messages;
    setMessages((arr) => arr.filter((x) => x.id !== msgId));
    try {
      const { data, error } = await supabase.functions.invoke("group-chat-delete", {
        body: { message_id: msgId },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Falha ao apagar");
      }
      toast.success("Mensagem apagada para todos");
    } catch (e: any) {
      setMessages(prev);
      toast.error(e?.message || "Erro ao apagar mensagem");
    }
  }, [messages]);

  const formatGroupTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isToday(d)) return format(d, "HH:mm");
    if (isYesterday(d)) return "Ontem";
    return format(d, "dd/MM");
  };

  const dateLabel = (d: Date) => {
    if (isToday(d)) return "Hoje";
    if (isYesterday(d)) return "Ontem";
    return format(d, "dd 'de' MMMM", { locale: ptBR });
  };

  const availableToOpen = devices.filter((d) => !openDeviceIds.includes(d.id));
  const openInstance = (id: string) => {
    setOpenDeviceIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveDeviceId(id);
    setSelected(null);
  };
  const closeInstance = (id: string) => {
    setOpenDeviceIds((prev) => prev.filter((x) => x !== id));
    if (activeDeviceId === id) {
      const remaining = openDeviceIds.filter((x) => x !== id);
      setActiveDeviceId(remaining[remaining.length - 1] || null);
      setSelected(null);
    }
  };

  return (
    <div className="flow-builder-fullscreen flex h-[calc(100dvh-2.75rem)] w-full min-w-0 flex-col overflow-hidden bg-background sm:h-[calc(100dvh-3.5rem)]">
      {/* Top: instance tabs */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-0 border-b border-border/40 bg-card/30 overflow-x-auto">
        <div className="flex items-center gap-2 pr-3 mr-1 border-r border-border/40 shrink-0">
          <MessagesSquare className="w-4 h-4 text-emerald-500" />
          <h2 className="text-[14px] font-bold tracking-tight whitespace-nowrap">Chat de Grupos</h2>
        </div>
        {openDeviceIds.map((id) => {
          const dev = deviceById.get(id);
          if (!dev) return null;
          const isActive = activeDeviceId === id;
          return (
            <div
              key={id}
              className={cn(
                "group flex items-center gap-2 px-3 py-1.5 rounded-t-md text-[12px] font-medium border-x border-t cursor-pointer transition-colors shrink-0",
                isActive
                  ? "bg-background border-border/60 text-foreground -mb-px"
                  : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted/70"
              )}
              onClick={() => { setActiveDeviceId(id); setSelected(null); }}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{dev.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); closeInstance(id); }}
                className="opacity-60 hover:opacity-100 hover:text-destructive"
                title="Fechar instância"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        {availableToOpen.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Abrir instância
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px] max-h-[320px] overflow-y-auto">
              {availableToOpen.map((d) => (
                <DropdownMenuItem
                  key={d.id}
                  onSelect={(e) => { e.preventDefault(); openInstance(d.id); }}
                  className="gap-2 text-xs cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                  {d.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
      {/* Left: groups list */}
      <aside className="flex h-full min-h-0 w-[360px] shrink-0 flex-col overflow-hidden border-r border-border/40 bg-card/40">

        <div className="shrink-0 px-3 py-2 border-b border-border/20">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar grupo..."
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!activeDeviceId ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Abra uma instância nas abas acima para ver seus grupos.
            </div>
          ) : decoratedGroups.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhum grupo encontrado nesta instância. Sincronize seus grupos no menu Disparo em Grupo.
            </div>
          ) : (
            <ul className="p-1">
              {decoratedGroups.map((g) => {
                const isActive = selected?.jid === g.jid && selected?.device_id === g.device_id;
                const last = g.last;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(null);
                        setSelected({
                          jid: g.jid,
                          device_id: g.device_id,
                          name: g.name || g.jid,
                          participants_count: g.participants_count || 0,
                          device_name: g.deviceName,
                          image_url: g.image_url || null,
                        });
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-3 transition-colors",
                        isActive ? "bg-primary/10" : "hover:bg-muted/50"
                      )}
                    >
                      <Avatar className="w-10 h-10 shrink-0">
                        {g.image_url ? <AvatarImage src={g.image_url} alt={g.name || ""} /> : null}
                        <AvatarFallback className="bg-emerald-500/15 text-emerald-600 text-xs font-bold">
                          {(g.name || "G").substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold truncate">{g.name || g.jid}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatGroupTime(last?.sent_at)}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {last
                            ? `${last.sender_name ? last.sender_name + ": " : ""}${
                                last.content || (last.media_type ? `[${last.media_type}]` : "")
                              }`
                            : "Sem mensagens recentes"}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                          <Smartphone className="w-2.5 h-2.5" /> {g.deviceName}
                          {g.participants_count ? <span>· {g.participants_count} membros</span> : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Right: chat panel */}
      <main className="flex-1 flex flex-col bg-background min-w-0 min-h-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Selecione um grupo à esquerda para conversar.
          </div>
        ) : (
          <>
            <header className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-border/30 bg-card/40">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="w-9 h-9 shrink-0">
                  {selected.image_url ? <AvatarImage src={selected.image_url} alt={selected.name} /> : null}
                  <AvatarFallback className="bg-emerald-500/15 text-emerald-600 text-xs font-bold">
                    {selected.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{selected.name}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    {selected.participants_count} membros
                    <span>·</span>
                    <Smartphone className="w-3 h-3" />
                    {selected.device_name}
                  </div>
                </div>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-hidden px-5 py-4 space-y-2">
              {loadingMsgs ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando mensagens...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-10">
                  Sem mensagens neste grupo ainda. Envie a primeira ou aguarde novas mensagens chegarem.
                </div>
              ) : (
                messages.map((m, idx) => {
                  const prev = messages[idx - 1];
                  const showDate = !prev || format(new Date(prev.sent_at), "yyyy-MM-dd") !== format(new Date(m.sent_at), "yyyy-MM-dd");
                  const directionChanged = prev && prev.direction !== m.direction;
                  const sent = m.direction === "sent";
                  return (
                    <div key={m.id}>
                      {showDate && (
                        <div className="flex justify-center my-4">
                          <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted/40 px-3 py-1 rounded-full">
                            {dateLabel(new Date(m.sent_at))}
                          </span>
                        </div>
                      )}
                      <div className={cn("group/msg flex items-end gap-1.5", sent ? "justify-end" : "justify-start", directionChanged && !showDate && "mt-6")}>
                        {sent && !m.pending && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                                title="Mais"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setReplyTo({
                                    whatsappMessageId: m.whatsapp_message_id,
                                    content: m.content,
                                    senderName: "Você",
                                    mediaType: m.media_type,
                                  });
                                }}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <Reply className="w-3.5 h-3.5" /> Responder
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={(e) => { e.preventDefault(); handleDeleteForEveryone(m.id); }}
                                className="gap-2 text-xs cursor-pointer text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Apagar para todos
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        <div
                          className={cn(
                            "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                            sent
                              ? cn("bg-emerald-600 text-white rounded-br-sm", m.pending && "opacity-75")
                              : "bg-muted text-foreground rounded-bl-sm"
                          )}
                        >
                          {!sent && m.sender_name && (
                            <div className="text-[11px] font-semibold text-emerald-600 mb-0.5">
                              {m.sender_name}
                            </div>
                          )}
                          {m.media_type === "image" && m.media_url && (
                            <img src={m.media_url} alt="" className="rounded-lg mb-1 max-w-full" />
                          )}
                          {m.media_type === "audio" && m.media_url && (
                            <audio controls src={m.media_url} className="mb-1 w-full" />
                          )}
                          {m.media_type === "video" && m.media_url && (
                            <video controls src={m.media_url} className="rounded-lg mb-1 max-w-full" />
                          )}
                          {m.media_type === "document" && m.media_url && (
                            <a href={m.media_url} target="_blank" rel="noreferrer" className="underline text-xs block mb-1">
                              📎 Documento
                            </a>
                          )}
                          {m.content && <div className="whitespace-pre-wrap break-words">{m.content}</div>}
                          {Array.isArray(m.buttons) && m.buttons.length > 0 && (
                            <div className={cn("mt-2 -mx-1 pt-2 border-t flex flex-col gap-1", sent ? "border-white/20" : "border-border")}>
                              {m.buttons.map((b, i) => (
                                <div
                                  key={b.id || i}
                                  className={cn(
                                    "text-[12px] font-medium text-center py-1.5 px-2 rounded-md",
                                    sent ? "bg-white/15 text-white" : "bg-background text-primary border border-border"
                                  )}
                                >
                                  {b.label || b.valor || "Botão"}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className={cn("text-[10px] mt-1 text-right", sent ? "text-white/70" : "text-muted-foreground")}>
                            {m.pending ? "enviando..." : format(new Date(m.sent_at), "HH:mm")}
                          </div>
                        </div>
                        {!sent && (
                          <button
                            type="button"
                            onClick={() => setReplyTo({
                              whatsappMessageId: m.whatsapp_message_id,
                              content: m.content,
                              senderName: m.sender_name || "Membro",
                              mediaType: m.media_type,
                            })}
                            className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Responder"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <GroupChatComposer
              disabled={!selected}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onSendText={sendText}
              onSendFile={sendFile}
              onSendAudio={sendAudio}
              buttonTemplates={buttonTemplates}
              carouselTemplates={carouselTemplates}
              onSendTemplate={sendTemplate}
            />

          </>
        )}
      </main>
      </div>
    </div>
  );
};

export default GroupChat;
