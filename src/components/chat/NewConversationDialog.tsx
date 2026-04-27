import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, Smartphone, ChevronDown, Check, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DeviceOption {
  id: string;
  name: string;
  number: string | null;
  status: string | null;
  uazapi_base_url: string | null;
}

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateConversation: (params: {
    deviceId: string;
    phone: string;
    name?: string;
  }) => Promise<string | null | undefined>;
}

const READY_STATUSES = new Set([
  "Ready",
  "Connected",
  "connected",
  "authenticated",
  "open",
  "active",
]);

const cleanPhone = (value: string) => value.replace(/\D/g, "");

function applyPhoneMask(raw: string): string {
  const digits = cleanPhone(raw);
  if (!digits) return "";
  // Brasil (DDI 55): aplica máscara com DDD e traço
  if (digits.startsWith("55") && digits.length >= 4) {
    const ddi = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length <= 5) return `+${ddi} (${ddd}) ${rest}`;
    return `+${ddi} (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
  }
  // Internacional: apenas prefixa "+" e mantém os dígitos como estão
  return `+${digits}`;
}

function formatDeviceNumber(number?: string | null) {
  if (!number) return "";
  const digits = cleanPhone(number);
  return digits ? `+${digits}` : "";
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onCreateConversation,
}: NewConversationDialogProps) {
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [name, setName] = useState("");
  const [showDevices, setShowDevices] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const phoneDigits = cleanPhone(phoneRaw);
  const phoneDisplay = applyPhoneMask(phoneRaw);
  const isPhoneValid = phoneDigits.length >= 12;

  const resetForm = useCallback(() => {
    setDeviceId("");
    setPhoneRaw("");
    setName("");
    setShowDevices(false);
  }, []);

  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setDevices([]);
      setLoadingDevices(false);
      return;
    }
    const { data, error } = await supabase
      .from("devices")
      .select("id, name, number, status, uazapi_base_url")
      .eq("user_id", uid)
      .not("uazapi_base_url", "is", null)
      .order("name");

    if (error) {
      toast.error("Não foi possível carregar as instâncias");
      setDevices([]);
      setLoadingDevices(false);
      return;
    }

    const readyDevices = (data || []).filter((device) =>
      READY_STATUSES.has(device.status || "")
    );
    setDevices(readyDevices);
    setLoadingDevices(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchDevices();
    setTimeout(() => phoneInputRef.current?.focus(), 200);
  }, [open, fetchDevices]);

  useEffect(() => {
    if (open && devices.length === 1 && !deviceId && isPhoneValid) {
      setDeviceId(devices[0].id);
    }
  }, [open, devices, deviceId, isPhoneValid]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = cleanPhone(raw);
    if (digits.length >= 2 && !digits.startsWith("55") && digits.length <= 11) {
      setPhoneRaw("55" + digits);
    } else {
      setPhoneRaw(digits);
    }
  };

  const handlePhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Garante que Backspace sempre apague um dígito real,
    // mesmo quando o cursor estiver sobre máscara (espaços, parênteses, traço).
    if (e.key === "Backspace" && phoneDigits.length > 0) {
      e.preventDefault();
      setPhoneRaw(phoneDigits.slice(0, -1));
    }
  };

  const handleDialogChange = (nextOpen: boolean) => {
    if (!nextOpen && !submitting) resetForm();
    onOpenChange(nextOpen);
  };

  const selectedDevice = devices.find((d) => d.id === deviceId);

  const handleSubmit = async () => {
    if (!isPhoneValid) {
      toast.warning("Digite um número completo com DDI e DDD");
      return;
    }
    if (!deviceId) {
      toast.warning("Selecione uma instância");
      return;
    }

    setSubmitting(true);
    try {
      const conversationId = await onCreateConversation({
        deviceId,
        phone: phoneDigits,
        name: name.trim() || undefined,
      });
      if (conversationId) {
        resetForm();
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-[380px] p-0 gap-0 overflow-hidden max-h-[85dvh] flex flex-col rounded-2xl">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2.5 text-sm font-bold">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquarePlus className="w-3.5 h-3.5 text-primary" />
            </div>
            Nova conversa
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-3 space-y-3 overflow-y-auto min-h-0">
          {/* Número */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">Número</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
              <Input
                ref={phoneInputRef}
                type="tel"
                inputMode="numeric"
                placeholder="+55 (62) 99999-9999"
                value={phoneDisplay}
                onChange={handlePhoneChange}
                onKeyDown={handlePhoneKeyDown}
                disabled={submitting}
                className={cn(
                  "h-10 text-sm pl-9 pr-8 rounded-lg transition-all",
                  isPhoneValid && "border-emerald-500/40 focus-visible:ring-emerald-500/20"
                )}
              />
              {isPhoneValid && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                </div>
              )}
            </div>
            {phoneDigits.length > 0 && !isPhoneValid && (
              <p className="text-[10px] text-amber-500/70 px-1">Número incompleto</p>
            )}
          </div>

          {/* Nome (opcional) — só aparece quando número válido */}
          {isPhoneValid && (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
              <label className="text-[11px] text-muted-foreground/60">
                Nome <span className="text-muted-foreground/30">(opcional)</span>
              </label>
              <Input
                placeholder="Ex: João Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                className="h-9 text-sm rounded-lg bg-muted/5 border-border/25"
              />
            </div>
          )}

          {/* Instância — só aparece quando número válido */}
          {isPhoneValid && (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
              <label className="text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">Instância</label>

              {loadingDevices ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground/50 py-2 justify-center">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Carregando...
                </div>
              ) : devices.length === 0 ? (
                <div className="rounded-lg border border-border/30 bg-muted/10 px-3 py-2.5 text-xs text-muted-foreground/50 text-center">
                  Nenhuma instância conectada
                </div>
              ) : devices.length <= 3 ? (
                <div className="grid grid-cols-1 gap-1.5">
                  {devices.map((device) => {
                    const isActive = device.id === deviceId;
                    return (
                      <button
                        key={device.id}
                        onClick={() => setDeviceId(device.id)}
                        disabled={submitting}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all duration-150",
                          isActive
                            ? "border-primary/50 bg-primary/8 ring-1 ring-primary/20"
                            : "border-border/30 bg-card/30 hover:bg-muted/20 hover:border-border/50"
                        )}
                      >
                        <Smartphone className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground/40")} />
                        <span className={cn("text-xs font-medium truncate flex-1", isActive ? "text-foreground" : "text-foreground/70")}>
                          {device.name}
                        </span>
                        {device.number && (
                          <span className="text-[10px] text-muted-foreground/40 truncate max-w-[80px]">
                            {formatDeviceNumber(device.number)}
                          </span>
                        )}
                        {isActive && (
                          <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                            <Check className="w-2.5 h-2.5 text-primary" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDevices(!showDevices)}
                    disabled={submitting}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all",
                      selectedDevice
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/30 bg-card/30 hover:bg-muted/20"
                    )}
                  >
                    <Smartphone className={cn("w-3.5 h-3.5 shrink-0", selectedDevice ? "text-primary" : "text-muted-foreground/40")} />
                    <span className={cn("text-xs flex-1 min-w-0 truncate", selectedDevice ? "font-medium text-foreground" : "text-muted-foreground/60")}>
                      {selectedDevice ? selectedDevice.name : "Selecionar instância"}
                    </span>
                    {selectedDevice?.number && (
                      <span className="text-[10px] text-muted-foreground/40 truncate max-w-[80px]">
                        {formatDeviceNumber(selectedDevice.number)}
                      </span>
                    )}
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/40 transition-transform duration-150", showDevices && "rotate-180")} />
                  </button>

                  {showDevices && (
                    <div className="rounded-lg border border-border/30 bg-card overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
                      <ScrollArea className="max-h-[220px]">
                        {devices.map((device) => {
                          const isActive = device.id === deviceId;
                          return (
                            <button
                              key={device.id}
                              onClick={() => { setDeviceId(device.id); setShowDevices(false); }}
                              className={cn(
                                "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
                                isActive ? "bg-primary/8" : "hover:bg-muted/15"
                              )}
                            >
                              <Smartphone className={cn("w-3 h-3 shrink-0", isActive ? "text-primary" : "text-muted-foreground/40")} />
                              <span className={cn("text-xs font-medium truncate flex-1", isActive ? "text-primary" : "text-foreground/70")}>
                                {device.name}
                              </span>
                              {device.number && (
                                <span className="text-[10px] text-muted-foreground/35 truncate max-w-[80px]">
                                  {formatDeviceNumber(device.number)}
                                </span>
                              )}
                              {isActive && <Check className="w-3 h-3 text-primary shrink-0" />}
                            </button>
                          );
                        })}
                      </ScrollArea>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2 space-y-1.5">
          <Button
            onClick={handleSubmit}
            disabled={submitting || !isPhoneValid || !deviceId}
            className="w-full h-10 rounded-lg text-sm font-semibold gap-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageSquarePlus className="w-3.5 h-3.5" />
            )}
            Abrir conversa
          </Button>
          <button
            onClick={() => handleDialogChange(false)}
            disabled={submitting}
            className="w-full text-center text-[11px] text-muted-foreground/50 hover:text-foreground/70 transition-colors py-1"
          >
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
