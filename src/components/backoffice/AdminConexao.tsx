import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Plug, RefreshCw, Loader2, CheckCircle2, Smartphone, QrCode, XCircle,
  LogOut, Key, Send, Users, Wifi, WifiOff, MessageSquare, Shield, ArrowLeft,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface WhatsAppGroup {
  id: string;
  name: string;
  participants?: number;
}

export default function AdminConexao() {
  const queryClient = useQueryClient();
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(30);
  const [qrConnected, setQrConnected] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [connectMethod, setConnectMethod] = useState<"qr" | "code">("qr");
  const [connectStep, setConnectStep] = useState<"choose" | "active">("choose");
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [sendingTest, setSendingTest] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const qrCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["admin-conexao-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_settings")
        .select("key, value")
        .in("key", ["wa_report_device_id", "wa_report_group_id", "wa_report_group_name"]);
      const map: Record<string, string> = {};
      for (const r of data || []) map[r.key] = r.value;
      return map;
    },
  });

  const deviceId = settings?.wa_report_device_id || null;
  const groupId = settings?.wa_report_group_id || null;
  const groupName = settings?.wa_report_group_name || null;

  const { data: device, isLoading: deviceLoading } = useQuery({
    queryKey: ["admin-conexao-device", deviceId],
    queryFn: async () => {
      if (!deviceId) return null;
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status, profile_name, profile_picture, uazapi_token, uazapi_base_url")
        .eq("id", deviceId)
        .maybeSingle();
      return data;
    },
    enabled: !!deviceId,
  });

  const isConnected = device?.status === "Connected" || device?.status === "Ready" || device?.status === "authenticated";
  const hasCredentials = !!(device?.uazapi_token && device?.uazapi_base_url);

  const ensureAdminReportDevice = async () => {
    if (deviceId && device) return deviceId;

    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "create-report" }),
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || "Erro ao preparar instância admin");
    }

    const newDeviceId = result?.device?.id;
    if (!newDeviceId) {
      throw new Error("Instância admin não retornou um identificador válido");
    }

    await Promise.all([
      upsertSetting("wa_report_device_id", newDeviceId),
      queryClient.invalidateQueries({ queryKey: ["admin-conexao-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-conexao-device"] }),
    ]);

    return newDeviceId;
  };

  const openConnectDialog = () => {
    setQrDialogOpen(true);
    setConnectStep("choose");
    setConnectMethod("qr");
    setQrCodeBase64("");
    setQrConnected(false);
    setConnectError("");
    setPairingCode("");
    setPairingPhone("");
  };

  const startQrConnect = async () => {
    setQrLoading(true);
    setQrCodeBase64("");
    setQrConnected(false);
    setConnectError("");

    try {
      const ensuredDeviceId = await ensureAdminReportDevice();
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "connect", deviceId: ensuredDeviceId }),
        }
      );
      const result = await res.json();
      if (result.base64 || result.qr) {
        setQrCodeBase64(result.base64 || result.qr);
        startCountdownAndPoll(ensuredDeviceId);
      } else if (result.pairing_code) {
        setPairingCode(result.pairing_code);
        setConnectMethod("code");
      } else {
        setConnectError(result.error || "Erro ao gerar QR Code");
      }
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : "Erro de conexão");
    } finally {
      setQrLoading(false);
    }
  };

  const startCountdownAndPoll = (devId: string) => {
    if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    let countdown = 30;
    setQrCountdown(30);
    qrCountdownRef.current = setInterval(() => {
      countdown--;
      setQrCountdown(countdown);
      if (countdown <= 0 && qrCountdownRef.current) clearInterval(qrCountdownRef.current);
    }, 1000);
    pollRef.current = setInterval(async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-connect`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: "status", deviceId: devId }),
          }
        );
        const result = await res.json();
        if (result.status === "authenticated") {
          setQrConnected(true);
          if (pollRef.current) clearInterval(pollRef.current);
          if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
          queryClient.invalidateQueries({ queryKey: ["admin-conexao-device"] });
          toast.success("Dispositivo conectado!");
        } else if (result.base64 || result.qr) {
          setQrCodeBase64(result.base64 || result.qr);
        }
      } catch {}
    }, 3000);
  };

  const requestPairingCode = async () => {
    if (!deviceId || !pairingPhone) return;
    setPairingLoading(true);
    setPairingCode("");
    setConnectError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "requestPairingCode", deviceId, phoneNumber: pairingPhone.replace(/\D/g, "") }),
        }
      );
      const result = await res.json();
      if (result.pairingCode || result.pairing_code) {
        setPairingCode(result.pairingCode || result.pairing_code);
        startCountdownAndPoll(deviceId);
      } else {
        setConnectError(result.error || "Erro ao gerar código");
      }
    } catch {
      setConnectError("Erro de conexão");
    } finally {
      setPairingLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!deviceId) return;
    setDisconnecting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "logout", deviceId }),
        }
      );
      queryClient.invalidateQueries({ queryKey: ["admin-conexao-device"] });
      toast.success("Dispositivo desconectado");
    } catch {
      toast.error("Erro ao desconectar");
    } finally {
      setDisconnecting(false);
    }
  };

  const loadGroups = async () => {
    if (!deviceId) return;
    setLoadingGroups(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "listGroups", deviceId }),
        }
      );
      const data = await res.json();
      const raw = Array.isArray(data?.groups) ? data.groups : Array.isArray(data) ? data : [];
      const list = raw.map((g: any) => ({
        id: g.id || g.jid,
        name: g.name || g.subject || "Sem nome",
        participants: g.participants?.length || g.size || 0,
      }));
      setGroups(list);
    } catch {
      toast.error("Erro ao carregar grupos");
    } finally {
      setLoadingGroups(false);
    }
  };

  const upsertSetting = async (key: string, value: string) => {
    const { data: existing } = await supabase
      .from("community_settings").select("id").eq("key", key).maybeSingle();
    if (existing) {
      await supabase.from("community_settings").update({ value }).eq("key", key);
    } else {
      await supabase.from("community_settings").insert({ key, value });
    }
  };

  const selectGroup = async (group: WhatsAppGroup) => {
    try {
      await Promise.all([
        upsertSetting("wa_report_group_id", group.id),
        upsertSetting("wa_report_group_name", group.name),
      ]);
      queryClient.invalidateQueries({ queryKey: ["admin-conexao-settings"] });
      toast.success(`Grupo "${group.name}" selecionado`);
      setGroups([]);
    } catch {
      toast.error("Erro ao salvar grupo");
    }
  };

  const sendTest = async () => {
    if (!deviceId || !groupId) return;
    setSendingTest(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const groupNumber = groupId.replace(/@g\.us$/, "");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: "sendText", deviceId, number: groupNumber,
            text: "✅ Teste de conexão — DG Contingência PRO\n\nSe você recebeu esta mensagem, a conexão está funcionando.",
          }),
        }
      );
      const result = await res.json();
      if (result.success) toast.success("Mensagem de teste enviada!");
      else toast.error(result.error || "Falha ao enviar teste");
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSendingTest(false);
    }
  };

  useEffect(() => {
    return () => {
      if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  if (settingsLoading || deviceLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!deviceId && !deviceLoading) {
    return (
      <div className="text-center py-16">
        <Plug size={40} className="mx-auto mb-3 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">A instância principal ainda não foi preparada.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Clique em <code className="bg-muted px-1 rounded">Conectar WhatsApp</code> para recriar a conexão admin automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ─── Status Header ─── */}
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/80 p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.03] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-primary/[0.02] rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="relative">
              {device?.profile_picture ? (
                <img
                  src={device.profile_picture} alt=""
                  className={`w-14 h-14 rounded-2xl object-cover border-2 ${isConnected ? "border-emerald-500/40" : "border-destructive/30"}`}
                />
              ) : (
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 ${
                  isConnected ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted border-border"
                }`}>
                  <Smartphone size={24} className={isConnected ? "text-emerald-500" : "text-muted-foreground"} />
                </div>
              )}
              <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-card ${isConnected ? "bg-emerald-500" : "bg-destructive"}`}>
                {isConnected && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-40" />}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  {device?.profile_name || device?.name || "WhatsApp Admin"}
                </h3>
                {hasCredentials && (
                  <Badge variant="outline" className="text-[9px] border-primary/20 text-primary bg-primary/5 font-medium">
                    <Shield size={8} className="mr-0.5" /> API ativa
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {device?.number ? `+${device.number.replace(/^(\d{2})(\d{2})(\d{5})(\d{4})$/, "$1 ($2) $3-$4")}` : "Número não vinculado"}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                {isConnected ? (
                  <Badge className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10">
                    <Wifi size={10} className="mr-1" /> Online
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive bg-destructive/5">
                    <WifiOff size={10} className="mr-1" /> Offline
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {isConnected ? (
              <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={disconnecting}
                className="text-xs h-9 border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/40">
                {disconnecting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <LogOut size={14} className="mr-1.5" />}
                Desconectar
              </Button>
            ) : (
              <Button size="sm" onClick={openConnectDialog} className="text-xs h-9 gap-1.5">
                <QrCode size={14} /> Conectar WhatsApp
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Grupo de Relatórios ─── */}
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare size={16} className="text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">Grupo de Relatórios</h4>
              <p className="text-[11px] text-muted-foreground">Destino dos alertas e relatórios automáticos</p>
            </div>
          </div>
        </div>

        {groupId ? (
          <div className="rounded-xl bg-muted/30 border border-border/40 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{groupName || "Grupo selecionado"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Alertas e relatórios serão enviados aqui</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={sendTest} disabled={sendingTest || !isConnected} className="text-xs h-8">
                  {sendingTest ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Send size={12} className="mr-1" />}
                  Testar
                </Button>
                <Button size="sm" variant="outline" onClick={loadGroups} disabled={loadingGroups || !isConnected} className="text-xs h-8">
                  {loadingGroups ? <Loader2 size={12} className="mr-1 animate-spin" /> : <RefreshCw size={12} className="mr-1" />}
                  Trocar
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-border/60 p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted mx-auto flex items-center justify-center mb-3">
              <Users size={22} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">Nenhum grupo selecionado</p>
            <p className="text-xs text-muted-foreground mb-4">Selecione um grupo do WhatsApp para receber os alertas</p>
            <Button size="sm" onClick={loadGroups} disabled={loadingGroups || !isConnected} className="text-xs h-8">
              {loadingGroups ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Users size={12} className="mr-1" />}
              Selecionar Grupo
            </Button>
          </div>
        )}

        {groups.length > 0 && (
          <div className="mt-4 rounded-xl border border-border/60 overflow-hidden max-h-[280px] overflow-y-auto">
            {groups.map((g) => (
              <button key={g.id} onClick={() => selectGroup(g)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border/40 last:border-0 text-left group">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <Users size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{g.name}</p>
                    <p className="text-[10px] text-muted-foreground">{g.participants || 0} participantes</p>
                  </div>
                </div>
                <CheckCircle2 size={16} className={`shrink-0 transition-colors ${groupId === g.id ? "text-primary" : "text-transparent group-hover:text-muted-foreground/30"}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── QR Dialog ─── */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden border-border/60">
          {connectStep === "choose" ? (
            <div className="p-6 space-y-5">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Smartphone size={28} className="text-primary" />
                </div>
                <DialogTitle className="text-lg font-bold">Conectar WhatsApp</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1.5">Vincule seu número para enviar alertas e relatórios</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setConnectMethod("qr"); setConnectStep("active"); startQrConnect(); }}
                  className="group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-border/40 hover:border-primary/50 bg-card hover:bg-primary/[0.04] transition-all">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <QrCode className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-bold text-foreground block">QR Code</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5 block leading-tight">Mais rápido</span>
                  </div>
                </button>
                <button
                  onClick={() => { setConnectMethod("code"); setConnectStep("active"); }}
                  className="group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-border/40 hover:border-primary/50 bg-card hover:bg-primary/[0.04] transition-all">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Key className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-bold text-foreground block">Código</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5 block leading-tight">Sem câmera</span>
                  </div>
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/60 text-center">A API será configurada automaticamente</p>
            </div>
          ) : (
            <div className="p-6">
              <button onClick={() => { setConnectStep("choose"); setConnectError(""); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-5 transition-colors">
                <ArrowLeft size={12} /> Voltar
              </button>

              {connectMethod === "qr" ? (
                <div className="flex flex-col items-center gap-4">
                  {qrConnected ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <CheckCircle2 size={32} className="text-emerald-500" />
                      </div>
                      <p className="text-base font-bold text-emerald-500">Conectado!</p>
                      <p className="text-xs text-muted-foreground">WhatsApp vinculado com sucesso</p>
                    </div>
                  ) : qrCodeBase64 ? (
                    <>
                      <div className="text-center mb-1">
                        <h3 className="text-sm font-bold text-foreground">Escaneie com seu celular</h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">WhatsApp → Menu → Dispositivos conectados → Conectar</p>
                      </div>
                      <div className="p-3 bg-white rounded-2xl shadow-lg">
                        <img src={qrCodeBase64.startsWith("data:") ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`}
                          alt="QR Code" className="w-52 h-52 rounded-lg" />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        Aguardando leitura • {qrCountdown}s
                      </div>
                    </>
                  ) : connectError ? (
                    <div className="py-8 text-center">
                      <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
                        <XCircle size={28} className="text-destructive" />
                      </div>
                      <p className="text-sm font-semibold text-destructive mb-1">{connectError}</p>
                      <p className="text-[11px] text-muted-foreground mb-4">Verifique se o dispositivo está configurado</p>
                      <Button size="sm" variant="outline" onClick={startQrConnect} className="text-xs">
                        <RefreshCw size={12} className="mr-1.5" /> Tentar novamente
                      </Button>
                    </div>
                  ) : (
                    <div className="py-12 flex flex-col items-center gap-4 animate-fade-in">
                      <div className="relative w-20 h-20">
                        {/* Outer spinning ring */}
                        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" style={{ animationDuration: '1.2s' }} />
                        {/* Inner icon */}
                        <div className="absolute inset-2 rounded-full bg-primary/10 flex items-center justify-center">
                          <QrCode size={28} className="text-primary animate-pulse" />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-foreground">Gerando QR Code</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Provisionando API automaticamente...</p>
                      </div>
                      <div className="flex gap-1 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-sm font-bold text-foreground">Código de Pareamento</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Conecte sem precisar de câmera</p>
                  </div>
                  {pairingCode ? (
                    <div className="text-center py-4">
                      <div className="inline-block bg-muted/40 border border-border/40 rounded-2xl px-8 py-5">
                        <p className="text-3xl font-mono font-black tracking-[0.4em] text-primary">{pairingCode}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
                        WhatsApp → <span className="font-medium text-foreground/80">Dispositivos conectados</span> → Conectar → <span className="font-medium text-foreground/80">Código</span>
                      </p>
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-3 bg-muted/30 px-3 py-1.5 rounded-full mx-auto w-fit">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        Aguardando conexão
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Número com DDD (sem o +)</label>
                        <Input placeholder="5562999999999" value={pairingPhone}
                          onChange={(e) => setPairingPhone(e.target.value)}
                          className="text-sm text-center font-mono tracking-wider h-11" />
                      </div>
                      <Button className="w-full text-xs h-10" onClick={requestPairingCode}
                        disabled={pairingLoading || !pairingPhone}>
                        {pairingLoading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Key size={14} className="mr-1.5" />}
                        Gerar Código
                      </Button>
                    </div>
                  )}
                  {connectError && (
                    <div className="text-center bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                      <p className="text-xs text-destructive">{connectError}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}