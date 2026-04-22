import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MoreHorizontal, Zap, RotateCcw, XCircle, ArrowUp, Pencil, History, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useUpdateQueueItem, useForceSendQueueItem, useResendQueueItem, usePatchQueueItem,
  type WelcomeQueueItem,
} from "@/hooks/useWelcomeAutomation";

interface Props {
  item: WelcomeQueueItem;
  onEdit: (item: WelcomeQueueItem) => void;
  onShowLogs: (item: WelcomeQueueItem) => void;
}

type ConfirmKind = null | "force" | "resend" | "cancel";

const CONFIRM_COPY: Record<Exclude<ConfirmKind, null>, { title: string; desc: string; cta: string; tone?: "destructive" }> = {
  force: {
    title: "Forçar envio agora?",
    desc: "O item será reenfileirado para envio imediato, ignorando o agendamento atual. As tentativas serão preservadas.",
    cta: "Forçar envio",
  },
  resend: {
    title: "Reenviar do zero?",
    desc: "As tentativas serão zeradas e o item voltará para a fila como novo. Use quando deseja recomeçar este envio.",
    cta: "Reenviar",
  },
  cancel: {
    title: "Cancelar este envio?",
    desc: "O item será marcado como ignorado e o worker não tentará mais enviá-lo. Você pode reenfileirar depois.",
    cta: "Cancelar envio",
    tone: "destructive",
  },
};

export function WelcomeQueueRowActions({ item, onEdit, onShowLogs }: Props) {
  const update = useUpdateQueueItem();
  const force = useForceSendQueueItem();
  const resend = useResendQueueItem();
  const patch = usePatchQueueItem();

  const [confirm, setConfirm] = useState<ConfirmKind>(null);

  const isTerminal = item.status === "sent";
  const busy = update.isPending || force.isPending || resend.isPending || patch.isPending;

  const bumpPriority = async () => {
    const next = Math.min(10, (item.priority ?? 0) + 1);
    try {
      await patch.mutateAsync({ id: item.id, patch: { priority: next } });
      toast.success(`Prioridade aumentada para ${next}`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao priorizar");
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm === "force") {
        await force.mutateAsync(item.id);
        toast.success("Item enviado para a frente da fila");
      } else if (confirm === "resend") {
        await resend.mutateAsync(item.id);
        toast.success("Reenvio agendado");
      } else if (confirm === "cancel") {
        await update.mutateAsync({ id: item.id, status: "ignored" });
        toast.success("Envio cancelado");
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao executar ação");
    } finally {
      setConfirm(null);
    }
  };

  return (
    <>
      <div className="flex items-center gap-0.5">
        {/* Quick: force send (only relevant when not yet sent) */}
        {!isTerminal && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 rounded-lg hover:bg-amber-500/10 hover:text-amber-400"
            title="Forçar envio agora"
            onClick={() => setConfirm("force")}
            disabled={busy}
          >
            <Zap className="w-3.5 h-3.5" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-3.5 h-3.5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Ações
            </DropdownMenuLabel>

            {!isTerminal && (
              <DropdownMenuItem onClick={() => setConfirm("force")} className="gap-2 text-xs">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Forçar envio agora
              </DropdownMenuItem>
            )}

            <DropdownMenuItem onClick={() => setConfirm("resend")} className="gap-2 text-xs">
              <RotateCcw className="w-3.5 h-3.5 text-primary" /> Reenviar (zerar tentativas)
            </DropdownMenuItem>

            {!isTerminal && (
              <DropdownMenuItem onClick={bumpPriority} className="gap-2 text-xs">
                <ArrowUp className="w-3.5 h-3.5 text-emerald-400" /> Aumentar prioridade
              </DropdownMenuItem>
            )}

            {!isTerminal && (
              <DropdownMenuItem onClick={() => onEdit(item)} className="gap-2 text-xs">
                <Pencil className="w-3.5 h-3.5" /> Editar agendamento e prioridade
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => onShowLogs(item)} className="gap-2 text-xs">
              <History className="w-3.5 h-3.5" /> Ver histórico de envios
            </DropdownMenuItem>

            {!isTerminal && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setConfirm("cancel")}
                  className="gap-2 text-xs text-destructive focus:text-destructive"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancelar envio
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={() => setConfirm(null)}>
        <AlertDialogContent>
          {confirm && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{CONFIRM_COPY[confirm].title}</AlertDialogTitle>
                <AlertDialogDescription>{CONFIRM_COPY[confirm].desc}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={runConfirm}
                  className={CONFIRM_COPY[confirm].tone === "destructive" ? "bg-destructive hover:bg-destructive/90" : ""}
                >
                  {CONFIRM_COPY[confirm].cta}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
