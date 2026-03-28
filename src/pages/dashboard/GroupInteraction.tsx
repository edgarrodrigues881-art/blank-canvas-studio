import { useState, useEffect, useMemo, useCallback, Fragment, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useGroupInteraction, type GroupInteraction } from "@/hooks/useGroupInteraction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Play, Pause, Square, Plus, Trash2, Copy, Save, MessageCircle, Clock,
  Users, Settings, RotateCw, ArrowLeft, Layers,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import GIStatusPanel from "@/components/group-interaction/GIStatusPanel";
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

const CONNECTED_GROUP_DEVICE_STATUSES = new Set(["connected", "ready", "authenticated", "open", "online", "active"]);
const BLOCKED_GROUP_DEVICE_TYPES = new Set(["notificacao", "report", "report_wa"]);

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
  start_hour: "07:00",
  end_hour: "21:00",
  active_days: ["mon", "tue", "wed", "thu", "fri"],
  daily_limit_per_group: 10,
  daily_limit_total: 50,
  content_types: { text: true, image: false, audio: false, sticker: false },
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

const defaultContentTypes = { text: true, image: false, audio: false, sticker: false };

function isGroupInteractionDeviceEligible(device: any): boolean {
  const normalizedStatus = String(device?.status || "").trim().toLowerCase();
  const normalizedType = String(device?.instance_type || "").trim().toLowerCase();
  return CONNECTED_GROUP_DEVICE_STATUSES.has(normalizedStatus) && !BLOCKED_GROUP_DEVICE_TYPES.has(normalizedType);
}

function getInteractionInvalidReason(interaction: GroupInteraction, deviceMap: Map<string, any>): string | null {
  if (!interaction.device_id) return "Nenhuma instância vinculada.";

  const device = deviceMap.get(interaction.device_id);
  if (!device) return "A instância vinculada foi removida.";
  if (!isGroupInteractionDeviceEligible(device)) return "A instância vinculada está desconectada.";

  return null;
}

export default function GroupInteractionPage() {
  const { user } = useAuth();
  const {
    interactions, isLoading, logs,
    createInteraction, updateInteraction, deleteInteraction, invokeAction,
  } = useGroupInteraction();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({ ...defaultForm });
  const [bulkDeviceIds, setBulkDeviceIds] = useState<string[]>([]);
  const [usePeriod2, setUsePeriod2] = useState(false);
  const [groupSource, setGroupSource] = useState<"system" | "custom">("system");
  const autoPausedInteractionIdsRef = useRef<Set<string>>(new Set());

  const { data: devices = [] } = useQuery({
    queryKey: ["devices-gi", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status, instance_type")
        .eq("user_id", user.id)
        .order("name");
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const eligibleDevices = useMemo(() => {
    return devices.filter((device: any) => isGroupInteractionDeviceEligible(device));
  }, [devices]);

  const deviceMap = useMemo(() => new Map(devices.map((device: any) => [device.id, device])), [devices]);

  const { data: allWarmupGroups = [] } = useQuery({
    queryKey: ["warmup-groups-gi", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("warmup_groups" as any)
        .select("id, name, link, is_custom, user_id")
        .or(`user_id.eq.${user.id},and(is_custom.eq.false,user_id.is.null)`)
        .order("name");
      return data || [];
    },
    enabled: !!user,
  });

  const warmupGroups = useMemo(() => {
    if (groupSource === "system") {
      return allWarmupGroups.filter((g: any) => !g.is_custom && !g.user_id);
    }
    return allWarmupGroups.filter((g: any) => g.user_id === user?.id);
  }, [allWarmupGroups, groupSource, user?.id]);

  const selected = useMemo(
    () => interactions.find((i) => i.id === selectedId) || null,
    [interactions, selectedId]
  );

  const selectedInvalidReason = useMemo(
    () => (selected ? getInteractionInvalidReason(selected, deviceMap) : null),
    [selected, deviceMap]
  );

  const selectedDisplayStatus = selectedInvalidReason && selected?.status === "running" ? "paused" : selected?.status;
  const selectedPresentation = useMemo(() => {
    if (!selected) return null;
    if (!selectedDisplayStatus || selectedDisplayStatus === selected.status) return selected;
    return { ...selected, status: selectedDisplayStatus, last_error: selected.last_error || selectedInvalidReason };
  }, [selected, selectedDisplayStatus, selectedInvalidReason]);

  useEffect(() => {
    const invalidRunningInteractions = interactions.filter((interaction) => {
      return interaction.status === "running" && Boolean(getInteractionInvalidReason(interaction, deviceMap));
    });

    const activeInvalidIds = new Set(invalidRunningInteractions.map((interaction) => interaction.id));
    autoPausedInteractionIdsRef.current.forEach((interactionId) => {
      if (!activeInvalidIds.has(interactionId)) autoPausedInteractionIdsRef.current.delete(interactionId);
    });

    if (invalidRunningInteractions.length === 0) return;

    void Promise.allSettled(
      invalidRunningInteractions.map(async (interaction) => {
        if (autoPausedInteractionIdsRef.current.has(interaction.id)) return;
        autoPausedInteractionIdsRef.current.add(interaction.id);
        try {
          await supabase.functions.invoke("group-interaction", {
            body: { interactionId: interaction.id, action: "pause" },
          });
        } catch {
          autoPausedInteractionIdsRef.current.delete(interaction.id);
        }
      })
    );
  }, [interactions, deviceMap]);

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
    if (!form.device_id && !showBulkCreate) return "Selecione um dispositivo";
    if (!showBulkCreate && form.device_id && !eligibleDevices.some((device: any) => device.id === form.device_id)) return "A instância selecionada está desconectada";
    if (!form.group_ids?.length) return "Selecione pelo menos um grupo";
    if (!form.start_hour || !form.end_hour) return "Defina os horários";
    if (form.min_delay_seconds != null && form.max_delay_seconds != null && form.min_delay_seconds > form.max_delay_seconds) return "Delay mínimo não pode ser maior que o máximo";
    if (form.pause_duration_min > form.pause_duration_max) return "Pausa mínima não pode ser maior que a máxima";
    return null;
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) return toast.error(err);
    await createInteraction.mutateAsync(form as any);
    setShowConfig(false);
  };

  const handleBulkCreate = async () => {
    if (!bulkDeviceIds.length) return toast.error("Selecione pelo menos um dispositivo");
    const err = validate();
    if (err) return toast.error(err);
    for (const deviceId of bulkDeviceIds) {
      const device = eligibleDevices.find((d: any) => d.id === deviceId);
      const deviceName = device ? device.name : "Dispositivo";
      await createInteraction.mutateAsync({
        ...form,
        device_id: deviceId,
        name: `${form.name} - ${deviceName}`,
      } as any);
    }
    toast.success(`${bulkDeviceIds.length} automações criadas e iniciadas`);
    setShowBulkCreate(false);
    setBulkDeviceIds([]);
    setForm({ ...defaultForm });
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {(showConfig || showBulkCreate) ? (
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => {
              setShowConfig(false);
              setShowBulkCreate(false);
              setSelectedId(null);
            }}
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <MessageCircle className="w-6 h-6 text-primary" />
                Interação de Grupos
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Automatize interações em grupos com naturalidade
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedId(null);
                  setForm({ ...defaultForm });
                  setShowBulkCreate(true);
                  setBulkDeviceIds([]);
                }}
                className="gap-2"
              >
                <Layers className="w-4 h-4" />
                Criação em Massa
              </Button>
              <Button
                onClick={() => {
                  setSelectedId(null);
                  setForm({ ...defaultForm });
                  setShowConfig(true);
                }}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Nova Automação
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Campaign list */}
      {!showConfig && !showBulkCreate && interactions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Campanhas ({interactions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {interactions.map((inter) => (
                (() => {
                  const invalidReason = getInteractionInvalidReason(inter, deviceMap);
                  const displayStatus = invalidReason && inter.status === "running" ? "paused" : inter.status;
                  const deviceName = inter.device_id
                    ? deviceMap.get(inter.device_id)?.name || "Instância removida"
                    : "Sem instância";

                  return (
                    <div
                      key={inter.id}
                      className={`rounded-2xl border p-4 cursor-pointer transition-all hover:border-primary/30 hover:bg-muted/20 aspect-square flex flex-col justify-between ${
                        selectedId === inter.id ? "bg-muted/40 border-primary/30" : "border-border/50"
                      }`}
                      onClick={() => {
                        setSelectedId(inter.id);
                        setShowConfig(true);
                      }}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm line-clamp-2">{inter.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-1 truncate">{deviceName}</p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColors[displayStatus] || ""}`}>
                            {statusLabels[displayStatus] || displayStatus}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg border border-border/50 bg-muted/20 p-2">
                            <p className="text-[10px] text-muted-foreground">Grupos</p>
                            <p className="font-semibold text-sm">{(inter.group_ids || []).length}</p>
                          </div>
                          <div className="rounded-lg border border-border/50 bg-muted/20 p-2">
                            <p className="text-[10px] text-muted-foreground">Mensagens</p>
                            <p className="font-semibold text-sm">{inter.total_messages_sent}</p>
                          </div>
                        </div>

                        {invalidReason && (
                          <p className="text-[11px] text-destructive line-clamp-2">{invalidReason}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-3" onClick={(e) => e.stopPropagation()}>
                        {displayStatus === "running" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-8 px-2 text-xs gap-1"
                            onClick={() => invokeAction.mutate({ interactionId: inter.id, action: "pause" })}
                          >
                            <Pause className="w-3 h-3" /> Pausar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={Boolean(invalidReason)}
                            className="flex-1 h-8 px-2 text-xs gap-1"
                            onClick={() => invokeAction.mutate({ interactionId: inter.id, action: "start" })}
                          >
                            <Play className="w-3 h-3" /> {displayStatus === "paused" ? "Retomar" : "Iniciar"}
                          </Button>
                        )}

                        {(displayStatus === "running" || displayStatus === "paused") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                            onClick={() => invokeAction.mutate({ interactionId: inter.id, action: "stop" })}
                          >
                            <Square className="w-3 h-3" /> Parar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })()
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk creation mode */}
      {showBulkCreate && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Criação em Massa — Mesma configuração para múltiplos dispositivos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Selecione os dispositivos que receberão a mesma automação. Cada dispositivo terá sua própria campanha com delays variados automaticamente.
              </p>
              <div>
                <Label className="text-xs font-medium">Dispositivos ({bulkDeviceIds.length} selecionados)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto border border-border/50 rounded-lg p-2 mt-2">
                  {eligibleDevices.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2 col-span-full">
                      Nenhum dispositivo encontrado.
                    </p>
                  ) : (
                    eligibleDevices.map((d: any) => (
                      <label key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer">
                        <Checkbox
                          checked={bulkDeviceIds.includes(d.id)}
                          onCheckedChange={() =>
                            setBulkDeviceIds((prev) =>
                              prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]
                            )
                          }
                        />
                        <span className="text-xs truncate">
                          {d.name} {d.number ? `(${d.number})` : ""}
                        </span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      </label>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {renderFormFields()}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleBulkCreate} className="flex-1 gap-2" disabled={!bulkDeviceIds.length}>
              <Layers className="w-4 h-4" /> Criar {bulkDeviceIds.length} automações
            </Button>
            <Button variant="outline" onClick={() => { setShowBulkCreate(false); setBulkDeviceIds([]); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Single config mode */}
      <div className="space-y-4">
          {showConfig && !showBulkCreate ? (
            <>
              {/* Controls bar */}
              {selectedId && (
                <>
                  <GIStatusPanel interaction={(selectedPresentation || selected)!} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => handleAction("start")}
                      disabled={selectedDisplayStatus === "running" || invokeAction.isPending || Boolean(selectedInvalidReason)}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Play className="w-3.5 h-3.5" /> Iniciar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction("pause")}
                      disabled={selectedDisplayStatus !== "running" || invokeAction.isPending}
                      className="gap-1.5"
                    >
                      <Pause className="w-3.5 h-3.5" /> Pausar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(selectedDisplayStatus === "paused" ? "start" : "stop")}
                      disabled={selectedDisplayStatus === "idle" || invokeAction.isPending || (selectedDisplayStatus === "paused" && Boolean(selectedInvalidReason))}
                      className="gap-1.5"
                    >
                      {selectedDisplayStatus === "paused" ? (
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
                  {selectedInvalidReason && (
                    <p className="text-xs text-destructive">{selectedInvalidReason}</p>
                  )}
                </>
              )}

              {/* Device selector for single mode */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Dispositivo</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select
                    value={form.device_id || ""}
                    onValueChange={(v) => updateForm({ device_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar dispositivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleDevices.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} {d.number ? `(${d.number})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {eligibleDevices.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">Nenhum dispositivo encontrado.</p>
                  )}
                </CardContent>
              </Card>

              {renderFormFields()}

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

              {/* Logs */}
              {selectedId && selectedLogs.length > 0 && (
                <GILogs logs={selectedLogs} />
              )}
            </>
          ) : !showBulkCreate && !showConfig ? (
            interactions.length === 0 && <Card className="border-dashed">
              <CardContent className="p-12 text-center text-muted-foreground">
                <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Selecione uma automação ou crie uma nova</p>
              </CardContent>
            </Card>
          ) : null}
      </div>
    </div>
  );

  function renderFormFields() {
    return (
      <div className="space-y-4">
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
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Agenda
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label className="text-xs font-medium">Período 1</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Início</Label>
                  <Input
                    type="time"
                    value={form.start_hour || "07:00"}
                    onChange={(e) => updateForm({ start_hour: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Término</Label>
                  <Input
                    type="time"
                    value={form.end_hour || "21:00"}
                    onChange={(e) => updateForm({ end_hour: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Switch checked={usePeriod2} onCheckedChange={(v) => {
                  setUsePeriod2(v);
                  if (!v) updateForm({ start_hour_2: undefined, end_hour_2: undefined });
                }} />
                <Label className="text-xs">Adicionar 2º período (ex: tarde)</Label>
              </div>

              {usePeriod2 && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Período 2</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Início</Label>
                      <Input
                        type="time"
                        value={form.start_hour_2 || "13:00"}
                        onChange={(e) => updateForm({ start_hour_2: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Término</Label>
                      <Input
                        type="time"
                        value={form.end_hour_2 || "19:00"}
                        onChange={(e) => updateForm({ end_hour_2: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-1">
                <Label className="text-xs">Dias ativos</Label>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {DAYS.map((d) => (
                    <button
                      key={d.key}
                      onClick={() => toggleDay(d.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        (form.active_days || []).includes(d.key)
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-muted/30 text-muted-foreground border-border hover:border-border/80"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
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
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => { setGroupSource("system"); updateForm({ group_ids: [] }); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  groupSource === "system"
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted/30 text-muted-foreground border-border hover:border-border/80"
                }`}
              >
                Grupos do Sistema
              </button>
              <button
                onClick={() => { setGroupSource("custom"); updateForm({ group_ids: [] }); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  groupSource === "custom"
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted/30 text-muted-foreground border-border hover:border-border/80"
                }`}
              >
                Meus Grupos
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto border border-border/50 rounded-lg p-2">
              {warmupGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2 col-span-full">
                  {groupSource === "custom"
                    ? "Nenhum grupo próprio cadastrado. Adicione em Aquecimento > Grupos."
                    : "Nenhum grupo do sistema disponível."}
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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Delays</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Delay mín. (seg)</Label>
                <Input
                  type="number"
                  value={form.min_delay_seconds ?? ""}
                  onChange={(e) => updateForm({ min_delay_seconds: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="mt-1"
                  min={0}
                />
              </div>
              <div>
                <Label className="text-xs">Delay máx. (seg)</Label>
                <Input
                  type="number"
                  value={form.max_delay_seconds ?? ""}
                  onChange={(e) => updateForm({ max_delay_seconds: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="mt-1"
                  min={0}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
