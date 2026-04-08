import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Pencil, Trash2, Send, Phone, MessageSquare } from "lucide-react";
import { ScheduledMessage, statusConfig } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  schedules: ScheduledMessage[];
  onEdit: (s: ScheduledMessage) => void;
  onCancel: (id: string) => void;
  onSendNow: (s: ScheduledMessage) => void;
}

export default function DayDetailSheet({ open, onOpenChange, date, schedules, onEdit, onCancel, onSendNow }: Props) {
  if (!date) return null;

  const sorted = [...schedules].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 pb-3 border-b border-border">
          <SheetTitle className="text-base">
            {format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            {sorted.length} agendamento{sorted.length !== 1 ? "s" : ""}
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 p-4">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Nenhum agendamento neste dia</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sorted.map(s => {
                const sc = statusConfig[s.status] || statusConfig.pending;
                return (
                  <div key={s.id} className="rounded-xl border border-border bg-card p-3 space-y-2 hover:border-border/80 transition-colors">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {s.contact_name || "Sem nome"}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[11px] font-mono text-muted-foreground">{s.contact_phone}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px] shrink-0", sc.className)}>
                        {sc.label}
                      </Badge>
                    </div>

                    {/* Time */}
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(s.scheduled_at), "HH:mm")}
                      </span>
                    </div>

                    {/* Message preview */}
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2 line-clamp-2">
                      {s.message_content}
                    </p>

                    {/* Actions */}
                    {s.status === "pending" && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <Button size="sm" variant="default" className="h-7 text-[11px] gap-1" onClick={() => onSendNow(s)}>
                          <Send className="w-3 h-3" /> Enviar agora
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => onEdit(s)}>
                          <Pencil className="w-3 h-3" /> Editar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onCancel(s.id)}>
                          <Trash2 className="w-3 h-3" /> Excluir
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
