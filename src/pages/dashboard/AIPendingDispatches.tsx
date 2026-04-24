import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Check, X, MessageSquare, Phone, Clock, Sparkles, Info } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AIDispatch {
  id: string;
  contact_name: string | null;
  contact_phone: string;
  message_content: string;
  scheduled_for: string;
  detected_from_message: string | null;
  status: string;
  created_at: string;
}

export default function AIPendingDispatches() {
  const { user } = useAuth();
  const [items, setItems] = useState<AIDispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [processing, setProcessing] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_scheduled_dispatches" as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("status", tab)
      .order("created_at", { ascending: false });
    setItems(((data as any[]) || []) as AIDispatch[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, tab]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setProcessing(id);
    const { data, error } = await supabase.functions.invoke("ai-dispatch-approve", {
      body: { dispatch_id: id, action },
    });
    setProcessing(null);
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao processar");
      return;
    }
    toast.success(action === "approve" ? "Disparo aprovado e agendado" : "Disparo rejeitado");
    load();
  };

  const counts = useState<Record<string, number>>({})[0];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CalendarClock className="w-6 h-6" /> Disparos sugeridos pela IA
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Quando a IA detecta um pedido de envio futuro (ex: "me manda amanhã 14h"), cria uma sugestão aqui aguardando sua aprovação.
          </p>
        </div>
      </div>

      <Card className="p-4 bg-amber-500/5 border-amber-500/20">
        <div className="flex gap-3">
          <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p className="text-foreground font-medium">Aprovação obrigatória</p>
            <p>Nenhum disparo é enviado sem sua confirmação. Revise o conteúdo, horário e destinatário antes de aprovar.</p>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/40">
        {[
          { key: "pending", label: "Pendentes" },
          { key: "approved", label: "Aprovados" },
          { key: "rejected", label: "Rejeitados" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          {tab === "pending" ? "Nenhum disparo pendente. A IA criará sugestões aqui automaticamente." : `Nenhum disparo ${tab === "approved" ? "aprovado" : "rejeitado"}.`}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const sched = new Date(item.scheduled_for);
            const isPast = sched.getTime() < Date.now();
            return (
              <Card key={item.id} className="p-4 hover:border-border/80 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Phone className="w-3 h-3" />
                        {item.contact_name || item.contact_phone}
                      </Badge>
                      <Badge variant={isPast && tab === "pending" ? "destructive" : "secondary"} className="gap-1 text-xs">
                        <Clock className="w-3 h-3" />
                        {format(sched, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </Badge>
                      {isPast && tab === "pending" && (
                        <span className="text-[11px] text-destructive">Horário já passou — será enviado imediatamente se aprovado</span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Mensagem a enviar</p>
                      <div className="p-3 bg-muted/30 rounded-lg border border-border/30 text-sm whitespace-pre-wrap">
                        {item.message_content}
                      </div>
                    </div>
                    {item.detected_from_message && (
                      <details className="text-xs text-muted-foreground/80">
                        <summary className="cursor-pointer hover:text-foreground flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3" /> Mensagem original do cliente
                        </summary>
                        <div className="mt-1.5 p-2 bg-muted/20 rounded border border-border/30 italic">
                          "{item.detected_from_message}"
                        </div>
                      </details>
                    )}
                  </div>
                  {tab === "pending" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleAction(item.id, "approve")}
                        disabled={processing === item.id}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Check className="w-3.5 h-3.5" /> Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(item.id, "reject")}
                        disabled={processing === item.id}
                        className="gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" /> Rejeitar
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
