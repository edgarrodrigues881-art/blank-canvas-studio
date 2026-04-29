import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
// radio-group not available; using custom toggle
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Send, Image as ImageIcon, Video, Mic, Type, History, CheckCircle2, XCircle, Plus, Trash2, Pencil, Calendar, Clock, X } from "lucide-react";

type Device = { id: string; name: string; number: string | null; status: string };
type StatusPost = { id: string; type: string; text_content: string | null; caption: string | null; status: string; success_count: number; error_count: number; created_at: string };
type Schedule = {
  id: string;
  name: string;
  enabled: boolean;
  type: "text" | "image" | "video" | "audio";
  text_content: string | null;
  media_url: string | null;
  caption: string | null;
  background_color: string | null;
  font: number | null;
  weekdays: number[];
  times: string[];
  device_mode: "all_online" | "fixed";
  device_ids: string[];
  last_run_at: string | null;
  run_count: number;
};

const STATUS_COLORS = ["#25D366", "#128C7E", "#075E54", "#34B7F1", "#FF6B6B", "#FFD93D", "#9B59B6", "#000000"];
const ONLINE_STATUSES = ["Ready", "Connected", "authenticated", "open", "active"];
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function uploadMediaFile(userId: string, file: File) {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/status/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return supabase.storage.from("media").upload(path, file, { contentType: file.type, upsert: false }).then(({ error }) => {
    if (error) throw new Error(error.message);
    return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
  });
}

// ===== INSTANT POST FORM =====
function PostNowTab({ devices }: { devices: Device[] }) {
  const { user } = useAuth();
  const [type, setType] = useState<"text" | "image" | "video" | "audio">("text");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState("#25D366");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const onlineDevices = useMemo(() => devices.filter((d) => ONLINE_STATUSES.includes(d.status)), [devices]);

  const handleSend = async () => {
    if (!user) return;
    if (selected.length === 0) return toast.error("Selecione ao menos uma instância");
    if (type === "text" && !text.trim()) return toast.error("Digite o texto");
    if (type !== "text" && !file) return toast.error("Selecione um arquivo");

    setSending(true);
    try {
      let mediaUrl: string | null = null;
      if (file) mediaUrl = await uploadMediaFile(user.id, file);

      const { data, error } = await supabase.functions.invoke("status-post", {
        body: {
          type,
          text_content: type === "text" ? text.trim() : undefined,
          media_url: mediaUrl || undefined,
          caption: type !== "text" && type !== "audio" ? caption.trim() : undefined,
          background_color: type === "text" ? bgColor : undefined,
          font: type === "text" ? 1 : undefined,
          device_ids: selected,
        },
      });

      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);

      const succ = (data as any)?.success_count ?? 0;
      const err = (data as any)?.error_count ?? 0;
      if (err === 0) toast.success(`Status publicado em ${succ} instância(s)`);
      else if (succ === 0) toast.error("Falha em todas as instâncias");
      else toast.warning(`Publicado: ${succ} • Falhas: ${err}`);

      setText(""); setCaption(""); setFile(null);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao publicar");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Conteúdo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={type} onValueChange={(v) => setType(v as any)}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="text"><Type className="w-4 h-4 mr-1.5" />Texto</TabsTrigger>
              <TabsTrigger value="image"><ImageIcon className="w-4 h-4 mr-1.5" />Imagem</TabsTrigger>
              <TabsTrigger value="video"><Video className="w-4 h-4 mr-1.5" />Vídeo</TabsTrigger>
              <TabsTrigger value="audio"><Mic className="w-4 h-4 mr-1.5" />Áudio</TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-4 mt-4">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva seu status..." rows={5} maxLength={700} />
              <div>
                <Label>Cor de fundo</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {STATUS_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setBgColor(c)}
                      className={`w-9 h-9 rounded-lg border-2 transition ${bgColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="rounded-lg p-6 min-h-[140px] flex items-center justify-center text-center text-white text-lg font-semibold whitespace-pre-wrap break-words" style={{ backgroundColor: bgColor }}>
                {text || "Pré-visualização"}
              </div>
            </TabsContent>

            <TabsContent value="image" className="space-y-4 mt-4">
              <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {file && file.type.startsWith("image/") && (
                <div className="rounded-lg overflow-hidden border bg-muted/30 flex items-center justify-center">
                  <img
                    src={URL.createObjectURL(file)}
                    alt="Pré-visualização"
                    className="max-h-[360px] w-auto object-contain"
                    onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                  />
                </div>
              )}
              <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda (opcional)" rows={2} />
            </TabsContent>

            <TabsContent value="video" className="space-y-4 mt-4">
              <Input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {file && file.type.startsWith("video/") && (
                <div className="rounded-lg overflow-hidden border bg-black flex items-center justify-center">
                  <video
                    src={URL.createObjectURL(file)}
                    controls
                    className="max-h-[360px] w-auto"
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">Máx. 30 segundos.</p>
              <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda (opcional)" rows={2} />
            </TabsContent>

            <TabsContent value="audio" className="space-y-4 mt-4">
              <Input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {file && file.type.startsWith("audio/") && (
                <audio src={URL.createObjectURL(file)} controls className="w-full" />
              )}
            </TabsContent>
          </Tabs>

          <Button onClick={handleSend} disabled={sending || selected.length === 0} className="w-full" size="lg">
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Publicar Agora ({selected.length})
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Instâncias</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setSelected(selected.length === onlineDevices.length ? [] : onlineDevices.map((d) => d.id))}>
            {selected.length === onlineDevices.length ? "Limpar" : "Todas"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[500px] overflow-auto">
          {devices.map((d) => {
            const online = ONLINE_STATUSES.includes(d.status);
            return (
              <label key={d.id} className={`flex items-center gap-3 rounded-md p-2 border ${online ? "hover:bg-accent cursor-pointer" : "opacity-50 cursor-not-allowed"}`}>
                <Checkbox checked={selected.includes(d.id)} disabled={!online}
                  onCheckedChange={(c) => setSelected((prev) => c ? [...prev, d.id] : prev.filter((x) => x !== d.id))} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.number || "—"}</p>
                </div>
                <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
              </label>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ===== SCHEDULE EDITOR DIALOG =====
function ScheduleDialog({
  open, onOpenChange, devices, editing, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; devices: Device[];
  editing: Schedule | null; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "image" | "video" | "audio">("text");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState("#25D366");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [newTime, setNewTime] = useState("12:00");
  const [deviceMode, setDeviceMode] = useState<"all_online" | "fixed">("all_online");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setText(editing.text_content || "");
      setBgColor(editing.background_color || "#25D366");
      setCaption(editing.caption || "");
      setExistingMediaUrl(editing.media_url);
      setFile(null);
      setWeekdays(editing.weekdays || []);
      setTimes(editing.times || []);
      setDeviceMode(editing.device_mode);
      setSelectedDevices(editing.device_ids || []);
    } else {
      setName(""); setType("text"); setText(""); setBgColor("#25D366"); setCaption("");
      setFile(null); setExistingMediaUrl(null);
      setWeekdays([1, 2, 3, 4, 5]); setTimes(["09:00"]);
      setDeviceMode("all_online"); setSelectedDevices([]);
    }
  }, [editing, open]);

  const toggleWeekday = (d: number) => {
    setWeekdays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  };

  const addTime = () => {
    if (!/^\d{2}:\d{2}$/.test(newTime)) return toast.error("Horário inválido");
    if (times.includes(newTime)) return;
    setTimes([...times, newTime].sort());
  };

  const removeTime = (t: string) => setTimes(times.filter((x) => x !== t));

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) return toast.error("Dê um nome ao agendamento");
    if (type === "text" && !text.trim()) return toast.error("Digite o texto");
    if (type !== "text" && !file && !existingMediaUrl) return toast.error("Selecione um arquivo");
    if (weekdays.length === 0) return toast.error("Escolha ao menos um dia");
    if (times.length === 0) return toast.error("Adicione ao menos um horário");
    if (deviceMode === "fixed" && selectedDevices.length === 0) return toast.error("Selecione as instâncias");

    setSaving(true);
    try {
      let mediaUrl: string | null = existingMediaUrl;
      if (file) mediaUrl = await uploadMediaFile(user.id, file);

      const payload: any = {
        user_id: user.id,
        name: name.trim(),
        type,
        text_content: type === "text" ? text.trim() : null,
        media_url: type !== "text" ? mediaUrl : null,
        caption: (type === "image" || type === "video") ? caption.trim() : null,
        background_color: type === "text" ? bgColor : null,
        font: type === "text" ? 1 : null,
        weekdays,
        times,
        device_mode: deviceMode,
        device_ids: deviceMode === "fixed" ? selectedDevices : [],
      };

      if (editing) {
        const { error } = await supabase.from("status_schedules").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Agendamento atualizado");
      } else {
        const { error } = await supabase.from("status_schedules").insert(payload);
        if (error) throw error;
        toast.success("Agendamento criado");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <Label>Nome do agendamento</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Bom dia matinal" />
          </div>

          <div>
            <Label>Conteúdo</Label>
            <Tabs value={type} onValueChange={(v) => setType(v as any)} className="mt-2">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="text"><Type className="w-4 h-4 mr-1.5" />Texto</TabsTrigger>
                <TabsTrigger value="image"><ImageIcon className="w-4 h-4 mr-1.5" />Imagem</TabsTrigger>
                <TabsTrigger value="video"><Video className="w-4 h-4 mr-1.5" />Vídeo</TabsTrigger>
                <TabsTrigger value="audio"><Mic className="w-4 h-4 mr-1.5" />Áudio</TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="space-y-3 mt-3">
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={700} placeholder="Texto do status" />
                <div className="flex gap-2 flex-wrap">
                  {STATUS_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setBgColor(c)}
                      className={`w-8 h-8 rounded-md border-2 ${bgColor === c ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="image" className="space-y-3 mt-3">
                {file && file.type.startsWith("image/") ? (
                  <div className="rounded-lg overflow-hidden border bg-muted/30 flex items-center justify-center">
                    <img src={URL.createObjectURL(file)} alt="" className="max-h-[280px] w-auto object-contain" />
                  </div>
                ) : existingMediaUrl && (
                  <div className="rounded-lg overflow-hidden border bg-muted/30 flex items-center justify-center">
                    <img src={existingMediaUrl} alt="" className="max-h-[280px] w-auto object-contain" />
                  </div>
                )}
                <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda" rows={2} />
              </TabsContent>

              <TabsContent value="video" className="space-y-3 mt-3">
                {file && file.type.startsWith("video/") ? (
                  <div className="rounded-lg overflow-hidden border bg-black flex items-center justify-center">
                    <video src={URL.createObjectURL(file)} controls className="max-h-[280px] w-auto" />
                  </div>
                ) : existingMediaUrl && (
                  <div className="rounded-lg overflow-hidden border bg-black flex items-center justify-center">
                    <video src={existingMediaUrl} controls className="max-h-[280px] w-auto" />
                  </div>
                )}
                <Input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda" rows={2} />
              </TabsContent>

              <TabsContent value="audio" className="space-y-3 mt-3">
                {file && file.type.startsWith("audio/") ? (
                  <audio src={URL.createObjectURL(file)} controls className="w-full" />
                ) : existingMediaUrl && (
                  <audio src={existingMediaUrl} controls className="w-full" />
                )}
                <Input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </TabsContent>
            </Tabs>
          </div>

          <div>
            <Label className="flex items-center gap-2"><Calendar className="w-4 h-4" />Dias da semana</Label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {WEEKDAY_LABELS.map((label, i) => (
                <button key={i} type="button" onClick={() => toggleWeekday(i)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition ${weekdays.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-2"><Clock className="w-4 h-4" />Horários (BRT)</Label>
            <div className="flex gap-2 mt-2">
              <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-40" />
              <Button type="button" variant="outline" onClick={addTime}><Plus className="w-4 h-4 mr-1" />Adicionar</Button>
            </div>
            <div className="flex gap-2 flex-wrap mt-3">
              {times.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1.5 pl-3 pr-1.5 py-1">
                  {t}
                  <button onClick={() => removeTime(t)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                </Badge>
              ))}
              {times.length === 0 && <p className="text-xs text-muted-foreground">Nenhum horário</p>}
            </div>
          </div>

          <div>
            <Label>Instâncias</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeviceMode("all_online")}
                className={`text-left p-3 border rounded-md transition ${deviceMode === "all_online" ? "border-primary bg-primary/5" : "hover:bg-accent"}`}>
                <p className="text-sm font-medium">Todas as conectadas</p>
                <p className="text-xs text-muted-foreground mt-0.5">Usa instâncias online no momento da execução</p>
              </button>
              <button type="button" onClick={() => setDeviceMode("fixed")}
                className={`text-left p-3 border rounded-md transition ${deviceMode === "fixed" ? "border-primary bg-primary/5" : "hover:bg-accent"}`}>
                <p className="text-sm font-medium">Instâncias específicas</p>
                <p className="text-xs text-muted-foreground mt-0.5">Apenas as selecionadas abaixo</p>
              </button>
            </div>

            {deviceMode === "fixed" && (
              <div className="mt-3 max-h-48 overflow-auto border rounded-md p-2 space-y-1">
                {devices.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 p-1.5 hover:bg-accent rounded cursor-pointer">
                    <Checkbox checked={selectedDevices.includes(d.id)}
                      onCheckedChange={(c) => setSelectedDevices((prev) => c ? [...prev, d.id] : prev.filter((x) => x !== d.id))} />
                    <span className="text-sm flex-1">{d.name}</span>
                    <span className="text-xs text-muted-foreground">{d.number || "—"}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== SCHEDULES TAB =====
function SchedulesTab({ devices }: { devices: Device[] }) {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("status_schedules")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setSchedules((data || []) as Schedule[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const toggle = async (s: Schedule) => {
    await supabase.from("status_schedules").update({ enabled: !s.enabled }).eq("id", s.id);
    load();
  };

  const remove = async (s: Schedule) => {
    if (!confirm(`Remover agendamento "${s.name}"?`)) return;
    await supabase.from("status_schedules").delete().eq("id", s.id);
    toast.success("Agendamento removido");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          O sistema verifica os agendamentos a cada minuto e publica nos horários definidos (fuso de Brasília).
        </p>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Novo Agendamento
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!loading && schedules.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nenhum agendamento. Crie o primeiro para postar status automaticamente.
        </CardContent></Card>
      )}

      <div className="grid gap-3">
        {schedules.map((s) => (
          <Card key={s.id} className={s.enabled ? "" : "opacity-60"}>
            <CardContent className="p-4 flex items-center gap-4">
              <Switch checked={s.enabled} onCheckedChange={() => toggle(s)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{s.name}</p>
                  <Badge variant="outline" className="capitalize text-xs">{s.type}</Badge>
                  <Badge variant="secondary" className="text-xs">
                    {s.device_mode === "all_online" ? "Todas conectadas" : `${s.device_ids.length} fixas`}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {s.text_content || s.caption || "—"}
                </p>
                <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span><Calendar className="w-3 h-3 inline mr-1" />{s.weekdays.map((w) => WEEKDAY_LABELS[w]).join(", ")}</span>
                  <span><Clock className="w-3 h-3 inline mr-1" />{s.times.join(", ")}</span>
                  <span>Execuções: {s.run_count}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditing(s); setDialogOpen(true); }}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(s)} className="text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        devices={devices}
        editing={editing}
        onSaved={load}
      />
    </div>
  );
}

// ===== HISTORY TAB =====
function HistoryTab() {
  const { user } = useAuth();
  const [history, setHistory] = useState<StatusPost[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("status_posts")
      .select("id, type, text_content, caption, status, success_count, error_count, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setHistory((data || []) as StatusPost[]));
  }, [user]);

  if (history.length === 0) return <p className="text-sm text-muted-foreground p-4">Nenhuma publicação ainda.</p>;

  return (
    <div className="space-y-2">
      {history.map((h) => (
        <div key={h.id} className="flex items-center gap-3 p-3 border rounded-md">
          <Badge variant="outline" className="capitalize">{h.type}</Badge>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{h.text_content || h.caption || "—"}</p>
            <p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />{h.success_count}</span>
            <span className="flex items-center gap-1 text-destructive"><XCircle className="w-3.5 h-3.5" />{h.error_count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== MAIN PAGE =====
export default function StatusPost() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("devices")
      .select("id, name, number, status")
      .eq("user_id", user.id)
      .neq("login_type", "report_wa")
      .order("created_at")
      .then(({ data }) => setDevices((data || []) as Device[]));
  }, [user]);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Postagem de Status</h1>
        <p className="text-sm text-muted-foreground">Publique status (stories) no WhatsApp manualmente ou agende para rodar todo dia.</p>
      </div>

      <Tabs defaultValue="now">
        <TabsList>
          <TabsTrigger value="now"><Send className="w-4 h-4 mr-1.5" />Postar Agora</TabsTrigger>
          <TabsTrigger value="schedules"><Calendar className="w-4 h-4 mr-1.5" />Agendamentos</TabsTrigger>
          <TabsTrigger value="history"><History className="w-4 h-4 mr-1.5" />Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="now" className="mt-4"><PostNowTab devices={devices} /></TabsContent>
        <TabsContent value="schedules" className="mt-4"><SchedulesTab devices={devices} /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  );
}
