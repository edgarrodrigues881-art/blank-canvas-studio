import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, Smartphone, Search, User, ChevronDown, Check } from "lucide-react";
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

interface ContactSuggestion {
  id: string;
  name: string;
  phone: string;
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

/** Format a raw digit string into a readable phone mask */
function applyPhoneMask(raw: string): string {
  const digits = cleanPhone(raw);
  if (!digits) return "";

  // Brazilian format: +55 (XX) XXXXX-XXXX
  if (digits.startsWith("55") && digits.length >= 4) {
    const ddi = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length <= 5) {
      return `+${ddi} (${ddd}) ${rest}`;
    }
    return `+${ddi} (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
  }

  // Generic international: +XX XXXXXXXXX
  if (digits.length <= 2) return `+${digits}`;
  return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
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
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [autoFilledName, setAutoFilledName] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const phoneDisplay = applyPhoneMask(phoneRaw);
  const phoneDigits = cleanPhone(phoneRaw);

  const resetForm = useCallback(() => {
    setDeviceId("");
    setPhoneRaw("");
    setName("");
    setSuggestions([]);
    setAutoFilledName(false);
  }, []);

  // Fetch devices
  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    const { data, error } = await supabase
      .from("devices")
      .select("id, name, number, status, uazapi_base_url")
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
    // Focus phone input after opening
    setTimeout(() => phoneInputRef.current?.focus(), 200);
  }, [open, fetchDevices]);

  // Auto-select single device
  useEffect(() => {
    if (open && devices.length === 1 && !deviceId) {
      setDeviceId(devices[0].id);
    }
  }, [open, devices, deviceId]);

  // Search contacts as user types phone
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (phoneDigits.length < 4) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      const { data } = await supabase
        .from("contacts")
        .select("id, name, phone")
        .or(`phone.ilike.%${phoneDigits}%,name.ilike.%${phoneDigits}%`)
        .limit(5);

      setSuggestions(data || []);
      setLoadingSuggestions(false);

      // Auto-fill name if exact match
      if (data && data.length > 0 && !name) {
        const exactMatch = data.find(
          (c) => cleanPhone(c.phone) === phoneDigits || cleanPhone(c.phone).endsWith(phoneDigits)
        );
        if (exactMatch && exactMatch.name) {
          setName(exactMatch.name);
          setAutoFilledName(true);
        }
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [phoneDigits]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Only keep digits from input, but allow user to type naturally
    const digits = cleanPhone(raw);
    // Auto-add 55 prefix if user starts typing local number
    if (digits.length >= 2 && !digits.startsWith("55") && digits.length <= 11) {
      setPhoneRaw("55" + digits);
    } else {
      setPhoneRaw(digits);
    }
    if (autoFilledName) {
      setAutoFilledName(false);
    }
  };

  const selectSuggestion = (contact: ContactSuggestion) => {
    setPhoneRaw(cleanPhone(contact.phone));
    setName(contact.name || "");
    setAutoFilledName(true);
    setSuggestions([]);
  };

  const handleDialogChange = (nextOpen: boolean) => {
    if (!nextOpen && !submitting) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  // Phone validation
  const isPhoneValid = phoneDigits.length >= 12; // DDI(2) + DDD(2) + number(8+)
  const isPhonePartial = phoneDigits.length >= 4 && phoneDigits.length < 12;

  const handleSubmit = async () => {
    if (!deviceId) {
      toast.warning("Selecione uma instância");
      return;
    }
    if (!isPhoneValid) {
      toast.warning("Digite um número completo com DDI e DDD");
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
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquarePlus className="w-4 h-4 text-primary" />
            </div>
            Nova conversa
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-5">
          {/* 1. Phone field — primary */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Número</label>
            <div className="relative">
              <Input
                ref={phoneInputRef}
                type="tel"
                inputMode="numeric"
                placeholder="+55 (62) 99999-9999"
                value={phoneDisplay}
                onChange={handlePhoneChange}
                disabled={submitting}
                className={cn(
                  "h-11 text-sm pl-3 pr-10 rounded-xl transition-all",
                  isPhoneValid && "border-emerald-500/50 focus-visible:ring-emerald-500/30",
                  isPhonePartial && "border-amber-500/30"
                )}
              />
              {phoneDigits.length > 0 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isPhoneValid ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <span className="text-emerald-500 text-[10px]">✓</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">{phoneDigits.length}/13</span>
                  )}
                </div>
              )}
            </div>

            {/* Contact suggestions */}
            {suggestions.length > 0 && phoneDigits.length >= 4 && (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20">
                  Contatos encontrados
                </div>
                <ScrollArea className="max-h-[140px]">
                  {suggestions.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => selectSuggestion(contact)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {contact.name || "Sem nome"}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {applyPhoneMask(contact.phone)}
                        </p>
                      </div>
                    </button>
                  ))}
                </ScrollArea>
              </div>
            )}
            {loadingSuggestions && phoneDigits.length >= 4 && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Buscando contatos...
              </div>
            )}
          </div>

          {/* 2. Name — optional, subtle */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Nome <span className="text-muted-foreground/50">(opcional)</span>
            </label>
            <Input
              placeholder="Ex: João Silva"
              value={name}
              onChange={(e) => { setName(e.target.value); setAutoFilledName(false); }}
              disabled={submitting}
              className={cn(
                "h-10 text-sm rounded-xl bg-muted/10 border-border/30",
                autoFilledName && "border-primary/30 bg-primary/5"
              )}
            />
            {autoFilledName && (
              <p className="text-[10px] text-primary/70 px-1">
                ✨ Preenchido automaticamente
              </p>
            )}
          </div>

          {/* 3. Instance — visual buttons */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Instância</label>
            {loadingDevices ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando...
              </div>
            ) : devices.length === 0 ? (
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground text-center">
                Nenhuma instância conectada
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {devices.map((device) => {
                  const isSelected = deviceId === device.id;
                  return (
                    <button
                      key={device.id}
                      onClick={() => setDeviceId(device.id)}
                      disabled={submitting}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-150",
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm shadow-primary/10"
                          : "border-border/40 bg-card/50 hover:bg-muted/30 hover:border-border"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                        isSelected ? "bg-primary/20" : "bg-muted/40"
                      )}>
                        <Smartphone className={cn(
                          "w-4 h-4 transition-colors",
                          isSelected ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-xs font-semibold truncate transition-colors",
                          isSelected ? "text-primary" : "text-foreground"
                        )}>
                          {device.name}
                        </p>
                        {device.number && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {formatDeviceNumber(device.number)}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <span className="text-primary-foreground text-[8px] font-bold">✓</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer — fixed bottom */}
        <div className="px-5 pb-5 pt-2 border-t border-border/20 space-y-2">
          <Button
            onClick={handleSubmit}
            disabled={submitting || loadingDevices || devices.length === 0 || !isPhoneValid || !deviceId}
            className="w-full h-11 rounded-xl text-sm font-semibold gap-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageSquarePlus className="w-4 h-4" />
            )}
            Abrir conversa
          </Button>
          <button
            onClick={() => handleDialogChange(false)}
            disabled={submitting}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
