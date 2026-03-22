import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useGroupInteraction, GroupInteraction } from "@/hooks/useGroupInteraction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  MessageCircle,
  Clock,
  Users,
  Activity,
  Settings,
  ScrollText,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const DAYS = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

export default function GroupInteractionPage() {
  const { user } = useAuth();
  const {
    interactions,
    isLoading,
    logs,
    createInteraction,
    updateInteraction,
    deleteInteraction,
    invokeAction,
  } = useGroupInteraction();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [form, setForm] = useState<Partial<GroupInteraction>>({
    name: "Interação de Grupos",
    group_ids: [],
    device_id: null,
    min_delay_seconds: 15,
    max_delay_seconds: 60,
    pause_after_messages_min: 4,
    pause_after_messages_max: 8,
    pause_duration_min: 120,
    pause_duration_max: 300,
    messages_per_cycle_min: 10,
    messages_per_cycle_max: 30,
    duration_hours: 1,
    duration_minutes: 0,
    start_hour: "08:00",
    end_hour: "18:00",
    active_days: ["mon", "tue", "wed", "thu", "fri"],
    daily_limit_per_group: 50,
    daily_limit_total: 200,
  });

  // Fetch user devices
  const { data: devices = [] } = useQuery({
    queryKey: ["devices-for-group-interaction", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .eq("user_id", user.id)
        .order("name");
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch warmup groups for group selection
  const { data: warmupGroups = [] } = useQuery({
    queryKey: ["warmup-groups-for-interaction", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("warmup_groups")
        .select("id, name, link")
        .eq("user_id", user.id)
        .order("name");
      return data || [];
    },
    enabled: !!user,
  });

  const selected = interactions.find((i) => i.id === selectedId) || null;

  useEffect(() => {
    if (selected) {
      setForm({
        name: selected.name,
        group_ids: selected.group_ids,
        device_id: selected.device_id,
        min_delay_seconds: selected.min_delay_seconds,
        max_delay_seconds: selected.max_delay_seconds,
        pause_after_messages_min: selected.pause_after_messages_min,
        pause_after_messages_max: selected.pause_after_messages_max,
        pause_duration_min: selected.pause_duration_min,
        pause_duration_max: selected.pause_duration_max,
        messages_per_cycle_min: selected.messages_per_cycle_min,
        messages_per_cycle_max: selected.messages_per_cycle_max,
        duration_hours: selected.duration_hours,
        duration_minutes: selected.duration_minutes,
        start_hour: selected.start_hour,
        end_hour: selected.end_hour,
        active_days: selected.active_days,
        daily_limit_per_group: selected.daily_limit_per_group,
        daily_limit_total: selected.daily_limit_total,
      });
    }
  }, [selected]);

  const handleCreate = async () => {
    await createInteraction.mutateAsync(form);
    setShowConfig(false);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    await updateInteraction.mutateAsync({ id: selectedId, ...form });
  };

  const handleAction = (action: string) => {
    if (!selectedId) return;
    invokeAction.mutate({ interactionId: selectedId, action });
  };

  const toggleDay = (day: string) => {
    const days = form.active_days || [];
    setForm({
      ...form,
      active_days: days.includes(day)
        ? days.filter((d) => d !== day)
        : [...days, day],
    });
  };

  const toggleGroup = (groupId: string) => {
    const ids = form.group_ids || [];
    setForm({
      ...form,
      group_ids: ids.includes(groupId)
        ? ids.filter((g) => g !== groupId)
        : [...ids, groupId],
    });
  };

  const selectedLogs = selectedId
    ? logs.filter((l) => l.interaction_id === selectedId)
    : [];

  const statusColors: Record<string, string> = {
    idle: "bg-muted text-muted-foreground",
    running: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    completed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };

  const statusLabels: Record<string, string> = {
    idle: "Inativo",
    running: "Rodando",
    paused: "Pausado",
    completed: "Concluído",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" />
            Interação entre Grupos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automatize interações entre seus grupos autorizados com naturalidade
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedId(null);
            setShowConfig(true);
          }}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Nova Automação
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: List */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Automações
          </h3>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : interactions.length === 0 && !showConfig ? (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                Nenhuma automação criada.
                <br />
                Clique em "Nova Automação" para começar.
              </CardContent>
            </Card>
          ) : (
            interactions.map((inter) => (
              <Card
                key={inter.id}
                className={`cursor-pointer transition-all hover:border-primary/40 ${
                  selectedId === inter.id ? "border-primary ring-1 ring-primary/20" : ""
                }`}
                onClick={() => {
                  setSelectedId(inter.id);
                  setShowConfig(true);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{inter.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(inter.group_ids || []).length} grupos · {inter.total_messages_sent} msgs
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${statusColors[inter.status] || ""}`}>
                      {statusLabels[inter.status] || inter.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Right: Config + Logs */}
        <div className="lg:col-span-2 space-y-4">
          {showConfig && (
            <>
              {/* Controls */}
              {selectedId && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => handleAction("start")}
                    disabled={selected?.status === "running"}
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Play className="w-3.5 h-3.5" /> Iniciar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction("pause")}
                    disabled={selected?.status !== "running"}
                    className="gap-1.5"
                  >
                    <Pause className="w-3.5 h-3.5" /> Pausar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction("stop")}
                    disabled={selected?.status === "idle"}
                    className="gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5" /> Parar
                  </Button>
                  <div className="ml-auto flex items-center gap-2">
                    <Badge variant="outline" className={statusColors[selected?.status || "idle"]}>
                      <Activity className="w-3 h-3 mr-1" />
                      {statusLabels[selected?.status || "idle"]}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        deleteInteraction.mutate(selectedId);
                        setSelectedId(null);
                        setShowConfig(false);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Config Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary" />
                    Configurações
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Name */}
                  <div>
                    <Label className="text-xs">Nome da automação</Label>
                    <Input
                      value={form.name || ""}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  {/* Device */}
                  <div>
                    <Label className="text-xs">Dispositivo para envio</Label>
                    <Select
                      value={form.device_id || ""}
                      onValueChange={(v) => setForm({ ...form, device_id: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecionar dispositivo" />
                      </SelectTrigger>
                      <SelectContent>
                        {devices.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name} {d.number ? `(${d.number})` : ""} — {d.status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Groups */}
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> Grupos participantes
                    </Label>
                    <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto border border-border rounded-lg p-2">
                      {warmupGroups.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-2">Nenhum grupo cadastrado. Adicione grupos em Aquecimento &gt; Grupos.</p>
                      ) : (
                        warmupGroups.map((g: any) => (
                          <label key={g.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer">
                            <Checkbox
                              checked={(form.group_ids || []).includes(g.link || g.id)}
                              onCheckedChange={() => toggleGroup(g.link || g.id)}
                            />
                            <span className="text-sm truncate">{g.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {(form.group_ids || []).length} grupos selecionados
                    </p>
                  </div>

                  {/* Delays */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Delay mín. (seg)</Label>
                      <Input
                        type="number"
                        value={form.min_delay_seconds || 15}
                        onChange={(e) => setForm({ ...form, min_delay_seconds: +e.target.value })}
                        className="mt-1"
                        min={5}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Delay máx. (seg)</Label>
                      <Input
                        type="number"
                        value={form.max_delay_seconds || 60}
                        onChange={(e) => setForm({ ...form, max_delay_seconds: +e.target.value })}
                        className="mt-1"
                        min={10}
                      />
                    </div>
                  </div>

                  {/* Pause config */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Pausa após (mín msgs)</Label>
                      <Input
                        type="number"
                        value={form.pause_after_messages_min || 4}
                        onChange={(e) => setForm({ ...form, pause_after_messages_min: +e.target.value })}
                        className="mt-1"
                        min={2}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Pausa após (máx msgs)</Label>
                      <Input
                        type="number"
                        value={form.pause_after_messages_max || 8}
                        onChange={(e) => setForm({ ...form, pause_after_messages_max: +e.target.value })}
                        className="mt-1"
                        min={3}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Duração pausa mín (seg)</Label>
                      <Input
                        type="number"
                        value={form.pause_duration_min || 120}
                        onChange={(e) => setForm({ ...form, pause_duration_min: +e.target.value })}
                        className="mt-1"
                        min={30}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Duração pausa máx (seg)</Label>
                      <Input
                        type="number"
                        value={form.pause_duration_max || 300}
                        onChange={(e) => setForm({ ...form, pause_duration_max: +e.target.value })}
                        className="mt-1"
                        min={60}
                      />
                    </div>
                  </div>

                  {/* Messages per cycle */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Msgs por ciclo (mín)</Label>
                      <Input
                        type="number"
                        value={form.messages_per_cycle_min || 10}
                        onChange={(e) => setForm({ ...form, messages_per_cycle_min: +e.target.value })}
                        className="mt-1"
                        min={1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Msgs por ciclo (máx)</Label>
                      <Input
                        type="number"
                        value={form.messages_per_cycle_max || 30}
                        onChange={(e) => setForm({ ...form, messages_per_cycle_max: +e.target.value })}
                        className="mt-1"
                        min={2}
                      />
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Duração (horas)
                      </Label>
                      <Input
                        type="number"
                        value={form.duration_hours || 1}
                        onChange={(e) => setForm({ ...form, duration_hours: +e.target.value })}
                        className="mt-1"
                        min={0}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Minutos adicionais</Label>
                      <Input
                        type="number"
                        value={form.duration_minutes || 0}
                        onChange={(e) => setForm({ ...form, duration_minutes: +e.target.value })}
                        className="mt-1"
                        min={0}
                        max={59}
                      />
                    </div>
                  </div>

                  {/* Schedule */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Horário início</Label>
                      <Input
                        type="time"
                        value={form.start_hour || "08:00"}
                        onChange={(e) => setForm({ ...form, start_hour: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Horário término</Label>
                      <Input
                        type="time"
                        value={form.end_hour || "18:00"}
                        onChange={(e) => setForm({ ...form, end_hour: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* Daily limits */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Limite diário/grupo</Label>
                      <Input
                        type="number"
                        value={form.daily_limit_per_group || 50}
                        onChange={(e) => setForm({ ...form, daily_limit_per_group: +e.target.value })}
                        className="mt-1"
                        min={1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Limite diário total</Label>
                      <Input
                        type="number"
                        value={form.daily_limit_total || 200}
                        onChange={(e) => setForm({ ...form, daily_limit_total: +e.target.value })}
                        className="mt-1"
                        min={1}
                      />
                    </div>
                  </div>

                  {/* Days of week */}
                  <div>
                    <Label className="text-xs">Dias da semana</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {DAYS.map((d) => (
                        <button
                          key={d.key}
                          onClick={() => toggleDay(d.key)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            (form.active_days || []).includes(d.key)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/60"
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {selectedId ? (
                      <Button onClick={handleSave} className="flex-1">
                        Salvar alterações
                      </Button>
                    ) : (
                      <Button onClick={handleCreate} className="flex-1">
                        Criar automação
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowConfig(false);
                        setSelectedId(null);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Logs */}
              {selectedId && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ScrollText className="w-4 h-4 text-primary" />
                      Histórico de execução
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum log registrado ainda
                      </p>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {selectedLogs.map((log) => (
                            <div
                              key={log.id}
                              className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/50"
                            >
                              <div
                                className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                  log.status === "sent" ? "bg-emerald-500" : "bg-red-500"
                                }`}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground">
                                  {new Date(log.sent_at).toLocaleString("pt-BR")} ·{" "}
                                  <span className="capitalize">{log.message_category}</span> ·{" "}
                                  Grupo: {log.group_name || log.group_id?.slice(0, 12)}
                                </p>
                                <p className="text-sm mt-0.5 truncate">{log.message_content}</p>
                                {log.error_message && (
                                  <p className="text-xs text-red-400 mt-0.5">{log.error_message}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!showConfig && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center text-muted-foreground">
                <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Selecione uma automação ou crie uma nova</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
