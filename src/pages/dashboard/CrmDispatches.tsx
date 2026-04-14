/**
 * CRM Dispatches — Reuses the Campaigns page component but with CRM-specific hooks/tables.
 * For now this is a thin wrapper that imports the main Campaigns page logic
 * and swaps the data layer to use crm_campaigns + crm_templates tables.
 *
 * Due to the size of Campaigns.tsx (3200+ lines), we create a separate page
 * that redirects to the standard Campaigns component but with a CRM context flag.
 */
import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  Plus, Upload, Send, Bold, Italic, Strikethrough,
  Smile, Code, FileText, Link, MousePointerClick,
  X, Users, Smartphone, Phone, Loader2,
  Clock, Wifi, WifiOff, Settings2, Calendar,
  ArrowUp, ArrowDown, Search, Save, Image as ImageIcon, Video, Mic,
  Sparkles
} from "lucide-react";
import { useCreateCrmCampaign, useStartCrmCampaign } from "@/hooks/useCrmCampaigns";
import { useCrmTemplates, useCreateCrmTemplate } from "@/hooks/useCrmTemplates";
import { useContacts } from "@/hooks/useContacts";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const SurfaceCard = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-xl sm:rounded-2xl border border-border/50 bg-card shadow-sm", "dark:border-[hsl(220_10%_16%)] dark:bg-[hsl(220_13%_9%)] dark:shadow-lg dark:shadow-black/30", className)} {...props}>{children}</div>
);

const SectionLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h3 className={cn("text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70", className)}>{children}</h3>
);

interface Contact {
  id: number;
  nome: string;
  numero: string;
  var1: string; var2: string; var3: string; var4: string; var5: string;
  var6: string; var7: string; var8: string; var9: string; var10: string;
}

interface UnifiedButton {
  id: number;
  type: "reply" | "url" | "phone";
  text: string;
  value: string;
}

const commonEmojis: Record<string, string[]> = {
  "Mais usados": ["😀", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤩", "😘", "🤗", "😁", "😉", "🥺", "😢", "😤", "🤔"],
  "Gestos": ["👍", "👋", "🙏", "💪", "🤝", "👏", "✌️", "🤞", "👊", "🫶", "☝️", "👆", "👇", "👉", "👈", "🫡"],
  "Negócios": ["✅", "⭐", "💰", "🚀", "📱", "💬", "📢", "🎯", "⚡", "🏆", "💎", "📞", "✨", "🛒", "🎁", "📊"],
};

const CrmDispatches = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session } = useAuth();
  const createCampaign = useCreateCrmCampaign();
  const startCampaign = useStartCrmCampaign();
  const createTemplate = useCreateCrmTemplate();
  const { data: savedTemplates = [] } = useCrmTemplates();
  const { data: savedContacts = [] } = useContacts();
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const sendLockRef = useRef(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaUploading, setMediaUploading] = useState(false);
  const [isSubmittingCampaign, setIsSubmittingCampaign] = useState(false);

  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, login_type, profile_picture, profile_name, instance_type")
        .neq("login_type", "report_wa")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!session,
  });

  const [campaignName, setCampaignName] = useState("");
  const [message, setMessage] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [buttons, setButtons] = useState<UnifiedButton[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("nova");
  const [showContactTable, setShowContactTable] = useState(false);
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [pauseOnDisconnect, setPauseOnDisconnect] = useState(true);
  const [minDelay, setMinDelay] = useState(8);
  const [maxDelay, setMaxDelay] = useState(25);
  const [pauseEveryMin, setPauseEveryMin] = useState(10);
  const [pauseEveryMax, setPauseEveryMax] = useState(20);
  const [pauseDurationMin, setPauseDurationMin] = useState(30);
  const [pauseDurationMax, setPauseDurationMax] = useState(120);
  const [messagesPerInstance, setMessagesPerInstance] = useState(0);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");

  const activeDevices = useMemo(() => devices.filter(d => ["Ready", "Connected", "authenticated"].includes(d.status)), [devices]);

  const loadTemplate = (templateId: string) => {
    if (templateId === "nova") { setMessage(""); setMediaUrl(""); setButtons([]); return; }
    const t = savedTemplates.find(t => t.id === templateId);
    if (!t) return;
    setMessage(t.content);
    setMediaUrl(t.media_url || "");
    setButtons((t.buttons || []).map((b: any, i: number) => ({ id: Date.now() + i, type: b.type || "reply", text: b.text || "", value: b.value || "" })));
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (rows.length < 2) { toast({ title: "Arquivo vazio", variant: "destructive" }); return; }

      const imported: Contact[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const phone = String(row[1] || row[0] || "").replace(/\D/g, "");
        if (!phone) continue;
        imported.push({
          id: Date.now() + i,
          nome: String(row[0] || "").trim(),
          numero: phone,
          var1: String(row[2] || ""), var2: String(row[3] || ""), var3: String(row[4] || ""),
          var4: String(row[5] || ""), var5: String(row[6] || ""), var6: String(row[7] || ""),
          var7: String(row[8] || ""), var8: String(row[9] || ""), var9: String(row[10] || ""),
          var10: String(row[11] || ""),
        });
      }
      setContacts(prev => [...prev, ...imported]);
      setShowContactTable(true);
      toast({ title: `${imported.length} contatos importados` });
    } catch (err: any) {
      toast({ title: "Erro na importação", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  const addManualContact = () => {
    const phone = manualPhone.replace(/\D/g, "");
    if (!phone) return;
    setContacts(prev => [...prev, {
      id: Date.now(), nome: manualName || "", numero: phone,
      var1: "", var2: "", var3: "", var4: "", var5: "",
      var6: "", var7: "", var8: "", var9: "", var10: "",
    }]);
    setManualPhone("");
    setManualName("");
    setShowContactTable(true);
  };

  const handleMediaUpload = async (file: File) => {
    if (!session) return;
    setMediaUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      setMediaUrl(urlData.publicUrl);
      toast({ title: "Mídia enviada" });
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    } finally { setMediaUploading(false); }
  };

  const wrapSelectedText = (before: string, after: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setMessage(prev => prev + before + after); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = message.substring(start, end);
    setMessage(message.substring(0, start) + before + selected + after + message.substring(end));
  };

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setMessage(prev => prev + text); return; }
    const start = textarea.selectionStart;
    setMessage(message.substring(0, start) + text + message.substring(textarea.selectionEnd));
  };

  const addButton = (type: "reply" | "url") => {
    if (buttons.length < 10) setButtons(prev => [...prev, { id: Date.now(), type, text: "", value: "" }]);
  };

  const handleSubmit = async () => {
    if (sendLockRef.current || isSubmittingCampaign) return;
    if (!campaignName.trim()) { toast({ title: "Nome da campanha obrigatório", variant: "destructive" }); return; }
    if (!message.trim()) { toast({ title: "Mensagem obrigatória", variant: "destructive" }); return; }
    if (contacts.length === 0) { toast({ title: "Adicione ao menos um contato", variant: "destructive" }); return; }
    if (selectedDevices.length === 0) { toast({ title: "Selecione ao menos uma instância", variant: "destructive" }); return; }

    sendLockRef.current = true;
    setIsSubmittingCampaign(true);

    try {
      const msgType = mediaUrl ? (buttons.length > 0 ? "imagem-botao" : "texto-imagem") : (buttons.length > 0 ? "texto-botao" : "texto");
      const result = await createCampaign.mutateAsync({
        name: campaignName,
        message_type: msgType,
        message_content: message,
        media_url: mediaUrl || undefined,
        buttons: buttons.map(b => ({ type: b.type, text: b.text, value: b.value })),
        scheduled_at: scheduleEnabled && scheduleDate ? new Date(scheduleDate).toISOString() : undefined,
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
        pause_every_min: pauseEveryMin,
        pause_every_max: pauseEveryMax,
        pause_duration_min: pauseDurationMin,
        pause_duration_max: pauseDurationMax,
        device_id: selectedDevices[0],
        device_ids: selectedDevices,
        messages_per_instance: messagesPerInstance,
        pause_on_disconnect: pauseOnDisconnect,
        contacts: contacts.map(c => ({ phone: c.numero, name: c.nome, var1: c.var1, var2: c.var2, var3: c.var3, var4: c.var4, var5: c.var5, var6: c.var6, var7: c.var7, var8: c.var8, var9: c.var9, var10: c.var10 })),
      });

      if (!scheduleEnabled) {
        await startCampaign.mutateAsync({ campaignId: result.id, deviceId: selectedDevices[0] });
      }

      toast({ title: scheduleEnabled ? "Campanha CRM agendada!" : "Campanha CRM iniciada!" });
      navigate("/dashboard/crm-campaign-list");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      sendLockRef.current = false;
      setIsSubmittingCampaign(false);
    }
  };

  const handleSaveAsTemplate = () => {
    if (!saveTemplateName.trim() || !message.trim()) return;
    createTemplate.mutate({
      name: saveTemplateName.trim(),
      content: message,
      message_type: mediaUrl ? "text-media" : buttons.length > 0 ? "buttons" : "text",
      media_url: mediaUrl || undefined,
      buttons: buttons.map(b => ({ type: b.type, text: b.text, value: b.value })),
    }, {
      onSuccess: () => { setSaveTemplateOpen(false); setSaveTemplateName(""); toast({ title: "Template CRM salvo!" }); },
      onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Disparo CRM</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Envie mensagens para seus contatos do CRM</p>
      </div>

      {/* Campaign Name */}
      <SurfaceCard className="p-4 sm:p-5 space-y-4">
        <SectionLabel>Identificação</SectionLabel>
        <Input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Nome do disparo CRM" className="h-10" />
      </SurfaceCard>

      {/* Template Selection */}
      <SurfaceCard className="p-4 sm:p-5 space-y-4">
        <SectionLabel>Template CRM</SectionLabel>
        <Select value={selectedTemplate} onValueChange={v => { setSelectedTemplate(v); loadTemplate(v); }}>
          <SelectTrigger className="h-10"><SelectValue placeholder="Selecionar template" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nova">Nova mensagem</SelectItem>
            {savedTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </SurfaceCard>

      {/* Message Composer */}
      <SurfaceCard className="p-4 sm:p-5 space-y-4">
        <SectionLabel>Mensagem</SectionLabel>
        <div className="flex items-center gap-1 mb-1.5">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelectedText("*", "*")}><Bold className="w-3.5 h-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelectedText("_", "_")}><Italic className="w-3.5 h-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelectedText("~", "~")}><Strikethrough className="w-3.5 h-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelectedText("```", "```")}><Code className="w-3.5 h-3.5" /></Button>
          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7"><Smile className="w-3.5 h-3.5" /></Button></PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
              <div className="grid grid-cols-8 gap-0.5">
                {commonEmojis["Mais usados"]?.map(emoji => (
                  <button key={emoji} className="text-lg p-1 hover:bg-muted rounded" onClick={() => { insertAtCursor(emoji); setShowEmojiPicker(false); }}>{emoji}</button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex-1" />
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => insertAtCursor("{{nome}}")}>
            <Sparkles className="w-3 h-3" /> Variável
          </Button>
        </div>
        <Textarea ref={textareaRef} value={message} onChange={e => setMessage(e.target.value)} placeholder="Digite sua mensagem..." className="min-h-[120px] text-sm" />

        {/* Media */}
        <div className="flex items-center gap-2">
          <input type="file" ref={mediaFileRef} className="hidden" accept="image/*,video/*,audio/*,.pdf" onChange={e => { if (e.target.files?.[0]) handleMediaUpload(e.target.files[0]); e.target.value = ""; }} />
          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => mediaFileRef.current?.click()} disabled={mediaUploading}>
            {mediaUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Mídia
          </Button>
          {mediaUrl && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded">
              <ImageIcon className="w-3 h-3" />
              <span className="truncate max-w-[150px]">{mediaUrl.split("/").pop()}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setMediaUrl("")}><X className="w-3 h-3" /></Button>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div>
          {buttons.map(b => (
            <div key={b.id} className="flex items-center gap-2 mb-1.5">
              <Select value={b.type} onValueChange={v => setButtons(prev => prev.map(x => x.id === b.id ? { ...x, type: v as any } : x))}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reply">Resposta Rápida</SelectItem>
                  <SelectItem value="url">Link (URL)</SelectItem>
                </SelectContent>
              </Select>
              <Input value={b.text} onChange={e => setButtons(prev => prev.map(x => x.id === b.id ? { ...x, text: e.target.value } : x))} placeholder="Texto" className="h-8 text-xs flex-1" />
              {b.type === "url" && <Input value={b.value} onChange={e => setButtons(prev => prev.map(x => x.id === b.id ? { ...x, value: e.target.value } : x))} placeholder="https://..." className="h-8 text-xs flex-1" />}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setButtons(prev => prev.filter(x => x.id !== b.id))}><X className="w-3 h-3" /></Button>
            </div>
          ))}
          {buttons.length < 10 && (
            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => addButton("reply")}>
              <Plus className="w-3 h-3" /> Botão
            </Button>
          )}
        </div>

        {/* Save as Template */}
        {message.trim() && (
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground" onClick={() => { setSaveTemplateName(campaignName || ""); setSaveTemplateOpen(true); }}>
            <Save className="w-3 h-3" /> Salvar como template CRM
          </Button>
        )}
      </SurfaceCard>

      {/* Contacts */}
      <SurfaceCard className="p-4 sm:p-5 space-y-4">
        <SectionLabel>Contatos ({contacts.length})</SectionLabel>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="file" ref={fileRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileImport} />
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" /> Importar CSV/Excel
          </Button>
          <div className="flex items-center gap-1">
            <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Nome" className="h-8 w-28 text-xs" />
            <Input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="Telefone" className="h-8 w-32 text-xs" onKeyDown={e => e.key === "Enter" && addManualContact()} />
            <Button size="sm" className="h-8 text-xs" onClick={addManualContact}><Plus className="w-3 h-3" /></Button>
          </div>
        </div>
        {showContactTable && contacts.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded border border-border/30">
            <table className="w-full text-xs">
              <thead><tr className="bg-muted/30"><th className="px-2 py-1 text-left">Nome</th><th className="px-2 py-1 text-left">Telefone</th><th className="px-2 py-1 w-8"></th></tr></thead>
              <tbody>
                {contacts.slice(0, 50).map(c => (
                  <tr key={c.id} className="border-t border-border/20">
                    <td className="px-2 py-1 truncate max-w-[120px]">{c.nome || "-"}</td>
                    <td className="px-2 py-1 font-mono">{c.numero}</td>
                    <td className="px-2 py-1"><Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setContacts(prev => prev.filter(x => x.id !== c.id))}><X className="w-3 h-3" /></Button></td>
                  </tr>
                ))}
                {contacts.length > 50 && <tr><td colSpan={3} className="px-2 py-1 text-muted-foreground text-center">...e mais {contacts.length - 50} contatos</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>

      {/* Instances */}
      <SurfaceCard className="p-4 sm:p-5 space-y-4">
        <SectionLabel>Instâncias</SectionLabel>
        {activeDevices.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma instância conectada</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {activeDevices.map(d => {
              const selected = selectedDevices.includes(d.id);
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedDevices(prev => selected ? prev.filter(id => id !== d.id) : [...prev, d.id])}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-all",
                    selected ? "border-primary bg-primary/5 text-primary" : "border-border/30 bg-card/50 text-muted-foreground hover:border-border"
                  )}
                >
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{d.name || d.number || d.id.slice(0, 8)}</span>
                </button>
              );
            })}
          </div>
        )}
      </SurfaceCard>

      {/* Send Controls */}
      <SurfaceCard className="p-4 sm:p-5 space-y-4">
        <SectionLabel>Controle de Envio</SectionLabel>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Delay mín (s)</Label>
            <Input type="number" value={minDelay} onChange={e => setMinDelay(Number(e.target.value))} className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Delay máx (s)</Label>
            <Input type="number" value={maxDelay} onChange={e => setMaxDelay(Number(e.target.value))} className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Pausar a cada (mín)</Label>
            <Input type="number" value={pauseEveryMin} onChange={e => setPauseEveryMin(Number(e.target.value))} className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Pausar a cada (máx)</Label>
            <Input type="number" value={pauseEveryMax} onChange={e => setPauseEveryMax(Number(e.target.value))} className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Duração pausa (mín s)</Label>
            <Input type="number" value={pauseDurationMin} onChange={e => setPauseDurationMin(Number(e.target.value))} className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Duração pausa (máx s)</Label>
            <Input type="number" value={pauseDurationMax} onChange={e => setPauseDurationMax(Number(e.target.value))} className="h-8 text-xs mt-1" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <div className="flex items-center gap-2">
            <Switch checked={pauseOnDisconnect} onCheckedChange={setPauseOnDisconnect} />
            <Label className="text-xs">Pausar ao desconectar</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
            <Label className="text-xs">Agendar</Label>
          </div>
        </div>
        {scheduleEnabled && (
          <div>
            <Label className="text-xs text-muted-foreground">Data/hora</Label>
            <Input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="h-8 text-xs mt-1 w-60" />
          </div>
        )}
      </SurfaceCard>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/dashboard/crm-campaign-list")}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={isSubmittingCampaign || !campaignName.trim() || !message.trim() || contacts.length === 0 || selectedDevices.length === 0} className="gap-1.5">
          {isSubmittingCampaign ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {scheduleEnabled ? "Agendar Disparo CRM" : "Iniciar Disparo CRM"}
        </Button>
      </div>

      {/* Save Template Dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Salvar como Template CRM</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Input value={saveTemplateName} onChange={e => setSaveTemplateName(e.target.value)} placeholder="Nome do template" className="h-9" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveAsTemplate} disabled={createTemplate.isPending} className="gap-1.5">
              {createTemplate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CrmDispatches;
