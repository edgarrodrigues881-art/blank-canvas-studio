import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plug, Smartphone, CheckCircle2, Loader2, AlertTriangle, Save,
  MessageCircle, Bell, Send, UserPlus
} from "lucide-react";

interface ConnectionPurpose {
  id: string;
  purpose: string;
  label: string;
  device_id: string | null;
  group_id: string | null;
  group_name: string | null;
  updated_at: string;
}

const PURPOSE_ICONS: Record<string, any> = {
  lifecycle: MessageCircle,
  alerts: Bell,
  dispatch: Send,
  onboarding: UserPlus,
};

export default function AdminConnectionPurposes() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  // Load connection purposes
  const { data: purposes = [], isLoading } = useQuery({
    queryKey: ["admin-connection-purposes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_connection_purposes" as any)
        .select("*")
        .order("purpose");
      if (error) throw error;
      return (data || []) as unknown as ConnectionPurpose[];
    },
  });

  // Load only the current admin's devices (not all system devices)
  const { data: devices = [] } = useQuery({
    queryKey: ["admin-own-devices-list"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status, profile_name")
        .eq("user_id", user.id)
        .order("name");
      return data || [];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, device_id }: { id: string; device_id: string | null }) => {
      const { data, error } = await supabase.functions.invoke("admin-data?action=update-connection-purpose", {
        body: { id, device_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Conexão atualizada");
      setSaving(null);
      queryClient.invalidateQueries({ queryKey: ["admin-connection-purposes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-connection-purposes", "dispatch-view"] });
    },
    onError: (e: any) => { toast.error(e.message); setSaving(null); },
  });

  const handleDeviceChange = (purposeId: string, deviceId: string) => {
    setSaving(purposeId);
    updateMutation.mutate({ id: purposeId, device_id: deviceId === "none" ? null : deviceId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Plug size={20} className="text-primary" />
          Conexões por Finalidade
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure qual dispositivo será usado para cada tipo de envio
        </p>
      </div>

      {/* Info card */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={16} className="text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-sm">Como funciona</p>
          <p>Cada finalidade pode usar um dispositivo WhatsApp diferente. Configure abaixo qual instância será usada para cada tipo de envio automático ou manual.</p>
        </div>
      </div>

      {/* Purpose cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {purposes.filter(p => p.purpose !== "alerts").map(p => {
          const Icon = PURPOSE_ICONS[p.purpose] || Plug;
          const device = devices.find(d => d.id === p.device_id);
          const isConnected = device && ["Connected", "Ready", "authenticated"].includes(device.status);
          const isSaving = saving === p.id;

          return (
            <div key={p.id} className="bg-card/60 border border-border/50 rounded-xl p-5 space-y-4 hover:border-border transition-colors">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                  <Icon size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground">{p.label}</h3>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mt-0.5">
                    {p.purpose}
                  </p>
                </div>
                {device ? (
                  <Badge
                    variant="outline"
                    className={`text-[9px] shrink-0 ${
                      isConnected
                        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                        : "text-red-400 border-red-500/20 bg-red-500/10"
                    }`}
                  >
                    {isConnected ? "Online" : "Offline"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] shrink-0 text-muted-foreground border-border/50">
                    Não configurado
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Dispositivo
                </label>
                <Select
                  value={p.device_id || "none"}
                  onValueChange={v => handleDeviceChange(p.id, v)}
                  disabled={isSaving}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecionar dispositivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">Sem dispositivo</span>
                    </SelectItem>
                    {devices.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        <span className="flex items-center gap-2">
                          <Smartphone size={12} />
                          {d.name}
                          {d.number && <span className="text-[10px] text-muted-foreground/50">({d.number})</span>}
                          {["Connected", "Ready", "authenticated"].includes(d.status) ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {device && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 bg-muted/20 rounded-lg px-3 py-2">
                  <Smartphone size={12} className="shrink-0" />
                  <span className="truncate">{device.profile_name || device.name}</span>
                  {device.number && <span className="font-mono">· {device.number}</span>}
                </div>
              )}

              {isSaving && (
                <div className="flex items-center gap-2 text-[11px] text-primary">
                  <Loader2 size={12} className="animate-spin" /> Salvando...
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
