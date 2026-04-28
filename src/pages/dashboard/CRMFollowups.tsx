import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, CalendarClock, Trash2, Check, X, Sparkles, Bell, Send } from "lucide-react";
import { useCrmFollowups, useCrmFollowupSequences, type CrmFollowup } from "@/hooks/useCrmFollowups";
import { toast } from "sonner";

function formatBR(dt: string) {
  const d = new Date(dt);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  processing: { label: "Processando", color: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  sent: { label: "Enviado", color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  done_manually: { label: "Feito (manual)", color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  cancelled: { label: "Cancelado", color: "bg-muted text-muted-foreground border-border" },
  failed: { label: "Falhou", color: "bg-red-500/15 text-red-500 border-red-500/30" },
};

const MODE_LABELS: Record<string, string> = {
  manual: "Manual (lembrete)",
  auto: "Automático (envia)",
  ai_hybrid: "IA gera no envio",
};

export default function CRMFollowups() {
  const [tab, setTab] = useState("pending");
  const followups = useCrmFollowups({ status: tab === "all" ? undefined : tab });
  const sequences = useCrmFollowupSequences();
  const [createOpen, setCreateOpen] = useState(false);

  // form state
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [mode, setMode] = useState<"manual" | "auto" | "ai_hybrid">("auto");
  const [message, setMessage] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [cancelOnReply, setCancelOnReply] = useState(true);
  const [trigger, setTrigger] = useState<"manual" | "no_response" | "sequence">("manual");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setPhone(""); setName(""); setMessage(""); setAiPrompt(""); setNotes("");
    setMode("auto"); setTrigger("manual"); setCancelOnReply(true);
  };

  const submit = async () => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone) return toast.error("Informe o telefone do lead");
    if (mode !== "ai_hybrid" && !message.trim()) return toast.error("Escreva a mensagem ou escolha modo IA");
    if (mode === "ai_hybrid" && !aiPrompt.trim()) return toast.error("Descreva o objetivo para a IA");

    await followups.create.mutateAsync({
      contact_phone: cleanPhone.startsWith("55") ? cleanPhone : (cleanPhone.length >= 10 ? "55" + cleanPhone : cleanPhone),
      contact_name: name || null,
      scheduled_at: new Date(scheduledAt).toISOString(),
      mode,
      trigger_type: trigger,
      message: mode === "ai_hybrid" ? null : message,
      ai_prompt: mode === "ai_hybrid" ? aiPrompt : null,
      cancel_on_reply: cancelOnReply,
      notes: notes || null,
      status: "pending",
    });
    setCreateOpen(false);
    reset();
  };

  const counts = useMemo(() => {
    const data = followups.data || [];
    return {
      pending: data.filter((f) => f.status === "pending").length,
      sent: data.filter((f) => f.status === "sent" || f.status === "done_manually").length,
      cancelled: data.filter((f) => f.status === "cancelled" || f.status === "failed").length,
    };
  }, [followups.data]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-amber-400" /> Follow-ups
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agende lembretes ou disparos automáticos para reengajar leads. Suporta IA contextual.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo follow-up
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Pendentes</div>
          <div className="text-2xl font-bold mt-1">{counts.pending}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Concluídos</div>
          <div className="text-2xl font-bold mt-1 text-emerald-500">{counts.sent}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Cancelados / Falhas</div>
          <div className="text-2xl font-bold mt-1 text-muted-foreground">{counts.cancelled}</div>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="sent">Enviados</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelados</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <Card>
            {followups.isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : (followups.data || []).length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Nenhum follow-up {tab === "pending" ? "pendente" : ""} por aqui.
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {(followups.data || []).map((f) => (
                  <FollowupRow
                    key={f.id}
                    f={f}
                    onCancel={() => followups.cancel.mutate(f.id)}
                    onDone={() => followups.markDone.mutate(f.id)}
                    onDelete={() => followups.remove.mutate(f.id)}
                  />
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Novo follow-up</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Telefone do lead</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 9 0000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome (opcional)</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do lead" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data e hora</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Modo</Label>
                <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático (envia mensagem)</SelectItem>
                    <SelectItem value="manual">Manual (apenas lembrete)</SelectItem>
                    <SelectItem value="ai_hybrid">IA gera mensagem no envio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Gatilho</Label>
              <Select value={trigger} onValueChange={(v: any) => setTrigger(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (sempre na hora marcada)</SelectItem>
                  <SelectItem value="no_response">Só envia se o lead não responder antes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "ai_hybrid" ? (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Objetivo da mensagem (a IA escreve)</Label>
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={3}
                  placeholder="Ex: Reengajar o lead lembrando da proposta enviada, oferecer ajuda e marcar uma call."
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Mensagem</Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder={mode === "manual" ? "Texto do lembrete (você envia depois)" : "Olá {{nome}}, tudo bem? Passando aqui pra…"}
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div>
                <div className="text-sm font-medium">Cancelar se o lead responder</div>
                <div className="text-xs text-muted-foreground">Não envia se o lead já respondeu antes da hora marcada.</div>
              </div>
              <Switch checked={cancelOnReply} onCheckedChange={setCancelOnReply} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notas internas (opcional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anotação privada" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={followups.create.isPending}>
              {followups.create.isPending ? "Salvando…" : "Agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FollowupRow({
  f, onCancel, onDone, onDelete,
}: {
  f: CrmFollowup;
  onCancel: () => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_LABELS[f.status] || STATUS_LABELS.pending;
  const isPending = f.status === "pending" || f.status === "processing";
  const ModeIcon = f.mode === "manual" ? Bell : f.mode === "ai_hybrid" ? Sparkles : Send;

  return (
    <li className="p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{f.contact_name || f.contact_phone}</span>
            <Badge variant="outline" className={status.color + " text-[10px]"}>{status.label}</Badge>
            <Badge variant="outline" className="text-[10px] gap-1">
              <ModeIcon className="w-3 h-3" /> {MODE_LABELS[f.mode]}
            </Badge>
            {f.cancel_on_reply && f.status === "pending" && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">Cancela se responder</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {f.contact_name && <span className="mr-2">{f.contact_phone}</span>}
            <span>📅 {formatBR(f.scheduled_at)}</span>
          </div>
          {(f.message || f.ai_prompt) && (
            <div className="mt-2 text-sm text-foreground/80 line-clamp-2 bg-muted/30 rounded-md px-3 py-2">
              {f.mode === "ai_hybrid" ? <span className="text-muted-foreground italic">🤖 {f.ai_prompt}</span> : f.message}
            </div>
          )}
          {f.error_message && (
            <div className="mt-2 text-xs text-red-500">⚠ {f.error_message}</div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {isPending && (
            <>
              <Button variant="ghost" size="icon" onClick={onDone} title="Marcar como feito" className="h-8 w-8 text-emerald-500 hover:text-emerald-400">
                <Check className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onCancel} title="Cancelar" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={onDelete} title="Excluir" className="h-8 w-8 text-muted-foreground hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}
