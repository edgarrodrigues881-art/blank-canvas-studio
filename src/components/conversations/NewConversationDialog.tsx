import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquarePlus, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DeviceOption {
  id: string;
  name: string;
  number: string | null;
  status: string | null;
  uazapi_base_url: string | null;
}

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateConversation: (params: {
    deviceId: string;
    phone: string;
    name?: string;
  }) => Promise<string | null | undefined>;
}

const READY_STATUSES = new Set([
  "Ready",
  "Connected",
  "connected",
  "authenticated",
  "open",
  "active",
]);

const cleanPhone = (value: string) => value.replace(/\D/g, "");

function formatDeviceNumber(number?: string | null) {
  if (!number) return "";
  const digits = cleanPhone(number);
  return digits ? `+${digits}` : "";
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onCreateConversation,
}: NewConversationDialogProps) {
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");

  const resetForm = useCallback(() => {
    setDeviceId("");
    setPhone("");
    setName("");
  }, []);

  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    const { data, error } = await supabase
      .from("devices")
      .select("id, name, number, status, uazapi_base_url")
      .not("uazapi_base_url", "is", null)
      .order("name");

    if (error) {
      toast.error("Não foi possível carregar as instâncias");
      setDevices([]);
      setLoadingDevices(false);
      return;
    }

    const readyDevices = (data || []).filter((device) =>
      READY_STATUSES.has(device.status || "")
    );

    setDevices(readyDevices);
    setLoadingDevices(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchDevices();
  }, [open, fetchDevices]);

  useEffect(() => {
    if (open && devices.length === 1 && !deviceId) {
      setDeviceId(devices[0].id);
    }
  }, [open, devices, deviceId]);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === deviceId) || null,
    [devices, deviceId]
  );

  const handleDialogChange = (nextOpen: boolean) => {
    if (!nextOpen && !submitting) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    const normalizedPhone = cleanPhone(phone);

    if (!deviceId) {
      toast.warning("Selecione uma instância");
      return;
    }

    if (normalizedPhone.length < 10) {
      toast.warning("Digite um número com DDI e DDD");
      return;
    }

    setSubmitting(true);
    try {
      const conversationId = await onCreateConversation({
        deviceId,
        phone: normalizedPhone,
        name: name.trim() || undefined,
      });

      if (conversationId) {
        resetForm();
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-primary" />
            Nova conversa
          </DialogTitle>
          <DialogDescription>
            Escolha a instância, informe o número e abra o chat já pronto para enviar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="conversation-device">Instância</Label>
            <Select value={deviceId} onValueChange={setDeviceId} disabled={loadingDevices || submitting}>
              <SelectTrigger id="conversation-device">
                <SelectValue placeholder={loadingDevices ? "Carregando instâncias..." : "Selecione uma instância"} />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name}
                    {device.number ? ` • ${formatDeviceNumber(device.number)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingDevices && devices.length === 0 && (
              <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Nenhuma instância pronta com API configurada foi encontrada.
              </div>
            )}
            {selectedDevice && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <Smartphone className="w-3.5 h-3.5 text-primary" />
                Envio sairá por <span className="font-medium text-foreground">{selectedDevice.name}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="conversation-phone">Número do contato</Label>
            <Input
              id="conversation-phone"
              type="tel"
              inputMode="numeric"
              placeholder="Ex: 5562991234567"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">Use DDI + DDD para abrir a conversa corretamente.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="conversation-name">Nome do contato (opcional)</Label>
            <Input
              id="conversation-name"
              placeholder="Ex: João Silva"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleDialogChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loadingDevices || devices.length === 0}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
            Abrir conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
