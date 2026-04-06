import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  MessageSquarePlus,
  Clock,
  Hourglass,
  Save,
  Loader2,
  Zap,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AutomationConfig {
  id?: string;
  welcome_enabled: boolean;
  welcome_message: string;
  followup_enabled: boolean;
  followup_minutes: number;
  followup_message: string;
  awaiting_enabled: boolean;
  awaiting_message: string;
  awaiting_delay_minutes: number;
}

interface AutomationLog {
  id: string;
  automation_type: string;
  message_sent: string;
  triggered_at: string;
  status: string;
  error_message: string | null;
}

const defaultConfig: AutomationConfig = {
  welcome_enabled: false,
  welcome_message: "Olá! Como posso te ajudar? 😊",
  followup_enabled: false,
  followup_minutes: 30,
  followup_message: "Oi! Vi que não tivemos retorno. Posso ajudar em algo?",
  awaiting_enabled: false,
  awaiting_message: "Estamos analisando sua solicitação e retornaremos em breve!",
  awaiting_delay_minutes: 5,
};

export function AutomationFlows() {
  const { user } = useAuth();
  const [config, setConfig] = useState<AutomationConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("conversation_automations")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setConfig({
        id: data.id,
        welcome_enabled: data.welcome_enabled,
        welcome_message: data.welcome_message,
        followup_enabled: data.followup_enabled,
        followup_minutes: data.followup_minutes,
        followup_message: data.followup_message,
        awaiting_enabled: data.awaiting_enabled,
        awaiting_message: data.awaiting_message,
        awaiting_delay_minutes: data.awaiting_delay_minutes,
      });
    }
    setLoading(false);
  }, [user]);

  const fetchLogs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("conversation_automation_logs")
      .select("id, automation_type, message_sent, triggered_at, status, error_message")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setLogs((data as AutomationLog[]) || []);
  }, [user]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  useEffect(() => { if (showLogs) fetchLogs(); }, [showLogs, fetchLogs]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      welcome_enabled: config.welcome_enabled,
      welcome_message: config.welcome_message,
      followup_enabled: config.followup_enabled,
      followup_minutes: config.followup_minutes,
      followup_message: config.followup_message,
      awaiting_enabled: config.awaiting_enabled,
      awaiting_message: config.awaiting_message,
      awaiting_delay_minutes: config.awaiting_delay_minutes,
    };

    const { error } = config.id
      ? await supabase.from("conversation_automations").update(payload).eq("id", config.id)
      : await supabase.from("conversation_automations").insert(payload);

    if (error) {
      toast.error("Erro ao salvar automações");
      console.error(error);
    } else {
      toast.success("Automações salvas com sucesso!");
      if (!config.id) fetchConfig();
    }
    setSaving(false);
  };

  const update = (patch: Partial<AutomationConfig>) => setConfig((prev) => ({ ...prev, ...patch }));

  const typeLabel: Record<string, string> = {
    welcome: "Boas-vindas",
    followup: "Follow-up",
    awaiting: "Aguardando",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Fluxos Automáticos</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowLogs(!showLogs)} className="gap-1.5 text-xs">
            <History className="w-3.5 h-3.5" />
            Histórico
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Automation Cards */}
      <div className="space-y-4">
        {/* Welcome */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <MessageSquarePlus className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Nova Conversa</p>
                <p className="text-[11px] text-muted-foreground">Mensagem automática ao receber primeira mensagem</p>
              </div>
            </div>
            <Switch checked={config.welcome_enabled} onCheckedChange={(v) => update({ welcome_enabled: v })} />
          </div>
          {config.welcome_enabled && (
            <Textarea
              value={config.welcome_message}
              onChange={(e) => update({ welcome_message: e.target.value })}
              placeholder="Mensagem de boas-vindas..."
              className="text-sm min-h-[60px]"
            />
          )}
        </Card>

        {/* Follow-up */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Sem Resposta</p>
                <p className="text-[11px] text-muted-foreground">Follow-up automático após inatividade</p>
              </div>
            </div>
            <Switch checked={config.followup_enabled} onCheckedChange={(v) => update({ followup_enabled: v })} />
          </div>
          {config.followup_enabled && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Após</span>
                <Input
                  type="number"
                  min={5}
                  max={1440}
                  value={config.followup_minutes}
                  onChange={(e) => update({ followup_minutes: Math.max(5, parseInt(e.target.value) || 30) })}
                  className="w-20 h-8 text-sm"
                />
                <span className="text-xs text-muted-foreground">minutos</span>
              </div>
              <Textarea
                value={config.followup_message}
                onChange={(e) => update({ followup_message: e.target.value })}
                placeholder="Mensagem de follow-up..."
                className="text-sm min-h-[60px]"
              />
            </div>
          )}
        </Card>

        {/* Awaiting */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Hourglass className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Status "Aguardando"</p>
                <p className="text-[11px] text-muted-foreground">Mensagem ao mudar para Aguardando</p>
              </div>
            </div>
            <Switch checked={config.awaiting_enabled} onCheckedChange={(v) => update({ awaiting_enabled: v })} />
          </div>
          {config.awaiting_enabled && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Atraso</span>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={config.awaiting_delay_minutes}
                  onChange={(e) => update({ awaiting_delay_minutes: Math.max(0, parseInt(e.target.value) || 5) })}
                  className="w-20 h-8 text-sm"
                />
                <span className="text-xs text-muted-foreground">minutos</span>
              </div>
              <Textarea
                value={config.awaiting_message}
                onChange={(e) => update({ awaiting_message: e.target.value })}
                placeholder="Mensagem quando aguardando..."
                className="text-sm min-h-[60px]"
              />
            </div>
          )}
        </Card>
      </div>

      {/* Logs */}
      {showLogs && (
        <Card className="p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Histórico de Automações</p>
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma automação disparada ainda</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 py-2 border-b border-border/30 last:border-0">
                  <div className={cn(
                    "w-2 h-2 rounded-full mt-1.5 shrink-0",
                    log.status === "sent" ? "bg-emerald-500" : "bg-destructive"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-foreground">
                        {typeLabel[log.automation_type] || log.automation_type}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(log.triggered_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{log.message_sent}</p>
                    {log.error_message && (
                      <p className="text-[10px] text-destructive">{log.error_message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
