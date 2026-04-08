import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Send, Clock, Phone, User } from "lucide-react";
import { ScheduledMessage, Device } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ScheduledMessage | null;
  devices: Device[];
  onConfirm: (id: string, deviceId: string | null) => void;
  sending: boolean;
}

export default function SendNowDialog({ open, onOpenChange, schedule, devices, onConfirm, sending }: Props) {
  const [selectedDevice, setSelectedDevice] = useState("auto");
  const connectedDevices = devices.filter(d => ["Ready", "Connected", "authenticated"].includes(d.status));

  if (!schedule) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Confirmar envio imediato</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">{schedule.contact_name || "Sem nome"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-mono text-muted-foreground">{schedule.contact_phone}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Agendado: {format(new Date(schedule.scheduled_at), "dd/MM/yyyy HH:mm")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground bg-background rounded p-2 line-clamp-3 mt-1">
              {schedule.message_content}
            </p>
          </div>

          <div>
            <Label className="text-xs">Instância para envio</Label>
            <Select value={selectedDevice} onValueChange={setSelectedDevice}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático</SelectItem>
                {connectedDevices.map(d => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} {d.number ? `(${d.number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button
            onClick={() => onConfirm(schedule.id, selectedDevice === "auto" ? null : selectedDevice)}
            disabled={sending}
          >
            <Send className="w-4 h-4 mr-1.5" />
            {sending ? "Enviando..." : "Confirmar envio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
