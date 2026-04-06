import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  History, Search, Filter, Send, Bot, ArrowRightLeft, UserCheck,
  CalendarClock, AlertCircle, Clock, ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type UnifiedEvent = {
  id: string;
  created_at: string;
  event_type: string;
  description: string;
  actor: string | null;
  meta?: string | null;
  source: string;
};

const EVENT_CONFIG: Record<string, { label: string; icon: typeof Send; color: string }> = {
  message_sent: { label: "Mensagem enviada", icon: Send, color: "text-blue-400" },
  ai_response: { label: "IA respondeu", icon: Bot, color: "text-violet-400" },
  status_change: { label: "Mudança de status", icon: ArrowRightLeft, color: "text-amber-400" },
  human_takeover: { label: "Assumiu atendimento", icon: UserCheck, color: "text-emerald-400" },
  automation_trigger: { label: "Automação disparada", icon: Bot, color: "text-pink-400" },
  schedule_sent: { label: "Agendamento enviado", icon: CalendarClock, color: "text-cyan-400" },
  schedule_failed: { label: "Agendamento falhou", icon: AlertCircle, color: "text-red-400" },
};

const EVENT_TYPES = [
  { value: "all", label: "Todos os eventos" },
  { value: "message_sent", label: "Mensagem enviada" },
  { value: "ai_response", label: "IA respondeu" },
  { value: "status_change", label: "Mudança de status" },
  { value: "human_takeover", label: "Assumiu atendimento" },
  { value: "automation_trigger", label: "Automação disparada" },
  { value: "schedule_sent", label: "Agendamento enviado" },
  { value: "schedule_failed", label: "Agendamento falhou" },
];

export default function ActivityHistory() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [limit, setLimit] = useState(50);

  const { data: events, isLoading } = useQuery({
    queryKey: ["activity-history", user?.id, limit],
    queryFn: async () => {
      if (!user) return [];
      const unified: UnifiedEvent[] = [];

      // 1. Sent messages (human + AI)
      const { data: msgs } = await supabase
        .from("conversation_messages")
        .select("id, created_at, content, direction, is_ai_response, responded_by")
        .eq("user_id", user.id)
        .eq("direction", "sent")
        .order("created_at", { ascending: false })
        .limit(limit);

      for (const m of msgs || []) {
        const isAi = m.is_ai_response || m.responded_by === "automation" || m.responded_by === "ai";
        unified.push({
          id: m.id,
          created_at: m.created_at,
          event_type: isAi ? "ai_response" : "message_sent",
          description: (m.content || "").substring(0, 120) + ((m.content?.length ?? 0) > 120 ? "…" : ""),
          actor: isAi ? "IA / Automação" : "Você",
          source: "messages",
        });
      }

      // 2. Status changes
      const { data: statusHist } = await supabase
        .from("conversation_status_history")
        .select("id, created_at, old_status, new_status, changed_by_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      for (const s of statusHist || []) {
        const isHumanTakeover = s.new_status === "em_atendimento" && s.changed_by_name;
        unified.push({
          id: s.id,
          created_at: s.created_at,
          event_type: isHumanTakeover ? "human_takeover" : "status_change",
          description: isHumanTakeover
            ? `${s.changed_by_name} assumiu o atendimento`
            : `Status: ${s.old_status || "—"} → ${s.new_status}`,
          actor: s.changed_by_name || "Sistema",
          source: "status",
        });
      }

      // 3. Automation logs
      const { data: autoLogs } = await supabase
        .from("conversation_automation_logs")
        .select("id, created_at, automation_type, message_sent, status, error_message")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      for (const a of autoLogs || []) {
        unified.push({
          id: a.id,
          created_at: a.created_at,
          event_type: "automation_trigger",
          description: `[${a.automation_type}] ${(a.message_sent || "").substring(0, 100)}`,
          actor: "Automação",
          meta: a.status === "failed" ? a.error_message : null,
          source: "automation",
        });
      }

      // 4. Scheduled messages (sent or failed)
      const { data: schedules } = await supabase
        .from("scheduled_messages")
        .select("id, created_at, contact_name, contact_phone, message_content, status, error_message, sent_at")
        .eq("user_id", user.id)
        .in("status", ["sent", "failed"])
        .order("created_at", { ascending: false })
        .limit(limit);

      for (const sc of schedules || []) {
        unified.push({
          id: sc.id,
          created_at: sc.sent_at || sc.created_at,
          event_type: sc.status === "sent" ? "schedule_sent" : "schedule_failed",
          description: `${sc.contact_name || sc.contact_phone}: ${(sc.message_content || "").substring(0, 100)}`,
          actor: "Agendamento",
          meta: sc.status === "failed" ? sc.error_message : null,
          source: "schedule",
        });
      }

      // Sort by date desc
      unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return unified;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    if (!events) return [];
    return events.filter((e) => {
      if (typeFilter !== "all" && e.event_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          e.description.toLowerCase().includes(q) ||
          (e.actor?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [events, typeFilter, search]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, UnifiedEvent[]>();
    for (const ev of filtered) {
      const day = format(new Date(ev.created_at), "yyyy-MM-dd");
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(ev);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <History className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Histórico</h1>
          <p className="text-sm text-muted-foreground">Timeline de todas as ações do sistema</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar eventos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum evento encontrado</p>
          <p className="text-sm">Os eventos aparecerão aqui conforme o sistema registra ações.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {format(new Date(day), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="relative ml-4 border-l-2 border-border/50 pl-6 space-y-1">
                {items.map((ev) => {
                  const cfg = EVENT_CONFIG[ev.event_type] || {
                    label: ev.event_type,
                    icon: Clock,
                    color: "text-muted-foreground",
                  };
                  const Icon = cfg.icon;

                  return (
                    <div
                      key={ev.id}
                      className="relative group py-2.5 hover:bg-muted/30 rounded-lg px-3 -ml-3 transition-colors"
                    >
                      {/* Timeline dot */}
                      <div className={`absolute -left-[39px] top-3.5 w-3 h-3 rounded-full border-2 border-background ${cfg.color.replace("text-", "bg-")}`} />

                      <div className="flex items-start gap-3">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-[10px] font-medium px-1.5 py-0">
                              {cfg.label}
                            </Badge>
                            {ev.actor && (
                              <span className="text-xs text-muted-foreground">{ev.actor}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                              {format(new Date(ev.created_at), "HH:mm:ss")}
                            </span>
                          </div>
                          <p className="text-sm text-foreground/80 mt-0.5 truncate">
                            {ev.description}
                          </p>
                          {ev.meta && (
                            <p className="text-xs text-red-400 mt-0.5 truncate">⚠ {ev.meta}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load more */}
          {(events?.length ?? 0) >= limit && (
            <div className="text-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLimit((l) => l + 50)}
                className="text-muted-foreground"
              >
                <ChevronDown className="h-4 w-4 mr-1" />
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
