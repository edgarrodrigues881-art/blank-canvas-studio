import { useEffect, useMemo, useRef, useState } from "react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Send, Image as ImageIcon, Video, Mic, Type, History, CheckCircle2, XCircle, Plus, Trash2, Pencil, Calendar, Clock, X, Upload, Eye, ChevronLeft, ChevronRight, Folder as FolderIcon, FolderPlus, Copy, ChevronDown, Film, MessageCircleX } from "lucide-react";
import { saveDraft, loadDraft, clearDraft, type StatusDraftMeta } from "@/lib/statusDraftStore";
import { WhatsAppTextEditor, renderWhatsAppMarkdown } from "@/components/WhatsAppTextEditor";

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
  schedule_mode: "recurring" | "oneshot";
  run_date: string | null;
  device_mode: "all_online" | "fixed";
  device_ids: string[];
  last_run_at: string | null;
  run_count: number;
  folder_id: string | null;
  created_at?: string;
};
type Folder = { id: string; name: string; color: string; position: number };

// Cores oficiais do status do WhatsApp
const STATUS_COLORS = ["#008080", "#073C4F", "#9DE1AE", "#FF6F61", "#FFB347", "#F4D35E", "#9B59B6", "#34B7F1"];
const ONLINE_STATUSES = ["Ready", "Connected", "authenticated", "open", "active"];
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// WhatsApp status fonts (1-5)
const STATUS_FONTS: { id: number; label: string; cssFamily: string }[] = [
  { id: 1, label: "Padrão", cssFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 2, label: "Serif", cssFamily: 'Georgia, "Times New Roman", serif' },
  { id: 3, label: "Manuscrita", cssFamily: '"Brush Script MT", "Lucida Handwriting", cursive' },
  { id: 4, label: "Monoespaçada", cssFamily: '"Courier New", monospace' },
  { id: 5, label: "Datilografada", cssFamily: '"Andale Mono", "Courier New", monospace' },
];

function fontCss(id?: number | null) {
  return STATUS_FONTS.find((f) => f.id === id)?.cssFamily || STATUS_FONTS[0].cssFamily;
}

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
  const [font, setFont] = useState<number>(1);
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState<number>(5);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Object URLs estáveis por arquivo
  const previewUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previewUrls.forEach((u) => URL.revokeObjectURL(u)), [previewUrls]);

  const onlineDevices = useMemo(() => devices.filter((d) => ONLINE_STATUSES.includes(d.status)), [devices]);

  // Carrega rascunho do IndexedDB ao montar
  useEffect(() => {
    (async () => {
      const { meta, files: storedFiles } = await loadDraft();
      if (meta) {
        setType(meta.type);
        setText(meta.text || "");
        setBgColor(meta.bgColor || "#25D366");
        setCaption(meta.caption || "");
        setSelected(meta.selectedDeviceIds || []);
        setDelaySeconds(meta.delaySeconds ?? 5);
        if (typeof meta.font === "number") setFont(meta.font);
        if (storedFiles.length) setFiles(storedFiles);
      }
      setDraftLoaded(true);
    })();
  }, []);

  // Persiste rascunho ao mudar
  useEffect(() => {
    if (!draftLoaded) return;
    const meta: StatusDraftMeta = {
      type, text, bgColor, caption,
      selectedDeviceIds: selected,
      delaySeconds,
      fileNames: files.map((f) => f.name),
      font,
    };
    saveDraft(meta, files).catch(() => {});
  }, [type, text, bgColor, caption, selected, delaySeconds, files, font, draftLoaded]);

  const acceptForType = type === "image" ? "image/*" : type === "video" ? "video/*" : type === "audio" ? "audio/*" : "";

  const onPickFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const clearAll = async () => {
    setFiles([]); setText(""); setCaption("");
    await clearDraft();
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast.success("Conteúdo limpo");
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const handleSend = async () => {
    if (!user) return;
    if (selected.length === 0) return toast.error("Selecione ao menos uma instância");
    if (type === "text" && !text.trim()) return toast.error("Digite o texto");
    if (type !== "text" && files.length === 0) return toast.error("Selecione ao menos um arquivo");

    const items: Array<File | null> = type === "text" ? [null] : files;
    setSending(true);
    setProgress({ done: 0, total: items.length });

    let totalSucc = 0, totalErr = 0, postFails = 0;

    try {
      for (let i = 0; i < items.length; i++) {
        const f = items[i];
        try {
          let mediaUrl: string | null = null;
          if (f) mediaUrl = await uploadMediaFile(user.id, f);

          const { data, error } = await supabase.functions.invoke("status-post", {
            body: {
              type,
              text_content: type === "text" ? text.trim() : undefined,
              media_url: mediaUrl || undefined,
              caption: type !== "text" && type !== "audio" ? caption.trim() : undefined,
              background_color: type === "text" ? bgColor : undefined,
              font: type === "text" ? font : undefined,
              device_ids: selected,
            },
          });

          if (error) throw new Error(error.message);
          if ((data as any)?.error) throw new Error((data as any).error);

          totalSucc += (data as any)?.success_count ?? 0;
          totalErr += (data as any)?.error_count ?? 0;
        } catch (e: any) {
          postFails += 1;
          toast.error(`Item ${i + 1}: ${e?.message || "erro"}`);
        }

        setProgress({ done: i + 1, total: items.length });
        if (i < items.length - 1 && delaySeconds > 0) await sleep(delaySeconds * 1000);
      }

      if (postFails === 0 && totalErr === 0) {
        toast.success(`Publicado: ${items.length} item(ns) • ${totalSucc} envio(s)`);
      } else if (totalSucc === 0) {
        toast.error("Falha em todas as publicações");
      } else {
        toast.warning(`OK: ${totalSucc} • Falhas: ${totalErr + postFails}`);
      }

      if (postFails === 0) {
        setFiles([]); setText(""); setCaption("");
        await clearDraft();
      }
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Conteúdo</CardTitle>
          {(files.length > 0 || text || caption) && (
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={sending}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />Limpar tudo
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={type} onValueChange={(v) => { setType(v as any); setFiles([]); }}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="text"><Type className="w-4 h-4 mr-1.5" />Texto</TabsTrigger>
              <TabsTrigger value="image"><ImageIcon className="w-4 h-4 mr-1.5" />Imagem</TabsTrigger>
              <TabsTrigger value="video"><Video className="w-4 h-4 mr-1.5" />Vídeo</TabsTrigger>
              <TabsTrigger value="audio"><Mic className="w-4 h-4 mr-1.5" />Áudio</TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-4 mt-4">
              <WhatsAppTextEditor
                value={text}
                onChange={setText}
                placeholder="Escreva seu status... (use *negrito*, _itálico_, ~riscado~, ```mono```)"
                rows={5}
                maxLength={700}
              />
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
              <div>
                <Label>Fonte</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {STATUS_FONTS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFont(f.id)}
                      className={`px-3 py-1.5 rounded-md border text-sm transition ${font === f.id ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"}`}
                      style={{ fontFamily: f.cssFamily }}
                      title={f.label}
                    >
                      Aa
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="rounded-lg p-6 min-h-[140px] flex items-center justify-center text-center text-white text-lg font-semibold whitespace-pre-wrap break-words"
                style={{ backgroundColor: bgColor, fontFamily: fontCss(font) }}
                dangerouslySetInnerHTML={{ __html: renderWhatsAppMarkdown(text) || '<span class="opacity-70">Pré-visualização</span>' }}
              />
            </TabsContent>

            {(type === "image" || type === "video" || type === "audio") && (
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-2">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={acceptForType}
                    onChange={(e) => onPickFiles(e.target.files)}
                  />
                  {files.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setFiles([])} disabled={sending}>
                      <X className="w-4 h-4 mr-1" />Remover todos
                    </Button>
                  )}
                </div>

                {type === "video" && (
                  <p className="text-xs text-muted-foreground">Máx. 30 segundos por vídeo.</p>
                )}

                {files.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{files.length} arquivo(s) — publicados em sequência na ordem abaixo.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {files.map((f, i) => (
                        <div key={`${f.name}-${i}`} className="relative group rounded-lg overflow-hidden border bg-muted/30">
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            disabled={sending}
                            className="absolute top-1 right-1 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 opacity-100 transition"
                            aria-label="Remover"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <div className="absolute top-1 left-1 z-10 bg-black/60 text-white text-[10px] rounded px-1.5 py-0.5">
                            {i + 1}
                          </div>
                          {type === "image" && (
                            <img src={previewUrls[i]} alt="" className="w-full h-32 object-cover" />
                          )}
                          {type === "video" && (
                            <video src={previewUrls[i]} className="w-full h-32 object-cover" muted />
                          )}
                          {type === "audio" && (
                            <div className="p-3 pt-7 space-y-2">
                              <p className="text-xs truncate">{f.name}</p>
                              <audio src={previewUrls[i]} controls className="w-full" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {type !== "audio" && (
                  <WhatsAppTextEditor
                    value={caption}
                    onChange={setCaption}
                    placeholder="Legenda (opcional) — *negrito*, _itálico_, ~riscado~, ```mono```"
                    rows={2}
                  />
                )}
              </div>
            )}
          </Tabs>

          {/* Delay configurável (vale para texto também caso enviado em sequência futura) */}
          {((type !== "text" && files.length > 1)) && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Label htmlFor="delay" className="text-sm whitespace-nowrap">Delay entre publicações</Label>
              <Input
                id="delay"
                type="number"
                min={0}
                max={3600}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Math.max(0, Math.min(3600, Number(e.target.value) || 0)))}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">segundos</span>
            </div>
          )}

          <Button onClick={handleSend} disabled={sending || selected.length === 0} className="w-full" size="lg">
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            {sending && progress
              ? `Publicando ${progress.done}/${progress.total}...`
              : `Publicar Agora (${type === "text" ? selected.length : `${files.length || 0} × ${selected.length}`})`}
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
  open, onOpenChange, devices, editing, onSaved, folders, defaultFolderId,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; devices: Device[];
  editing: Schedule | null; onSaved: () => void;
  folders: Folder[]; defaultFolderId?: string | null;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "image" | "video" | "audio">("text");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState("#25D366");
  const [font, setFont] = useState<number>(1);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [time, setTime] = useState<string>("12:00");
  const [scheduleMode, setScheduleMode] = useState<"recurring" | "oneshot">("recurring");
  const [runDate, setRunDate] = useState<string>(""); // YYYY-MM-DD
  const [deviceMode, setDeviceMode] = useState<"all_online" | "fixed">("all_online");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setText(editing.text_content || "");
      setBgColor(editing.background_color || "#25D366");
      setFont(editing.font || 1);
      setCaption(editing.caption || "");
      setExistingMediaUrl(editing.media_url);
      setFile(null);
      setWeekdays(editing.weekdays || []);
      setTime(editing.times?.[0] || "12:00");
      setScheduleMode(editing.schedule_mode || "recurring");
      setRunDate(editing.run_date || "");
      setDeviceMode(editing.device_mode);
      setSelectedDevices(editing.device_ids || []);
      setFolderId(editing.folder_id || null);
    } else {
      setName(""); setType("text"); setText(""); setBgColor("#25D366"); setFont(1); setCaption("");
      setFile(null); setExistingMediaUrl(null);
      setWeekdays([1, 2, 3, 4, 5]);
      setTime("12:00");
      setScheduleMode("recurring");
      setRunDate("");
      setDeviceMode("all_online"); setSelectedDevices([]);
      setFolderId(defaultFolderId || null);
    }
  }, [editing, open]);

  const toggleWeekday = (d: number) => {
    setWeekdays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) return toast.error("Dê um nome ao agendamento");
    if (type === "text" && !text.trim()) return toast.error("Digite o texto");
    if (type !== "text" && !file && !existingMediaUrl) return toast.error("Selecione um arquivo");
    if (!/^\d{2}:\d{2}$/.test(time)) return toast.error("Horário inválido");
    if (scheduleMode === "recurring" && weekdays.length === 0) return toast.error("Escolha ao menos um dia da semana");
    if (scheduleMode === "oneshot" && !runDate) return toast.error("Escolha a data do disparo");
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
        font: type === "text" ? font : null,
        // 1 horário só por agendamento
        times: [time],
        // Modo: recorrente (dias da semana) OU única (data específica)
        schedule_mode: scheduleMode,
        weekdays: scheduleMode === "recurring" ? weekdays : [],
        run_date: scheduleMode === "oneshot" ? runDate : null,
        device_mode: deviceMode,
        device_ids: deviceMode === "fixed" ? selectedDevices : [],
        folder_id: folderId,
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
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
            <div>
              <Label>Nome do agendamento</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Bom dia matinal" />
            </div>
            <div>
              <Label>Pasta</Label>
              <select
                value={folderId || ""}
                onChange={(e) => setFolderId(e.target.value || null)}
                className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Sem pasta</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
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
                <WhatsAppTextEditor
                  value={text}
                  onChange={setText}
                  rows={4}
                  maxLength={700}
                  placeholder="Texto do status — *negrito*, _itálico_, ~riscado~, ```mono```"
                />
                <div>
                  <Label className="text-xs">Cor de fundo</Label>
                  <div className="flex gap-2 flex-wrap mt-1.5">
                    {STATUS_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setBgColor(c)}
                        className={`w-8 h-8 rounded-md border-2 ${bgColor === c ? "border-foreground" : "border-transparent"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Fonte</Label>
                  <div className="flex gap-2 flex-wrap mt-1.5">
                    {STATUS_FONTS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFont(f.id)}
                        className={`px-2.5 py-1 rounded-md border text-xs ${font === f.id ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"}`}
                        style={{ fontFamily: f.cssFamily }}
                        title={f.label}
                      >
                        Aa
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className="rounded-lg p-4 min-h-[100px] flex items-center justify-center text-center text-white text-base font-semibold whitespace-pre-wrap break-words"
                  style={{ backgroundColor: bgColor, fontFamily: fontCss(font) }}
                  dangerouslySetInnerHTML={{ __html: renderWhatsAppMarkdown(text) || '<span class="opacity-70">Pré-visualização</span>' }}
                />
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
                <WhatsAppTextEditor value={caption} onChange={setCaption} placeholder="Legenda — *negrito*, _itálico_, ~riscado~, ```mono```" rows={2} />
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
                <WhatsAppTextEditor value={caption} onChange={setCaption} placeholder="Legenda — *negrito*, _itálico_, ~riscado~, ```mono```" rows={2} />
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

          {/* Modo do agendamento */}
          <div>
            <Label>Quando publicar</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setScheduleMode("recurring")}
                className={`text-left p-3 border rounded-md transition ${scheduleMode === "recurring" ? "border-primary bg-primary/5" : "hover:bg-accent"}`}>
                <p className="text-sm font-medium flex items-center gap-2"><Calendar className="w-4 h-4" />Recorrente</p>
                <p className="text-xs text-muted-foreground mt-0.5">Repete nos dias da semana escolhidos</p>
              </button>
              <button type="button" onClick={() => setScheduleMode("oneshot")}
                className={`text-left p-3 border rounded-md transition ${scheduleMode === "oneshot" ? "border-primary bg-primary/5" : "hover:bg-accent"}`}>
                <p className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4" />Data única</p>
                <p className="text-xs text-muted-foreground mt-0.5">Dispara 1 vez no dia escolhido</p>
              </button>
            </div>
          </div>

          {/* Recorrente: dias da semana */}
          {scheduleMode === "recurring" && (
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
          )}

          {/* Oneshot: data específica */}
          {scheduleMode === "oneshot" && (
            <div>
              <Label className="flex items-center gap-2"><Calendar className="w-4 h-4" />Data do disparo</Label>
              <Input
                type="date"
                value={runDate}
                onChange={(e) => setRunDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="mt-2 w-48"
              />
              {runDate && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Será publicado no dia {runDate.split("-").reverse().join("/")} às {time} (BRT) e desativado depois.
                </p>
              )}
            </div>
          )}

          {/* Horário único */}
          <div>
            <Label className="flex items-center gap-2"><Clock className="w-4 h-4" />Horário (BRT)</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Cada agendamento publica em <strong>1 horário</strong>. Para outros horários, crie outros agendamentos.
            </p>

            {/* Atalhos rápidos */}
            <div className="flex gap-2 flex-wrap mt-3">
              {["08:00", "10:00", "12:00", "15:00", "17:00", "19:00", "21:00"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTime(preset)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition ${
                    time === preset
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-accent"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Horário exato */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Outro horário:</span>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32 h-9" />
            </div>

            <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Vai publicar às <span className="text-primary">{time}</span></span>
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
// ===== PREVIEW DIALOG (carousel-ready) =====
function SchedulePreviewDialog({ items, title, onClose }: { items: Schedule[] | null; title?: string; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const key = items?.map((s) => s.id).join(",") || "";
  useEffect(() => { setIdx(0); }, [key]);

  if (!items || items.length === 0) return null;

  // Sort by time so carousel reflects the campaign order
  const sorted = [...items].sort((a, b) => {
    const t = (a.times?.[0] || "").localeCompare(b.times?.[0] || "");
    if (t !== 0) return t;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });

  const slides = sorted.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    mediaUrl: s.media_url,
    caption: s.caption,
    text: s.text_content,
    bg: s.background_color,
    font: s.font,
    schedule_mode: s.schedule_mode,
    run_date: s.run_date,
    weekdays: s.weekdays,
    times: s.times,
  }));

  const total = slides.length;
  const slide = slides[idx];
  const isMulti = total > 1;

  const mediaIcon = (t: string) => {
    if (t === "image") return <ImageIcon className="w-3.5 h-3.5" />;
    if (t === "video") return <Video className="w-3.5 h-3.5" />;
    if (t === "audio") return <Mic className="w-3.5 h-3.5" />;
    return <Type className="w-3.5 h-3.5" />;
  };

  return (
    <Dialog open={!!items} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="truncate">{title || slide.name}</span>
            {isMulti && (
              <span className="text-xs font-normal text-muted-foreground ml-auto">{slide.name}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Slide */}
          <div className="relative bg-muted/40 border border-border/60 rounded-xl overflow-hidden">
            {slide.type === "text" ? (
              <div
                className="aspect-square flex items-center justify-center p-6 text-center"
                style={{ background: slide.bg || "#25D366", fontFamily: fontCss(slide.font) }}
              >
                <p className="text-white text-xl font-medium whitespace-pre-wrap break-words">
                  {slide.text || "—"}
                </p>
              </div>
            ) : slide.type === "image" && slide.mediaUrl ? (
              <div className="w-full bg-muted/40 flex items-center justify-center">
                <img src={slide.mediaUrl} alt="" loading="lazy" className="w-full h-auto max-h-[420px] object-contain" />
              </div>
            ) : slide.type === "video" && slide.mediaUrl ? (
              <div className="w-full bg-muted/40 flex items-center justify-center">
                <video
                  src={`${slide.mediaUrl}#t=0.1`}
                  preload="metadata"
                  muted
                  playsInline
                  className="w-full h-auto max-h-[420px] object-contain"
                />
              </div>
            ) : slide.type === "audio" && slide.mediaUrl ? (
              <div className="py-10 bg-muted/40 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Mic className="w-12 h-12 opacity-60" />
                <p className="text-xs">Áudio (preview desativado)</p>
              </div>
            ) : (
              <div className="aspect-square flex items-center justify-center text-muted-foreground text-sm">
                Sem mídia
              </div>
            )}

            {/* Carousel arrows */}
            {isMulti && (
              <>
                <button
                  type="button"
                  onClick={() => setIdx((i) => (i - 1 + total) % total)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIdx((i) => (i + 1) % total)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition"
                  aria-label="Próximo"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-background/80 backdrop-blur text-[10px] font-medium">
                  {idx + 1} / {total}
                </div>
              </>
            )}
          </div>

          {/* Type + caption */}
          <div className="space-y-2">
            <Badge variant="outline" className="capitalize text-xs gap-1">
              {mediaIcon(slide.type)}
              {slide.type}
            </Badge>
            {slide.caption && (
              <div className="text-sm bg-muted/40 rounded-lg p-3 border border-border/50 whitespace-pre-wrap break-words">
                {slide.caption}
              </div>
            )}
            {!slide.caption && slide.type !== "text" && (
              <p className="text-xs text-muted-foreground italic">Sem legenda</p>
            )}
          </div>

          {/* Dots */}
          {isMulti && (
            <div className="flex justify-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          )}

          {/* Schedule meta */}
          <div className="border-t border-border pt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              {(slide.schedule_mode || "recurring") === "oneshot" && slide.run_date
                ? slide.run_date.split("-").reverse().join("/")
                : (slide.weekdays || []).map((w) => WEEKDAY_LABELS[w]).join(", ") || "—"}
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {(slide.times || []).join(", ") || "—"}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== FOLDER DIALOG =====
const FOLDER_COLORS = ["#25D366", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

function FolderDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  editing: Folder | null; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [color, setColor] = useState(FOLDER_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) { setName(editing.name); setColor(editing.color); }
    else { setName(""); setColor(FOLDER_COLORS[0]); }
  }, [editing, open]);

  const save = async () => {
    if (!user || !name.trim()) return toast.error("Dê um nome à pasta");
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("status_schedule_folders")
          .update({ name: name.trim(), color }).eq("id", editing.id);
        if (error) throw error;
        toast.success("Pasta atualizada");
      } else {
        const { error } = await supabase.from("status_schedule_folders")
          .insert({ user_id: user.id, name: name.trim(), color });
        if (error) throw error;
        toast.success("Pasta criada");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar pasta" : "Nova pasta"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Segunda — Promoções" />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {FOLDER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== SCHEDULE ROW (used inside and outside folders) =====
function ScheduleRow({
  s, onToggle, onPreview, onEdit, onDelete, locked,
}: {
  s: Schedule;
  onToggle: () => void;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
  locked?: boolean;
}) {
  return (
    <Card className={s.enabled ? "" : "opacity-60"}>
      <CardContent className="p-4 flex items-center gap-4">
        <Switch checked={s.enabled} onCheckedChange={onToggle} />
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
          <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
            {(s.schedule_mode || "recurring") === "oneshot" && s.run_date ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                <Calendar className="w-3 h-3 inline mr-1" />
                Única: {s.run_date.split("-").reverse().join("/")}
              </span>
            ) : (
              <span><Calendar className="w-3 h-3 inline mr-1" />{(s.weekdays || []).map((w) => WEEKDAY_LABELS[w]).join(", ") || "—"}</span>
            )}
            <span><Clock className="w-3 h-3 inline mr-1" />{(s.times || []).join(", ")}</span>
            <span>Execuções: {s.run_count}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onPreview} title="Visualizar">
            <Eye className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onEdit} title="Editar">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} className="text-destructive" title="Excluir">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SchedulesTab({ devices }: { devices: Device[] }) {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [defaultFolderId, setDefaultFolderId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Schedule | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [previewing, setPreviewing] = useState<{ items: Schedule[]; title?: string } | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderEditing, setFolderEditing] = useState<Folder | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState(false);
  const [pausedFolders, setPausedFolders] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("statusPost.pausedFolders");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const persistPaused = (next: Set<string>) => {
    try { localStorage.setItem("statusPost.pausedFolders", JSON.stringify([...next])); } catch {}
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: sch }, { data: fld }] = await Promise.all([
      supabase.from("status_schedules").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("status_schedule_folders").select("*").eq("user_id", user.id).order("position", { ascending: true }).order("created_at", { ascending: true }),
    ]);
    setSchedules((sch || []) as Schedule[]);
    setFolders((fld || []) as Folder[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const toggle = async (s: Schedule) => {
    const newVal = !s.enabled;
    // Optimistic update — no flicker
    setSchedules((prev) => prev.map((x) => x.id === s.id ? { ...x, enabled: newVal } : x));
    // If user activates an item inside a paused folder, auto-unpause the folder
    if (newVal && s.folder_id && pausedFolders.has(s.folder_id)) {
      const next = new Set(pausedFolders);
      next.delete(s.folder_id);
      setPausedFolders(next);
      persistPaused(next);
    }
    const { error } = await supabase.from("status_schedules").update({ enabled: newVal }).eq("id", s.id);
    if (error) {
      // revert on failure
      setSchedules((prev) => prev.map((x) => x.id === s.id ? { ...x, enabled: !newVal } : x));
      toast.error("Erro ao atualizar");
    }
  };

  const toggleFolder = async (folder: Folder, items: Schedule[]) => {
    const isPaused = pausedFolders.has(folder.id);
    const next = new Set(pausedFolders);
    if (isPaused) {
      // Unpause: just unlock switches. Do NOT mass-activate items.
      next.delete(folder.id);
      setPausedFolders(next);
      persistPaused(next);
      toast.success("Pasta destravada — ative os agendamentos manualmente");
    } else {
      // Pause: turn all items off and lock the folder
      next.add(folder.id);
      setPausedFolders(next);
      persistPaused(next);
      const ids = items.filter((s) => s.enabled).map((s) => s.id);
      // Optimistic
      setSchedules((prev) => prev.map((x) => x.folder_id === folder.id ? { ...x, enabled: false } : x));
      if (ids.length > 0) {
        await supabase.from("status_schedules").update({ enabled: false }).in("id", ids);
      }
      toast.success("Pasta pausada");
    }
  };

  const duplicateFolder = async (folder: Folder, items: Schedule[]) => {
    if (!user) return;
    if (items.length === 0) return toast.error("Pasta vazia — nada pra duplicar");
    try {
      const { data: newFolder, error: fErr } = await supabase
        .from("status_schedule_folders")
        .insert({ user_id: user.id, name: `${folder.name} (cópia)`, color: folder.color })
        .select()
        .single();
      if (fErr) throw fErr;

      const clones = items.map((s) => ({
        user_id: user.id,
        folder_id: newFolder.id,
        name: s.name,
        type: s.type,
        text_content: s.text_content,
        media_url: s.media_url,
        caption: s.caption,
        background_color: s.background_color,
        font: s.font,
        weekdays: s.weekdays,
        times: s.times,
        schedule_mode: s.schedule_mode,
        run_date: s.run_date,
        device_mode: s.device_mode,
        device_ids: s.device_ids,
        enabled: false,
      }));
      const { error: cErr } = await supabase.from("status_schedules").insert(clones);
      if (cErr) throw cErr;
      toast.success(`Pasta duplicada com ${clones.length} agendamento(s)`);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao duplicar");
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await supabase.from("status_schedules").delete().eq("id", toDelete.id);
      toast.success("Agendamento removido");
      setToDelete(null);
      load();
    } finally { setDeleting(false); }
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    setDeleting(true);
    try {
      // delete schedules in folder + folder
      await supabase.from("status_schedules").delete().eq("folder_id", folderToDelete.id);
      await supabase.from("status_schedule_folders").delete().eq("id", folderToDelete.id);
      toast.success("Pasta e agendamentos removidos");
      setFolderToDelete(null);
      load();
    } finally { setDeleting(false); }
  };

  // Group by folder
  const grouped = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const f of folders) map.set(f.id, []);
    const orphans: Schedule[] = [];
    for (const s of schedules) {
      if (s.folder_id && map.has(s.folder_id)) map.get(s.folder_id)!.push(s);
      else orphans.push(s);
    }
    // sort schedules in each folder by time asc, tiebreak by created_at asc (oldest first)
    const cmp = (a: Schedule, b: Schedule) => {
      const t = (a.times?.[0] || "").localeCompare(b.times?.[0] || "");
      if (t !== 0) return t;
      return (a.created_at || "").localeCompare(b.created_at || "");
    };
    for (const arr of map.values()) arr.sort(cmp);
    orphans.sort(cmp);
    return { map, orphans };
  }, [schedules, folders]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
          Organize seus agendamentos em pastas (campanhas, dias da semana, etc.). O sistema verifica a cada minuto e publica nos horários definidos (BRT).
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setFolderEditing(null); setFolderDialogOpen(true); }}>
            <FolderPlus className="w-4 h-4 mr-1.5" />Nova Pasta
          </Button>
          <Button onClick={() => { setEditing(null); setDefaultFolderId(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />Novo Agendamento
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!loading && schedules.length === 0 && folders.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nenhum agendamento ainda. Crie uma pasta pra organizar ou um agendamento avulso.
        </CardContent></Card>
      )}

      {/* Folders */}
      <div className="space-y-3">
        {folders.map((f) => {
          const items = grouped.map.get(f.id) || [];
          const isCollapsed = collapsed[f.id];
          const folderLocked = pausedFolders.has(f.id);
          const folderActive = !folderLocked;
          return (
            <Card key={f.id} className="overflow-hidden">
              <div
                className="px-4 py-3 flex items-center gap-3 border-l-4"
                style={{ borderLeftColor: f.color, background: `${f.color}10` }}
              >
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [f.id]: !c[f.id] }))}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  <FolderIcon className="w-4 h-4" style={{ color: f.color }} />
                  <span className="font-semibold truncate">{f.name}</span>
                  <Badge variant="secondary" className="text-xs ml-1">{items.length}</Badge>
                  {items.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {items.filter((s) => s.enabled).length} ativas
                    </Badge>
                  )}
                </button>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={folderActive}
                    disabled={items.length === 0}
                    onCheckedChange={() => toggleFolder(f, items)}
                  />
                  <Button size="icon" variant="ghost" title="Visualizar pasta (carrossel)"
                    disabled={items.length === 0}
                    onClick={() => setPreviewing({ items, title: f.name })}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Adicionar agendamento nesta pasta"
                    onClick={() => { setEditing(null); setDefaultFolderId(f.id); setDialogOpen(true); }}>
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Duplicar pasta"
                    onClick={() => duplicateFolder(f, items)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Editar pasta"
                    onClick={() => { setFolderEditing(f); setFolderDialogOpen(true); }}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Excluir pasta"
                    className="text-destructive"
                    onClick={() => setFolderToDelete(f)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {!isCollapsed && (
                <div className="p-3 space-y-2 bg-muted/10">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4 italic">
                      Pasta vazia. Clique em + para adicionar um agendamento aqui.
                    </p>
                  ) : (
                    items.map((s) => (
                      <ScheduleRow
                        key={s.id} s={s}
                        locked={folderLocked}
                        onToggle={() => toggle(s)}
                        onPreview={() => setPreviewing({ items: [s] })}
                        onEdit={() => { setEditing(s); setDialogOpen(true); }}
                        onDelete={() => setToDelete(s)}
                      />
                    ))
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Orphans (avulsos) */}
      {grouped.orphans.length > 0 && (
        <div className="space-y-2">
          {folders.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Sem pasta</p>
          )}
          {grouped.orphans.map((s) => (
            <ScheduleRow
              key={s.id} s={s}
              onToggle={() => toggle(s)}
              onPreview={() => setPreviewing({ items: [s] })}
              onEdit={() => { setEditing(s); setDialogOpen(true); }}
              onDelete={() => setToDelete(s)}
            />
          ))}
        </div>
      )}

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        devices={devices}
        editing={editing}
        onSaved={load}
        folders={folders}
        defaultFolderId={defaultFolderId}
      />

      <FolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        editing={folderEditing}
        onSaved={load}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o agendamento <span className="font-medium text-foreground">"{toDelete?.name}"</span>? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!folderToDelete} onOpenChange={(o) => !o && setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pasta inteira?</AlertDialogTitle>
            <AlertDialogDescription>
              A pasta <span className="font-medium text-foreground">"{folderToDelete?.name}"</span> e <span className="font-medium text-foreground">todos os agendamentos dentro</span> serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDeleteFolder(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SchedulePreviewDialog
        items={previewing?.items || null}
        title={previewing?.title}
        onClose={() => setPreviewing(null)}
      />
    </div>
  );
}

// ===== HISTORY TAB =====
function HistoryTab() {
  const { user } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deletingWa, setDeletingWa] = useState<string | null>(null);
  const [confirmWaDelete, setConfirmWaDelete] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  const load = () => {
    if (!user) return;
    supabase.from("status_posts")
      .select("id, type, text_content, media_url, caption, background_color, font, status, success_count, error_count, created_at, results")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setHistory(data || []));
  };

  useEffect(() => { load(); }, [user]);

  const clearHistory = async () => {
    if (!user) return;
    setClearing(true);
    try {
      const { error } = await supabase.from("status_posts").delete().eq("user_id", user.id);
      if (error) throw error;
      setHistory([]);
      setConfirmOpen(false);
      toast.success("Histórico limpo");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao limpar");
    } finally {
      setClearing(false);
    }
  };

  const deleteOne = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("status_posts").delete().eq("id", id);
      if (error) throw error;
      setHistory((prev) => prev.filter((x) => x.id !== id));
      setConfirmDelete(null);
      toast.success("Publicação removida");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao remover");
    } finally {
      setDeletingId(null);
    }
  };

  const deleteFromWhatsapp = async (postId: string) => {
    setDeletingWa(postId);
    try {
      const { data, error } = await supabase.functions.invoke("status-delete", {
        body: { post_id: postId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const { deleted = 0, failed = 0 } = (data as any) || {};
      if (deleted > 0 && failed === 0) toast.success(`Status apagado em ${deleted} instância(s)`);
      else if (deleted > 0) toast.warning(`Apagado em ${deleted}, falhou em ${failed}`);
      else toast.error("Não foi possível apagar via API");
      setConfirmWaDelete(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao apagar do WhatsApp");
    } finally {
      setDeletingWa(null);
    }
  };

  const canDeleteFromWa = (h: any) => {
    const results = Array.isArray(h?.results) ? h.results : [];
    return results.some((r: any) => r?.success && r?.message_id && !r?.deleted);
  };

  const isAllDeleted = (h: any) => {
    const results = Array.isArray(h?.results) ? h.results : [];
    const successes = results.filter((r: any) => r?.success && r?.message_id);
    return successes.length > 0 && successes.every((r: any) => r?.deleted);
  };

  const statusBadge = (h: any) => {
    if (h.status === "failed" || (h.error_count > 0 && h.success_count === 0)) {
      return <Badge variant="destructive" className="text-[10px]">Falhou</Badge>;
    }
    if (h.error_count > 0) {
      return <Badge className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20">Parcial</Badge>;
    }
    if (h.success_count > 0) {
      return <Badge className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20">Enviado</Badge>;
    }
    return <Badge variant="secondary" className="text-[10px]">{h.status || "—"}</Badge>;
  };

  const renderThumb = (h: any) => {
    const t = h.type;
    if (t === "image" && h.media_url) {
      return <img src={h.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />;
    }
    if (t === "video" && h.media_url) {
      return (
        <div className="relative w-full h-full bg-black flex items-center justify-center">
          <video src={h.media_url} className="w-full h-full object-cover" muted preload="metadata" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
              <div className="w-0 h-0 border-l-[10px] border-l-black border-y-[6px] border-y-transparent ml-0.5" />
            </div>
          </div>
        </div>
      );
    }
    if (t === "audio") {
      return (
        <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
          <Mic className="w-7 h-7 text-white" />
        </div>
      );
    }
    // text
    const bg = h.background_color || "#008080";
    return (
      <div className="w-full h-full flex items-center justify-center p-1.5" style={{ background: bg }}>
        <p className="text-[9px] text-white text-center font-semibold leading-tight line-clamp-4 break-words">
          {h.text_content || "—"}
        </p>
      </div>
    );
  };

  const typeIcon = (t: string) => {
    if (t === "image") return <ImageIcon className="w-3 h-3" />;
    if (t === "video") return <Film className="w-3 h-3" />;
    if (t === "audio") return <Mic className="w-3 h-3" />;
    return <Type className="w-3 h-3" />;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Hoje, ${time}`;
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Ontem, ${time}`;
    return `${d.toLocaleDateString("pt-BR")} • ${time}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            {history.length === 0 ? "Nenhuma publicação ainda." : `${history.length} publicação(ões) recente(s)`}
          </p>
        </div>
        {history.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)} className="text-destructive hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />Limpar histórico
          </Button>
        )}
      </div>

      {history.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Suas publicações de status aparecerão aqui após serem enviadas.
        </Card>
      )}

      <div className="space-y-2">
        {history.map((h) => {
          const total = (h.success_count || 0) + (h.error_count || 0);
          const successRate = total > 0 ? Math.round(((h.success_count || 0) / total) * 100) : 0;
          return (
            <Card key={h.id} className="overflow-hidden hover:border-primary/40 transition-colors">
              <div className="flex items-stretch gap-3 p-3">
                {/* Thumbnail */}
                <div className="w-16 h-20 flex-shrink-0 rounded-md overflow-hidden border border-border/50">
                  {renderThumb(h)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] h-5 capitalize gap-1 px-1.5">
                        {typeIcon(h.type)}{h.type}
                      </Badge>
                      {statusBadge(h)}
                      {isAllDeleted(h) && (
                        <Badge variant="secondary" className="text-[10px] h-5">Apagado do WhatsApp</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">
                      {h.text_content || h.caption || <span className="text-muted-foreground italic">Sem legenda</span>}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />{formatDate(h.created_at)}
                    </p>
                  </div>
                </div>

                {/* Stats + actions */}
                <div className="flex flex-col items-end justify-between gap-2 flex-shrink-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />{h.success_count || 0}
                    </span>
                    <span className="flex items-center gap-1 text-destructive font-semibold">
                      <XCircle className="w-3.5 h-3.5" />{h.error_count || 0}
                    </span>
                    {total > 0 && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        ({successRate}%)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {canDeleteFromWa(h) && !isAllDeleted(h) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmWaDelete(h)}
                        disabled={deletingWa === h.id}
                        className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                        title="Apagar do WhatsApp (remove dos celulares)"
                      >
                        {deletingWa === h.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <MessageCircleX className="w-4 h-4" />}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmDelete(h)}
                      disabled={deletingId === h.id}
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Excluir do histórico"
                    >
                      {deletingId === h.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todo o histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as {history.length} publicação(ões) registradas serão removidas permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); clearHistory(); }}
              disabled={clearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Limpar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta publicação do histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro será removido permanentemente. Isso <strong>não apaga</strong> o status do WhatsApp dos celulares — use o botão laranja para isso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (confirmDelete) deleteOne(confirmDelete.id); }}
              disabled={!!deletingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmWaDelete} onOpenChange={(o) => !o && setConfirmWaDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar status do WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Vamos pedir ao WhatsApp para remover este status para todos os contatos que o receberam. Pode levar alguns segundos para sumir nos celulares.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingWa}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (confirmWaDelete) deleteFromWhatsapp(confirmWaDelete.id); }}
              disabled={!!deletingWa}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingWa && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Apagar do WhatsApp
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
