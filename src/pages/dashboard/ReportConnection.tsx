import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Radio, RefreshCw, Plug, Loader2, Send, CheckCircle2, Smartphone, Users, Zap, QrCode, XCircle, LogOut, Key, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlanGate } from "@/hooks/usePlanGate";
import { PlanGateDialog } from "@/components/PlanGateDialog";
import { Ban } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface WhatsAppGroup {
  id: string;
  name: string;
  participants?: number;
}

export default function ReportConnection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isBlocked, planState, canUseReports } = usePlanGate();
  const [planGateOpen, setPlanGateOpen] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [sendingTest, setSendingTest] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(30);
  const [qrConnected, setQrConnected] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [connectStep, setConnectStep] = useState<"qr" | "code" | "done">("qr");
  const [connectMethod, setConnectMethod] = useState<"qr" | "code">("qr");
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);

  const qrCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canUseReport = canUseReports;

  const { data: config } = useQuery({
    queryKey: ["report-wa-config", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_wa_configs")
        .select("id, device_id, group_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: reportDevice, isLoading: loadingDevice } = useQuery({
    queryKey: ["report-device", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status, login_type")
        .eq("user_id", user!.id)
        .eq("login_type", "report_wa")
        .maybeSingle();

      if (data) return data;

      const { data: created, error } = await supabase.functions.invoke("manage-devices", {
        body: { action: "create-report" },
      });
      if (error || created?.error) {
        console.error("Auto-provision report instance failed:", error || created?.error);
        return null;
      }
      if (created?.device) {
        await supabase.from("report_wa_configs").upsert({
          user_id: user!.id,
          device_id: created.device.id,
        }, { onConflict: "user_id" }).select().maybeSingle();
      }
      const { data: refetched } = await supabase
        .from("devices")
        .select("id, name, number, status, login_type")
        .eq("user_id", user!.id)
        .eq("login_type", "report_wa")
        .maybeSingle();
      return refetched;
    },
    enabled: !!user && canUseReport,
  });

  const isConnected = reportDevice?.status === "Ready";

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

  const handleDisconnect = async () => {
    if (!reportDevice?.id) return;
    setDisconnecting(true);
    try {
      await callApi({ action: "logout", deviceId: reportDevice.id });
      queryClient.invalidateQueries({ queryKey: ["report-device"] });
      setGroups([]);
      toast.success("Instância desconectada");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao desconectar");
    } finally {
      setDisconnecting(false);
    }
  };

  const openConnectDialog = () => {
    if (!canUseReport) { setPlanGateOpen(true); return; }
    setQrDialogOpen(true);
    setQrCodeBase64("");
    setQrConnected(false);
    setConnectError("");
    setConnectMethod("qr");
    setConnectStep("qr");
    setPairingCode("");
    setPairingPhone("");
    handleConnectQR();
  };

  const handleConnectQR = async () => {
    if (!reportDevice?.id) return;
    setConnectStep("qr");
    setQrLoading(true);
    setQrCodeBase64("");
    setConnectError("");
    try {
      const result = await callApi({ action: "connect", deviceId: reportDevice.id, method: "qr" });
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
      let msg = "Erro ao gerar QR Code";
      try {
        const parsed = err?.message ? JSON.parse(err.message) : null;
        if (parsed?.error) msg = parsed.error;
        else if (err?.message) msg = err.message;
      } catch {
        if (err?.message) msg = err.message;
      }
      if (err?.context?.body) {
        try {
          const body = typeof err.context.body === 'string' ? JSON.parse(err.context.body) : err.context.body;
          if (body?.error) msg = body.error;
        } catch {}
      }
      setConnectError(msg);
      toast.error(msg);
    } finally {
      setQrLoading(false);
    }
  };

  const handleRequestPairingCode = async () => {
    if (!reportDevice?.id || !pairingPhone) return;
    setPairingLoading(true);
    setConnectError("");
    setPairingCode("");
    try {
      const result = await callApi({
        action: "requestPairingCode",
        deviceId: reportDevice.id,
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

  // Poll connection status while QR dialog open
  useEffect(() => {
    if (!qrDialogOpen || !reportDevice?.id || qrConnected) return;
    pollRef.current = setInterval(async () => {
      try {
        const result = await callApi({ action: "status", deviceId: reportDevice.id });
        if (result?.status === "authenticated" || result?.status === "connected") {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setQrConnected(true);
          setConnectStep("done");
          queryClient.invalidateQueries({ queryKey: ["report-device"] });
          toast.success("Instância conectada com sucesso!");
          setTimeout(() => setQrDialogOpen(false), 2000);
        }
      } catch {}
    }, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [qrDialogOpen, reportDevice?.id, qrConnected, connectStep]);

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
      const groupChats: WhatsAppGroup[] = chats.map((c: any) => ({
        id: c.id || c.jid || c.chatId || "",
        name: c.name || c.subject || c.title || c.id || "Grupo sem nome",
        participants: c.participants?.length || c.participantsCount || c.size || undefined,
      }));
      setGroups(groupChats);
      if (groupChats.length === 0) {
        toast.info("Nenhum grupo encontrado neste WhatsApp");
      } else {
        toast.success(`${groupChats.length} grupos carregados`);
      }
    } catch (err) {
      console.error("Error fetching groups:", err);
      toast.error("Erro ao buscar grupos do WhatsApp");
    } finally {
      setLoadingGroups(false);
    }
  };

  const sendTestMessage = async () => {
    if (!config?.device_id) return;
    setSendingTest(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const testGroupId = config?.group_id;
      if (!testGroupId) {
        toast.error("Configure ao menos um grupo no Relatório antes de enviar teste");
        setSendingTest(false);
        return;
      }
      const testGroupName = groups.find(g => g.id === testGroupId)?.name || testGroupId;
      const message = `[TESTE DE MONITORAMENTO]\n\nSistema de alertas ativo.\n\nInstância: ${reportDevice?.name || "—"}\nNúmero: ${reportDevice?.number || "—"}\n\nGrupo configurado: ${testGroupName}\n\nCentral de monitoramento funcionando corretamente.`;

      let whatsappSent = false;
      let whatsappError: string | null = null;
      try {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whapi-chats?action=send_message&device_id=${config.device_id}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ to: testGroupId, message }),
          }
        );
        whatsappSent = true;
      } catch (e: any) {
        whatsappError = e?.message || "Erro ao enviar";
      }

      await supabase.from("alerts").insert({
        user_id: user!.id,
        type: "TEST_ALERT" as any,
        severity: "INFO" as any,
        instance_name: reportDevice?.name || null,
        phone_number: reportDevice?.number || null,
        instance_id: config.device_id,
        message_rendered: message,
        whatsapp_sent: whatsappSent,
        whatsapp_group_id: testGroupId,
        whatsapp_sent_at: whatsappSent ? new Date().toISOString() : null,
        whatsapp_error: whatsappError,
      });

      toast.success(whatsappSent ? "Alerta de teste enviado!" : "Alerta registrado (WhatsApp falhou)");
    } catch {
      toast.error("Erro ao enviar alerta de teste");
    } finally {
      setSendingTest(false);
    }
  };

  useEffect(() => {
    if (reportDevice?.id && reportDevice?.status === "Ready") {
      fetchGroups(reportDevice.id);
    }
  }, [reportDevice?.id, reportDevice?.status]);

  // Logs
  const { data: logs } = useQuery({
    queryKey: ["report-wa-logs", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("report_wa_logs")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!user,
  });

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
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Radio className="w-4 h-4 text-primary" />
          </div>
          Relatório WhatsApp
        </h1>
        <p className="text-muted-foreground text-xs mt-1 ml-[42px]">
          Clique no cliente → veja a mensagem → envie
        </p>
      </div>

      {/* Instance Panel */}
      <div className={`rounded-xl border overflow-hidden ${isConnected ? "border-emerald-500/15" : "border-border/30"}`}>
        <div className={`h-0.5 w-full ${isConnected ? "bg-emerald-500/50" : "bg-muted-foreground/10"}`} />
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isConnected ? "bg-emerald-500/10" : "bg-muted/30"}`}>
                <Smartphone className={`w-4 h-4 ${isConnected ? "text-emerald-500" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Relatório via WhatsApp</p>
                {reportDevice && (
                  <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">
                    {reportDevice.number || reportDevice.name}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Histórico button */}
              {logs && logs.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-[11px]" onClick={() => toast.info("Histórico de logs disponível abaixo")}>
                  <RefreshCw className="w-3 h-3" /> Histórico
                </Button>
              )}
              {reportDevice && (
                <Badge variant="outline" className={`text-[10px] gap-1 px-2 py-0.5 ${isConnected ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" : "border-destructive/20 text-destructive bg-destructive/5"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-destructive"}`} />
                  {isConnected ? "Conectado" : "Offline"}
                </Badge>
              )}
            </div>
          </div>

          {!reportDevice ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground/60">Provisionando instância...</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {!isConnected && (
                <Button size="sm" onClick={openConnectDialog} className="gap-1.5 h-7 text-[11px]">
                  <Plug className="w-3 h-3" /> Conectar
                </Button>
              )}
              {isConnected && (
                <>
                  <Button variant="outline" size="sm" onClick={() => reportDevice?.id && fetchGroups(reportDevice.id, true)} disabled={loadingGroups} className="gap-1.5 h-7 text-[11px]">
                    {loadingGroups ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Sincronizar
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting} className="gap-1.5 h-7 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20">
                    {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                    Desconectar
                  </Button>
                </>
              )}
              {groups.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40 ml-auto self-center">
                  <Users className="w-3 h-3" /> {groups.length} grupos
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Connect Dialog */}
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
                ) : connectMethod === "qr" ? (
                  <QrCode className="w-6 h-6 text-primary" />
                ) : (
                  <Smartphone className="w-6 h-6 text-primary" />
                )}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  {connectStep === "done" ? "Conectado com sucesso!" : connectMethod === "qr" ? "Escaneie o QR Code" : "Código de pareamento"}
                </DialogTitle>
                {reportDevice && connectStep !== "done" && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {reportDevice.name}{reportDevice.number ? ` · ${reportDevice.number}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 pt-5 overflow-hidden">
            <AnimatePresence mode="wait">
              {connectStep !== "done" && (
                <motion.div key="connect-content" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                  {/* Method chooser */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <button
                      onClick={() => {
                        setConnectMethod("qr");
                        setConnectStep("qr");
                        setConnectError("");
                        if (!qrCodeBase64 && !qrLoading) handleConnectQR();
                      }}
                      className={`group relative flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 transition-all duration-200 ${
                        connectMethod === "qr"
                          ? "border-primary/50 bg-primary/[0.04] shadow-sm"
                          : "border-border/30 hover:border-primary/30 bg-card hover:bg-primary/[0.02]"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                        connectMethod === "qr" ? "bg-primary/20" : "bg-primary/10 group-hover:bg-primary/15"
                      }`}>
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
                        setConnectError("");
                      }}
                      className={`group relative flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 transition-all duration-200 ${
                        connectMethod === "code"
                          ? "border-primary/50 bg-primary/[0.04] shadow-sm"
                          : "border-border/30 hover:border-primary/30 bg-card hover:bg-primary/[0.02]"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                        connectMethod === "code" ? "bg-primary/20" : "bg-primary/10 group-hover:bg-primary/15"
                      }`}>
                        <Key className="w-6 h-6 text-primary" />
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-bold text-foreground block">Código</span>
                        <span className="text-[11px] text-muted-foreground mt-0.5 block">Digite um código numérico</span>
                      </div>
                    </button>
                  </div>

                  {/* QR Code content */}
                  {connectMethod === "qr" && (
                    <motion.div key="qr-content" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }} className="flex flex-col items-center gap-5">
                      <div className="relative w-[272px] h-[272px]">
                        <div className={`absolute inset-0 w-64 h-64 m-auto rounded-2xl flex flex-col items-center justify-center border border-primary/20 bg-gradient-to-b from-primary/[0.03] to-transparent overflow-hidden transition-all duration-500 ease-out ${
                          !qrCodeBase64 && !connectError ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                        }`}>
                          <div className="absolute left-4 right-4 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent rounded-full" style={{ animation: "scanLine 2.5s ease-in-out infinite" }} />
                          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4" style={{ animation: "qrPulse 2s ease-in-out infinite" }}>
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
                              try {
                                const { data: { session: s } } = await supabase.auth.getSession();
                                if (s) {
                                  await supabase.functions.invoke("sync-devices", { headers: { Authorization: `Bearer ${s.access_token}` } });
                                  queryClient.invalidateQueries({ queryKey: ["report-device"] });
                                }
                              } catch {}
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
                                  try {
                                    const { data: { session: s } } = await supabase.auth.getSession();
                                    if (s) {
                                      await supabase.functions.invoke("sync-devices", { headers: { Authorization: `Bearer ${s.access_token}` } });
                                      queryClient.invalidateQueries({ queryKey: ["report-device"] });
                                    }
                                  } catch {}
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
