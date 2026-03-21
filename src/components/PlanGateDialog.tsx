import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Ban } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PlanState } from "@/hooks/usePlanGate";

interface PlanGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planState: PlanState;
  context?: "instances" | "campaigns" | "warmup" | "notifications";
}

export function PlanGateDialog({ open, onOpenChange, planState, context }: PlanGateDialogProps) {
  const navigate = useNavigate();

  const statusText =
    planState === "noPlan" ? "sem plano ativo"
    : planState === "expired" ? "com plano vencido"
    : "suspensa/cancelada";

  const contextText = context === "notifications"
    ? "Para usar relatórios via WhatsApp, ative o addon de Relatórios WhatsApp ou um plano principal."
    : "Ative ou renove seu plano para usar todas as funcionalidades (instâncias, campanhas, aquecimento, etc).";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban size={18} className="text-destructive" /> Funcionalidade bloqueada
          </DialogTitle>
          <p className="text-sm text-muted-foreground pt-2">
            Sua conta está {statusText}. {contextText}
          </p>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">Cancelar</Button>
          <Button onClick={() => { onOpenChange(false); navigate("/dashboard/my-plan"); }} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            Ver planos / Ativar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
