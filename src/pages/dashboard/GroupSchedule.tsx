import { useState, useMemo } from "react";
import { CalendarClock, Plus, Pencil, Trash2, Pause, Play, CheckCircle2, Calendar, Repeat, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ScheduleType = "once" | "weekly";
type ScheduleStatus = "ativo" | "pausado" | "concluido";

interface GroupSchedule {
  id: string;
  name: string;
  description?: string;
  status: ScheduleStatus;
  message: string;
  type: ScheduleType;
  date?: string; // YYYY-MM-DD (once)
  time: string; // HH:MM
  weekdays: number[]; // 0-6 (weekly) Sunday=0
  groupIds: string[];
  createdAt: string;
}

const WEEKDAYS = [
  { value: 0, label: "Dom", full: "Domingo" },
  { value: 1, label: "Seg", full: "Segunda" },
  { value: 2, label: "Ter", full: "Terça" },
  { value: 3, label: "Qua", full: "Quarta" },
  { value: 4, label: "Qui", full: "Quinta" },
  { value: 5, label: "Sex", full: "Sexta" },
  { value: 6, label: "Sáb", full: "Sábado" },
];

// Mock groups - structure ready for real integration
const MOCK_GROUPS = [
  { id: "g1", name: "Grupo 1 - Vendas" },
  { id: "g2", name: "Grupo 2 - Suporte" },
  { id: "g3", name: "Grupo 3 - Comunidade" },
  { id: "g4", name: "Grupo 4 - VIP" },
];

const STORAGE_KEY = "group_schedules_v1";

function loadSchedules(): GroupSchedule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSchedules(items: GroupSchedule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function computeNextRun(s: GroupSchedule): Date | null {
  if (s.status !== "ativo") return null;
  const [hh, mm] = s.time.split(":").map(Number);
  if (s.type === "once" && s.date) {
    const d = new Date(`${s.date}T${s.time}:00`);
    return d > new Date() ? d : null;
  }
  if (s.type === "weekly" && s.weekdays.length > 0) {
    const now = new Date();
    for (let i = 0; i < 8; i++) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + i);
      candidate.setHours(hh, mm, 0, 0);
      if (s.weekdays.includes(candidate.getDay()) && candidate > now) {
        return candidate;
      }
    }
  }
  return null;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusColor: Record<ScheduleStatus, string> = {
  ativo: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  pausado: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  concluido: "bg-muted text-muted-foreground border-border",
};

export default function GroupSchedule() {
  const [items, setItems] = useState<GroupSchedule[]>(loadSchedules);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GroupSchedule | null>(null);
  const [step, setStep] = useState(1);

  // form state
  const [form, setForm] = useState<Omit<GroupSchedule, "id" | "createdAt">>({
    name: "",
    description: "",
    status: "ativo",
    message: "",
    type: "once",
    date: "",
    time: "",
    weekdays: [],
    groupIds: [],
  });

  const persist = (next: GroupSchedule[]) => {
    setItems(next);
    saveSchedules(next);
  };

  const stats = useMemo(() => {
    const total = items.length;
    const ativos = items.filter((i) => i.status === "ativo").length;
    const pausados = items.filter((i) => i.status === "pausado").length;
    const today = new Date();
    const hoje = items.filter((i) => {
      const next = computeNextRun(i);
      return next && next.toDateString() === today.toDateString();
    }).length;
    return { total, ativos, pausados, hoje };
  }, [items]);

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      status: "ativo",
      message: "",
      type: "once",
      date: "",
      time: "",
      weekdays: [],
      groupIds: [],
    });
    setStep(1);
    setEditing(null);
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (s: GroupSchedule) => {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description || "",
      status: s.status,
      message: s.message,
      type: s.type,
      date: s.date || "",
      time: s.time,
      weekdays: s.weekdays,
      groupIds: s.groupIds,
    });
    setStep(1);
    setDialogOpen(true);
  };

  const validateStep = (s: number): boolean => {
    if (s === 1) {
      if (!form.name.trim()) {
        toast({ title: "Nome obrigatório", description: "Informe um nome para a campanha.", variant: "destructive" });
        return false;
      }
    }
    if (s === 2) {
      if (!form.message.trim()) {
        toast({ title: "Mensagem obrigatória", description: "Escreva a mensagem que será enviada.", variant: "destructive" });
        return false;
      }
    }
    if (s === 3) {
      if (!form.time) {
        toast({ title: "Horário obrigatório", description: "Selecione um horário.", variant: "destructive" });
        return false;
      }
      if (form.type === "once" && !form.date) {
        toast({ title: "Data obrigatória", description: "Selecione uma data para o disparo único.", variant: "destructive" });
        return false;
      }
      if (form.type === "weekly" && form.weekdays.length === 0) {
        toast({ title: "Dias obrigatórios", description: "Selecione ao menos um dia da semana.", variant: "destructive" });
        return false;
      }
    }
    if (s === 4) {
      if (form.groupIds.length === 0) {
        toast({ title: "Grupos obrigatórios", description: "Selecione ao menos um grupo.", variant: "destructive" });
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(5, s + 1));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const save = () => {
    if (!validateStep(3) || !validateStep(4)) return;
    if (editing) {
      const updated: GroupSchedule = { ...editing, ...form };
      persist(items.map((i) => (i.id === editing.id ? updated : i)));
      toast({ title: "Agendamento atualizado" });
    } else {
      const created: GroupSchedule = {
        ...form,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      persist([created, ...items]);
      toast({ title: "Agendamento criado" });
    }
    setDialogOpen(false);
    resetForm();
  };

  const toggleStatus = (s: GroupSchedule) => {
    const newStatus: ScheduleStatus = s.status === "ativo" ? "pausado" : "ativo";
    persist(items.map((i) => (i.id === s.id ? { ...i, status: newStatus } : i)));
  };

  const remove = (id: string) => {
    persist(items.filter((i) => i.id !== id));
    toast({ title: "Agendamento excluído" });
  };

  const toggleWeekday = (day: number) => {
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(day) ? f.weekdays.filter((d) => d !== day) : [...f.weekdays, day],
    }));
  };

  const setQuickWeekdays = (preset: "weekdays" | "weekend" | "all") => {
    const map = {
      weekdays: [1, 2, 3, 4, 5],
      weekend: [0, 6],
      all: [0, 1, 2, 3, 4, 5, 6],
    };
    setForm((f) => ({ ...f, weekdays: map[preset] }));
  };

  const toggleGroup = (id: string) => {
    setForm((f) => ({
      ...f,
      groupIds: f.groupIds.includes(id) ? f.groupIds.filter((g) => g !== id) : [...f.groupIds, id],
    }));
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-violet-500" />
            Agendamento de Grupo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie campanhas recorrentes ou únicas para envio em grupos do WhatsApp.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo agendamento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total" value={stats.total} icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard label="Ativos" value={stats.ativos} icon={<Play className="h-4 w-4" />} accent="text-emerald-500" />
        <StatCard label="Pausados" value={stats.pausados} icon={<Pause className="h-4 w-4" />} accent="text-amber-500" />
        <StatCard label="Envios hoje" value={stats.hoje} icon={<Calendar className="h-4 w-4" />} accent="text-violet-500" />
      </div>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agendamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum agendamento criado ainda.</p>
              <Button variant="outline" onClick={openNew} className="mt-4 gap-2">
                <Plus className="h-4 w-4" /> Criar primeiro agendamento
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Próximo envio</TableHead>
                  <TableHead>Grupos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => {
                  const nextRun = computeNextRun(s);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {s.type === "once" ? <Calendar className="h-3 w-3" /> : <Repeat className="h-3 w-3" />}
                          {s.type === "once" ? "Único" : "Semanal"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(nextRun)}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{s.groupIds.length} grupo(s)</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("capitalize", statusColor[s.status])}>
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {s.status !== "concluido" && (
                            <Button size="icon" variant="ghost" onClick={() => toggleStatus(s)} title={s.status === "ativo" ? "Pausar" : "Ativar"}>
                              {s.status === "ativo" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(s.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Wizard Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center justify-between mb-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="flex items-center flex-1 last:flex-none">
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                  step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {step > n ? <CheckCircle2 className="h-4 w-4" /> : n}
                </div>
                {n < 5 && <div className={cn("h-0.5 flex-1 mx-2", step > n ? "bg-primary" : "bg-muted")} />}
              </div>
            ))}
          </div>

          <div className="text-sm font-medium text-muted-foreground mb-3">
            {step === 1 && "1. Identificação"}
            {step === 2 && "2. Conteúdo"}
            {step === 3 && "3. Quando enviar"}
            {step === 4 && "4. Grupos"}
            {step === 5 && "5. Revisão"}
          </div>

          <div className="space-y-4 min-h-[280px]">
            {step === 1 && (
              <>
                <div>
                  <Label>Nome da campanha *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Promoção semanal" maxLength={100} />
                </div>
                <div>
                  <Label>Descrição (opcional)</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} rows={3} />
                </div>
                <div className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <Label>Status</Label>
                    <p className="text-xs text-muted-foreground">Ativo dispara conforme programado.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{form.status === "ativo" ? "Ativo" : "Pausado"}</span>
                    <Switch checked={form.status === "ativo"} onCheckedChange={(v) => setForm({ ...form, status: v ? "ativo" : "pausado" })} />
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <Label>Mensagem *</Label>
                  <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={8} placeholder="Digite a mensagem que será enviada nos grupos..." maxLength={4000} />
                  <p className="text-xs text-muted-foreground mt-1">{form.message.length}/4000 caracteres</p>
                </div>
                <div className="border border-dashed rounded-lg p-3 text-xs text-muted-foreground">
                  Suporte a mídia (imagem, vídeo, arquivo) será adicionado em breve.
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-3"> setForm({ ...form, type: v as ScheduleType })}>
                  <div className={cn("border rounded-lg p-4 cursor-pointer transition-colors", form.type === "once" && "border-primary bg-primary/5")} onClick={() => setForm({ ...form, type: "once" })}>
                    <div className="flex items-center gap-3">
                      
                      <Label htmlFor="once" className="cursor-pointer flex items-center gap-2 font-medium">
                        <Calendar className="h-4 w-4" /> Disparar só uma vez
                      </Label>
                    </div>
                    {form.type === "once" && (
                      <div className="grid grid-cols-2 gap-3 mt-3 pl-7">
                        <div>
                          <Label className="text-xs">Data</Label>
                          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Horário</Label>
                          <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={cn("border rounded-lg p-4 cursor-pointer transition-colors", form.type === "weekly" && "border-primary bg-primary/5")} onClick={() => setForm({ ...form, type: "weekly" })}>
                    <div className="flex items-center gap-3">
                      
                      <Label htmlFor="weekly" className="cursor-pointer flex items-center gap-2 font-medium">
                        <Repeat className="h-4 w-4" /> Disparar toda semana
                      </Label>
                    </div>
                    {form.type === "weekly" && (
                      <div className="space-y-3 mt-3 pl-7">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setQuickWeekdays("weekdays"); }}>Dias úteis</Button>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setQuickWeekdays("weekend"); }}>Fim de semana</Button>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setQuickWeekdays("all"); }}>Todos os dias</Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {WEEKDAYS.map((d) => (
                            <button
                              key={d.value}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleWeekday(d.value); }}
                              className={cn(
                                "h-9 w-12 rounded-md border text-xs font-medium transition-colors",
                                form.weekdays.includes(d.value)
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background hover:bg-muted"
                              )}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                        <div>
                          <Label className="text-xs">Horário</Label>
                          <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="w-40" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {step === 4 && (
              <div className="space-y-2">
                <Label>Selecione os grupos *</Label>
                <p className="text-xs text-muted-foreground mb-2">Lista de grupos será integrada em breve. Por enquanto, opções de exemplo:</p>
                {MOCK_GROUPS.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 border rounded-lg p-3 hover:bg-muted/30 cursor-pointer" onClick={() => toggleGroup(g.id)}>
                    <Checkbox checked={form.groupIds.includes(g.id)} onCheckedChange={() => toggleGroup(g.id)} />
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{g.name}</span>
                  </div>
                ))}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3">
                <ReviewRow label="Nome" value={form.name} />
                {form.description && <ReviewRow label="Descrição" value={form.description} />}
                <ReviewRow label="Tipo" value={form.type === "once" ? "Único" : "Semanal"} />
                {form.type === "once" ? (
                  <ReviewRow label="Quando" value={`${form.date} às ${form.time}`} />
                ) : (
                  <ReviewRow label="Quando" value={`${form.weekdays.sort().map((d) => WEEKDAYS[d].full).join(", ")} às ${form.time}`} />
                )}
                <ReviewRow label="Grupos" value={MOCK_GROUPS.filter((g) => form.groupIds.includes(g.id)).map((g) => g.name).join(", ") || "—"} />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Mensagem</p>
                  <div className="border rounded-lg p-3 text-sm whitespace-pre-wrap bg-muted/30">{form.message}</div>
                </div>
                <ReviewRow label="Status" value={form.status} />
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between sm:justify-between gap-2">
            <Button variant="ghost" onClick={back} disabled={step === 1}>Voltar</Button>
            {step < 5 ? (
              <Button onClick={next}>Continuar</Button>
            ) : (
              <Button onClick={save}>{editing ? "Salvar alterações" : "Criar agendamento"}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className={cn("h-9 w-9 rounded-lg bg-muted flex items-center justify-center", accent)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}
