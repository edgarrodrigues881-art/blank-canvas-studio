import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { format, addHours, addDays, setHours, setMinutes } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Search, UserPlus, User, Phone, Clock, Loader2, X } from "lucide-react";
import { Device, ScheduledMessage } from "./types";

interface ServiceContact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  devices: Device[];
  editing: ScheduledMessage | null;
  initialDate?: string;
  initialTime?: string;
  onSaved: () => void;
}

export default function NewScheduleDialog({ open, onOpenChange, devices, editing, initialDate, initialTime, onSaved }: Props) {
  const { user } = useAuth();

  // Contact selection
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ServiceContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ServiceContact | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Inline create
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);

  // Form
  const [messageContent, setMessageContent] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [saving, setSaving] = useState(false);

  const connectedDevices = devices.filter(d =>
    ["Ready", "Connected", "authenticated"].includes(d.status)
  );

  // Reset on open
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const dt = new Date(editing.scheduled_at);
      setSelectedContact({ id: "", name: editing.contact_name, phone: editing.contact_phone, email: null, company: null });
      setMessageContent(editing.message_content);
      setDate(format(dt, "yyyy-MM-dd"));
      setTime(format(dt, "HH:mm"));
      setDeviceId(editing.device_id || "");
    } else {
      setSelectedContact(null);
      setMessageContent("");
      setDate(initialDate || "");
      setTime(initialTime || "");
      setDeviceId("");
    }
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
    setShowInlineCreate(false);
  }, [open, editing, initialDate, initialTime]);

  // Search contacts
  const searchContacts = useCallback(async (q: string) => {
    if (!user || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const cleanQ = q.replace(/[^\w\s+]/g, "");
    const { data } = await supabase
      .from("service_contacts")
      .select("id, name, phone, email, company")
      .eq("user_id", user.id)
      .or(`name.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%`)
      .limit(10);
    setSearchResults((data as ServiceContact[]) || []);
    setSearching(false);
  }, [user]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchContacts(searchQuery);
        setShowResults(true);
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchContacts]);

  // Click outside to close results
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectContact = (c: ServiceContact) => {
    setSelectedContact(c);
    setShowResults(false);
    setSearchQuery("");
    setShowInlineCreate(false);
  };

  const clearContact = () => {
    setSelectedContact(null);
    setSearchQuery("");
  };

  // Inline create contact
  const handleCreateContact = async () => {
    if (!user || !newPhone.trim()) return;
    setCreatingContact(true);
    const { data, error } = await supabase
      .from("service_contacts")
      .insert({
        user_id: user.id,
        name: newName.trim() || newPhone.trim(),
        phone: newPhone.trim(),
        origin: "manual",
        status: "active",
      } as any)
      .select("id, name, phone, email, company")
      .single();
    setCreatingContact(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Contato com esse telefone já existe");
      } else {
        toast.error("Erro ao criar contato");
      }
      return;
    }
    toast.success("Contato criado");
    selectContact(data as ServiceContact);
    setShowInlineCreate(false);
    setNewName("");
    setNewPhone("");
  };

  // Quick date shortcuts
  const setQuickDate = (d: Date) => {
    setDate(format(d, "yyyy-MM-dd"));
    setTime(format(d, "HH:mm"));
  };

  const quickIn1h = () => setQuickDate(addHours(new Date(), 1));
  const quickTomorrow9 = () => setQuickDate(setMinutes(setHours(addDays(new Date(), 1), 9), 0));
  const quickTomorrow14 = () => setQuickDate(setMinutes(setHours(addDays(new Date(), 1), 14), 0));

  // Save
  const canSave = selectedContact && messageContent.trim() && date && time;

  const handleSave = async () => {
    if (!user || !selectedContact || !canSave) return;
    setSaving(true);
    const scheduled_at = new Date(`${date}T${time}:00`).toISOString();
    const payload = {
      user_id: user.id,
      contact_name: selectedContact.name,
      contact_phone: selectedContact.phone,
      message_content: messageContent.trim(),
      scheduled_at,
      device_id: deviceId || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from("scheduled_messages").update(payload as any).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("scheduled_messages").insert(payload as any));
    }
    setSaving(false);

    if (error) {
      toast.error(editing ? "Erro ao atualizar" : "Erro ao criar");
      return;
    }
    toast.success(editing ? "Agendamento atualizado" : "Agendamento criado");
    onOpenChange(false);
    onSaved();
  };

  const formatPhone = (p: string) => {
    const digits = p.replace(/\D/g, "");
    if (digits.length === 13) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
    if (digits.length === 12) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return p;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Section 1: Contact ── */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contato</Label>

            {selectedContact ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{selectedContact.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {formatPhone(selectedContact.phone)}
                  </p>
                </div>
                {!editing && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={clearContact}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ) : (
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou telefone..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                </div>

                {showResults && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.length > 0 ? (
                      searchResults.map(c => (
                        <button
                          key={c.id}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors text-left"
                          onClick={() => selectContact(c)}
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{formatPhone(c.phone)}</p>
                          </div>
                        </button>
                      ))
                    ) : searchQuery.length >= 2 && !searching ? (
                      <div className="p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-2">Nenhum contato encontrado</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => { setShowResults(false); setShowInlineCreate(true); setNewPhone(searchQuery.replace(/[^\d+]/g, "")); }}
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Criar novo contato
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {/* Inline create */}
            {showInlineCreate && !selectedContact && (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" /> Criar novo contato
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Nome</Label>
                    <Input
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Nome"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Telefone *</Label>
                    <Input
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      placeholder="5511999999999"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowInlineCreate(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleCreateContact} disabled={!newPhone.trim() || creatingContact}>
                    {creatingContact ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Salvar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 2: Message ── */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mensagem</Label>
            <Textarea
              value={messageContent}
              onChange={e => setMessageContent(e.target.value)}
              placeholder="Digite a mensagem que será enviada..."
              rows={3}
              className="resize-y min-h-[80px]"
            />
          </div>

          {/* ── Section 3: Scheduling ── */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agendamento</Label>

            {/* Quick buttons */}
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={quickIn1h}>
                <Clock className="w-3 h-3" /> Daqui 1h
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={quickTomorrow9}>
                <Clock className="w-3 h-3" /> Amanhã 09:00
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={quickTomorrow14}>
                <Clock className="w-3 h-3" /> Amanhã 14:00
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data *</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Hora *</Label>
                <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-xs">Instância</Label>
              <Select value={deviceId || "auto"} onValueChange={v => setDeviceId(v === "auto" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Automático" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático (primeira disponível)</SelectItem>
                  {devices.map(d => {
                    const online = ["Ready", "Connected", "authenticated"].includes(d.status);
                    return (
                      <SelectItem key={d.id} value={d.id}>
                        <span className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                          {d.name} {d.number ? `(${d.number})` : ""}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
            {editing ? "Salvar" : "Agendar envio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
