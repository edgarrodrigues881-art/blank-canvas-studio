import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Pencil, Loader2, Calendar, Flame } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { usePatchQueueItem, type WelcomeQueueItem } from "@/hooks/useWelcomeAutomation";

interface Props {
  open: boolean;
  onClose: () => void;
  item: WelcomeQueueItem | null;
}

/**
 * Convert ISO -> "yyyy-MM-ddTHH:mm" (datetime-local input format, local TZ).
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function fromLocalInput(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

export function WelcomeEditQueueDialog({ open, onClose, item }: Props) {
  const patch = usePatchQueueItem();
  const [sendAt, setSendAt] = useState("");
  const [priority, setPriority] = useState(0);

  useEffect(() => {
    if (item) {
      setSendAt(toLocalInput(item.send_at));
      setPriority(item.priority ?? 0);
    }
  }, [item]);

  if (!item) return null;

  const save = async () => {
    const updates: Partial<WelcomeQueueItem> = {
      priority,
      send_at: fromLocalInput(sendAt),
    };
    try {
      await patch.mutateAsync({ id: item.id, patch: updates });
      toast.success("Item atualizado");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    }
  };

  const setSendNow = () => setSendAt(toLocalInput(new Date().toISOString()));
  const setSendIn = (mins: number) =>
    setSendAt(toLocalInput(new Date(Date.now() + mins * 60_000).toISOString()));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" /> Editar item da fila
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Contact summary */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-1">
            <p className="text-xs font-mono font-medium text-foreground">{item.participant_phone}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {item.participant_name || "—"} · {item.group_name || item.group_id.slice(0, 16)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Detectado em {format(new Date(item.detected_at), "dd/MM/yyyy HH:mm")}
            </p>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" /> Prioridade
              <span className="text-primary normal-case ml-auto">{priority}</span>
            </Label>
            <Slider value={[priority]} onValueChange={v => setPriority(v[0])} min={0} max={10} step={1} />
            <p className="text-[10px] text-muted-foreground">
              Itens com maior prioridade são processados antes (0 = normal, 10 = máxima).
            </p>
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Agendado para
            </Label>
            <Input
              type="datetime-local"
              value={sendAt}
              onChange={e => setSendAt(e.target.value)}
              step={1}
            />
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] rounded-lg" onClick={setSendNow}>
                Agora
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] rounded-lg" onClick={() => setSendIn(5)}>
                + 5 min
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] rounded-lg" onClick={() => setSendIn(30)}>
                + 30 min
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] rounded-lg" onClick={() => setSendIn(60)}>
                + 1h
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] rounded-lg" onClick={() => setSendIn(60 * 24)}>
                + 1 dia
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={patch.isPending} className="gap-2">
            {patch.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
