import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Radio, RefreshCw, Flame, Megaphone, Plug, Loader2, Eye, Smartphone, Users, X, Ban, QrCode, CheckCircle2, Key, Lock, XCircle, Zap, LogOut, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlanGate } from "@/hooks/usePlanGate";
import { PlanGateDialog } from "@/components/PlanGateDialog";


interface WhatsAppGroup {
  id: string;
  name: string;
  participants?: number;
}

export default function ReportWhatsApp() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isBlocked, planState, canUseReports } = usePlanGate();
  const [planGateOpen, setPlanGateOpen] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [groupLinkUnified, setGroupLinkUnified] = useState("");
  const [joiningUnified, setJoiningUnified] = useState(false);

  // Connection dialog state
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(30);
  const [qrConnected, setQrConnected] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [connectStep, setConnectStep] = useState<"choose" | "qr" | "code" | "done">("choose");
  const [connectMethod, setConnectMethod] = useState<"qr" | "code">("qr");
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const qrCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canUseReport = canUseReports;

  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ["report-wa-config", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_wa_configs")
        .select("id, device_id, toggle_campaigns, toggle_warmup, toggle_instances, alert_disconnect, alert_campaign_end, alert_high_failures, group_id, group_name, frequency, connected_phone, connection_status, warmup_group_id, warmup_group_name, campaigns_group_id, campaigns_group_name, connection_group_id, connection_group_name, created_at, updated_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: reportDevice } = useQuery({
    queryKey: ["report-device", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status, login_type")
        .eq("user_id", user!.id)
        .eq("login_type", "report_wa")
        .maybeSingle();
      return data;
    },
    enabled: !!user && canUseReport,
  });

  const isConnected = reportDevice?.status === "Ready";

  // ─── Connection API helper ───
  const callApi = async (body: Record<string, any>) => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) throw new Error("Não autenticado");
    const response = await supabase.functions.invoke("evolution-connect", {
      body,
      headers: { Authorization: `Bearer ${s.access_token}` },
    });
    if (response.error) {
      let backendMsg = "";
      if (response.data?.error) backendMsg = response.data.error;
      if (!backendMsg) {
        try {
          const ctx = (response.error as any)?.context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === 'string' ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.error) backendMsg = parsed.error;
          }
        } catch {}
      }
      throw new Error(backendMsg || response.error.message || "Erro na operação");
    }
    if (response.data?.error) throw new Error(response.data.error);
    return response.data;
  };

  // Ensure a report_wa device exists, creating one if needed
  const ensureReportDevice = async (): Promise<string | null> => {
    if (reportDevice?.id) return reportDevice.id;
    
    // Fetch monitor token from profile to pre-fill the device
    const { data: profile } = await supabase
      .from("profiles")
      .select("whatsapp_monitor_token")
      .eq("id", user!.id)
      .maybeSingle();
    
    const hasMonitorToken = !!profile?.whatsapp_monitor_token;
    
    const { data, error } = await supabase
      .from("devices")
      .insert({
        user_id: user!.id,
        name: "Relatorio Via Whatsapp",
        login_type: "report_wa",
        status: "Disconnected",
        instance_type: "report",
        ...(hasMonitorToken ? { uazapi_token: profile.whatsapp_monitor_token } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error("Erro ao criar instância de relatório: " + error.message);
    // Invalidate to pick up the new device
    await queryClient.invalidateQueries({ queryKey: ["report-device"] });
    return data.id;
  };

  const handleConnectQR = async () => {
    setConnectStep("qr");
    setQrLoading(true);
    setQrCodeBase64("");
    setConnectError("");
    try {
      const deviceId = await ensureReportDevice();
      if (!deviceId) return;
      const result = await callApi({ action: "connect", deviceId, method: "qr" });
      if (result?.alreadyConnected) {
        setQrConnected(true);
        setConnectStep("done");
        queryClient.invalidateQueries({ queryKey: ["report-device"] });
        toast.success("Já conectado!");
        return;
      }
      const b64 = result?.base64 || result?.qr;
      if (b64) {
        setQrCodeBase64(b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`);
      }
    } catch (err: any) {
      const msg = err?.message || "Erro ao gerar QR Code";
      setConnectError(msg);
      toast.error(msg);
    } finally {
      setQrLoading(false);
    }
  };

  const openConnectDialog = () => {
    if (!canUseReport) { setPlanGateOpen(true); return; }
    setQrDialogOpen(true);
    setQrCodeBase64("");
    setQrConnected(false);
    setConnectError("");
    setConnectMethod("qr");
    setConnectStep("choose");
    setPairingCode("");
    setPairingPhone("");
  };

  const handleRequestPairingCode = async () => {
    if (!pairingPhone) return;
    setPairingLoading(true);
    setConnectError("");
    setPairingCode("");
    try {
      const deviceId = await ensureReportDevice();
      if (!deviceId) return;
      const result = await callApi({
        action: "requestPairingCode",
        deviceId,
        phoneNumber: pairingPhone,
      });
      if (result?.alreadyConnected) {
        setQrConnected(true);
        setConnectStep("done");
        queryClient.invalidateQueries({ queryKey: ["report-device"] });
        toast.success("Já conectado!");
        return;
      }
      if (result?.pairingCode) {
        setPairingCode(result.pairingCode);
      } else {
        setConnectError("Código não retornado. Verifique o número e tente novamente.");
      }
    } catch (err: any) {
      const msg = err?.message || "Erro ao solicitar código";
      setConnectError(msg);
      toast.error(msg);
    } finally {
      setPairingLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!reportDevice?.id || disconnecting) return;
    setDisconnecting(true);
    // Optimistic: update cache immediately
    queryClient.setQueryData(["report-device", user?.id], (old: any) => old ? { ...old, status: "Disconnected", number: null } : old);
    try {
      await callApi({ action: "logout", deviceId: reportDevice.id });
      queryClient.invalidateQueries({ queryKey: ["report-device"] });
      setGroups([]);
      toast.success("Instância desconectada");
    } catch (err: any) {
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: ["report-device"] });
      toast.error(err?.message || "Erro ao desconectar");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDeleteInstance = async () => {
    if (!reportDevice?.id || deleting) return;
    setDeleting(true);
    const deviceId = reportDevice.id;
    const configId = config?.id;
    // Optimistic: clear UI immediately
    queryClient.setQueryData(["report-device", user?.id], null);
    queryClient.setQueryData(["report-wa-config", user?.id], null);
    setGroups([]);
    toast.success("Instância de relatório excluída");
    try {
      // Delete config and device first, then logout in background
      // (no need to await logout — device is already being deleted)
      // Delete config and device in parallel
      await Promise.all([
        configId ? supabase.from("report_wa_configs").delete().eq("id", configId) : Promise.resolve(),
        supabase.from("devices").delete().eq("id", deviceId),
      ]);
      queryClient.invalidateQueries({ queryKey: ["report-device"] });
      queryClient.invalidateQueries({ queryKey: ["report-wa-config"] });
    } catch (err: any) {
      queryClient.invalidateQueries({ queryKey: ["report-device"] });
      queryClient.invalidateQueries({ queryKey: ["report-wa-config"] });
      toast.error(err?.message || "Erro ao excluir instância");
    } finally {
      setDeleting(false);
    }
  };

  // QR auto-refresh every 30s
  useEffect(() => {
    if (connectStep === "qr" && qrCodeBase64) {
      setQrCountdown(30);
      if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
      qrCountdownRef.current = setInterval(() => {
        setQrCountdown(prev => {
          if (prev <= 1) {
            setQrCodeBase64("");
            if (reportDevice?.id) {
              callApi({ action: "refreshQr", deviceId: reportDevice.id }).then(result => {
                if (result?.alreadyConnected) {
                  setQrConnected(true);
                  setConnectStep("done");
                  queryClient.invalidateQueries({ queryKey: ["report-device"] });
                  return;
                }
                const b64 = result?.base64 || result?.qr;
                if (b64) setQrCodeBase64(b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`);
              }).catch(() => {});
            }
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (qrCountdownRef.current) { clearInterval(qrCountdownRef.current); qrCountdownRef.current = null; }
    }
    return () => { if (qrCountdownRef.current) { clearInterval(qrCountdownRef.current); qrCountdownRef.current = null; } };
  }, [connectStep, qrCodeBase64, reportDevice?.id]);

  // Detect connection via Realtime (devices table changes) — much faster than polling
  useEffect(() => {
    if (!qrDialogOpen || !reportDevice?.id || qrConnected) return;
    const channel = supabase
      .channel(`report-device-${reportDevice.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'devices', filter: `id=eq.${reportDevice.id}` },
        (payload: any) => {
          const newStatus = payload.new?.status;
          if (newStatus === 'Ready' || newStatus === 'Connected' || newStatus === 'authenticated') {
            setQrConnected(true);
            setConnectStep("done");
            queryClient.invalidateQueries({ queryKey: ["report-device"] });
            toast.success("Instância conectada com sucesso!");
            setTimeout(() => setQrDialogOpen(false), 1500);
          }
        }
      )
      .subscribe();

    // Fallback: also poll every 4s in case Realtime misses it
    pollRef.current = setInterval(async () => {
      try {
        const result = await callApi({ action: "status", deviceId: reportDevice.id });
        if (result?.status === "authenticated" || result?.status === "connected") {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setQrConnected(true);
          setConnectStep("done");
          queryClient.invalidateQueries({ queryKey: ["report-device"] });
          toast.success("Instância conectada com sucesso!");
          setTimeout(() => setQrDialogOpen(false), 1500);
        }
      } catch {}
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [qrDialogOpen, reportDevice?.id, qrConnected]);

  const fetchGroups = async (deviceId: string, forceRefresh = false) => {
    setLoadingGroups(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const refreshParam = forceRefresh ? "&refresh=true" : "";
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whapi-chats?action=list_chats&device_id=${deviceId}&count=200${refreshParam}`,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
      const json = await res.json();
      const chats = json.chats || [];
      const seenIds = new Set<string>();
      const groupChats: WhatsAppGroup[] = [];
      for (const c of chats) {
        const id = c.id || c.jid || c.chatId || "";
        const name = c.name || c.subject || c.title || c.id || "Grupo sem nome";
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          groupChats.push({ id, name, participants: c.participants?.length || c.participantsCount || c.size || undefined });
        }
      }
      setGroups(groupChats);
      if (forceRefresh) {
        toast.success(`${groupChats.length} grupo(s) encontrado(s)`);
      }
    } catch (err) {
      console.error("Error fetching groups:", err);
      if (forceRefresh) {
        toast.error("Erro ao buscar grupos. Tente novamente.");
      }
    } finally {
      setLoadingGroups(false);
    }
  };

  // Auto-fetch groups on mount + periodic refresh every 2 minutes
  useEffect(() => {
    if (reportDevice?.id && reportDevice?.status === "Ready") {
      fetchGroups(reportDevice.id);
      const interval = setInterval(() => {
        fetchGroups(reportDevice.id);
      }, 2 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [reportDevice?.id, reportDevice?.status]);

  // Sync device_id and connection_status into report_wa_configs
  useEffect(() => {
    if (!reportDevice?.id || !config?.id) return;
    const isReady = reportDevice.status === "Ready";
    const needsDeviceSync = config.device_id !== reportDevice.id;
    const currentStatus = isReady ? "connected" : "disconnected";
    const needsStatusSync = config.connection_status !== currentStatus;
    const needsPhoneSync = reportDevice.number && config.connected_phone !== reportDevice.number;

    if (needsDeviceSync || needsStatusSync || needsPhoneSync) {
      const updates: Record<string, any> = {};
      if (needsDeviceSync) updates.device_id = reportDevice.id;
      if (needsStatusSync) updates.connection_status = currentStatus;
      if (needsPhoneSync) updates.connected_phone = reportDevice.number;
      supabase.from("report_wa_configs").update(updates).eq("id", config.id).then(({ error }) => {
        if (!error) queryClient.invalidateQueries({ queryKey: ["report-wa-config"] });
      });
    }
  }, [reportDevice?.id, reportDevice?.status, reportDevice?.number, config?.id]);

  const upsertConfig = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      if (config?.id) {
        const { error } = await supabase.from("report_wa_configs").update(updates).eq("id", config.id);
        if (error) throw error;
      } else {
        // First insert: set all toggles to false, then apply the specific update
        const defaults = {
          toggle_campaigns: false,
          toggle_warmup: false,
          toggle_instances: false,
          alert_disconnect: false,
          alert_campaign_end: false,
          alert_high_failures: false,
        };
        const { error } = await supabase.from("report_wa_configs").insert({
          user_id: user!.id,
          device_id: reportDevice?.id || null,
          connection_status: reportDevice?.status === "Ready" ? "connected" : "disconnected",
          connected_phone: reportDevice?.number || null,
          frequency: "daily",
          ...defaults,
          ...updates,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-wa-config"] });
      toast.success("Configuração salva");
    },
    onError: () => toast.error("Erro ao salvar configuração"),
  });

  const handleToggle = (field: string, value: boolean) => upsertConfig.mutate({ [field]: value });

  const handleGroupSelect = (field: string, nameField: string, groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    upsertConfig.mutate({ [field]: groupId, [nameField]: group?.name || "" });
  };

  const handleUnifiedLinkJoin = async () => {
    const link = groupLinkUnified.trim();
    if (!link) return;
    if (link.includes("@g.us")) {
      upsertConfig.mutate({ group_id: link, group_name: link });
      setGroupLinkUnified("");
      return;
    }
    const cleaned = link.replace(/^https?:\/\//, "").replace(/^chat\.whatsapp\.com\//, "");
    const inviteCode = cleaned.split("?")[0].split("/")[0].trim();
    if (!inviteCode || inviteCode.length < 10) {
      toast.error("Link inválido. Cole um link do tipo: https://chat.whatsapp.com/...");
      return;
    }
    setJoiningUnified(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const deviceParam = reportDevice?.id ? `&device_id=${reportDevice.id}` : "";
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whapi-chats?action=resolve_invite&invite_code=${encodeURIComponent(inviteCode)}${deviceParam}`,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      const json = await res.json();
      if (json.jid) {
        upsertConfig.mutate({ group_id: json.jid, group_name: json.name || json.jid });
        setGroupLinkUnified("");
        toast.success(`Grupo encontrado: ${json.name || json.jid}`);
      } else {
        toast.error("Não foi possível resolver o link. Tente selecionar da lista.");
      }
    } catch (_err) {
      toast.error("Erro ao resolver link do grupo");
    } finally {
      setJoiningUnified(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan gate banner */}
      {!canUseReport && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-destructive/20 bg-destructive/5">
          <Ban className="w-4 h-4 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-medium text-foreground">Funcionalidade bloqueada</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isBlocked ? "Ative ou renove seu plano para usar notificações via WhatsApp." : "Solicite ao administrador a liberação desta funcionalidade."}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Radio className="w-4 h-4 text-primary" />
            </div>
            Relatório Via WhatsApp
          </h1>
          <p className="text-muted-foreground text-xs mt-1 ml-[42px]">
            Configure notificações automáticas para grupos do WhatsApp.
          </p>
        </div>
        {canUseReport && (
          <div className="flex items-center gap-2">
            {reportDevice?.id && !isConnected && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir instância de relatório?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso irá desconectar e remover permanentemente a instância "{reportDevice?.name}". As configurações de grupos e alertas também serão apagadas. Essa ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteInstance} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {isConnected && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? (
                  <span className="w-3.5 h-3.5 border-2 border-destructive/30 border-t-destructive rounded-full animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5" />
                )}
                {disconnecting ? "Desconectando..." : "Desconectar"}
              </Button>
            )}
            {isConnected ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 text-primary text-sm font-medium select-none">
                <Plug className="w-4 h-4" />
                Conectado: {reportDevice?.number || ""}
              </div>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="gap-2 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={openConnectDialog}
              >
                <Plug className="w-4 h-4" />
                Conexão
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Unified Group Selector */}
      {canUseReport && isConnected && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Grupo de Destino</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Todas as notificações serão enviadas para este grupo.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {(config?.group_id) ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-md border border-border/60 bg-background/50 px-3 h-9">
                  <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate flex-1">
                    {groups.find(g => g.id === config.group_id)?.name || config.group_name || `📌 ${config.group_id}`}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => upsertConfig.mutate({ group_id: null, group_name: null })}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={groupLinkUnified}
                    onChange={(e) => setGroupLinkUnified(e.target.value)}
                    placeholder="Cole o link do grupo: https://chat.whatsapp.com/..."
                    className="h-9 text-xs flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleUnifiedLinkJoin()}
                    disabled={joiningUnified}
                  />
                  <Button size="sm" className="h-9 px-3 text-xs" onClick={handleUnifiedLinkJoin} disabled={!groupLinkUnified.trim() || joiningUnified}>
                    {joiningUnified ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Buscar"}
                  </Button>
                </div>
                {groups.length > 0 && (
                  <div className="border border-border/40 rounded-lg overflow-hidden">
                    <div className="px-2 py-1.5 bg-muted/30 border-b border-border/40 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Grupos encontrados ({groups.length})</span>
                      <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-muted-foreground" onClick={() => reportDevice?.id && fetchGroups(reportDevice.id, true)} disabled={loadingGroups}>
                        <RefreshCw className={`w-2.5 h-2.5 mr-1 ${loadingGroups ? "animate-spin" : ""}`} />
                        Atualizar
                      </Button>
                    </div>
                    <div className="max-h-32 overflow-y-auto">
                      {groups.map(g => (
                        <button
                          key={g.id}
                          onClick={() => {
                            upsertConfig.mutate({ group_id: g.id, group_name: g.name });
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center justify-between gap-2 border-b border-border/20 last:border-0"
                        >
                          <span className="truncate">{g.name}</span>
                          {g.participants && <span className="text-[10px] text-muted-foreground shrink-0">{g.participants}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {groups.length === 0 && !loadingGroups && (
                  <p className="text-[10px] text-muted-foreground text-center py-1">Cole o link de um grupo acima para selecioná-lo</p>
                )}
                {loadingGroups && (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground ml-1.5">Buscando grupos...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3 Toggle Cards */}
      {canUseReport ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ToggleCard
            icon={<Flame className="w-4 h-4 text-orange-500" />}
            iconColor="orange"
            title="Aquecimento"
            description="Relatórios após cada ciclo de 24h."
            enabled={config?.toggle_warmup ?? false}
            onToggle={(v) => handleToggle("toggle_warmup", v)}
            monitoredEvents={["Ciclo de aquecimento concluído"]}
            previewMessage={`🔥 RELATÓRIO DE AQUECIMENTO (24H)\\n\\nInstância: ${reportDevice?.name || "{nome_instancia}"}\\nNúmero: ${reportDevice?.number || "{numero}"}\\n\\n📊 Atividades registradas\\n\\n📨 Mensagens enviadas: {msgs_enviadas}\\n\\n📩 Mensagens recebidas: {msgs_recebidos}\\n\\n👥 Interações em grupos: {grupos_interacoes}\\n\\n⏱ Última atividade registrada:\\n{ultima_atividade}\\n\\n🔎 Status atual da instância: ${isConnected ? "🟢 Online" : "🔴 Offline"}\\n\\nRelatório gerado automaticamente após o ciclo de aquecimento de 24h.`}
          />
          <ToggleCard
            icon={<Megaphone className="w-4 h-4 text-sky-500" />}
            iconColor="sky"
            title="Campanhas"
            description="Alertas de eventos de campanha."
            enabled={config?.toggle_campaigns ?? false}
            onToggle={(v) => handleToggle("toggle_campaigns", v)}
            monitoredEvents={["Campanha iniciada", "Campanha pausada", "Campanha finalizada", "Falhas detectadas"]}
            previewMessage={`📣 CAMPANHA FINALIZADA\\n\\nCampanha: {nome_campanha}\\n\\n📊 Resultado da campanha\\n\\n👥 Total de contatos: {total}\\n\\n✅ Mensagens enviadas: {enviadas}\\n📬 Mensagens entregues: {entregues}\\n\\n❌ Falhas registradas: {falhas}\\n⏳ Pendentes: {pendentes}\\n\\n⏱ Tempo total de execução:\\n{tempo_execucao}\\n\\nStatus da campanha: Concluída`}
          />
          <ToggleCard
            icon={<Plug className="w-4 h-4 text-emerald-500" />}
            iconColor="emerald"
            title="Conexão"
            description="Alertas de mudança de status."
            enabled={config?.alert_disconnect ?? false}
            onToggle={(v) => handleToggle("alert_disconnect", v)}
            monitoredEvents={["Instância conectada", "Instância desconectada"]}
            previewMessage={`⚠️ ALERTA DE CONEXÃO\\n\\nInstância: ${reportDevice?.name || "{nome_instancia}"}\\nNúmero: ${reportDevice?.number || "{numero}"}\\n\\n❌ Status: Desconectado\\n\\n⏱ Horário da ocorrência:\\n${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}\\n\\nA instância perdeu conexão com o WhatsApp.`}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Locked cards for Essencial/Start */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { icon: <Flame className="w-4 h-4 text-orange-500" />, title: "Aquecimento", description: "Relatórios após cada ciclo de 24h.", iconBg: "bg-orange-500/10" },
              { icon: <Megaphone className="w-4 h-4 text-sky-500" />, title: "Campanhas", description: "Alertas de eventos de campanha.", iconBg: "bg-sky-500/10" },
              { icon: <Plug className="w-4 h-4 text-emerald-500" />, title: "Conexão", description: "Alertas de mudança de status.", iconBg: "bg-emerald-500/10" },
            ].map((card) => (
              <div key={card.title} className="rounded-xl border-2 border-border bg-card opacity-60 pointer-events-none select-none">
                <div className="p-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0`}>
                        {card.icon}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                          {card.title}
                          <Lock className="w-3 h-3 text-muted-foreground" />
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{card.description}</p>
                      </div>
                    </div>
                    <Switch checked={false} disabled />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Card */}
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-6 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Libere notificações via WhatsApp</h3>
              <p className="text-sm text-muted-foreground mt-1">Receba alertas em tempo real diretamente no seu WhatsApp.</p>
            </div>
            <Button
              size="lg"
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => {
                startCheckout({ planName: "Relatórios WhatsApp", instances: "1", price: "18.90" });
              }}
            >
              <Zap className="w-4 h-4" />
              Desbloquear notificações
            </Button>
          </div>
        </div>
      )}

      {/* ─── Connect Dialog (QR Code + Pairing Code) ─── */}
      <Dialog open={qrDialogOpen} onOpenChange={(open) => {
        if (!open) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } setQrDialogOpen(false); }
      }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <div className="relative px-6 pt-6 pb-4 border-b border-border/20">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent pointer-events-none" />
            <div className="relative flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${connectStep === "done" ? "bg-emerald-500/15" : "bg-primary/10"}`}>
                {connectStep === "done" ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                ) : connectStep === "choose" ? (
                  <Plug className="w-6 h-6 text-primary" />
                ) : connectMethod === "qr" ? (
                  <QrCode className="w-6 h-6 text-primary" />
                ) : (
                  <Smartphone className="w-6 h-6 text-primary" />
                )}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  {connectStep === "done" ? "Conectado com sucesso!" : connectStep === "choose" ? "Como deseja conectar?" : connectMethod === "qr" ? "Escaneie o QR Code" : "Código de pareamento"}
                </DialogTitle>
                {reportDevice && connectStep !== "done" && connectStep !== "choose" && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {reportDevice.name}{reportDevice.number ? ` · ${reportDevice.number}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 pt-5 overflow-hidden">
            <AnimatePresence mode="wait">
              {/* ── Step: Choose method ── */}
              {connectStep === "choose" && (
                <motion.div key="choose" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
                  <p className="text-sm text-muted-foreground mb-5">Escolha o método de conexão para sua instância de relatório:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        setConnectMethod("qr");
                        setConnectStep("qr");
                        handleConnectQR();
                      }}
                      className="group relative flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 border-border/30 hover:border-primary/50 bg-card hover:bg-primary/[0.04] transition-all duration-200"
                    >
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <QrCode className="w-6 h-6 text-primary" />
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-bold text-foreground block">QR Code</span>
                        <span className="text-[11px] text-muted-foreground mt-0.5 block">Escaneie com o celular</span>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setConnectMethod("code");
                        setConnectStep("code");
                      }}
                      className="group relative flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 border-border/30 hover:border-primary/50 bg-card hover:bg-primary/[0.04] transition-all duration-200"
                    >
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Key className="w-6 h-6 text-primary" />
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-bold text-foreground block">Código</span>
                        <span className="text-[11px] text-muted-foreground mt-0.5 block">Digite um código numérico</span>
                      </div>
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Step: QR or Code ── */}
              {connectStep !== "done" && connectStep !== "choose" && (
                <motion.div key="connect-content" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                  {/* Back button */}
                  <button
                    onClick={() => { setConnectStep("choose"); setConnectError(""); }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
                  >
                    ← Voltar
                  </button>

                  {/* QR Code content */}
                  {connectMethod === "qr" && (
                    <motion.div key="qr-content" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }} className="flex flex-col items-center gap-5">
                      <div className="relative w-[272px] h-[272px]">
                        <div className={`absolute inset-0 w-64 h-64 m-auto rounded-2xl flex flex-col items-center justify-center border border-primary/20 bg-gradient-to-b from-primary/[0.03] to-transparent overflow-hidden transition-all duration-500 ease-out ${
                          !qrCodeBase64 && !connectError ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                        }`}>
                          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                            <QrCode className="w-8 h-8 text-primary" />
                          </div>
                          <p className="text-sm font-semibold text-foreground">Gerando QR Code...</p>
                          <p className="text-xs text-muted-foreground/50 mt-1">Aguarde alguns segundos</p>
                        </div>

                        <div className={`absolute inset-0 w-64 h-64 m-auto bg-destructive/5 rounded-2xl flex flex-col items-center justify-center border-2 border-destructive/20 p-6 transition-all duration-500 ease-out ${
                          connectError ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                        }`}>
                          <XCircle className="w-10 h-10 text-destructive mb-3" />
                          <p className="text-sm text-destructive text-center leading-relaxed">{connectError}</p>
                          <Button size="sm" variant="outline" className="mt-3 h-7 text-[10px] gap-1" onClick={handleConnectQR}>
                            <RefreshCw className="w-3 h-3" /> Tentar novamente
                          </Button>
                        </div>

                        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-out ${
                          qrCodeBase64 ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                        }`}>
                          <div className="relative p-4 rounded-2xl bg-white dark:bg-white shadow-lg">
                            <img src={qrCodeBase64} alt="QR Code" className="w-64 h-64 rounded-lg transition-opacity duration-300" />
                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-card border border-border/30 rounded-full px-3 py-1 shadow-sm">
                              <svg className="w-4 h-4 -rotate-90" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" fill="none" stroke="hsl(var(--muted))" strokeWidth="2" />
                                <circle cx="12" cy="12" r="10" fill="none" stroke="hsl(var(--primary))" strokeWidth="2"
                                  strokeDasharray={`${(qrCountdown / 30) * 62.83} 62.83`}
                                  strokeLinecap="round"
                                  className="transition-all duration-1000 ease-linear"
                                />
                              </svg>
                              <span className="text-[11px] text-muted-foreground font-medium tabular-nums">{qrCountdown}s</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="w-full bg-muted/30 rounded-xl p-4 space-y-2.5">
                        <p className="text-xs font-semibold text-foreground mb-2">Como conectar:</p>
                        <div className="flex items-start gap-3">
                          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                          <p className="text-xs text-muted-foreground">Abra o <span className="font-medium text-foreground">WhatsApp</span> no celular</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                          <p className="text-xs text-muted-foreground">Toque em <span className="font-medium text-foreground">Configurações → Aparelhos conectados</span></p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                          <p className="text-xs text-muted-foreground">Toque em <span className="font-medium text-foreground">Conectar um aparelho</span> e escaneie o código</p>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        className="gap-2 h-9 text-sm w-full"
                        onClick={async () => {
                          try {
                            const result = await callApi({ action: "status", deviceId: reportDevice!.id });
                            const state = result?.status;
                            if (state === "authenticated" || state === "connected") {
                              if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                              setQrConnected(true);
                              setConnectStep("done");
                              queryClient.invalidateQueries({ queryKey: ["report-device"] });
                              toast.success("Conectado!");
                            } else {
                              toast.info("QR Code ainda não foi escaneado.");
                            }
                          } catch {
                            toast.error("Erro ao verificar conexão");
                          }
                        }}
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Já escaneei, sincronizar
                      </Button>
                    </motion.div>
                  )}

                  {/* Pairing Code content */}
                  {connectMethod === "code" && (
                    <motion.div key="code-content" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }} className="flex flex-col items-center gap-5">
                      {!pairingCode ? (
                        <div className="w-full space-y-5">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                              <Smartphone className="w-6 h-6 text-primary" />
                            </div>
                            <div className="text-center space-y-1">
                              <p className="text-sm font-medium text-foreground">Conectar via código</p>
                              <p className="text-xs text-muted-foreground">Insira o número completo com código do país</p>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                                <span className="text-base">🇧🇷</span>
                              </div>
                              <Input
                                value={pairingPhone}
                                onChange={e => {
                                  const raw = e.target.value.replace(/\D/g, "").slice(0, 13);
                                  let f = raw;
                                  if (raw.length > 2) f = `+${raw.slice(0, 2)} ${raw.slice(2)}`;
                                  if (raw.length > 4) f = `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4)}`;
                                  if (raw.length > 9) f = `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4, 9)}-${raw.slice(9)}`;
                                  setPairingPhone(f);
                                }}
                                placeholder="+55 11 99999-9999"
                                className="h-14 pl-10 text-lg font-mono tracking-wider bg-muted/30 border-border/50 focus-visible:border-primary/60 focus-visible:ring-primary/20 transition-all"
                                autoFocus
                                onKeyDown={e => { if (e.key === "Enter" && pairingPhone.replace(/\D/g, "").length >= 12) handleRequestPairingCode(); }}
                              />
                              {pairingPhone.replace(/\D/g, "").length >= 12 && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                  <CheckCircle2 className="w-5 h-5 text-primary" />
                                </div>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground/60 text-center flex items-center justify-center gap-1">
                              <span>Ex:</span>
                              <span className="font-mono">+55 63 91234-5678</span>
                            </p>
                          </div>
                          {connectError && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                              <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                              <p className="text-[11px] text-destructive leading-relaxed">{connectError}</p>
                            </div>
                          )}
                          <Button
                            className="w-full h-11 text-sm font-semibold gap-2"
                            disabled={pairingLoading || pairingPhone.replace(/\D/g, "").length < 12}
                            onClick={handleRequestPairingCode}
                          >
                            {pairingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            Gerar código
                          </Button>
                        </div>
                      ) : (
                        <div className="w-full space-y-5">
                          <div className="flex flex-col items-center">
                            <div className="relative px-10 py-6 rounded-2xl bg-card border-2 border-primary/20 shadow-lg">
                              <p className="text-3xl font-mono font-bold tracking-[0.5em] text-foreground">{pairingCode}</p>
                              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg">
                                <Lock className="w-4 h-4 text-primary-foreground" />
                              </div>
                            </div>
                          </div>

                          <div className="w-full bg-muted/30 rounded-xl p-4 space-y-2.5">
                            <p className="text-xs font-semibold text-foreground mb-2">Como conectar:</p>
                            <div className="flex items-start gap-3">
                              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                              <p className="text-xs text-muted-foreground">Abra o <span className="font-medium text-foreground">WhatsApp</span> no celular</p>
                            </div>
                            <div className="flex items-start gap-3">
                              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                              <p className="text-xs text-muted-foreground">Vá em <span className="font-medium text-foreground">Aparelhos conectados → Conectar por número</span></p>
                            </div>
                            <div className="flex items-start gap-3">
                              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                              <p className="text-xs text-muted-foreground">Digite o código acima</p>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <Button variant="outline" className="flex-1 h-9 text-sm gap-1.5" onClick={() => { setPairingCode(""); setConnectError(""); }}>
                              <RefreshCw className="w-3.5 h-3.5" /> Novo código
                            </Button>
                            <Button variant="outline" className="flex-1 h-9 text-sm gap-1.5" onClick={async () => {
                              try {
                                const result = await callApi({ action: "status", deviceId: reportDevice!.id });
                                const state = result?.status;
                                if (state === "authenticated" || state === "connected") {
                                  if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                                  setQrConnected(true);
                                  setConnectStep("done");
                                  queryClient.invalidateQueries({ queryKey: ["report-device"] });
                                  toast.success("Conectado!");
                                } else {
                                  toast.info("Código ainda não foi digitado.");
                                }
                              } catch {
                                toast.error("Erro ao verificar conexão");
                              }
                            }}>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Já pareei
                            </Button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* Done */}
              {connectStep === "done" && (
                <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: "easeOut" }} className="flex flex-col items-center gap-5 py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground">Conectado com sucesso!</p>
                    <p className="text-sm text-muted-foreground mt-1">Instância de relatório está online e pronta.</p>
                  </div>
                  <Button className="h-10 px-8" onClick={() => setQrDialogOpen(false)}>Fechar</Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      <PlanGateDialog open={planGateOpen} onOpenChange={setPlanGateOpen} planState={planState} context="notifications" />
    </div>
  );
}

// ─── Toggle Card (simplified - no group selector) ───
interface ToggleCardProps {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  monitoredEvents: string[];
  previewMessage: string;
}

const ToggleCard = ({ icon, iconColor, title, description, enabled, onToggle, monitoredEvents, previewMessage }: ToggleCardProps) => {
  const [showPreview, setShowPreview] = useState(false);

  const colorMap: Record<string, { border: string; bg: string; iconBg: string }> = {
    orange: { border: "border-orange-500/40", bg: "bg-orange-500/5", iconBg: "bg-orange-500/10" },
    sky: { border: "border-sky-500/40", bg: "bg-sky-500/5", iconBg: "bg-sky-500/10" },
    emerald: { border: "border-emerald-500/40", bg: "bg-emerald-500/5", iconBg: "bg-emerald-500/10" },
  };
  const colors = colorMap[iconColor] || colorMap.emerald;

  return (
    <div className={`rounded-xl border-2 transition-all duration-300 ${enabled ? colors.border : "border-border"} ${enabled ? colors.bg : "bg-card"}`}>
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${colors.iconBg} flex items-center justify-center shrink-0`}>
              {icon}
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">{title}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
      </div>

      {enabled && (
        <div className="px-4 pb-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              Eventos monitorados
            </label>
            <div className="flex flex-wrap gap-1.5">
              {monitoredEvents.map((evt, i) => (
                <span key={i} className="text-[10px] px-2 py-1 rounded-md bg-muted/50 text-muted-foreground border border-border/40">
                  {evt}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-[11px] text-primary hover:underline flex items-center gap-1"
          >
            <Eye className="w-3 h-3" />
            {showPreview ? "Ocultar preview" : "Ver preview da mensagem"}
          </button>

          {showPreview && (
            <div className="mt-2 rounded-xl overflow-hidden shadow-lg border border-border/50">
              {/* WhatsApp header */}
              <div className="bg-[#075e54] px-3 py-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-[11px] text-white font-medium truncate">Grupo de Relatórios</span>
              </div>
              {/* WhatsApp chat bg */}
              <div className="bg-[#e5ddd5] p-3" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ccc' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>
                <div className="bg-white rounded-lg rounded-tl-none shadow-sm p-2.5 max-h-56 overflow-y-auto">
                  <pre className="text-[10px] text-gray-800 whitespace-pre-wrap font-sans leading-relaxed m-0">
                    {previewMessage.replace(/\\n/g, "\n")}
                  </pre>
                  <div className="text-right mt-1">
                    <span className="text-[9px] text-gray-400">22:00 ✓✓</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
