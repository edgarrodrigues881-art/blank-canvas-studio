import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Users, MessageSquare, Clock, AlertTriangle, CheckCircle2, Target, Play, History, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const chipLabels: Record<string, string> = { new: "Novo", recovered: "Recuperado", unstable: "Fraco" };

function getCommunityStartDay(chipState: string): number {
  if (chipState === "unstable") return 9;
  if (chipState === "recovered") return 7;
  return 6;
}

function getPairsTarget(communityDay: number): { min: number; max: number } {
  if (communityDay <= 1) return { min: 1, max: 3 };
  if (communityDay === 2) return { min: 2, max: 5 };
  if (communityDay === 3) return { min: 4, max: 7 };
  if (communityDay <= 6) return { min: 5, max: 8 };
  return { min: 6, max: 10 };
}

interface Props {
  deviceId: string;
  cycle: {
    id: string;
    day_index: number;
    chip_state: string;
    phase: string;
    is_running: boolean;
  } | null;
}

export function CommunityDiagnostic({ deviceId, cycle }: Props) {
  const { data: membership } = useQuery({
    queryKey: ["community_diagnostic", deviceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("warmup_community_membership" as any)
        .select("*")
        .eq("device_id", deviceId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!deviceId,
    refetchInterval: 30_000,
  });

  const { data: activeSession } = useQuery({
    queryKey: ["community_active_session", deviceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_sessions")
        .select("id, device_a, device_b, target_messages, messages_total, messages_sent_a, messages_sent_b, status, started_at, last_sender, last_message_at, end_reason, community_mode")
        .or(`device_a.eq.${deviceId},device_b.eq.${deviceId}`)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!deviceId,
    refetchInterval: 15_000,
  });

  const { data: activePairs = [] } = useQuery({
    queryKey: ["community_pairs_diag", deviceId],
    queryFn: async () => {
      const [{ data: a }, { data: b }] = await Promise.all([
        supabase.from("community_pairs").select("id, instance_id_a, instance_id_b, status, messages_total, target_messages, created_at").eq("instance_id_a", deviceId).eq("status", "active"),
        supabase.from("community_pairs").select("id, instance_id_a, instance_id_b, status, messages_total, target_messages, created_at").eq("instance_id_b", deviceId).eq("status", "active"),
      ]);
      return [...(a || []), ...(b || [])];
    },
    enabled: !!deviceId,
    refetchInterval: 30_000,
  });

  const { data: recentSessions = [] } = useQuery({
    queryKey: ["community_recent_sessions", deviceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_sessions")
        .select("id, device_a, device_b, messages_total, target_messages, status, end_reason, started_at, completed_at, community_mode")
        .or(`device_a.eq.${deviceId},device_b.eq.${deviceId}`)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!deviceId,
    refetchInterval: 60_000,
  });

  const { data: recentAudit = [] } = useQuery({
    queryKey: ["community_audit_device", deviceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_audit_logs" as any)
        .select("id, event_type, level, message, reason, created_at")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false })
        .limit(8);
      return (data || []) as any[];
    },
    enabled: !!deviceId,
    refetchInterval: 60_000,
  });

  if (!cycle && mode !== "community_only") return null;

  const chipState = cycle?.chip_state || "new";
  const communityStartDay = getCommunityStartDay(chipState);
  const isCommunityUnlocked = mode === "community_only" || (cycle && (cycle.day_index || 1) >= communityStartDay);
  const communityDay = membership?.community_day || 0;
  const pairsToday = membership?.pairs_today || 0;
  const msgsToday = membership?.messages_today || 0;
  const cooldownUntil = membership?.cooldown_until;
  const lastPartner = membership?.last_partner_device_id;
  const lastError = membership?.last_error;
  const isEligible = membership?.is_eligible;
  const lastJob = membership?.last_job;
  const lastRejectReason = membership?.last_pair_reject_reason;
  const configType = membership?.config_type || "preset";
  const intensity = membership?.intensity || "medium";
  const dailyPairsMax = membership?.daily_pairs_max || 6;
  const targetMsgsPair = membership?.target_messages_per_pair || 120;

  const pairsTarget = mode === "community_only"
    ? { min: membership?.daily_pairs_min || 3, max: dailyPairsMax }
    : communityDay > 0 ? getPairsTarget(communityDay) : { min: 0, max: 0 };
  const inCooldown = cooldownUntil && new Date(cooldownUntil) > new Date();

  let statusColor = "bg-muted text-muted-foreground";
  let statusText = "Desabilitado";
  if (mode === "community_only" && membership?.is_enabled) {
    if (activeSession) {
      statusText = "Em sessão";
      statusColor = "bg-emerald-500/20 text-emerald-400";
    } else if (inCooldown) {
      statusText = "Em cooldown";
      statusColor = "bg-blue-500/20 text-blue-400";
    } else if (lastError) {
      statusText = "Erro";
      statusColor = "bg-destructive/20 text-destructive";
    } else {
      statusText = "Dedicado ativo";
      statusColor = "bg-purple-500/20 text-purple-400";
    }
  } else if (!isCommunityUnlocked) {
    statusText = `Desbloq. dia ${communityStartDay}`;
    statusColor = "bg-amber-500/20 text-amber-400";
  } else if (mode === "warmup_managed" && membership?.is_enabled) {
    if (activeSession) {
      statusText = "Em sessão";
      statusColor = "bg-emerald-500/20 text-emerald-400";
    } else if (inCooldown) {
      statusText = "Em cooldown";
      statusColor = "bg-blue-500/20 text-blue-400";
    } else if (lastError) {
      statusText = "Erro";
      statusColor = "bg-destructive/20 text-destructive";
    } else {
      statusText = "Ativo";
      statusColor = "bg-emerald-500/20 text-emerald-400";
    }
  } else if (mode === "disabled") {
    statusText = "Aguardando";
  }

  const reasonLabels: Record<string, string> = {
    device_disconnected: "Desconectado",
    cooldown_active: "Em cooldown",
    daily_limit_reached: "Limite diário",
    session_active: "Em sessão",
    outside_window: "Fora do horário",
    no_active_cycle: "Sem ciclo ativo",
    warmup_day_too_early: "Dia insuficiente",
    community_day_not_started: "Com. não iniciado",
    pairs_limit_reached: "Limite de duplas",
    no_candidates: "Sem candidatos",
    all_partners_blocked: "Parceiros bloqueados",
    spacing_block: "Espaçamento",
    same_pair_repeated_today: "Par repetido",
    device_not_configured: "Não configurado",
  };

  return (
    <Card className="border-border/50 bg-card/50">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-foreground">Diagnóstico Comunitário</span>
          </div>
          <Badge className={statusColor}>{statusText}</Badge>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {mode === "warmup_managed" && cycle && (
            <>
              <div className="space-y-1">
                <div className="text-muted-foreground">Tipo do chip</div>
                <div className="font-medium text-foreground">{chipLabels[chipState] || chipState}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Dia do aquecimento</div>
                <div className="font-medium text-foreground">{cycle.day_index || 1}/30</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Dia do comunitário</div>
                <div className="font-medium text-foreground">
                  {communityDay > 0 ? communityDay : isCommunityUnlocked ? "Aguardando reset" : `Começa dia ${communityStartDay}`}
                </div>
              </div>
            </>
          )}
          {mode === "community_only" && (
            <>
              <div className="space-y-1">
                <div className="text-muted-foreground">Configuração</div>
                <div className="font-medium text-foreground">{configType === "preset" ? `Preset: ${intensity}` : "Customizado"}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Meta por bloco</div>
                <div className="font-medium text-foreground">{targetMsgsPair} msgs</div>
              </div>
            </>
          )}
          <div className="space-y-1">
            <div className="text-muted-foreground">Modo</div>
            <div className="font-medium text-foreground">
              {mode === "warmup_managed" ? "Aquecimento" : mode === "community_only" ? "Dedicado" : "—"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Users className="w-3 h-3" /> Duplas hoje
            </div>
            <div className="font-medium text-foreground">
              {pairsToday} / {pairsTarget.min}–{pairsTarget.max}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <MessageSquare className="w-3 h-3" /> Msgs hoje
            </div>
            <div className="font-medium text-foreground">{msgsToday}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Elegível</div>
            <div className="font-medium flex items-center gap-1">
              {isEligible ? (
                <><CheckCircle2 className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Sim</span></>
              ) : (
                <><AlertTriangle className="w-3 h-3 text-amber-400" /><span className="text-amber-400">Não</span></>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3 h-3" /> Cooldown
            </div>
            <div className="font-medium text-foreground">
              {inCooldown
                ? formatDistanceToNow(new Date(cooldownUntil), { locale: ptBR, addSuffix: false })
                : "—"}
            </div>
          </div>
        </div>

        {/* Block reason */}
        {!isEligible && lastRejectReason && (
          <div className="flex items-start gap-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
            <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>Bloqueio: {reasonLabels[lastRejectReason] || lastRejectReason}</span>
          </div>
        )}

        {/* Active Session Block */}
        {activeSession && (
          <div className="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Play className="w-3 h-3" /> Sessão Ativa
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Progresso</div>
                <div className="font-medium text-foreground flex items-center gap-1">
                  <Target className="w-3 h-3 text-emerald-400" />
                  {activeSession.messages_total}/{activeSession.target_messages}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Distribuição</div>
                <div className="font-medium text-foreground">
                  A: {activeSession.messages_sent_a} · B: {activeSession.messages_sent_b}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Parceiro</div>
                <div className="font-mono text-foreground">
                  {(activeSession.device_a === deviceId ? activeSession.device_b : activeSession.device_a)?.substring(0, 8)}…
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Último envio</div>
                <div className="text-foreground">
                  {activeSession.last_message_at
                    ? formatDistanceToNow(new Date(activeSession.last_message_at), { locale: ptBR, addSuffix: true })
                    : "—"}
                </div>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (activeSession.messages_total / activeSession.target_messages) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Active Pairs */}
        {!activeSession && activePairs.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Duplas ativas ({activePairs.length})</div>
            <div className="flex flex-wrap gap-1">
              {activePairs.map((p: any) => {
                const peerId = p.instance_id_a === deviceId ? p.instance_id_b : p.instance_id_a;
                return (
                  <Badge key={p.id} variant="outline" className="text-[10px] font-mono">
                    {peerId.substring(0, 8)}… {p.messages_total}/{p.target_messages || 120}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <History className="w-3 h-3" /> Sessões recentes
            </div>
            <div className="space-y-1">
              {recentSessions.map((s: any) => {
                const peerId = s.device_a === deviceId ? s.device_b : s.device_a;
                const isComplete = s.end_reason === "target_reached";
                return (
                  <div key={s.id} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-muted/30">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isComplete ? "bg-emerald-400" : s.status === "active" ? "bg-blue-400" : "bg-amber-400"}`} />
                      <span className="font-mono text-foreground">{peerId?.substring(0, 8)}…</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{s.messages_total}/{s.target_messages}</span>
                      <span>{s.end_reason || s.status}</span>
                      {s.started_at && (
                        <span>{formatDistanceToNow(new Date(s.started_at), { locale: ptBR, addSuffix: true })}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Audit */}
        {recentAudit.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangle className="w-3 h-3" /> Log recente
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {recentAudit.map((log: any) => (
                <div key={log.id} className="flex items-start gap-1.5 text-[10px] px-2 py-1 rounded bg-muted/30">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                    log.level === "error" ? "bg-red-400" : log.level === "warn" ? "bg-amber-400" : "bg-teal-400"
                  }`} />
                  <span className="text-foreground truncate">{log.message}</span>
                  <span className="text-muted-foreground shrink-0 ml-auto">
                    {formatDistanceToNow(new Date(log.created_at), { locale: ptBR, addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last Error */}
        {lastError && (
          <div className="flex items-start gap-1.5 p-2 rounded bg-destructive/10 text-destructive text-xs">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="break-all">{lastError}</span>
          </div>
        )}

        {/* Last Partner + Job */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            {lastPartner && !activeSession && (
              <span>Último parceiro: <span className="font-mono text-foreground">{lastPartner.substring(0, 8)}…</span></span>
            )}
          </div>
          {lastJob && (
            <span className="text-[10px]">Job: {lastJob}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
