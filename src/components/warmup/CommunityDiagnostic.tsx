import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Users, MessageSquare, Clock, AlertTriangle, CheckCircle2, Target, Play, History, XCircle, Settings2, Zap, Shield } from "lucide-react";
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
  mode_disabled: "Modo desabilitado",
};

const repeatPolicyLabels: Record<string, string> = {
  avoid_same_day: "Evitar no mesmo dia",
  strict_no_repeat: "Nunca repetir no dia",
  allow_repeat: "Permitir repetição",
};

const crossUserLabels: Record<string, string> = {
  prefer_cross: "Preferir outros clientes",
  balanced: "Equilibrado",
  prefer_own: "Preferir próprias",
};

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
        .select("id, device_id, community_mode, community_day, messages_today, pairs_today, daily_limit, cooldown_until, is_enabled")
        .eq("device_id", deviceId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!deviceId,
    refetchInterval: () => document.hidden ? false : 120_000,
    staleTime: 60_000,
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
    refetchInterval: () => document.hidden ? false : 60_000,
    staleTime: 30_000,
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
    refetchInterval: () => document.hidden ? false : 120_000,
    staleTime: 60_000,
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
    refetchInterval: () => document.hidden ? false : 120_000,
    staleTime: 60_000,
  });

  const mode = membership?.community_mode || "disabled";

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
  const lastRejectReason = membership?.last_pair_reject_reason;
  const configType = membership?.config_type || "preset";
  const intensity = membership?.intensity || "medium";
  const dailyPairsMax = membership?.daily_pairs_max || 6;
  const dailyPairsMin = membership?.daily_pairs_min || 3;
  const targetMsgsPair = membership?.target_messages_per_pair || 120;
  const cooldownMin = membership?.cooldown_min_minutes || 15;
  const cooldownMax = membership?.cooldown_max_minutes || 45;
  const partnerRepeatPolicy = membership?.partner_repeat_policy || "avoid_same_day";
  const crossUserPref = membership?.cross_user_preference || "balanced";
  const ownAccountsAllowed = membership?.own_accounts_allowed ?? true;
  const timeWindowStart = membership?.time_window_start || "07:00";
  const timeWindowEnd = membership?.time_window_end || "21:00";

  const pairsTarget = mode === "community_only"
    ? { min: dailyPairsMin, max: dailyPairsMax }
    : communityDay > 0 ? getPairsTarget(communityDay) : { min: 0, max: 0 };
  const inCooldown = cooldownUntil && new Date(cooldownUntil) > new Date();

  const isWarmup = mode === "warmup_managed";
  const isDedicated = mode === "community_only";

  let statusColor = "bg-muted text-muted-foreground";
  let statusText = "Desabilitado";
  let modeLabel = "—";
  let modeBorderColor = "border-border/50";

  if (isDedicated && membership?.is_enabled) {
    modeLabel = "Dedicado";
    modeBorderColor = "border-purple-500/40";
    if (activeSession) { statusText = "Em sessão"; statusColor = "bg-emerald-500/20 text-emerald-400"; }
    else if (inCooldown) { statusText = "Em cooldown"; statusColor = "bg-blue-500/20 text-blue-400"; }
    else if (lastError) { statusText = "Erro"; statusColor = "bg-destructive/20 text-destructive"; }
    else { statusText = "Dedicado ativo"; statusColor = "bg-purple-500/20 text-purple-400"; }
  } else if (isWarmup && membership?.is_enabled) {
    modeLabel = "Aquecimento";
    modeBorderColor = "border-teal-500/40";
    if (!isCommunityUnlocked) { statusText = `Desbloq. dia ${communityStartDay}`; statusColor = "bg-amber-500/20 text-amber-400"; }
    else if (activeSession) { statusText = "Em sessão"; statusColor = "bg-emerald-500/20 text-emerald-400"; }
    else if (inCooldown) { statusText = "Em cooldown"; statusColor = "bg-blue-500/20 text-blue-400"; }
    else if (lastError) { statusText = "Erro"; statusColor = "bg-destructive/20 text-destructive"; }
    else { statusText = "Ativo"; statusColor = "bg-emerald-500/20 text-emerald-400"; }
  } else if (mode === "disabled") {
    statusText = "Aguardando";
    modeLabel = "Desabilitado";
  }

  return (
    <Card className={`${modeBorderColor} bg-card/50`}>
      <CardContent className="p-4 space-y-3">
        {/* Header with mode badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-foreground">Diagnóstico Comunitário</span>
            <Badge variant="outline" className={`text-[10px] ${isDedicated ? "bg-purple-500/15 text-purple-400 border-purple-500/30" : isWarmup ? "bg-teal-500/15 text-teal-400 border-teal-500/30" : "bg-muted"}`}>
              {modeLabel}
            </Badge>
          </div>
          <Badge className={statusColor}>{statusText}</Badge>
        </div>

        {/* ═══ WARMUP_MANAGED section ═══ */}
        {isWarmup && cycle && (
          <div className="p-2.5 rounded-md bg-teal-500/5 border border-teal-500/15 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-400">
              <Shield className="w-3 h-3" /> Modo Aquecimento Automático
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Tipo do chip</div>
                <div className="font-medium text-foreground">{chipLabels[chipState] || chipState}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Dia do aquecimento</div>
                <div className="font-medium text-foreground">{cycle.day_index || 1}/30</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Dia do comunitário</div>
                <div className="font-medium text-foreground">
                  {communityDay > 0 ? communityDay : isCommunityUnlocked ? "Aguardando reset" : `Começa dia ${communityStartDay}`}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Início comunitário</div>
                <div className="font-medium text-foreground">Dia {communityStartDay}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Fase do ciclo</div>
                <div className="font-medium text-foreground">{cycle.phase}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Meta por bloco</div>
                <div className="font-medium text-foreground">~120 msgs</div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ COMMUNITY_ONLY section ═══ */}
        {isDedicated && (
          <div className="p-2.5 rounded-md bg-purple-500/5 border border-purple-500/15 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-400">
              <Zap className="w-3 h-3" /> Modo Dedicado / Avulso
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Configuração</div>
                <div className="font-medium text-foreground flex items-center gap-1">
                  <Settings2 className="w-3 h-3" />
                  {configType === "preset" ? `Preset: ${intensity}` : "Manual"}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Meta por bloco</div>
                <div className="font-medium text-foreground">{targetMsgsPair} msgs</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Limite de duplas</div>
                <div className="font-medium text-foreground">{dailyPairsMin}–{dailyPairsMax}/dia</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Cooldown</div>
                <div className="font-medium text-foreground">{cooldownMin}–{cooldownMax} min</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Janela de horário</div>
                <div className="font-medium text-foreground">{timeWindowStart}–{timeWindowEnd}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Contas próprias</div>
                <div className="font-medium text-foreground">{ownAccountsAllowed ? "Sim" : "Não"}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Cross-user</div>
                <div className="font-medium text-foreground">{crossUserLabels[crossUserPref] || crossUserPref}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Repetição de par</div>
                <div className="font-medium text-foreground">{repeatPolicyLabels[partnerRepeatPolicy] || partnerRepeatPolicy}</div>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground italic mt-1">
              Não depende de chip, aquecimento ou community_day
            </div>
          </div>
        )}

        {/* Shared metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Users className="w-3 h-3" /> Duplas hoje
            </div>
            <div className="font-medium text-foreground">
              {pairsToday} / {pairsTarget.min}–{pairsTarget.max}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <MessageSquare className="w-3 h-3" /> Msgs hoje
            </div>
            <div className="font-medium text-foreground">{msgsToday}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-muted-foreground">Elegível</div>
            <div className="font-medium flex items-center gap-1">
              {isEligible ? (
                <><CheckCircle2 className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Sim</span></>
              ) : (
                <><AlertTriangle className="w-3 h-3 text-amber-400" /><span className="text-amber-400">Não</span></>
              )}
            </div>
          </div>
          <div className="space-y-0.5">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <Play className="w-3 h-3" /> Sessão Ativa
              </div>
              <Badge variant="outline" className={`text-[10px] ${activeSession.community_mode === "community_only" ? "text-purple-400 border-purple-500/30" : "text-teal-400 border-teal-500/30"}`}>
                {activeSession.community_mode === "community_only" ? "Dedicado" : "Aquecimento"}
              </Badge>
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
                      <Badge variant="outline" className={`text-[8px] ${s.community_mode === "community_only" ? "text-purple-400" : "text-teal-400"}`}>
                        {s.community_mode === "community_only" ? "DED" : "WRM"}
                      </Badge>
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
          {membership?.last_job && (
            <span className="text-[10px]">Job: {membership.last_job}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
