import { useState } from "react";
import { Save, Play, BotMessageSquare, ArrowLeft, Loader2, Smartphone, Circle, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { FlowNodeData } from "./types";
import type { Node } from "@xyflow/react";

interface Props {
  flowId?: string | null;
  name: string;
  onNameChange: (n: string) => void;
  isActive: boolean;
  onToggleActive: (checked: boolean) => void;
  onSave: () => void;
  saving?: boolean;
  deviceId: string | null;
  onDeviceChange: (id: string | null) => void;
  nodes: Node<FlowNodeData>[];
  edges?: { id: string; source: string; target: string }[];
  isDirty?: boolean;
}

const onlineStatuses = new Set(["connected", "Connected", "Ready", "ready", "authenticated"]);

export function FlowHeader({ flowId, name, onNameChange, isActive, onToggleActive, onSave, saving, deviceId, onDeviceChange, nodes, edges = [], isDirty }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [testing, setTesting] = useState(false);

  const { data: devices } = useQuery({
    queryKey: ["devices-list", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .neq("login_type", "report_wa")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 120_000,
  });

  const handleTest = async () => {
    if (!flowId) {
      toast.error("Salve a automação antes de testar os botões");
      return;
    }

    if (isDirty) {
      toast.error("Salve as alterações antes de testar os botões");
      return;
    }

    if (!deviceId) {
      toast.error("Selecione uma instância antes de testar");
      return;
    }

    const selectedDevice = devices?.find((device) => device.id === deviceId);
    if (!selectedDevice) {
      toast.error("Instância não encontrada");
      return;
    }

    if (!onlineStatuses.has(selectedDevice.status)) {
      toast.error("A instância selecionada está offline. Reconecte antes de testar.");
      return;
    }

    const startNode = nodes.find((node) => node.type === "startNode");
    if (!startNode) {
      toast.error("Adicione um nó de início ao fluxo");
      return;
    }

    const startData = startNode.data as FlowNodeData;
    const trigger = startData.trigger || "any_message";

    let incomingText = "teste";
    if (trigger === "keyword") {
      incomingText = startData.keyword?.split(",").map((item) => item.trim()).find(Boolean) || "";
    }

    if (!incomingText) {
      toast.error("Defina uma palavra-chave no gatilho antes de testar");
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-autoreply", {
        body: {
          flow_id: flowId,
          device_id: deviceId,
          incoming_text: incomingText,
          draft_flow: {
            name,
            nodes,
            edges,
          },
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.details ? `${data.error} ${data.details}` : data.error);
        return;
      }

      toast.success(data?.message || `Teste executado com a entrada "${incomingText}"`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar teste");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b border-border/30 bg-card/40 backdrop-blur-sm shrink-0 overflow-x-auto">
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground/40 hover:text-foreground shrink-0"
        onClick={() => navigate("/dashboard/auto-reply")}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
      </Button>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
          <BotMessageSquare className="w-3 h-3 text-primary" />
        </div>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="text-xs font-semibold bg-transparent border-none outline-none text-foreground w-32 sm:w-44 focus:ring-0 placeholder:text-muted-foreground/30"
          placeholder="Nome da automação"
        />
      </div>

      <Select
        value={deviceId || "none"}
        onValueChange={(value) => onDeviceChange(value === "none" ? null : value)}
      >
        <SelectTrigger className="w-[150px] sm:w-[180px] h-7 text-[11px] bg-card/40 border-border/20 gap-1.5 shrink-0">
          <Smartphone className="w-3 h-3 text-muted-foreground/40 shrink-0" />
          <SelectValue placeholder="Selecionar instância" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Nenhuma instância</SelectItem>
          {devices?.map((device) => (
            <SelectItem key={device.id} value={device.id}>
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${onlineStatuses.has(device.status) ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                />
                <span className="truncate">{device.name}</span>
                {device.number && (
                  <span className="text-muted-foreground/40 text-[10px]">{device.number}</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5 mr-1 shrink-0">
        <Switch checked={isActive} onCheckedChange={onToggleActive} className="scale-[0.8]" />
        <span className={`text-[11px] font-medium ${isActive ? "text-emerald-500/80" : "text-muted-foreground/40"}`}>
          {isActive ? "Ativo" : "Inativo"}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] px-3 border-border/30 hover:border-border/50"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
          Testar
        </Button>
        <Button
          size="sm"
          className="h-7 text-[11px] px-3 gap-1"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Salvar
          {isDirty && (
            <Circle className="w-1.5 h-1.5 fill-current" />
          )}
        </Button>
      </div>
    </div>
  );
}
