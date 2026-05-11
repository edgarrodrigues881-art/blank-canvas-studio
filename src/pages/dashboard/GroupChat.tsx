import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Send, Smartphone, Users, Check, MessagesSquare, Loader2, Plus, X, Reply } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { GroupChatComposer, type GroupReplyTo } from "@/components/group-chat/GroupChatComposer";

interface DeviceRow { id: string; name: string; created_at: string }
interface GroupRow {
  id: string;
  device_id: string;
  jid: string;
  name: string | null;
  participants_count: number | null;
}
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
}

interface SelectedGroup {
  jid: string;
  device_id: string;
  name: string;
  participants_count: number;
  device_name: string;
}

const GroupChat = () => {
  const { user } = useAuth();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [lastByGroup, setLastByGroup] = useState<Record<string, MessageRow | undefined>>({});
  const [openDeviceIds, setOpenDeviceIds] = useState<string[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedGroup | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ── Load devices (creation-order) ──
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, name, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled || !data) return;
      const filtered = (data as DeviceRow[]).filter(
        (d) => !/^relat[oó]rio/i.test((d.name || "").trim())
      );
      setDevices(filtered);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Load groups ──
  const loadGroups = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("device_groups_cache")
      .select("id, device_id, jid, name, participants_count")
      .eq("user_id", user.id)
      .order("name", { ascending: true })
      .limit(2000);
    if (data) setGroups(data as GroupRow[]);
  }, [user?.id]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // ── Last message per group (single query, group by jid client-side) ──
  const refreshLastByGroup = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("group_messages")
      .select("id, device_id, group_jid, sender_jid, sender_name, content, media_type, media_url, direction, whatsapp_message_id, sent_at")
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

  // ── Load messages when group selected ──
  useEffect(() => {
    if (!user?.id || !selected) return;
    let cancelled = false;
    setLoadingMsgs(true);
    (async () => {
      const { data } = await supabase
        .from("group_messages")
        .select("id, device_id, group_jid, sender_jid, sender_name, content, media_type, media_url, direction, whatsapp_message_id, sent_at")
        .eq("user_id", user.id)
        .eq("group_jid", selected.jid)
        .eq("device_id", selected.device_id)
        .order("sent_at", { ascending: true })
        .limit(500);
      if (cancelled) return;
      setMessages((data as MessageRow[]) || []);
      setLoadingMsgs(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, selected]);

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

  // ── Send ──
  const handleSend = async () => {
    if (!selected || !draft.trim() || sending) return;
    const text = draft.trim();
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-chat-send", {
        body: { device_id: selected.device_id, group_jid: selected.jid, type: "text", content: text },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Falha ao enviar");
      }
      setDraft("");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

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
                      onClick={() =>
                        setSelected({
                          jid: g.jid,
                          device_id: g.device_id,
                          name: g.name || g.jid,
                          participants_count: g.participants_count || 0,
                          device_name: g.deviceName,
                        })
                      }
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-3 transition-colors",
                        isActive ? "bg-primary/10" : "hover:bg-muted/50"
                      )}
                    >
                      <Avatar className="w-10 h-10 shrink-0">
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
                      <div className={cn("flex", sent ? "justify-end" : "justify-start", directionChanged && !showDate && "mt-6")}>
                        <div
                          className={cn(
                            "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                            sent
                              ? "bg-emerald-600 text-white rounded-br-sm"
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
                          <div className={cn("text-[10px] mt-1 text-right", sent ? "text-white/70" : "text-muted-foreground")}>
                            {format(new Date(m.sent_at), "HH:mm")}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <footer className="shrink-0 border-t border-border/30 px-4 py-3 bg-card/40">
              <div className="flex items-end gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Digite uma mensagem para o grupo..."
                  className="flex-1"
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={!draft.trim() || sending} className="gap-2">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar
                </Button>
              </div>
            </footer>
          </>
        )}
      </main>
      </div>
    </div>
  );
};

export default GroupChat;
