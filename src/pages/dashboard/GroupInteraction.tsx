import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useGroupInteraction, type GroupInteraction } from "@/hooks/useGroupInteraction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Play, Pause, Square, Plus, Trash2, Copy, Save, MessageCircle, Clock,
  Users, Settings, RotateCw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import GIStatusPanel from "@/components/group-interaction/GIStatusPanel";
import GIContentConfig from "@/components/group-interaction/GIContentConfig";
import GILogs from "@/components/group-interaction/GILogs";
import GIPresets from "@/components/group-interaction/GIPresets";

const DAYS = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

const defaultContentTypes = { text: true, image: false, audio: false, sticker: false };

const defaultForm: Partial<GroupInteraction> & Record<string, any> = {
  name: "Interação de Grupos",
  group_ids: [],
  device_id: null,
  min_delay_seconds: 40,
  max_delay_seconds: 120,
  pause_after_messages_min: 5,
  pause_after_messages_max: 10,
  pause_duration_min: 180,
  pause_duration_max: 420,
  messages_per_cycle_min: 10,
  messages_per_cycle_max: 25,
  duration_hours: 8,
  duration_minutes: 0,
  start_hour: "07:00",
  end_hour: "21:00",
  active_days: ["mon", "tue", "wed", "thu", "fri"],
  daily_limit_per_group: 30,
  daily_limit_total: 150,
  content_types: defaultContentTypes,
  preset_name: "moderate",
};

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

export default function GroupInteractionPage() {
  const { user } = useAuth();
  const {
    interactions, isLoading, logs,
    createInteraction, updateInteraction, deleteInteraction, invokeAction,
  } = useGroupInteraction();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState("config");
  const [form, setForm] = useState<Record<string, any>>({ ...defaultForm });

  const { data: devices = [] } = useQuery({
    queryKey: ["devices-gi", user?.id],
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

  const { data: warmupGroups = [] } = useQuery({
    queryKey: ["warmup-groups-gi", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("warmup_groups" as any)
        .select("id, name, link")
        .eq("user_id", user.id)
        .order("name");
      return data || [];
    },
    enabled: !!user,
  });

  const selected = useMemo(
    () => interactions.find((i) => i.id === selectedId) || null,
    [interactions, selectedId]
  );

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
        content_types: (selected as any).content_types || defaultContentTypes,
        preset_name: (selected as any).preset_name || "custom",
      });
    }
  }, [selected]);

  const updateForm = useCallback((patch: Record<string, any>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const toggleDay = useCallback((day: string) => {
    setForm((f) => {
      const days = f.active_days || [];
      return {
        ...f,
        active_days: days.includes(day) ? days.filter((d: string) => d !== day) : [...days, day],
      };
    });
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setForm((f) => {
      const ids = f.group_ids || [];
      return {
        ...f,
        group_ids: ids.includes(groupId) ? ids.filter((g: string) => g !== groupId) : [...ids, groupId],
      };
    });
  }, []);

  const validate = (): string | null => {
    if (!form.device_id) return "Selecione um dispositivo";
    if (!form.group_ids?.length) return "Selecione pelo menos um grupo";
    if (!form.start_hour || !form.end_hour) return "Defina os horários";
    if (form.min_delay_seconds > form.max_delay_seconds) return "Delay mínimo não pode ser maior que o máximo";
    if (form.pause_duration_min > form.pause_duration_max) return "Pausa mínima não pode ser maior que a máxima";
    const ct = form.content_types || defaultContentTypes;
    if (!Object.values(ct).some(Boolean)) return "Ative pelo menos um tipo de conteúdo";
    return null;
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) return toast.error(err);
    await createInteraction.mutateAsync(form as any);
    setShowConfig(false);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    const err = validate();
    if (err) return toast.error(err);
    await updateInteraction.mutateAsync({ id: selectedId, ...form } as any);
    toast.success("Configuração salva");
  };

  const handleDuplicate = async () => {
    if (!selectedId) return;
    const { id, created_at, updated_at, started_at, completed_at, total_messages_sent, status, ...rest } = form;
    await createInteraction.mutateAsync({ ...rest, name: `${form.name} (cópia)`, status: "idle" } as any);
    toast.success("Automação duplicada");
  };

  const handleAction = (action: string) => {
    if (!selectedId) return;
    if (action === "start") {
      const err = validate();
      if (err) return toast.error(err);
    }
    invokeAction.mutate({ interactionId: selectedId, action });
  };

  const selectedLogs = useMemo(
    () => (selectedId ? logs.filter((l) => l.interaction_id === selectedId) : []),
    [logs, selectedId]
  );

  const selectedDevice = devices.find((d: any) => d.id === form.device_id);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" />
            Interação de Grupos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automatize interações em grupos com naturalidade e variedade de conteúdo
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedId(null);
            setForm({ ...defaultForm });
            setShowConfig(true);
            setActiveTab("config");
          }}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Nova Automação
        </Button>
      </div>

      {/* Campaign list with pause/cancel controls */}
      {interactions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Campanhas ({interactions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {interactions.map((inter) => (
                <div
                  key={inter.id}
                  className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer ${
                    selectedId === inter.id ? "bg-muted/40" : ""
                  }`}
                  onClick={() => {
                    setSelectedId(inter.id);
                    setShowConfig(true);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{inter.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {(inter.group_ids || []).length} grupos · {inter.total_messages_sent} msgs enviadas
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${statusColors[inter.status] || ""}`}>
                      {statusLabels[inter.status] || inter.status}
                    </Badge>
                    {inter.status === "running" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          invokeAction.mutate({ interactionId: inter.id, action: "pause" });
                        }}
                      >
                        <Pause className="w-3 h-3" /> Pausar
                      </Button>
                    )}
                    {inter.status === "paused" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          invokeAction.mutate({ interactionId: inter.id, action: "start" });
                        }}
                      >
                        <Play className="w-3 h-3" /> Retomar
                      </Button>
                    )}
                    {(inter.status === "running" || inter.status === "paused") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          invokeAction.mutate({ interactionId: inter.id, action: "stop" });
                        }}
                      >
                        <Square className="w-3 h-3" /> Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main content - full width */}
      <div className="space-y-4">
          {showConfig ? (
            <>
              {/* Controls bar */}
              {selectedId && (
                <>
                  <GIStatusPanel interaction={selected!} />
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
                      onClick={() => handleAction(selected?.status === "paused" ? "start" : "stop")}
                      disabled={selected?.status === "idle"}
                      className="gap-1.5"
                    >
                      {selected?.status === "paused" ? (
                        <><RotateCw className="w-3.5 h-3.5" /> Retomar</>
                      ) : (
                        <><Square className="w-3.5 h-3.5" /> Parar</>
                      )}
                    </Button>
                    <div className="ml-auto flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={handleDuplicate} className="gap-1">
                        <Copy className="w-3.5 h-3.5" /> Duplicar
                      </Button>
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
                </>
              )}

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="config" className="gap-1 text-xs">
                    <Settings className="w-3.5 h-3.5" /> Configurações
                  </TabsTrigger>
                  <TabsTrigger value="content" className="gap-1 text-xs">
                    <MessageCircle className="w-3.5 h-3.5" /> Conteúdo
                  </TabsTrigger>
                  <TabsTrigger value="logs" className="gap-1 text-xs">
                    <Clock className="w-3.5 h-3.5" /> Logs
                  </TabsTrigger>
                </TabsList>

                {/* Config Tab */}
                <TabsContent value="config" className="space-y-4 mt-4">
                  {/* Presets */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Presets rápidos</Label>
                    <GIPresets
                      current={form.preset_name}
                      onApply={(vals) => updateForm({ ...vals })}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Identification */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Identificação</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <Label className="text-xs">Nome da automação</Label>
                          <Input
                            value={form.name || ""}
                            onChange={(e) => updateForm({ name: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Dispositivo</Label>
                          <Select
                            value={form.device_id || ""}
                            onValueChange={(v) => updateForm({ device_id: v })}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Selecionar dispositivo" />
                            </SelectTrigger>
                            <SelectContent>
                              {devices.map((d: any) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.name} {d.number ? `(${d.number})` : ""} {d.status === "connected" ? "🟢" : "🔴"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedDevice && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className={`w-2 h-2 rounded-full ${
                                (selectedDevice as any).status === "connected" ? "bg-emerald-500" : "bg-muted-foreground/40"
                              }`} />
                              <span className="text-[11px] text-muted-foreground capitalize">
                                {(selectedDevice as any).status}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Schedule */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" /> Horários
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Início</Label>
                            <Input
                              type="time"
                              value={form.start_hour || "07:00"}
                              onChange={(e) => updateForm({ start_hour: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Término</Label>
                            <Input
                              type="time"
                              value={form.end_hour || "21:00"}
                              onChange={(e) => updateForm({ end_hour: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Dias da semana</Label>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {DAYS.map((d) => (
                              <button
                                key={d.key}
                                onClick={() => toggleDay(d.key)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                                  (form.active_days || []).includes(d.key)
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/60"
                                }`}
                              >
                                {d.label}
                              </button>
                            ))}
                            <button
                              onClick={() =>
                                updateForm({
                                  active_days:
                                    (form.active_days || []).length === 7
                                      ? ["mon", "tue", "wed", "thu", "fri"]
                                      : DAYS.map((d) => d.key),
                                })
                              }
                              className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-dashed border-border text-muted-foreground hover:bg-muted/40"
                            >
                              {(form.active_days || []).length === 7 ? "Dias úteis" : "Todos"}
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Groups */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Grupos ({(form.group_ids || []).length} selecionados)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto border border-border/50 rounded-lg p-2">
                        {warmupGroups.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-2 col-span-full">
                            Nenhum grupo cadastrado. Adicione grupos em Aquecimento &gt; Grupos.
                          </p>
                        ) : (
                          warmupGroups.map((g: any) => (
                            <label key={g.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer">
                              <Checkbox
                                checked={(form.group_ids || []).includes(g.link || g.id)}
                                onCheckedChange={() => toggleGroup(g.link || g.id)}
                              />
                              <span className="text-xs truncate">{g.name}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Delays & Limits */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Delays e Pausas</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Delay mín. (seg)</Label>
                            <Input type="number" value={form.min_delay_seconds} onChange={(e) => updateForm({ min_delay_seconds: +e.target.value })} className="mt-1" min={5} />
                          </div>
                          <div>
                            <Label className="text-xs">Delay máx. (seg)</Label>
                            <Input type="number" value={form.max_delay_seconds} onChange={(e) => updateForm({ max_delay_seconds: +e.target.value })} className="mt-1" min={10} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Msgs antes da pausa (mín)</Label>
                            <Input type="number" value={form.pause_after_messages_min} onChange={(e) => updateForm({ pause_after_messages_min: +e.target.value })} className="mt-1" min={2} />
                          </div>
                          <div>
                            <Label className="text-xs">Msgs antes da pausa (máx)</Label>
                            <Input type="number" value={form.pause_after_messages_max} onChange={(e) => updateForm({ pause_after_messages_max: +e.target.value })} className="mt-1" min={3} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Pausa mín. (seg)</Label>
                            <Input type="number" value={form.pause_duration_min} onChange={(e) => updateForm({ pause_duration_min: +e.target.value })} className="mt-1" min={30} />
                          </div>
                          <div>
                            <Label className="text-xs">Pausa máx. (seg)</Label>
                            <Input type="number" value={form.pause_duration_max} onChange={(e) => updateForm({ pause_duration_max: +e.target.value })} className="mt-1" min={60} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Limites</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Msgs por ciclo (mín)</Label>
                            <Input type="number" value={form.messages_per_cycle_min} onChange={(e) => updateForm({ messages_per_cycle_min: +e.target.value })} className="mt-1" min={1} />
                          </div>
                          <div>
                            <Label className="text-xs">Msgs por ciclo (máx)</Label>
                            <Input type="number" value={form.messages_per_cycle_max} onChange={(e) => updateForm({ messages_per_cycle_max: +e.target.value })} className="mt-1" min={2} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Limite diário/grupo</Label>
                            <Input type="number" value={form.daily_limit_per_group} onChange={(e) => updateForm({ daily_limit_per_group: +e.target.value })} className="mt-1" min={1} />
                          </div>
                          <div>
                            <Label className="text-xs">Limite diário total</Label>
                            <Input type="number" value={form.daily_limit_total} onChange={(e) => updateForm({ daily_limit_total: +e.target.value })} className="mt-1" min={1} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Duração (horas)</Label>
                            <Input type="number" value={form.duration_hours} onChange={(e) => updateForm({ duration_hours: +e.target.value })} className="mt-1" min={0} />
                          </div>
                          <div>
                            <Label className="text-xs">Minutos adicionais</Label>
                            <Input type="number" value={form.duration_minutes} onChange={(e) => updateForm({ duration_minutes: +e.target.value })} className="mt-1" min={0} max={59} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Save */}
                  <div className="flex gap-2 pt-2">
                    {selectedId ? (
                      <Button onClick={handleSave} className="flex-1 gap-2">
                        <Save className="w-4 h-4" /> Salvar alterações
                      </Button>
                    ) : (
                      <Button onClick={handleCreate} className="flex-1 gap-2">
                        <Plus className="w-4 h-4" /> Criar automação
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => { setShowConfig(false); setSelectedId(null); }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </TabsContent>

                {/* Content Config Tab */}
                <TabsContent value="content" className="mt-4">
                  <Card className="mb-4">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">
                        💡 As mensagens de texto, áudios, imagens e figurinhas são geradas automaticamente pelo sistema com milhares de variações únicas, incluindo números aleatórios, para garantir que nenhuma instância envie a mesma mensagem.
                      </p>
                    </CardContent>
                  </Card>
                  <GIContentConfig
                    contentTypes={form.content_types || defaultContentTypes}
                    onChange={(types) => updateForm({ content_types: types })}
                  />
                  {selectedId && (
                    <div className="mt-3">
                      <Button onClick={handleSave} className="gap-2">
                        <Save className="w-4 h-4" /> Salvar
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* Logs Tab */}
                <TabsContent value="logs" className="mt-4">
                  <GILogs logs={selectedLogs} />
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center text-muted-foreground">
                <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Selecione uma automação ou crie uma nova</p>
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}
