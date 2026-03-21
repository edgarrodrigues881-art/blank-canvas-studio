import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Plus, Upload, Download, Eye, Send, Trash2, Bold, Italic, Strikethrough,
  Smile, Image, Code, FileText, AlertTriangle, Link, MousePointerClick,
  X, Users, MessageSquare, Smartphone, ChevronRight, ChevronDown,
  Phone, Type, ImageIcon, Flame, ShieldAlert, Activity,
  Zap, Clock, Hash, Wifi, WifiOff, RefreshCw, Settings2, Calendar,
  CheckCircle2, XCircle, Copy, Eraser, Sparkles, Loader2, Check,
  ArrowRight, Lock, Timer, TrendingUp, ArrowUp, ArrowDown, Pencil, Search
} from "lucide-react";
import { useCreateCampaign, useStartCampaign } from "@/hooks/useCampaigns";
import { useTemplates } from "@/hooks/useTemplates";
import { useContacts } from "@/hooks/useContacts";
import { useAdminDashboard } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
// XLSX is dynamically imported when needed to reduce initial bundle

// Compress images client-side before uploading
const compressImage = (file: File, maxWidth = 1200, quality = 0.8): Promise<File> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
      resolve(file);
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }));
          } else {
            resolve(file);
          }
        },
        "image/webp",
        quality
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
};


interface Contact {
  id: number;
  nome: string;
  numero: string;
  var1: string;
  var2: string;
  var3: string;
  var4: string;
  var5: string;
  var6: string;
  var7: string;
  var8: string;
  var9: string;
  var10: string;
}

type ColumnMapping = "nome" | "numero" | "var1" | "var2" | "var3" | "var4" | "var5" | "var6" | "var7" | "var8" | "var9" | "var10" | "ignorar";

interface RawImportData {
  headers: string[];
  rows: any[][];
  hasHeader: boolean;
  columnMappings: ColumnMapping[];
}

interface UnifiedButton {
  id: number;
  type: "reply" | "url" | "phone";
  text: string;
  value: string;
}

// Auto-detect message type based on content
function detectMessageType(mediaUrl: string, hasButtons: boolean): string {
  if (mediaUrl && hasButtons) return "imagem-botao";
  if (mediaUrl) return "texto-imagem";
  if (hasButtons) return "texto-botao";
  return "texto";
}

// ─── Surface Card wrapper for layered dark theme ───
const SurfaceCard = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-xl sm:rounded-2xl border border-border/50 bg-card shadow-sm",
      "dark:border-[hsl(220_10%_16%)] dark:bg-[hsl(220_13%_9%)] dark:shadow-lg dark:shadow-black/30",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

// ─── Section label ───
const SectionLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h3 className={cn("text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70", className)}>
    {children}
  </h3>
);

const Campaigns = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session } = useAuth();
  const isBlocked = false; // Admin bypass
  // Removed: useAutoSyncDevices already runs in DashboardLayout — no duplicate needed
  const createCampaign = useCreateCampaign();
  const startCampaign = useStartCampaign();
  const { data: savedTemplates = [] } = useTemplates();
  const { data: savedContacts = [] } = useContacts();
  const { data: adminData } = useAdminDashboard();
  const adminUsers = useMemo(() => (adminData?.users || []).filter(u => !u.roles.includes("admin")), [adminData]);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaFileName, setMediaFileName] = useState("");
  const [previewMode, setPreviewMode] = useState<"sent" | "received">("sent");
  const [showVarPreview, setShowVarPreview] = useState(false);
  const [previewContactIndex, setPreviewContactIndex] = useState(0);
  const [buttonAddedFlash, setButtonAddedFlash] = useState(false);

  const { data: devices = [] } = useQuery({
    queryKey: ["bo-admin-devices", session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, login_type, proxy_id, profile_picture, profile_name, created_at, updated_at, instance_type")
        .eq("user_id", session!.user.id)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!session,
  });

  const queryClient = useQueryClient();

  // Delay profiles
  const { data: delayProfiles = [] } = useQuery({
    queryKey: ["delay_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delay_profiles").select("id, name, min_delay_seconds, max_delay_seconds, pause_every_min, pause_every_max, pause_duration_min, pause_duration_max").order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!session,
  });

  const [saveProfileName, setSaveProfileName] = useState("");
  const [showSaveProfile, setShowSaveProfile] = useState(false);

  // Draft persistence key
  const DRAFT_KEY = "campaign_draft";

  // State
  const [step, setStep] = useState(1);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messageType, setMessageType] = useState("texto");
  const [campaignName, setCampaignName] = useState("");
  const [messages, setMessages] = useState<string[]>(["", "", "", "", ""]);
  const [activeMessageTab, setActiveMessageTab] = useState(0);
  const message = messages[activeMessageTab];
  const setMessage = (val: string | ((prev: string) => string)) => {
    setMessages(prev => {
      const copy = [...prev];
      copy[activeMessageTab] = typeof val === "function" ? val(copy[activeMessageTab]) : val;
      return copy;
    });
  };
  const [rotationMode, setRotationMode] = useState<"random" | "all">("random");
  const rotateMessages = rotationMode !== "all"; // backward compat
  const allMessages = messages.filter(m => m.trim());
  const combinedMessage = allMessages.length > 1 
    ? (rotationMode === "random" ? allMessages.join("|||") : allMessages.join("|&&|"))
    : allMessages[0] || "";
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [buttons, setButtons] = useState<UnifiedButton[]>([{ id: Date.now(), type: "reply", text: "", value: "" }]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("nova");
  const [importFromContacts, setImportFromContacts] = useState(false);
  const [selectedContactTags, setSelectedContactTags] = useState<string[]>([]);
  const [selectedSavedContactIds, setSelectedSavedContactIds] = useState<Set<string>>(new Set());
  const [importContactSearch, setImportContactSearch] = useState("");
  const [importSearchMode, setImportSearchMode] = useState<"name" | "phone" | "plan">("name");
  const [selectedPlanFilter, setSelectedPlanFilter] = useState<string>("all");
  const [showInstancePicker, setShowInstancePicker] = useState(false);
  const [showContactTools, setShowContactTools] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [pauseOnDisconnect, setPauseOnDisconnect] = useState(true);
  const [showContactTable, setShowContactTable] = useState(false);
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [rawImport, setRawImport] = useState<RawImportData | null>(null);
  const [contactPage, setContactPage] = useState(0);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [importReview, setImportReview] = useState<{
    all: Contact[];
    invalid: Contact[];
    batchDuplicates: Contact[];
    existingDuplicates: Contact[];
    clean: Contact[];
  } | null>(null);
  const CONTACTS_PER_PAGE = 50;
  const [draftLoaded, setDraftLoaded] = useState(false);

  // Send control
  const [messageLimit, setMessageLimit] = useState(100);
  const [minDelay, setMinDelay] = useState(8);
  const [maxDelay, setMaxDelay] = useState(25);
  const [pauseEveryMin, setPauseEveryMin] = useState(10);
  const [pauseEveryMax, setPauseEveryMax] = useState(20);
  const [pauseDurationMin, setPauseDurationMin] = useState(30);
  const [pauseDurationMax, setPauseDurationMax] = useState(120);
  const [messagesPerInstance, setMessagesPerInstance] = useState(0);
  const [sendMode, setSendMode] = useState<"single" | "rotation" | "parallel">("single");

  // Delay profile mutations (after delay state is declared)
  const saveDelayProfile = useMutation({
    mutationFn: async (name: string) => {
      if (delayProfiles.length >= 3) {
        throw new Error("Limite de 3 perfis atingido. Exclua um antes de salvar outro.");
      }
      const { error } = await supabase.from("delay_profiles").insert({
        user_id: session!.user.id,
        name,
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
        pause_every_min: pauseEveryMin,
        pause_every_max: pauseEveryMax,
        pause_duration_min: pauseDurationMin,
        pause_duration_max: pauseDurationMax,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delay_profiles"] });
      toast({ title: "Perfil salvo!" });
      setSaveProfileName("");
      setShowSaveProfile(false);
    },
    onError: (err: any) => {
      toast({ title: err.message || "Erro ao salvar perfil", variant: "destructive" });
    },
  });

  const deleteDelayProfile = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("delay_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delay_profiles"] });
      toast({ title: "Perfil excluído" });
    },
  });

  const loadDelayProfile = (profile: any) => {
    setMinDelay(profile.min_delay_seconds);
    setMaxDelay(profile.max_delay_seconds);
    setPauseEveryMin(profile.pause_every_min);
    setPauseEveryMax(profile.pause_every_max);
    setPauseDurationMin(profile.pause_duration_min);
    setPauseDurationMax(profile.pause_duration_max);
    toast({ title: `Perfil "${profile.name}" carregado` });
  };

  useEffect(() => {
    const loadDefaults = async () => {
      try {
        // Fetch last campaign's delay settings
        const { data: lastCampaign } = await supabase
          .from("campaigns")
          .select("min_delay_seconds, max_delay_seconds, pause_every_min, pause_every_max, pause_duration_min, pause_duration_max")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (lastCampaign) {
          setMinDelay(lastCampaign.min_delay_seconds);
          setMaxDelay(lastCampaign.max_delay_seconds);
          setPauseEveryMin(lastCampaign.pause_every_min);
          setPauseEveryMax(lastCampaign.pause_every_max);
          setPauseDurationMin(lastCampaign.pause_duration_min);
          setPauseDurationMax(lastCampaign.pause_duration_max);
        }
      } catch { /* use defaults */ }

      // Then restore draft (draft overrides last campaign values if present)
      try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) {
          const draft = JSON.parse(saved);
          if (draft.campaignName) setCampaignName(draft.campaignName);
          if (draft.messages) setMessages(draft.messages);
          else if (draft.message) setMessages(prev => { const c = [...prev]; c[0] = draft.message; return c; });
          if (draft.rotationMode) setRotationMode(draft.rotationMode);
          else if (draft.rotateMessages !== undefined) setRotationMode(draft.rotateMessages ? "random" : "all");
          if (draft.messageType) setMessageType(draft.messageType);
          if (draft.mediaUrl) setMediaUrl(draft.mediaUrl);
          if (draft.contacts?.length) { setContacts(draft.contacts); setShowContactTable(true); }
          if (draft.buttons?.length) setButtons(draft.buttons);
          if (draft.selectedDevices?.length) {
            // Filter out devices that no longer exist
            const validIds = draft.selectedDevices.filter((id: string) => devices.some(d => d.id === id));
            if (validIds.length > 0) setSelectedDevices(validIds);
          }
          if (draft.minDelay) setMinDelay(draft.minDelay);
          if (draft.maxDelay) setMaxDelay(draft.maxDelay);
          if (draft.pauseEveryMin) setPauseEveryMin(draft.pauseEveryMin);
          if (draft.pauseEveryMax) setPauseEveryMax(draft.pauseEveryMax);
          if (draft.pauseDurationMin) setPauseDurationMin(draft.pauseDurationMin);
          if (draft.pauseDurationMax) setPauseDurationMax(draft.pauseDurationMax);
          if (draft.scheduleEnabled) setScheduleEnabled(draft.scheduleEnabled);
          if (draft.scheduleDate) {
            // Se a data do draft já passou, recalcula para agora + 30min
            const draftDate = new Date(draft.scheduleDate);
            if (draftDate <= new Date()) {
              const now = new Date();
              now.setMinutes(now.getMinutes() + 30);
              const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
              setScheduleDate(local);
            } else {
              setScheduleDate(draft.scheduleDate);
            }
          }
        }
      } catch { /* ignore corrupt data */ }

      // Check for resend data from CampaignDetail
      try {
        const resendRaw = sessionStorage.getItem("resend_campaign_data");
        if (resendRaw) {
          sessionStorage.removeItem("resend_campaign_data");
          const resend = JSON.parse(resendRaw);
          if (resend.contacts?.length) { setContacts(resend.contacts); setShowContactTable(true); }
          if (resend.message) {
            // Split message variants back into individual slots
            const raw = resend.message;
            let variants: string[];
            if (raw.includes("|&&|")) {
              variants = raw.split("|&&|").map((m: string) => m.trim());
              setRotationMode("all");
            } else if (raw.includes("|||")) {
              variants = raw.split("|||").map((m: string) => m.trim());
              setRotationMode("random");
            } else {
              variants = [raw];
            }
            const filled = ["", "", "", "", ""];
            variants.forEach((v: string, i: number) => { if (i < 5) filled[i] = v; });
            setMessages(filled);
          }
          if (resend.mediaUrl) setMediaUrl(resend.mediaUrl);
          if (resend.campaignName) setCampaignName(resend.campaignName);
          if (resend.buttons && Array.isArray(resend.buttons) && resend.buttons.length > 0) {
            setButtons(resend.buttons);
          }
        }
      } catch { /* ignore */ }

      setDraftLoaded(true);
    };
    loadDefaults();
  }, []);

  // Auto-save draft (including all delay params)
  useEffect(() => {
    if (!draftLoaded) return;
    const draft = {
      campaignName, messages, rotationMode, messageType, mediaUrl, contacts,
      buttons, selectedDevices, messagesPerInstance, sendMode,
      minDelay, maxDelay, pauseEveryMin, pauseEveryMax, pauseDurationMin, pauseDurationMax,
      scheduleEnabled, scheduleDate,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draftLoaded, campaignName, messages, rotationMode, messageType, mediaUrl, contacts, buttons, selectedDevices, messagesPerInstance, sendMode, minDelay, maxDelay, pauseEveryMin, pauseEveryMax, pauseDurationMin, pauseDurationMax, scheduleEnabled, scheduleDate]);

  const clearStep1 = () => {
    setMessages(["", "", "", "", ""]); setActiveMessageTab(0); setRotationMode("random"); setMediaUrl(""); setMediaFileName("");
    setButtons([{ id: Date.now(), type: "reply", text: "", value: "" }]);
    setSelectedTemplate("nova");
    toast({ title: "Mensagem limpa" });
  };
  const clearStep2 = () => {
    setContacts([]); setShowContactTable(false); setContactPage(0);
    toast({ title: "Contatos limpos" });
  };
  const clearStep3 = () => {
    setSelectedDevices([]); setMinDelay(8); setMaxDelay(25);
    setPauseEveryMin(10); setPauseEveryMax(20); setPauseDurationMin(30); setPauseDurationMax(120);
    setMessagesPerInstance(0); setSendMode("single"); setScheduleEnabled(false); setScheduleDate("");
    toast({ title: "Parâmetros limpos" });
  };
  const clearAllForm = () => {
    setCampaignName(""); clearStep1(); clearStep2(); clearStep3();
    setStep(1);
    localStorage.removeItem(DRAFT_KEY);
    toast({ title: "Formulário limpo", description: "Todos os campos foram resetados." });
  };

  const PLAN_OPTIONS = ["Todos", "Sem plano", "Trial", "Start", "Pro", "Scale", "Elite"];
  const allTags = useMemo(() => Array.from(new Set(savedContacts.flatMap(c => c.tags || []))), [savedContacts]);
  const selectedDevicesData = devices.filter(d => selectedDevices.includes(d.id));
  const selectedDeviceData = selectedDevicesData[0];
  const validContacts = useMemo(() => contacts.filter(c => c.numero.trim()), [contacts]);
  const invalidContacts = useMemo(() => contacts.filter(c => c.numero.trim() && !/^\d{10,15}$/.test(c.numero.replace(/\D/g, ""))), [contacts]);
  const duplicateCount = useMemo(() => contacts.length - new Set(contacts.map(c => c.numero.trim()).filter(Boolean)).size, [contacts]);
  const hasButtons = buttons.filter(b => b.text.trim()).length > 0;
  const computedMessageType = detectMessageType(mediaUrl, hasButtons);

  // Paginated contacts
  const totalPages = Math.ceil(contacts.length / CONTACTS_PER_PAGE);
  const paginatedContacts = useMemo(() =>
    contacts.slice(contactPage * CONTACTS_PER_PAGE, (contactPage + 1) * CONTACTS_PER_PAGE),
    [contacts, contactPage, CONTACTS_PER_PAGE]
  );



  // Estimated send time calculation
  const estimatedTime = useMemo(() => {
    const count = validContacts.length;
    if (count === 0) return null;
    const avgDelay = (minDelay + maxDelay) / 2;
    const avgPauseEvery = (pauseEveryMin + pauseEveryMax) / 2;
    const avgPauseDur = (pauseDurationMin + pauseDurationMax) / 2;
    const numPauses = avgPauseEvery > 0 ? Math.floor(count / avgPauseEvery) : 0;
    const deviceCount = Math.max(selectedDevices.length, 1);
    const contactsPerDevice = Math.ceil(count / deviceCount);
    const totalSeconds = (contactsPerDevice * avgDelay) + (numPauses * avgPauseDur / deviceCount);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (days > 0) return `${days}d ${remainingHours}h ${minutes}min`;
    if (hours > 0) return `${hours}h ${minutes}min`;
    if (minutes > 0) return `${minutes}min`;
    return `< 1min`;
  }, [validContacts.length, minDelay, maxDelay, pauseEveryMin, pauseEveryMax, pauseDurationMin, pauseDurationMax, selectedDevices.length]);

  // Detected variables
  const detectedVars = useMemo(() => {
    const allText = messages.join(" ");
    const matches = allText.match(/{{[^}]+}}/g);
    return matches ? [...new Set(matches)] : [];
  }, [messages]);

  // Step completion status
  const getStepStatus = (num: number): "done" | "configured" | "incomplete" | "pending" => {
    if (step > num) {
      // Check if actually configured
      if (num === 1) return (message.trim() || mediaUrl) ? "done" : "incomplete";
      if (num === 2) return validContacts.length > 0 ? "done" : "incomplete";
      if (num === 3) return selectedDevices.length > 0 ? "done" : "incomplete";
      return "done";
    }
    if (step === num) return "configured";
    // Future steps
    if (num === 1) return (message.trim() || mediaUrl) ? "configured" : "pending";
    if (num === 2) return validContacts.length > 0 ? "configured" : "pending";
    if (num === 3) return selectedDevices.length > 0 ? "configured" : "pending";
    return "pending";
  };

  const statusLabels: Record<string, { text: string; color: string }> = {
    done: { text: "Completo", color: "text-emerald-400" },
    configured: { text: "Em edição", color: "text-primary" },
    incomplete: { text: "Incompleto", color: "text-amber-400" },
    pending: { text: "Pendente", color: "text-muted-foreground/40" },
  };

  // Handlers
  const handleSendCampaign = () => {
    if (isBlocked) { return; }
    if (!campaignName.trim()) { toast({ title: "Nome obrigatório", description: "Informe o nome da campanha.", variant: "destructive" }); return; }
    if (selectedDevices.length === 0) { toast({ title: "Instância obrigatória", description: "Selecione pelo menos uma instância.", variant: "destructive" }); return; }
    // Validate selected devices still exist
    const validDeviceIds = selectedDevices.filter(id => devices.some(d => d.id === id));
    if (validDeviceIds.length === 0) {
      setSelectedDevices([]);
      toast({ title: "Dispositivo não encontrado", description: "O dispositivo selecionado foi removido. Selecione outro na aba Configurações.", variant: "destructive" });
      return;
    }
    // Check if selected device is online
    const selectedDev = devices.find(d => d.id === validDeviceIds[0]);
    if (selectedDev && selectedDev.status !== "Ready") {
      toast({ title: "Instância offline", description: `"${selectedDev.name}" está desconectada. Reconecte antes de disparar.`, variant: "destructive" });
      return;
    }
    if (validContacts.length === 0) { toast({ title: "Sem contatos", description: "Adicione pelo menos um contato.", variant: "destructive" }); return; }
    if (!combinedMessage.trim()) { toast({ title: "Mensagem vazia", description: "Escreva pelo menos uma mensagem.", variant: "destructive" }); return; }
    createCampaign.mutate({
      name: campaignName, message_type: computedMessageType, message_content: combinedMessage,
      media_url: mediaUrl || undefined,
      buttons: buttons.filter(b => b.text.trim()).map(b => ({ type: b.type, text: b.text, value: b.value })),
      contacts: validContacts.map(c => ({ phone: c.numero, name: c.nome || undefined, var1: c.var1 || "", var2: c.var2 || "", var3: c.var3 || "", var4: c.var4 || "", var5: c.var5 || "", var6: c.var6 || "", var7: c.var7 || "", var8: c.var8 || "", var9: c.var9 || "", var10: c.var10 || "" })),
      scheduled_at: scheduleEnabled && scheduleDate ? new Date(scheduleDate).toISOString() : undefined,
      min_delay_seconds: minDelay,
      max_delay_seconds: maxDelay,
      pause_every_min: pauseEveryMin,
      pause_every_max: pauseEveryMax,
      pause_duration_min: pauseDurationMin,
      pause_duration_max: pauseDurationMax,
      device_id: selectedDevices[0],
      device_ids: selectedDevices,
      messages_per_instance: sendMode === "rotation" ? messagesPerInstance : (sendMode === "parallel" ? -1 : 0),
      pause_on_disconnect: pauseOnDisconnect,
    }, {
      onSuccess: (newCampaign) => {
        if (scheduleEnabled && scheduleDate) {
          toast({
            title: "Campanha agendada!",
            description: `Será iniciada em ${new Date(scheduleDate).toLocaleString("pt-BR")}`,
            action: <ToastAction altText="Ver campanha" onClick={() => navigate(`/backoffice/campaign/${newCampaign.id}`)}>Ver campanha</ToastAction>,
          });
        } else {
          toast({
            title: "Campanha criada!",
            description: `${validContacts.length} contatos. Iniciando envio...`,
            action: <ToastAction altText="Ver campanha" onClick={() => navigate(`/backoffice/campaign/${newCampaign.id}`)}>Ver campanha</ToastAction>,
          });
          startCampaign.mutate({ campaignId: newCampaign.id, deviceId: selectedDevices[0] }, {
            onSuccess: (data) => {
              if (data?.status === "queued") {
                toast({ title: "Campanha na fila", description: data.message || "A instância está em uso. A campanha iniciará automaticamente." });
              }
              navigate(`/backoffice/campaign/${newCampaign.id}`);
            },
            onError: (err: any) => { toast({ title: "Erro no envio", description: err.message, variant: "destructive" }); },
          });
        }
        setCampaignName(""); setMessages(["", "", "", "", ""]); setActiveMessageTab(0); setRotationMode("random"); setMediaUrl(""); setMediaFileName(""); setContacts([]); setButtons([{ id: Date.now(), type: "reply", text: "", value: "" }]); setStep(1); localStorage.removeItem(DRAFT_KEY);
      },
      onError: (err: any) => {
        let desc = err.message || "Erro desconhecido";
        if (desc.includes("campaigns_device_id_fkey")) {
          desc = "O dispositivo selecionado não existe mais. Selecione outro na aba 'Configurações'.";
          setSelectedDevices([]);
        }
        if (desc.includes("campaigns_template_id_fkey")) {
          desc = "O template selecionado foi removido. Escolha outro na aba 'Mensagem'.";
        }
        toast({ title: "Erro ao criar campanha", description: desc, variant: "destructive" });
      },
    });
  };

  const triggerButtonFlash = () => {
    setButtonAddedFlash(true);
    setTimeout(() => setButtonAddedFlash(false), 600);
  };

  const addButton = (type: "reply" | "url" | "phone") => { if (buttons.length < 10) { setButtons([...buttons, { id: Date.now(), type, text: "", value: "" }]); triggerButtonFlash(); } };
  const removeButton = (id: number) => setButtons(buttons.filter(b => b.id !== id));
  const updateButton = (id: number, field: keyof UnifiedButton, val: string) => setButtons(buttons.map(b => b.id === id ? { ...b, [field]: val } : b));
  const moveButton = (id: number, direction: "up" | "down") => {
    setButtons(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  const wrapSelectedText = (before: string, after: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setMessage(prev => prev + before + after); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = message.substring(start, end);
    const newText = message.substring(0, start) + before + selected + after + message.substring(end);
    setMessage(newText);
    setTimeout(() => {
      textarea.focus();
      if (selected.length > 0) {
        textarea.setSelectionRange(start + before.length, end + before.length);
      } else {
        textarea.setSelectionRange(start + before.length, start + before.length);
      }
    }, 0);
  };

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setMessage(prev => prev + text); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = message.substring(0, start) + text + message.substring(end);
    setMessage(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const commonEmojis = {
    "Mais usados": ["😀", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤩", "😘", "🤗", "😁", "😉", "🥺", "😢", "😤", "🤔"],
    "Gestos": ["👍", "👋", "🙏", "💪", "🤝", "👏", "✌️", "🤞", "👊", "🫶", "☝️", "👆", "👇", "👉", "👈", "🫡"],
    "Negócios": ["✅", "⭐", "💰", "🚀", "📱", "💬", "📢", "🎯", "⚡", "🏆", "💎", "📞", "✨", "🛒", "🎁", "📊"],
    "Símbolos": ["❤️", "💙", "💚", "💛", "🧡", "💜", "🖤", "🤍", "🔥", "💥", "⚠️", "🔔", "🎉", "🎊", "💯", "🆕"],
  };

  const [emojiCategory, setEmojiCategory] = useState<string>("Mais usados");

  const addContact = () => { setContacts(prev => [{ id: Date.now(), nome: "", numero: "", var1: "", var2: "", var3: "", var4: "", var5: "", var6: "", var7: "", var8: "", var9: "", var10: "" }, ...prev]); setShowContactTable(true); };
  const updateContact = (id: number, field: keyof Contact, value: string) => setContacts(contacts.map(c => c.id === id ? { ...c, [field]: value } : c));
  const removeContact = (id: number) => setContacts(contacts.filter(c => c.id !== id));

  const removeDuplicates = () => {
    const before = contacts.length;
    const seen = new Set<string>();
    const unique = contacts.filter(c => {
      const num = c.numero.trim();
      if (!num) return true; // keep contacts without number
      if (seen.has(num)) return false;
      seen.add(num);
      return true;
    });
    const removed = before - unique.length;
    setContacts(unique);
    toast({ title: `${removed} duplicado(s) removido(s)`, description: `${unique.length} contatos restantes na lista.` });
  };

  const removeInvalid = () => {
    const before = contacts.length;
    const valid = contacts.filter(c => !c.numero.trim() || /^\d{10,15}$/.test(c.numero.replace(/\D/g, "")));
    const removed = before - valid.length;
    setContacts(valid);
    toast({ title: `${removed} inválido(s) removido(s)`, description: `${valid.length} contatos restantes na lista.` });
  };

  const addPrefixToNumbers = (prefix: string) => {
    let count = 0;
    setContacts(prev => prev.map(c => {
      const cleaned = c.numero.replace(/\D/g, "");
      if (cleaned && !cleaned.startsWith(prefix)) {
        count++;
        return { ...c, numero: prefix + cleaned };
      }
      return c;
    }));
    toast({ title: `Prefixo "${prefix}" adicionado`, description: `${count} número(s) atualizados.` });
  };

  const filteredBaseContacts = useMemo(() => {
    let list = adminUsers;
    const q = importContactSearch.trim().toLowerCase();

    if (importSearchMode === "plan" && selectedPlanFilter !== "all") {
      list = list.filter(u => {
        const plan = (u.plan_name || "Sem plano").toLowerCase();
        return plan.includes(selectedPlanFilter.toLowerCase());
      });
    }

    if (q) {
      if (importSearchMode === "phone") {
        const phoneQuery = q.replace(/\D/g, "");
        list = list.filter(u => (u.phone || "").replace(/\D/g, "").includes(phoneQuery));
      } else if (importSearchMode === "name") {
        list = list.filter(u => (u.full_name || "").toLowerCase().includes(q));
      }
    }

    return list;
  }, [adminUsers, selectedPlanFilter, importContactSearch, importSearchMode]);

  const filteredSavedContacts = useMemo(() => {
    let list = savedContacts;
    const q = importContactSearch.trim().toLowerCase();
    if (q) {
      if (importSearchMode === "phone") {
        const phoneQuery = q.replace(/\D/g, "");
        list = list.filter(c => c.phone.replace(/\D/g, "").includes(phoneQuery));
      } else if (importSearchMode === "name") {
        list = list.filter(c => c.name.toLowerCase().includes(q));
      }
    }
    return list;
  }, [savedContacts, importContactSearch, importSearchMode]);

  const handleImportFromBase = () => {
    const toImport = selectedSavedContactIds.size > 0
      ? adminUsers.filter(u => selectedSavedContactIds.has(u.id))
      : filteredBaseContacts;
    const imported: Contact[] = toImport.map((u, i) => ({
      id: Date.now() + i,
      nome: u.full_name || "Sem nome",
      numero: (u.phone || "").replace(/\D/g, ""),
      var1: u.plan_name || "Sem plano",
      var2: "", var3: "", var4: "", var5: "",
      var6: "", var7: "", var8: "", var9: "", var10: "",
    }));
    if (imported.length === 0) { toast({ title: "Nenhum contato encontrado", variant: "destructive" }); return; }
    setContacts(prev => [...prev, ...imported]);
    setImportFromContacts(false);
    setSelectedSavedContactIds(new Set());
    setImportContactSearch("");
    setSelectedPlanFilter("all");
    setShowContactTable(true);
    toast({ title: `${imported.length} contatos adicionados`, description: "Plano salvo em Var 1" });
  };

  const handleImportFromDB = () => {
    const toImport = selectedSavedContactIds.size > 0
      ? savedContacts.filter(c => selectedSavedContactIds.has(c.id))
      : filteredSavedContacts;
    const imported: Contact[] = toImport.map((c, i) => ({
      id: Date.now() + i, nome: c.name, numero: c.phone.replace(/\D/g, ""),
      var1: c.var1 || "", var2: c.var2 || "", var3: c.var3 || "", var4: c.var4 || "", var5: c.var5 || "",
      var6: c.var6 || "", var7: c.var7 || "", var8: c.var8 || "", var9: c.var9 || "", var10: c.var10 || "",
    }));
    if (imported.length === 0) { toast({ title: "Nenhum contato encontrado", variant: "destructive" }); return; }
    setContacts(prev => [...prev, ...imported]);
    setImportFromContacts(false);
    setSelectedSavedContactIds(new Set());
    setImportContactSearch("");
    setShowContactTable(true);
    toast({ title: `${imported.length} contatos adicionados` });
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportProgress(0);

    // Start 3-second animation
    const startTime = Date.now();
    const animDuration = 3000;
    let animFrame: number;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / animDuration, 1);
      const eased = Math.round(100 * (1 - Math.pow(1 - t, 3)));
      setImportProgress(Math.min(eased, t >= 1 ? 100 : 99));
      if (t < 1) animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);

    // Read file in background
    let parsedResult: { headers: string[]; rows: any[][]; hasHeader: boolean; mappings: ColumnMapping[] } | null = null;
    let parseError: string | null = null;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import("xlsx");
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (rows.length < 1) { parseError = "empty"; return; }

        const normalize = (s: string) =>
          String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, " ").trim();

        const firstRow = rows[0] || [];
        const hasHeader = firstRow.some((c: any) => {
          const s = normalize(String(c));
          return ["nome", "name", "numero", "number", "telefone", "phone", "contato", "contact", "whatsapp", "celular", "var"].some(k => s.includes(k));
        });

        const colCount = Math.max(...rows.slice(0, 10).map(r => r?.length || 0));
        const headers = hasHeader
          ? firstRow.map((c: any) => String(c).trim() || `Coluna ${firstRow.indexOf(c) + 1}`)
          : Array.from({ length: colCount }, (_, i) => `Coluna ${i + 1}`);

        const dataRows = (hasHeader ? rows.slice(1) : rows).filter(r => r.some((cell: any) => cell != null && String(cell).trim() !== ""));
        parsedResult = { headers, rows: dataRows, hasHeader, mappings: headers.map(() => "ignorar" as ColumnMapping) };
      } catch (err) {
        console.error("Import error:", err);
        parseError = "format";
      }
    };
    reader.readAsArrayBuffer(file);

    // After exactly 3 seconds, show result
    setTimeout(() => {
      cancelAnimationFrame(animFrame);
      setImportProgress(100);
      setTimeout(() => {
        setImportProgress(null);
        if (parseError === "empty") {
          toast({ title: "Arquivo vazio", description: "O arquivo não contém dados.", variant: "destructive" });
        } else if (parseError) {
          toast({ title: "Erro ao ler arquivo", description: "Formato não suportado.", variant: "destructive" });
        } else if (parsedResult) {
          setRawImport({ headers: parsedResult.headers, rows: parsedResult.rows, hasHeader: parsedResult.hasHeader, columnMappings: parsedResult.mappings });
        }
      }, 400);
    }, animDuration);
    if (fileRef.current) fileRef.current.value = "";
  };

  const updateColumnMapping = (colIndex: number, value: ColumnMapping) => {
    if (!rawImport) return;
    const newMappings = [...rawImport.columnMappings];
    // If setting nome or numero, clear any other column with that value
    if (value === "nome" || value === "numero") {
      for (let i = 0; i < newMappings.length; i++) {
        if (newMappings[i] === value) newMappings[i] = "ignorar";
      }
    }
    newMappings[colIndex] = value;
    setRawImport({ ...rawImport, columnMappings: newMappings });
  };

  const confirmMappingImport = () => {
    if (!rawImport) return;
    const { rows, columnMappings } = rawImport;
    const numIdx = columnMappings.indexOf("numero");
    const nameIdx = columnMappings.indexOf("nome");
    const varIndices: Record<string, number> = {};
    columnMappings.forEach((m, i) => {
      if (m.startsWith("var")) varIndices[m] = i;
    });

    const imported: Contact[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const rawNum = numIdx >= 0 ? String(row[numIdx] ?? "").trim().replace(/[\s\-\(\)]/g, "") : "";
      const nome = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
      if (!rawNum && !nome) continue;

      imported.push({
        id: Date.now() + i,
        nome,
        numero: rawNum.replace(/\D/g, ""),
        var1: varIndices.var1 !== undefined ? String(row[varIndices.var1] ?? "") : "",
        var2: varIndices.var2 !== undefined ? String(row[varIndices.var2] ?? "") : "",
        var3: varIndices.var3 !== undefined ? String(row[varIndices.var3] ?? "") : "",
        var4: varIndices.var4 !== undefined ? String(row[varIndices.var4] ?? "") : "",
        var5: varIndices.var5 !== undefined ? String(row[varIndices.var5] ?? "") : "",
        var6: varIndices.var6 !== undefined ? String(row[varIndices.var6] ?? "") : "",
        var7: varIndices.var7 !== undefined ? String(row[varIndices.var7] ?? "") : "",
        var8: varIndices.var8 !== undefined ? String(row[varIndices.var8] ?? "") : "",
        var9: varIndices.var9 !== undefined ? String(row[varIndices.var9] ?? "") : "",
        var10: varIndices.var10 !== undefined ? String(row[varIndices.var10] ?? "") : "",
      });
    }

    const totalImported = imported.length;

    if (totalImported === 0) {
      toast({ title: "Nenhum contato encontrado", description: "A planilha parece estar vazia.", variant: "destructive" });
      return;
    }

    // Identify issues but DON'T remove — let user decide
    const invalid: Contact[] = [];
    const valid: Contact[] = [];
    for (const c of imported) {
      const digits = c.numero.replace(/\D/g, "");
      if (digits.length < 8) {
        invalid.push(c);
      } else {
        valid.push(c);
      }
    }

    const seenInBatch = new Set<string>();
    const batchDuplicates: Contact[] = [];
    const uniqueInBatch: Contact[] = [];
    for (const c of valid) {
      const num = c.numero.trim();
      if (seenInBatch.has(num)) {
        batchDuplicates.push(c);
      } else {
        seenInBatch.add(num);
        uniqueInBatch.push(c);
      }
    }

    const existingNums = new Set(contacts.map(c => c.numero.trim()).filter(Boolean));
    const existingDuplicates: Contact[] = [];
    const clean: Contact[] = [];
    for (const c of uniqueInBatch) {
      if (existingNums.has(c.numero.trim())) {
        existingDuplicates.push(c);
      } else {
        clean.push(c);
      }
    }

    const hasIssues = invalid.length > 0 || batchDuplicates.length > 0 || existingDuplicates.length > 0;

    if (!hasIssues) {
      // No issues — import directly
      finishImport(imported);
    } else {
      // Show review dialog
      setRawImport(null);
      setImportReview({ all: imported, invalid, batchDuplicates, existingDuplicates, clean });
    }
  };

  const finishImport = (finalContacts: Contact[]) => {
    if (finalContacts.length === 0) {
      toast({ title: "Nenhum contato para importar", variant: "destructive" });
      return;
    }
    setImportReview(null);
    setImportProgress(0);

    const totalSteps = 60;
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      const progress = Math.round(100 * (1 - Math.pow(1 - currentStep / totalSteps, 3)));
      setImportProgress(Math.min(progress, 99));

      if (currentStep >= totalSteps) {
        clearInterval(interval);
        setImportProgress(100);
        setTimeout(() => {
          setContacts(prev => [...prev, ...finalContacts]);
          setShowContactTable(true);
          setContactPage(0);
          setImportProgress(null);
          toast({ title: `✅ ${finalContacts.length} contatos importados` });
        }, 300);
      }
    }, 50);
  };


  const getDeviceStatus = (status: string) => {
    if (status === "Ready") return { label: "Online", icon: Wifi, color: "text-emerald-400" };
    if (status === "QR") return { label: "QR Pendente", icon: RefreshCw, color: "text-amber-400" };
    return { label: "Offline", icon: WifiOff, color: "text-red-400" };
  };

  const steps = [
    { num: 1, label: "Conteúdo", desc: "Mensagem & Mídia", icon: MessageSquare },
    { num: 2, label: "Público", desc: "Contatos & Destino", icon: Users },
    { num: 3, label: "Parâmetros", desc: "Controle de Envio", icon: Settings2 },
    { num: 4, label: "Lançamento", desc: "Revisão & Envio", icon: Send },
  ];

  // ─── Variable Preview Helper ───
  const previewContact = contacts[previewContactIndex] || contacts[0];
  const previewMessage = useMemo(() => {
    if (!showVarPreview || !previewContact || !message) return message;
    return message
      .replace(/\{\{nome\}\}/gi, previewContact.nome || "")
      .replace(/\{\{numero\}\}/gi, previewContact.numero || "")
      .replace(/\{\{telefone\}\}/gi, previewContact.numero || "")
      .replace(/\{\{var1\}\}/gi, previewContact.var1 || "")
      .replace(/\{\{var2\}\}/gi, previewContact.var2 || "")
      .replace(/\{\{var3\}\}/gi, previewContact.var3 || "")
      .replace(/\{\{var4\}\}/gi, previewContact.var4 || "")
      .replace(/\{\{var5\}\}/gi, previewContact.var5 || "")
      .replace(/\{\{var6\}\}/gi, previewContact.var6 || "")
      .replace(/\{\{var7\}\}/gi, previewContact.var7 || "")
      .replace(/\{\{var8\}\}/gi, previewContact.var8 || "")
      .replace(/\{\{var9\}\}/gi, previewContact.var9 || "")
      .replace(/\{\{var10\}\}/gi, previewContact.var10 || "")
      .replace(/\{\{rand4\}\}/gi, "1234")
      .replace(/\{\{rand3\}\}/gi, "abc");
  }, [showVarPreview, previewContact, message]);

  const hasVarsInMessage = /\{\{(nome|numero|telefone|var[0-9]+|rand[34])\}\}/i.test(message || "");

  // ─── WhatsApp Preview Component ───
  const WhatsAppPreview = () => {
    const displayMessage = showVarPreview ? previewMessage : message;
    const hasContent = displayMessage || mediaUrl;
    const hasAnyButtons = buttons.filter(b => b.text.trim()).length > 0;
    const bubbleMaxW = "max-w-[70%] sm:max-w-[75%]";
    const isSent = previewMode === "sent";

    return (
      <div className="rounded-[20px] overflow-hidden border-2 border-[hsl(210_10%_18%)] shadow-2xl shadow-black/40 flex flex-col" style={{ height: '520px' }}>
        {/* ── WhatsApp Header ── */}
        <div className="bg-[#202C33] px-4 py-3 flex items-center gap-3 border-b border-[#313D45]">
          <div className="w-9 h-9 rounded-full bg-[#6B7B8D]/30 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-[#AEBAC1]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#E9EDEF] text-[14px] font-medium leading-tight">
              {showVarPreview && previewContact ? (previewContact.nome || previewContact.numero) : "Destinatário"}
            </p>
            <p className="text-[#8696A0] text-[11px]">online</p>
          </div>
          {/* Var preview toggle */}
          {hasVarsInMessage && contacts.length > 0 && (
            <div className="flex items-center gap-1.5">
              {showVarPreview && contacts.length > 1 && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setPreviewContactIndex(Math.max(0, previewContactIndex - 1))}
                    disabled={previewContactIndex === 0}
                    className="w-5 h-5 rounded flex items-center justify-center text-[#AEBAC1] hover:bg-[#313D45] disabled:opacity-30 transition-colors"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <span className="text-[10px] text-[#8696A0] tabular-nums min-w-[24px] text-center">{previewContactIndex + 1}/{Math.min(contacts.length, 50)}</span>
                  <button
                    onClick={() => setPreviewContactIndex(Math.min(contacts.length - 1, previewContactIndex + 1))}
                    disabled={previewContactIndex >= contacts.length - 1}
                    className="w-5 h-5 rounded flex items-center justify-center text-[#AEBAC1] hover:bg-[#313D45] disabled:opacity-30 transition-colors"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
              )}
              <button
                onClick={() => { setShowVarPreview(!showVarPreview); setPreviewContactIndex(0); }}
                className={cn(
                  "px-2 py-1 rounded-md text-[11px] font-medium transition-all duration-200",
                  showVarPreview
                    ? "bg-[#00A884] text-white shadow-sm"
                    : "bg-[#313D45] text-[#AEBAC1] hover:bg-[#3B4A54]"
                )}
              >
                <Eye className="w-3 h-3 inline mr-1" />
                {showVarPreview ? "Vars" : "Vars"}
              </button>
            </div>
          )}
        </div>

        {/* ── Chat Area ── */}
        <div
          className="p-4 flex-1 min-h-0 overflow-y-auto flex flex-col"
          style={{
            backgroundColor: "#0B141A",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M50 50v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm-30 0v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm30-30v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm-30 0v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4z'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        >
          {/* Var preview indicator */}
          {showVarPreview && previewContact && (
            <div className="flex justify-center mb-3">
              <div className="bg-[#1D2C36] rounded-lg px-3 py-1.5 text-[11px] text-[#00A884] font-medium flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                Preview com dados de: {previewContact.nome || previewContact.numero}
              </div>
            </div>
          )}

          {/* ── Message Group ── */}
          <div
            className={cn("flex flex-col gap-[6px]", isSent ? "items-end" : "items-start")}
          >
            {/* ── Bubble ── */}
            <div className={cn(bubbleMaxW, "flex flex-col rounded-[12px] overflow-hidden shadow-md", isSent ? "bg-[#005C4B]" : "bg-[#202C33]")}>
              {/* Media */}
              {mediaUrl && (/\.(ogg|mp3|wav|m4a|aac|opus|mpeg)(\?|$)/i.test(mediaUrl) ? (
                <div className="px-3 py-2.5 flex items-center gap-3 bg-[#1B2B34] rounded-lg mx-2 mt-2">
                  <div className="w-10 h-10 rounded-full bg-[#00A884]/20 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#00A884]" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="h-1.5 bg-[#374045] rounded-full overflow-hidden">
                      <div className="h-full w-1/3 bg-[#00A884] rounded-full" />
                    </div>
                    <p className="text-[10px] text-[#8696A0] mt-1">0:00 / --:--</p>
                  </div>
                </div>
              ) : (
                <img src={mediaUrl} alt="media" className="w-full max-h-52 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ))}
              {/* Text */}
              <div className="px-[14px] py-[10px]">
                <p className="text-[14px] text-[#E9EDEF] whitespace-pre-wrap leading-[1.65] break-words">
                  {hasContent ? displayMessage : (
                    <span className="italic text-[#8696A0]/70">Sua mensagem aparecerá aqui…</span>
                  )}
                </p>
                {/* Meta */}
                <div className="flex items-center justify-end gap-1 mt-[4px]">
                  <span className="text-[11px] text-[#8696A0]/65 leading-none">12:00</span>
                  {isSent && <span className="text-[11px] text-[#53BDEB]/70 leading-none">✓✓</span>}
                </div>
              </div>
              {/* Buttons inside the bubble */}
              {hasAnyButtons && (
                <div className="flex flex-col gap-[1px] border-t border-[#313D45]/40">
                  {buttons.filter(b => b.text.trim()).map((btn) => (
                    <button
                      key={btn.id}
                      className={cn(
                        "w-full px-3 py-[10px] flex items-center justify-center gap-2 transition-colors duration-100",
                        isSent ? "hover:bg-[#006B57]" : "hover:bg-[#2A3942]",
                        buttonAddedFlash && "ring-1 ring-[#00A5F4]/30 ring-inset"
                      )}
                    >
                      {btn.type === "url" && <Link className="w-[14px] h-[14px] text-[#00A5F4]" />}
                      {btn.type === "phone" && <Phone className="w-[14px] h-[14px] text-[#00A5F4]" />}
                      <span className="text-[14px] text-[#00A5F4] font-medium">{btn.text || "Botão"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full pb-16">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground tracking-tight leading-tight">
            Configuração de Campanha
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground/60 mt-1 sm:mt-1.5">Controle total sobre sua entrega e performance.</p>
        </div>
      </div>

      {/* ═══ Stepper (Top) ═══ */}
      <div className="mb-4 sm:mb-8">
        <SurfaceCard className="px-2.5 py-2 sm:p-5">
          <div className="flex items-center">
            {steps.map((s, i) => {
              const isActive = step === s.num;
              const isDone = step > s.num;
              const Icon = s.icon;
              return (
                <React.Fragment key={s.num}>
                  {/* Step circle + label */}
                  <button
                    onClick={() => { if (s.num === 2 && contacts.length === 0) { setContacts([{ id: Date.now(), nome: "", numero: "", var1: "", var2: "", var3: "", var4: "", var5: "", var6: "", var7: "", var8: "", var9: "", var10: "" }]); setShowContactTable(true); } setStep(s.num); }}
                    className="flex flex-col items-center gap-0.5 sm:gap-2 group transition-all duration-150 cursor-pointer"
                  >
                    <div
                      className={cn(
                        "w-7 h-7 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 transition-all duration-200",
                        isActive && "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110",
                        isDone && "bg-primary/15 text-primary",
                        !isActive && !isDone && "bg-muted/20 dark:bg-muted/10 text-muted-foreground/30 group-hover:bg-muted/40 group-hover:text-muted-foreground/60",
                      )}
                    >
                      {isDone ? <Check className="w-3 h-3 sm:w-5 sm:h-5" strokeWidth={2.5} /> : <Icon className="w-3 h-3 sm:w-5 sm:h-5" />}
                    </div>
                    <span className={cn(
                      "text-[9px] sm:text-[11px] font-medium transition-colors leading-tight",
                      isActive ? "text-foreground" : isDone ? "text-foreground/60" : "text-muted-foreground/30 group-hover:text-muted-foreground/60"
                    )}>{s.label}</span>
                  </button>
                  {/* Connector line */}
                  {i < steps.length - 1 && (
                    <div className="flex-1 mx-1 sm:mx-3">
                      <div className={cn(
                        "h-[2px] rounded-full transition-colors duration-300",
                        isDone ? "bg-primary/40" : "bg-muted/15 dark:bg-muted/10"
                      )} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </SurfaceCard>
      </div>

      {/* ═══ Step Content ═══ */}
      <div key={step} className="animate-fade-in">
        {/* ===== STEP 1: Message ===== */}
        {step === 1 && (
          <div className="space-y-6 sm:space-y-12">
            {/* Editor + Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-8 items-start">
              {/* Editor column */}
              <div className="lg:col-span-3 space-y-4 sm:space-y-8">
                {/* Message editor */}
                <SurfaceCard className="p-4 sm:p-6 space-y-4 sm:space-y-5">
                  <SectionLabel>Mensagem</SectionLabel>
                  
                  {/* Message Tabs */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {[0, 1, 2, 3, 4].map(i => {
                      const hasText = messages[i]?.trim();
                      return (
                        <button
                          key={i}
                          onClick={() => setActiveMessageTab(i)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border",
                            activeMessageTab === i
                              ? "bg-primary/15 text-primary border-primary/30"
                              : hasText
                                ? "bg-muted/20 text-foreground/70 border-border/20 hover:bg-muted/30"
                                : "bg-muted/8 text-muted-foreground/40 border-border/10 hover:bg-muted/15"
                          )}
                        >
                          Msg {i + 1}
                          {hasText && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
                        </button>
                      );
                    })}
                    <span className="text-[9px] text-muted-foreground/40 ml-2">
                      {allMessages.length}/5 ativas
                    </span>
                  </div>

                  {/* Rotation toggle - only show when multiple messages */}
                  {allMessages.length > 1 && (
                    <div className="flex flex-col gap-2 p-3 rounded-xl bg-muted/10 border border-border/10">
                      <p className="text-[11px] font-medium text-foreground/70">Modo de envio das mensagens</p>
                      <div className="flex gap-2">
                        {([
                          { value: "random" as const, label: "Aleatório", icon: <Sparkles className="w-3 h-3 mr-1" />, desc: "Uma mensagem aleatória para cada contato" },
                          { value: "all" as const, label: "Todas", icon: <ArrowDown className="w-3 h-3 mr-1" />, desc: "Todas as mensagens para cada contato" },
                        ]).map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setRotationMode(opt.value)}
                            className={`flex-1 text-center p-2 rounded-lg border text-[10px] transition-all ${
                              rotationMode === opt.value
                                ? "border-primary bg-primary/10 text-primary font-medium"
                                : "border-border/20 text-muted-foreground hover:border-border/40"
                            }`}
                          >
                            <div className="flex items-center justify-center">{opt.icon}{opt.label}</div>
                            <p className="text-[9px] text-muted-foreground/50 mt-1">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Toolbar */}
                  <div className="flex items-center gap-0.5 flex-wrap p-1.5 rounded-xl bg-muted/15 dark:bg-muted/8 border border-border/10">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground hover:bg-background/60 font-medium rounded-lg">
                          <FileText className="w-3.5 h-3.5" /> Variável
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-1.5 bg-popover border-border z-50" align="start">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1">Contato</p>
                        {[{ label: "Nome", tag: "{{nome}}" }, { label: "Número", tag: "{{numero}}" }].map(v => (
                          <button key={v.tag} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-accent transition-colors flex items-center justify-between"
                            onClick={() => insertAtCursor(v.tag)}>
                            <span>{v.label}</span>
                            <code className="text-[9px] text-muted-foreground">{v.tag}</code>
                          </button>
                        ))}
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1 mt-1">Personalizadas</p>
                        {["Variável 1", "Variável 2", "Variável 3", "Variável 4", "Variável 5", "Variável 6", "Variável 7"].map((v, i) => (
                          <button key={v} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-accent transition-colors flex items-center justify-between"
                            onClick={() => insertAtCursor(`{{var${i + 1}}}`)}>
                            <span>{v}</span>
                            <code className="text-[9px] text-muted-foreground">{`{{var${i + 1}}}`}</code>
                          </button>
                        ))}
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1 mt-1">Dinâmicas</p>
                        {[
                          { label: "Número Aleatório (4 dígitos)", tag: "{{rand4}}" },
                          { label: "Texto Aleatório (3 letras)", tag: "{{rand3}}" },
                        ].map(v => (
                          <button key={v.tag} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-accent transition-colors flex items-center justify-between"
                            onClick={() => insertAtCursor(v.tag)}>
                            <span>{v.label}</span>
                            <code className="text-[9px] text-muted-foreground">{v.tag}</code>
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>

                    <div className="h-5 w-px bg-border/20 mx-0.5" />
                    {[
                      { icon: Bold, label: "Negrito", wrap: ["*", "*"] },
                      { icon: Italic, label: "Itálico", wrap: ["_", "_"] },
                      { icon: Strikethrough, label: "Tachado", wrap: ["~", "~"] },
                      { icon: Code, label: "Código", wrap: ["```", "```"] },
                    ].map(({ icon: Icon, label, wrap }) => (
                      <Button key={label} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 hover:text-foreground hover:bg-background/60 rounded-lg transition-colors" title={label}
                        onClick={() => wrapSelectedText(wrap[0], wrap[1])}>
                        <Icon className="w-3.5 h-3.5" />
                      </Button>
                    ))}
                    <div className="h-5 w-px bg-border/20 mx-0.5" />

                    <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 hover:text-foreground hover:bg-background/60 rounded-lg" title="Emoji">
                          <Smile className="w-3.5 h-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[280px] p-2 bg-popover border-border z-50" align="start">
                        <div className="flex items-center gap-0.5 mb-2 border-b border-border/20 pb-1.5">
                          {Object.keys(commonEmojis).map(cat => (
                            <button key={cat} onClick={() => setEmojiCategory(cat)}
                              className={cn("px-2 py-1 rounded text-[10px] transition-colors",
                                emojiCategory === cat ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent"
                              )}>{cat}</button>
                          ))}
                        </div>
                        <div className="grid grid-cols-8 gap-0.5">
                          {(commonEmojis[emojiCategory as keyof typeof commonEmojis] || []).map(emoji => (
                            <button key={emoji} className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-base"
                              onClick={() => { insertAtCursor(emoji); setShowEmojiPicker(false); }}>{emoji}</button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <Textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Olá, {{nome}}.\n\nEscreva sua mensagem aqui..."
                    rows={10}
                    className="text-sm leading-[1.8] bg-muted/8 dark:bg-muted/4 border-border/15 resize-none focus-visible:ring-1 focus-visible:ring-primary/30 px-4 py-3 text-foreground/90 placeholder:text-muted-foreground/30 rounded-xl"
                  />

                </SurfaceCard>
              </div>

              {/* Preview column */}
              <div className="lg:col-span-2 lg:sticky lg:top-4 self-start">
                <WhatsAppPreview />
              </div>
            </div>

            {/* Template + Mídia Row - below editor */}
            <div className="space-y-5">
              <SurfaceCard className="p-5 space-y-3">
                <SectionLabel>Modelo Base</SectionLabel>
                <Select value={selectedTemplate} onValueChange={(val) => {
                  setSelectedTemplate(val);
                  if (val !== "nova") {
                    const tmpl = savedTemplates.find(t => t.id === val);
                    if (tmpl) {
                      setMessage(tmpl.content);
                      if (tmpl.media_url) setMediaUrl(tmpl.media_url); else setMediaUrl("");
                      if (tmpl.buttons && Array.isArray(tmpl.buttons)) {
                        setButtons(tmpl.buttons.map((b: any, i: number) => ({ id: Date.now() + i, type: b.type || "reply", text: b.text || "", value: b.value || "" })));
                      } else { setButtons([{ id: Date.now(), type: "reply", text: "", value: "" }]); }
                    }
                  } else { setMessage(""); setMediaUrl(""); setButtons([{ id: Date.now(), type: "reply", text: "", value: "" }]); }
                }}>
                  <SelectTrigger className="h-11 text-sm font-medium bg-background/50 dark:bg-muted/20 border-border/30 hover:border-primary/40 transition-colors">
                    <SelectValue placeholder="Campanha Padrão" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border z-50">
                    <SelectItem value="nova">Campanha Padrão</SelectItem>
                    {savedTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </SurfaceCard>

              <SurfaceCard className="p-5 space-y-3">
                <SectionLabel>Mídia</SectionLabel>
                {!mediaUrl ? (
                  <>
                    <input type="file" ref={mediaFileRef} accept="image/*,video/*,audio/*,.pdf,.doc,.docx" className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 20 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "Máximo 20MB.", variant: "destructive" }); return; }
                        setMediaUploading(true);
                        try {
                          // Compress images before uploading
                          const optimized = await compressImage(file);
                          const ext = optimized.name.split(".").pop() || "bin";
                          const path = `${session!.user.id}/campaigns/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
                          const { error: uploadError } = await supabase.storage.from("media").upload(path, optimized);
                          if (uploadError) throw uploadError;
                          const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
                          setMediaUrl(urlData.publicUrl);
                          setMediaFileName(file.name);
                          toast({ title: "Mídia enviada!" });
                        } catch (err: any) { toast({ title: "Erro no upload", description: err.message, variant: "destructive" }); }
                        finally { setMediaUploading(false); if (mediaFileRef.current) mediaFileRef.current.value = ""; }
                      }}
                    />
                    <button
                      onClick={() => mediaFileRef.current?.click()}
                      disabled={mediaUploading}
                      className="w-full py-6 rounded-xl border-2 border-dashed border-border/30 dark:border-border/15 hover:border-primary/40 bg-muted/5 dark:bg-muted/3 flex flex-col items-center justify-center gap-2 transition-colors duration-100 hover:bg-primary/5 group"
                    >
                      {mediaUploading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <ImageIcon className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary transition-colors" />}
                      <span className="text-[11px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">{mediaUploading ? "Enviando..." : "Imagem, vídeo ou documento"}</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/60 shadow-sm">
                    <img src={mediaUrl} alt="preview" className="w-12 h-12 rounded-lg object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{mediaFileName || "Mídia"}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">Anexado</p>
                    </div>
                    <button onClick={() => { setMediaUrl(""); setMediaFileName(""); }} className="text-muted-foreground/50 hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </SurfaceCard>

              {/* ── Botões Interativos ── */}
              <SurfaceCard className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <SectionLabel>Botões Interativos</SectionLabel>
                  <Badge variant="secondary" className="text-[10px] h-5 bg-primary/10 text-primary border-primary/20">
                    {buttons.length}/10
                  </Badge>
                </div>
                
                <div className="space-y-3">
                  {buttons.map((btn, idx) => {
                    const typeLabel = btn.type === "reply" ? "Resposta Rápida" : "Link (URL)";
                    const TypeIcon = btn.type === "reply" ? MousePointerClick : Link;
                    return (
                      <div key={btn.id} className="rounded-xl border border-border/30 dark:border-border/15 bg-muted/15 dark:bg-muted/8 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                              <TypeIcon className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <span className="text-[11px] font-semibold text-foreground/70">{typeLabel}</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/30 disabled:opacity-20" disabled={idx === 0} onClick={() => moveButton(btn.id, "up")}><ArrowUp className="w-3.5 h-3.5" /></button>
                            <button className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/30 disabled:opacity-20" disabled={idx === buttons.length - 1} onClick={() => moveButton(btn.id, "down")}><ArrowDown className="w-3.5 h-3.5" /></button>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-muted-foreground/40 hover:text-primary transition-colors p-1 rounded-lg hover:bg-primary/10"><Pencil className="w-3.5 h-3.5" /></button>
                              </PopoverTrigger>
                              <PopoverContent className="w-44 p-1.5 bg-popover border-border z-50" align="end">
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1">Alterar tipo</p>
                                {[
                                  { t: "reply" as const, label: "Resposta Rápida", Ic: MousePointerClick },
                                  { t: "url" as const, label: "Link (URL)", Ic: Link },
                                ].map(opt => (
                                  <button key={opt.t} className={cn("w-full text-left px-2.5 py-2 text-xs rounded-lg hover:bg-accent transition-colors flex items-center gap-2", btn.type === opt.t && "bg-accent")}
                                    onClick={() => updateButton(btn.id, "type", opt.t)}>
                                    <opt.Ic className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="font-medium">{opt.label}</span>
                                  </button>
                                ))}
                              </PopoverContent>
                            </Popover>
                            <button className="text-muted-foreground/30 hover:text-destructive transition-colors p-1 rounded-lg hover:bg-destructive/10" onClick={() => removeButton(btn.id)}><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                        {btn.type === "reply" ? (
                          <Input value={btn.text} onChange={(e) => updateButton(btn.id, "text", e.target.value)} placeholder="Texto exibido no botão" className="h-10 text-sm bg-background/50 dark:bg-background/20 border-border/15 font-medium" maxLength={20} />
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <Input value={btn.text} onChange={(e) => updateButton(btn.id, "text", e.target.value)} placeholder="Texto exibido" className="h-10 text-sm bg-background/50 dark:bg-background/20 border-border/15 font-medium" maxLength={20} />
                            <Input value={btn.value} onChange={(e) => updateButton(btn.id, "value", e.target.value)} placeholder={btn.type === "url" ? "https://..." : "+5511999999999"} className="h-10 text-sm bg-background/50 dark:bg-background/20 border-border/15 font-mono" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button variant="outline" size="sm" disabled={buttons.length >= 10}
                  className="w-full h-11 gap-2 border-dashed border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors duration-100 text-xs font-medium"
                  onClick={() => addButton("reply")}>
                  <Plus className="w-4 h-4" /> Adicionar Botão
                </Button>
              </SurfaceCard>
            </div>
          </div>
        )}

        {/* ===== STEP 2: Contacts ===== */}
        {step === 2 && (
          <div className="space-y-8">

            {/* Import area */}
            <SurfaceCard className="p-0 overflow-hidden">
              <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileImport} />
              
              {validContacts.length === 0 ? (
                /* ── Empty state with integrated drag area ── */
                <button
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/40", "bg-primary/5"); }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove("ring-2", "ring-primary/40", "bg-primary/5"); }}
                  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("ring-2", "ring-primary/40", "bg-primary/5"); const f = e.dataTransfer.files[0]; if (f && fileRef.current) { const dt = new DataTransfer(); dt.items.add(f); fileRef.current.files = dt.files; fileRef.current.dispatchEvent(new Event("change", { bubbles: true })); } }}
                  className="w-full py-16 flex flex-col items-center gap-6 transition-all duration-200 hover:bg-muted/5 group cursor-pointer"
                >
                  <div className="w-18 h-18 rounded-2xl bg-primary/10 dark:bg-primary/8 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-center max-w-md">
                    <p className="text-lg font-bold text-foreground">Arraste sua planilha aqui</p>
                    <p className="text-sm text-muted-foreground/50 mt-2 leading-relaxed">ou clique para selecionar — .xlsx, .xls, .csv</p>
                  </div>
                </button>
              ) : (
                /* ── Compact drag area when contacts exist ── */
                <button
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/40", "bg-primary/5"); }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove("ring-2", "ring-primary/40", "bg-primary/5"); }}
                  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("ring-2", "ring-primary/40", "bg-primary/5"); const f = e.dataTransfer.files[0]; if (f && fileRef.current) { const dt = new DataTransfer(); dt.items.add(f); fileRef.current.files = dt.files; fileRef.current.dispatchEvent(new Event("change", { bubbles: true })); } }}
                  className="w-full py-8 flex flex-col items-center gap-3 transition-all duration-200 hover:bg-muted/5 group cursor-pointer border-b border-border/8"
                >
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 dark:bg-primary/8 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Upload className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground/70 group-hover:text-foreground transition-colors">Arraste ou clique para importar mais</p>
                    <p className="text-[11px] text-muted-foreground/30 mt-1">.xlsx, .xls, .csv — Importação cumulativa</p>
                  </div>
                </button>
              )}

              {/* Action bar — always visible */}
              <div className="px-5 py-3.5 flex items-center gap-2 border-b border-border/8 bg-muted/3 dark:bg-muted/2">
                <Button variant="outline" size="sm" className="text-xs h-9 border-border/20 gap-1.5 hover:bg-primary/5 hover:border-primary/30" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" /> Planilha
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-9 border-border/20 gap-1.5 hover:bg-primary/5 hover:border-primary/30" onClick={() => setImportFromContacts(true)}>
                  <Users className="w-3.5 h-3.5" /> Base
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-9 border-border/20 gap-1.5 hover:bg-primary/5 hover:border-primary/30" onClick={addContact}>
                  <Plus className="w-3.5 h-3.5" /> Manual
                </Button>

                {contacts.length > 0 && (
                  <>
                    <div className="h-5 w-px bg-border/15 mx-1" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="text-[11px] h-8 border-border/20 gap-1.5 text-muted-foreground hover:text-foreground hover:border-primary/30">
                          <Settings2 className="w-3 h-3" /> Ferramentas
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem className="text-xs gap-2" onClick={removeDuplicates}>
                          <Copy className="w-3.5 h-3.5" /> Remover Duplicados
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-xs gap-2" onClick={removeInvalid}>
                          <XCircle className="w-3.5 h-3.5" /> Remover Inválidos
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-xs gap-2" onClick={() => addPrefixToNumbers("55")}>
                          <Phone className="w-3.5 h-3.5" /> Adicionar DDI (55)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}

                {contacts.length > 0 && (
                  <span className="ml-auto text-[11px] text-muted-foreground/40 tabular-nums font-medium">
                    {validContacts.length} contato{validContacts.length !== 1 ? "s" : ""}
                    {invalidContacts.length > 0 && <span className="text-amber-400/70 ml-1.5">· {invalidContacts.length} inválido{invalidContacts.length !== 1 ? "s" : ""}</span>}
                    {duplicateCount > 0 && <span className="text-amber-400/70 ml-1.5">· {duplicateCount} duplicado{duplicateCount !== 1 ? "s" : ""}</span>}
                  </span>
                )}
              </div>
            </SurfaceCard>

            {/* ── Import from admin client base dialog ── */}
            <Dialog open={importFromContacts} onOpenChange={(open) => { setImportFromContacts(open); if (!open) { setSelectedSavedContactIds(new Set()); setImportContactSearch(""); setSelectedPlanFilter("all"); setImportSearchMode("name"); } }}>
              <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
                <DialogHeader><DialogTitle>Importar da Base</DialogTitle></DialogHeader>
                <div className="space-y-3 flex-1 min-h-0 flex flex-col">
                  {/* Search tabs */}
                  <div className="flex gap-1 border-b border-border/20 pb-2">
                    <button onClick={() => setImportSearchMode("name")} className={cn("px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors", importSearchMode === "name" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                      Nome
                    </button>
                    <button onClick={() => setImportSearchMode("phone")} className={cn("px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors", importSearchMode === "phone" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                      Número
                    </button>
                    <button onClick={() => setImportSearchMode("plan")} className={cn("px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors", importSearchMode === "plan" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                      Plano
                    </button>
                  </div>

                  {importSearchMode !== "plan" && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder={importSearchMode === "phone" ? "Buscar por número..." : "Buscar por nome..."} value={importContactSearch} onChange={e => setImportContactSearch(e.target.value)} className="pl-9 h-9 text-xs" />
                    </div>
                  )}

                  {/* Plan filter — show only in plan mode */}
                  {importSearchMode === "plan" && (
                    <div className="flex flex-wrap gap-1.5">
                      {PLAN_OPTIONS.map(plan => {
                        const filterVal = plan === "Todos" ? "all" : plan;
                        return (
                          <button key={plan} onClick={() => setSelectedPlanFilter(filterVal)}
                            className={cn("px-2.5 py-1 rounded-full text-[11px] border transition-colors",
                              selectedPlanFilter === filterVal
                                ? "bg-primary/10 text-primary border-primary/30"
                                : "bg-muted/30 text-muted-foreground border-border/30 hover:border-primary/20"
                            )}>{plan}</button>
                        );
                      })}
                    </div>
                  )}

                  {/* Select all / count */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <button className="hover:text-foreground transition-colors" onClick={() => {
                      if (selectedSavedContactIds.size === filteredBaseContacts.length) setSelectedSavedContactIds(new Set());
                      else setSelectedSavedContactIds(new Set(filteredBaseContacts.map(u => u.id)));
                    }}>
                      {selectedSavedContactIds.size === filteredBaseContacts.length && filteredBaseContacts.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
                    </button>
                    <span className="tabular-nums">
                      {selectedSavedContactIds.size > 0 ? `${selectedSavedContactIds.size} selecionado(s)` : `${filteredBaseContacts.length} contato(s)`}
                    </span>
                  </div>

                  {/* Contact list */}
                  <div className="flex-1 min-h-0 overflow-y-auto border border-border/20 rounded-lg divide-y divide-border/10 max-h-[400px]">
                    {filteredBaseContacts.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">Nenhum contato encontrado</div>
                    ) : (
                      filteredBaseContacts.map(u => {
                        const isSelected = selectedSavedContactIds.has(u.id);
                        return (
                          <button key={u.id} onClick={() => setSelectedSavedContactIds(prev => {
                            const next = new Set(prev);
                            next.has(u.id) ? next.delete(u.id) : next.add(u.id);
                            return next;
                          })} className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/10 transition-colors", isSelected && "bg-primary/5")}>
                            <Checkbox checked={isSelected} className="pointer-events-none" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-medium text-foreground truncate">{u.full_name || "Sem nome"}</p>
                                <p className="text-[11px] text-muted-foreground font-mono shrink-0">{u.phone || "—"}</p>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">{u.plan_name || "Sem plano"}</Badge>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
                <DialogFooter className="pt-2">
                  <Button variant="outline" onClick={() => setImportFromContacts(false)} size="sm">Cancelar</Button>
                  <Button onClick={handleImportFromBase} size="sm" className="font-semibold">
                    Importar {selectedSavedContactIds.size > 0 ? selectedSavedContactIds.size : filteredBaseContacts.length}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Contact table */}
            {showContactTable && contacts.length > 0 && (() => {
              const varKeys = (["var1","var2","var3","var4","var5","var6","var7","var8","var9","var10"] as const)
                .filter(k => contacts.some(c => c[k]?.trim()));
              const isNumValid = (n: string) => /^\d{10,15}$/.test(n.replace(/\D/g, ""));
              return (
              <SurfaceCard className="p-0 overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto max-h-[420px] rounded-xl scrollbar-thin">
                  <table className="w-full text-xs min-w-[600px]">
                    <thead className="sticky top-0 bg-card dark:bg-[hsl(220_13%_10%)] z-10">
                      <tr className="border-b border-border/10">
                        <th className="text-left px-4 py-3.5 text-muted-foreground/40 font-semibold w-10 text-[10px]">#</th>
                        <th className="text-left px-4 py-3.5 text-muted-foreground/40 font-semibold text-[10px] uppercase tracking-wider">Nome</th>
                        <th className="text-left px-4 py-3.5 text-muted-foreground/40 font-semibold text-[10px] uppercase tracking-wider">Número</th>
                        {varKeys.map(k => (
                          <th key={k} className="text-left px-4 py-3.5 text-muted-foreground/40 font-semibold text-[10px] uppercase tracking-wider">{k.replace("var", "Var ")}</th>
                        ))}
                        <th className="text-left px-4 py-3.5 text-muted-foreground/40 font-semibold w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedContacts.map((c, i) => {
                        const valid = isNumValid(c.numero);
                        return (
                        <tr key={c.id} className={cn(
                          "border-b border-border/5 transition-colors",
                          i % 2 === 0 ? "bg-transparent" : "bg-muted/4 dark:bg-muted/2",
                          "hover:bg-primary/3"
                        )}>
                          <td className="px-4 py-2.5 text-muted-foreground/25 tabular-nums text-[11px]">{contactPage * CONTACTS_PER_PAGE + i + 1}</td>
                          <td className="px-4 py-2.5">
                            <Input value={c.nome} onChange={(e) => updateContact(c.id, "nome", e.target.value)} className="h-8 text-xs bg-transparent border-none p-0 focus-visible:ring-0" placeholder="Nome" />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Input value={c.numero} onChange={(e) => updateContact(c.id, "numero", e.target.value)} className={cn("h-8 text-xs bg-transparent border-none p-0 font-mono focus-visible:ring-0", !valid && c.numero && "text-amber-400")} placeholder="Número" />
                              {!valid && c.numero && (
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Número inválido" />
                              )}
                            </div>
                          </td>
                          {varKeys.map(k => (
                            <td key={k} className="px-4 py-2.5">
                              <Input value={c[k]} onChange={(e) => updateContact(c.id, k, e.target.value)} className="h-8 text-xs bg-transparent border-none p-0 focus-visible:ring-0" placeholder={k.replace("var", "Var ")} />
                            </td>
                          ))}
                          <td className="px-4 py-2.5">
                            <button onClick={() => removeContact(c.id)} className="text-muted-foreground/15 hover:text-destructive transition-colors p-1 rounded-md hover:bg-destructive/10">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-border/8 bg-muted/3">
                    <span className="text-[11px] text-muted-foreground/40 tabular-nums">{contacts.length} contatos</span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" disabled={contactPage === 0} onClick={() => setContactPage(p => p - 1)} className="h-8 text-xs px-3">← Anterior</Button>
                      <span className="text-[11px] text-muted-foreground/40 px-3 tabular-nums">{contactPage + 1} / {totalPages}</span>
                      <Button variant="ghost" size="sm" disabled={contactPage >= totalPages - 1} onClick={() => setContactPage(p => p + 1)} className="h-8 text-xs px-3">Próximo →</Button>
                    </div>
                  </div>
                )}
              </SurfaceCard>
              );
            })()}

          </div>
        )}

        {/* ===== STEP 3: Configuration ===== */}
        {step === 3 && (
          <div className="space-y-8">
            {/* Send Control Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Delay */}
              <SurfaceCard className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                    <Clock className="w-4.5 h-4.5 text-teal-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Intervalo</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">Entre cada mensagem</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Mín (s)</label>
                      <Input type="number" value={minDelay || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setMinDelay(v); }} onBlur={() => { const v = Math.max(minDelay || 1, 1); setMinDelay(v); if (v > maxDelay) setMaxDelay(v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Máx (s)</label>
                      <Input type="number" value={maxDelay || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setMaxDelay(v); }} onBlur={() => { const v = Math.max(maxDelay || 1, 1); setMaxDelay(v < minDelay ? minDelay : v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 tabular-nums">{minDelay}s – {maxDelay}s a cada envio</p>
                </div>
              </SurfaceCard>

              {/* Pause every X */}
              <SurfaceCard className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Zap className="w-4.5 h-4.5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Pausa</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">A cada X mensagens</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Mín</label>
                      <Input type="number" value={pauseEveryMin || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setPauseEveryMin(v); }} onBlur={() => { const v = Math.max(pauseEveryMin || 1, 1); setPauseEveryMin(v); if (v > pauseEveryMax) setPauseEveryMax(v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Máx</label>
                      <Input type="number" value={pauseEveryMax || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setPauseEveryMax(v); }} onBlur={() => { const v = Math.max(pauseEveryMax || 1, 1); setPauseEveryMax(v < pauseEveryMin ? pauseEveryMin : v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 tabular-nums">A cada {pauseEveryMin}–{pauseEveryMax} msgs</p>
                </div>
              </SurfaceCard>

              {/* Pause duration */}
              <SurfaceCard className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Activity className="w-4.5 h-4.5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Duração</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">Tempo da pausa</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Mín (s)</label>
                      <Input type="number" value={pauseDurationMin || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setPauseDurationMin(v); }} onBlur={() => { const v = Math.max(pauseDurationMin || 1, 1); setPauseDurationMin(v); if (v > pauseDurationMax) setPauseDurationMax(v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50 font-medium">Máx (s)</label>
                      <Input type="number" value={pauseDurationMax || ""} onChange={(e) => { const v = e.target.value === "" ? 0 : parseInt(e.target.value); if (!isNaN(v)) setPauseDurationMax(v); }} onBlur={() => { const v = Math.max(pauseDurationMax || 1, 1); setPauseDurationMax(v < pauseDurationMin ? pauseDurationMin : v); }} className="h-9 text-xs bg-muted/15 dark:bg-muted/8 border-border/15 tabular-nums" min={1} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 tabular-nums">{pauseDurationMin}s – {pauseDurationMax}s de pausa</p>
                </div>
              </SurfaceCard>
            </div>

            {/* Row: Perfis de Delay + Tempo Estimado + Instância */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Delay Profiles */}
              <SurfaceCard className="relative p-5 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] to-transparent pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Settings2 className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-foreground">Perfis</p>
                        <p className="text-[10px] text-muted-foreground/50">{delayProfiles.length}/3 salvos</p>
                      </div>
                    </div>
                    {delayProfiles.length < 3 ? (
                      <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1 border-primary/20 text-primary hover:bg-primary/5" onClick={() => setShowSaveProfile(!showSaveProfile)}>
                        <Plus className="w-3 h-3" /> Salvar
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] h-5 bg-primary/10 text-primary border-primary/20">Cheio</Badge>
                    )}
                  </div>

                  {showSaveProfile && (
                    <div className="flex gap-2 mb-3">
                      <Input value={saveProfileName} onChange={(e) => setSaveProfileName(e.target.value)} placeholder="Nome do perfil..." className="h-8 text-xs flex-1 bg-muted/15 dark:bg-muted/8 border-border/15"
                        onKeyDown={(e) => { if (e.key === "Enter" && saveProfileName.trim()) saveDelayProfile.mutate(saveProfileName.trim()); }} />
                      <Button size="sm" className="h-8 text-xs px-3" disabled={!saveProfileName.trim() || saveDelayProfile.isPending} onClick={() => saveDelayProfile.mutate(saveProfileName.trim())}>
                        {saveDelayProfile.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </Button>
                    </div>
                  )}

                  {delayProfiles.length > 0 ? (
                    <div className="space-y-2">
                      {delayProfiles.map((p: any) => (
                        <div key={p.id} className="group flex items-center gap-2 px-3 py-2.5 rounded-lg bg-card border border-border/20 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
                          onClick={() => loadDelayProfile(p)}>
                          <div className="w-2 h-2 rounded-full bg-primary/40" />
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold text-foreground truncate block">{p.name}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">{p.min_delay_seconds}–{p.max_delay_seconds}s</span>
                          <button className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => { e.stopPropagation(); deleteDelayProfile.mutate(p.id); }}>
                            <X className="w-3 h-3 text-muted-foreground/40 hover:text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 flex flex-col items-center gap-2 opacity-60">
                      <Settings2 className="w-5 h-5 text-muted-foreground/30" />
                      <p className="text-[11px] text-muted-foreground/40">Nenhum perfil salvo</p>
                    </div>
                  )}
                </div>
              </SurfaceCard>

              {/* Projeção de Envio */}
              <SurfaceCard className="relative p-5 flex flex-col items-center justify-center text-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.06] to-transparent pointer-events-none" />
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
                    <Timer className="w-5 h-5 text-accent-foreground/70" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold mb-1.5">Tempo estimado</p>
                    <p className="text-3xl font-black text-foreground tabular-nums tracking-tight">
                      {estimatedTime ? `≈ ${estimatedTime}` : "—"}
                    </p>
                  </div>
                  {validContacts.length > 0 && (
                    <p className="text-[10px] text-muted-foreground/40">{validContacts.length} contato{validContacts.length !== 1 ? "s" : ""} • {selectedDevices.length || 1} instância{(selectedDevices.length || 1) !== 1 ? "s" : ""}</p>
                  )}
                </div>
              </SurfaceCard>

              {/* Instance Selection */}
              <SurfaceCard className="relative p-5 space-y-3 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] to-transparent pointer-events-none" />
                <div className="relative z-10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-foreground">Instâncias</p>
                        <p className="text-[10px] text-muted-foreground/50">{devices.length} disponível{devices.length !== 1 ? "is" : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {devices.length > 0 && (
                        <button
                          onClick={() => setSelectedDevices(prev => prev.length === devices.length ? [] : devices.map(d => d.id))}
                          className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                          {selectedDevices.length === devices.length ? "Desmarcar todas" : "Selecionar todas"}
                        </button>
                      )}
                      {selectedDevices.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          {selectedDevices.length} ✓
                        </Badge>
                      )}
                    </div>
                  </div>

                  {devices.length === 0 ? (
                    <div className="py-6 flex flex-col items-center gap-2">
                      <WifiOff className="w-6 h-6 text-muted-foreground/20" />
                      <p className="text-[11px] text-muted-foreground/40">Nenhuma instância</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {devices.map(d => {
                        const st = getDeviceStatus(d.status);
                        const isSelected = selectedDevices.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            onClick={() => setSelectedDevices(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 text-left w-full",
                              isSelected
                                ? "border-primary/30 bg-primary/5 shadow-sm shadow-primary/10"
                                : "border-border/20 hover:border-primary/20 bg-card hover:shadow-sm"
                            )}
                          >
                            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", isSelected ? "bg-primary/15" : "bg-muted/20")}>
                              {d.profile_picture ? (
                                <img src={d.profile_picture} alt="" className="w-9 h-9 rounded-lg object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              ) : (
                                <Smartphone className={cn("w-4 h-4", isSelected ? "text-emerald-400" : "text-muted-foreground/40")} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-xs font-semibold truncate", isSelected ? "text-foreground" : "text-foreground/70")}>{d.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <st.icon className={cn("w-3 h-3", st.color)} />
                                <span className={cn("text-[10px] font-medium", st.color)}>{st.label}</span>
                              </div>
                            </div>
                            <div className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0",
                              isSelected ? "border-emerald-400 bg-emerald-400" : "border-border/30"
                            )}>
                              {isSelected && <Check className="w-3 h-3 text-emerald-950" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </SurfaceCard>
            </div>

            {/* Safety: Pause on disconnect */}
            <SurfaceCard className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Pausar se desconectar</p>
                    <p className="text-[10px] text-muted-foreground/50">Pausa a campanha se uma instância for desconectada</p>
                  </div>
                </div>
                <Switch checked={pauseOnDisconnect} onCheckedChange={setPauseOnDisconnect} />
              </div>
              {!pauseOnDisconnect && (
                <p className="text-[10px] text-amber-400/70 mt-2 ml-11">⚠ O envio continuará mesmo se contas forem banidas ou desconectadas</p>
              )}
            </SurfaceCard>

          </div>
        )}

        {/* ===== STEP 4: Review & Launch ===== */}
        {step === 4 && (
          <div className="space-y-8">
            {/* Campaign name */}
            <SurfaceCard className="p-6 space-y-3">
              <SectionLabel>Nome da Campanha</SectionLabel>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Ex: Black Friday 2025" 
                className="h-13 text-base font-semibold bg-muted/15 dark:bg-muted/8 border-border/15 focus-visible:ring-primary/30 px-4" />
            </SurfaceCard>

            {/* Review panel */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Technical summary */}
              <SurfaceCard className="lg:col-span-3 p-6 space-y-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none" />
                <div className="relative z-10 space-y-5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Eye className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">Resumo Técnico</h3>
                  </div>

                  {/* Top stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Contatos", value: String(validContacts.length), icon: Users, accent: "text-primary" },
                      { label: "Instâncias", value: String(selectedDevicesData.length || 0), icon: Smartphone, accent: "text-emerald-400" },
                      { label: "Tempo", value: estimatedTime || "—", icon: Timer, accent: "text-amber-400" },
                    ].map(item => (
                      <div key={item.label} className="text-center p-4 rounded-xl bg-card border border-border/15">
                        <item.icon className={cn("w-4 h-4 mx-auto mb-2", item.accent)} />
                        <p className="text-lg font-black text-foreground tabular-nums">{item.value}</p>
                        <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/40 font-semibold mt-1">{item.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Delay config row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Intervalo", value: `${minDelay}–${maxDelay}s`, icon: Clock },
                      { label: "Pausa a cada", value: `${pauseEveryMin}–${pauseEveryMax} msgs`, icon: Zap },
                      { label: "Duração pausa", value: `${pauseDurationMin}–${pauseDurationMax}s`, icon: Activity },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/8 border border-border/10">
                        <item.icon className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/35 font-semibold">{item.label}</p>
                          <p className="text-[12px] font-bold text-foreground tabular-nums">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Devices list */}
                  {selectedDevicesData.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-muted-foreground/40 font-medium">Chips:</span>
                      {selectedDevicesData.map(d => (
                        <div key={d.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/8 border border-emerald-500/15">
                          {d.profile_picture ? (
                            <img src={d.profile_picture} alt="" className="w-4 h-4 rounded-full object-cover" />
                          ) : (
                            <Smartphone className="w-3 h-3 text-emerald-400" />
                          )}
                          <span className="text-[10px] font-semibold text-foreground">{d.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Warnings */}
                  {(!campaignName || selectedDevices.length === 0 || validContacts.length === 0 || !message) && (
                    <div className="flex items-center gap-3 text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-xl px-4 py-3">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="text-[12px]">
                        {!campaignName && "Nome ausente. "}
                        {selectedDevices.length === 0 && "Sem instância. "}
                        {validContacts.length === 0 && "Sem contatos. "}
                        {!combinedMessage && "Mensagem vazia."}
                      </span>
                    </div>
                  )}
                </div>
              </SurfaceCard>

              {/* Message preview */}
              <div className="lg:col-span-2 space-y-3">
                <WhatsAppPreview />
              </div>
            </div>

            {/* Schedule + Launch row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Schedule */}
              <SurfaceCard className="relative p-6 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.03] to-transparent pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                        <Calendar className="w-4.5 h-4.5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-foreground">Agendar envio</p>
                        <p className="text-[11px] text-muted-foreground/50">Programar para data e hora específica</p>
                      </div>
                    </div>
                    <Switch checked={scheduleEnabled} onCheckedChange={(checked) => {
                      setScheduleEnabled(checked);
                      if (checked) {
                        const now = new Date();
                        now.setMinutes(now.getMinutes() + 30);
                        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                        setScheduleDate(local);
                      }
                    }} />
                  </div>
                  {scheduleEnabled && (
                    <div className="mt-5 p-4 rounded-xl bg-card border border-amber-500/15 space-y-3">
                      <label className="text-[10px] uppercase tracking-wider text-amber-400/70 font-semibold">Data e hora de início</label>
                      <Input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} 
                        className="h-11 text-sm bg-muted/10 dark:bg-muted/5 border-amber-500/15 focus-visible:ring-amber-500/30" />
                      {scheduleDate && (
                        <p className="text-[11px] text-amber-400/60 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          Disparo em {new Date(scheduleDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  )}
                  {!scheduleEnabled && (
                    <p className="text-[11px] text-muted-foreground/30 mt-3 pl-[52px]">Envio imediato ao iniciar</p>
                  )}
                </div>
              </SurfaceCard>

              {/* Security + info */}
              <SurfaceCard className="relative p-6 flex flex-col justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
                <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-foreground">Pronto para enviar</p>
                      <p className="text-[11px] text-muted-foreground/50">Revise e inicie sua campanha</p>
                    </div>
                  </div>
                  <div className="space-y-2 pl-[52px]">
                    {[
                      { ok: !!campaignName, text: "Nome definido" },
                      { ok: selectedDevices.length > 0, text: "Instância selecionada" },
                      { ok: validContacts.length > 0, text: `${validContacts.length} contatos prontos` },
                      { ok: !!combinedMessage, text: "Mensagem configurada" },
                    ].map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {c.ok ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-destructive/50" />
                        )}
                        <span className={cn("text-[11px] font-medium", c.ok ? "text-foreground/70" : "text-muted-foreground/40")}>{c.text}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground/30 pl-[52px]">O envio pode ser cancelado a qualquer momento.</p>
                </div>
              </SurfaceCard>
            </div>

          </div>
        )}
      </div>

      {/* ═══ Bottom Navigation ═══ */}
      <div className="mt-6 sm:mt-8 mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-0">
          <Button 
            variant="outline" 
            size="sm" 
            className="text-xs gap-1.5 h-9 w-full sm:w-[170px] justify-center border-border/40 text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:border-destructive/30 transition-colors duration-100 order-3 sm:order-1"
            onClick={step === 1 ? clearStep1 : step === 2 ? clearStep2 : step === 3 ? clearStep3 : clearAllForm}
          >
            <Eraser className="w-3.5 h-3.5" /> {step === 1 ? "Limpar mensagem" : step === 2 ? "Limpar contatos" : step === 3 ? "Limpar parâmetros" : "Limpar tudo"}
          </Button>
          <div className="flex items-center gap-2 sm:gap-3 order-1 sm:order-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} className="gap-1.5 sm:gap-2.5 h-10 sm:h-11 flex-1 sm:flex-none sm:px-10 text-xs sm:text-sm font-bold tracking-wide">
                ← VOLTAR
              </Button>
            )}
            {step < 4 ? (
              <Button onClick={() => { const next = step + 1; if (next === 2 && contacts.length === 0) { setContacts([{ id: Date.now(), nome: "", numero: "", var1: "", var2: "", var3: "", var4: "", var5: "", var6: "", var7: "", var8: "", var9: "", var10: "" }]); setShowContactTable(true); } setStep(next); }} className="gap-1.5 sm:gap-3 h-10 sm:h-11 flex-1 sm:flex-none sm:px-14 text-xs sm:text-[15px] font-bold tracking-wide shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:brightness-110 transition-all duration-150">
                CONTINUAR <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            ) : (
              <Button 
                onClick={handleSendCampaign} 
                disabled={createCampaign.isPending || !campaignName || selectedDevices.length === 0 || validContacts.length === 0 || !message}
                className="gap-1.5 sm:gap-2.5 h-10 sm:h-11 flex-1 sm:flex-none sm:px-10 text-xs sm:text-sm font-bold tracking-wide shadow-lg shadow-primary/25 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {createCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {scheduleEnabled ? "AGENDAR" : "ENVIAR AGORA"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Import Progress Overlay */}
      {importProgress !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90">
          <div className="flex flex-col items-center gap-6 animate-scale-in">
            {/* Spinner */}
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-border/15" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" style={{ animationDuration: "1s" }} />
              <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-primary/40 animate-spin" style={{ animationDuration: "1.5s", animationDirection: "reverse" }} />
            </div>
            <div className="text-center space-y-2">
              <p className="text-base font-bold text-foreground">Importando contatos...</p>
              <p className="text-sm text-muted-foreground/60 tabular-nums">{importProgress}%</p>
            </div>
            <div className="w-64">
              <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                <div 
                  className="h-full rounded-full bg-primary transition-all duration-200 ease-out"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Column Mapping Dialog */}
      <Dialog open={!!rawImport} onOpenChange={(open) => !open && setRawImport(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="px-8 pt-8 pb-5 border-b border-border/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-primary" />
                </div>
                Mapeamento de Colunas
              </DialogTitle>
              <p className="text-sm text-muted-foreground/60 mt-2.5 leading-relaxed">Selecione o que cada coluna representa. Apenas 1 coluna pode ser "Nome" e 1 "Número".</p>
            </DialogHeader>
          </div>

          {rawImport && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Column mappings */}
              <div className="px-8 py-5 space-y-4 max-h-[280px] overflow-auto">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground/40 font-semibold">Colunas detectadas</p>
                {rawImport.headers.map((header, i) => {
                  const currentMapping = rawImport.columnMappings[i];
                  const mappingColors: Record<string, string> = {
                    nome: "ring-emerald-500/30 bg-emerald-500/5",
                    numero: "ring-primary/30 bg-primary/5",
                    ignorar: "",
                  };
                  const ringClass = mappingColors[currentMapping] || "ring-amber-500/20 bg-amber-500/5";
                  return (
                    <div key={i} className={cn(
                      "flex items-center gap-5 p-4.5 rounded-xl border border-border/10 transition-all duration-150",
                      currentMapping !== "ignorar" ? `ring-1 ${ringClass}` : "bg-muted/5 dark:bg-muted/3"
                    )}>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-foreground truncate">{header}</p>
                        <p className="text-xs text-muted-foreground/40 mt-1 font-mono truncate">
                          Ex: {String(rawImport.rows[0]?.[i] ?? "—").slice(0, 40)}
                        </p>
                      </div>
                      <ArrowRight className="w-4.5 h-4.5 text-muted-foreground/20 shrink-0" />
                      <Select value={currentMapping} onValueChange={(v) => updateColumnMapping(i, v as ColumnMapping)}>
                        <SelectTrigger className={cn(
                          "w-[170px] h-10 text-sm font-medium border-border/20",
                          currentMapping === "nome" && "text-emerald-400 border-emerald-500/30",
                          currentMapping === "numero" && "text-primary border-primary/30",
                        )}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            { value: "ignorar", label: "Ignorar" },
                            { value: "nome", label: "Nome" },
                            { value: "numero", label: "Número" },
                            { value: "var1", label: "Variável 1" },
                            { value: "var2", label: "Variável 2" },
                            { value: "var3", label: "Variável 3" },
                            { value: "var4", label: "Variável 4" },
                            { value: "var5", label: "Variável 5" },
                            { value: "var6", label: "Variável 6" },
                            { value: "var7", label: "Variável 7" },
                            { value: "var8", label: "Variável 8" },
                            { value: "var9", label: "Variável 9" },
                            { value: "var10", label: "Variável 10" },
                          ].map(opt => {
                            const takenByOther = opt.value !== "ignorar" && rawImport.columnMappings.some((m, idx) => idx !== i && m === opt.value);
                            return (
                              <SelectItem key={opt.value} value={opt.value} disabled={takenByOther} className={takenByOther ? "opacity-30" : ""}>
                                {opt.label}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

              {/* Stats bar */}
              <div className="px-8 py-4 border-t border-b border-border/8 bg-muted/5 dark:bg-muted/3">
                <div className="flex items-center justify-around">
                  {[
                    { label: "Linhas", value: rawImport.rows.length, color: "text-foreground" },
                    { label: "Colunas", value: rawImport.headers.length, color: "text-foreground" },
                    { label: "Mapeadas", value: rawImport.columnMappings.filter(m => m !== "ignorar").length, color: rawImport.columnMappings.filter(m => m !== "ignorar").length > 0 ? "text-primary" : "text-muted-foreground/40" },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className={cn("text-2xl font-bold tabular-nums", s.color)}>{s.value}</p>
                      <p className="text-xs text-muted-foreground/40 font-medium mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data preview */}
              <div className="flex-1 overflow-auto px-8 py-5">
                {(() => {
                  const mappedCols = rawImport.columnMappings
                    .map((m, i) => ({ mapping: m, index: i, header: rawImport.headers[i] }))
                    .filter(c => c.mapping !== "ignorar");
                  const labelMap: Record<string, string> = {
                    nome: "Nome", numero: "Número",
                    var1: "Var 1", var2: "Var 2", var3: "Var 3", var4: "Var 4", var5: "Var 5",
                    var6: "Var 6", var7: "Var 7", var8: "Var 8", var9: "Var 9", var10: "Var 10",
                  };
                  const colorMap: Record<string, string> = {
                    nome: "text-emerald-400", numero: "text-primary",
                  };
                  return mappedCols.length > 0 ? (
                    <div className="rounded-xl border border-border/10 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-card dark:bg-[hsl(220_13%_10%)] z-10">
                          <tr className="border-b border-border/10">
                            <th className="text-left px-4 py-3 text-muted-foreground/40 font-semibold w-10">#</th>
                            {mappedCols.map(col => (
                              <th key={col.index} className="text-left px-4 py-3">
                                <span className={cn("text-sm font-bold", colorMap[col.mapping] || "text-muted-foreground")}>
                                  {labelMap[col.mapping] || col.mapping}
                                </span>
                                <span className="block text-[10px] text-muted-foreground/30 font-normal mt-0.5">{col.header}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rawImport.rows.slice(0, 5).map((row, ri) => (
                            <tr key={ri} className="border-b border-border/5 hover:bg-muted/5">
                              <td className="px-4 py-3 text-muted-foreground/25 tabular-nums">{ri + 1}</td>
                              {mappedCols.map(col => (
                                <td key={col.index} className={cn(
                                  "px-4 py-3 text-foreground/80",
                                  col.mapping === "numero" && "font-mono"
                                )}>
                                  {String(row[col.index] ?? "—").slice(0, 30)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {rawImport.rows.length > 5 && (
                        <p className="text-xs text-muted-foreground/30 text-center py-3">
                          ...e mais {rawImport.rows.length - 5} linhas
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-12 gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-muted/10 flex items-center justify-center">
                        <Eye className="w-6 h-6 text-muted-foreground/20" />
                      </div>
                      <p className="text-sm text-muted-foreground/40">Mapeie ao menos uma coluna para ver o preview</p>
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="px-8 py-5 border-t border-border/10 space-y-3">
                {!rawImport.columnMappings.includes("numero") && (
                  <div className="flex items-center gap-2.5 text-sm text-amber-400 bg-amber-500/8 border border-amber-500/15 rounded-xl px-5 py-3.5">
                    <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                    <span>Selecione qual coluna contém o <strong>número de telefone</strong> para continuar.</span>
                  </div>
                )}
                <DialogFooter className="gap-3">
                  <Button variant="outline" onClick={() => setRawImport(null)} className="h-12 px-8 text-sm font-semibold">Cancelar</Button>
                  <Button 
                    onClick={confirmMappingImport} 
                    className="h-12 px-10 text-sm font-bold gap-2.5 shadow-lg shadow-primary/20"
                    disabled={!rawImport.columnMappings.includes("numero")}
                  >
                    <Check className="w-4.5 h-4.5" /> Confirmar Importação
                  </Button>
                </DialogFooter>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Import Review Dialog */}
      <Dialog open={!!importReview} onOpenChange={(open) => !open && setImportReview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Revisão da Importação</DialogTitle>
          </DialogHeader>
          {importReview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/30 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground tabular-nums">{importReview.all.length}</p>
                  <p className="text-xs text-muted-foreground">Total na planilha</p>
                </div>
                <div className="rounded-lg border border-border/30 p-3 text-center">
                  <p className="text-2xl font-bold text-primary tabular-nums">{importReview.clean.length}</p>
                  <p className="text-xs text-muted-foreground">Sem problemas</p>
                </div>
              </div>

              {importReview.invalid.length > 0 && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {importReview.invalid.length} número(s) inválido(s) (&lt;8 dígitos)
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {importReview.invalid.slice(0, 5).map(c => c.numero || "(vazio)").join(", ")}
                    {importReview.invalid.length > 5 && ` +${importReview.invalid.length - 5} mais`}
                  </p>
                </div>
              )}

              {importReview.batchDuplicates.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-xs font-semibold text-amber-400 flex items-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3" /> {importReview.batchDuplicates.length} duplicado(s) na planilha
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {importReview.batchDuplicates.slice(0, 5).map(c => c.numero).join(", ")}
                    {importReview.batchDuplicates.length > 5 && ` +${importReview.batchDuplicates.length - 5} mais`}
                  </p>
                </div>
              )}

              {importReview.existingDuplicates.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-xs font-semibold text-amber-400 flex items-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3" /> {importReview.existingDuplicates.length} já existe(m) na lista
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {importReview.existingDuplicates.slice(0, 5).map(c => c.numero).join(", ")}
                    {importReview.existingDuplicates.length > 5 && ` +${importReview.existingDuplicates.length - 5} mais`}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={() => finishImport(importReview.clean)} className="w-full gap-2">
                  <Check className="w-4 h-4" /> Importar apenas os {importReview.clean.length} limpos
                </Button>
                <Button variant="outline" onClick={() => finishImport(importReview.all)} className="w-full gap-2">
                  Importar todos ({importReview.all.length}) mesmo assim
                </Button>
                <Button variant="ghost" onClick={() => setImportReview(null)} className="w-full text-muted-foreground">
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Campaigns;
