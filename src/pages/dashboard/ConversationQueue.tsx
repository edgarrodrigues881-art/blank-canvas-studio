import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, UserPlus, Inbox, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface QueueItem {
  id: string;
  name: string;
  phone: string;
  last_message: string;
  last_message_at: string;
  attending_status: string;
  unread_count: number;
}

const ConversationQueue = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("conversations")
      .select("id, name, phone, last_message, last_message_at, attending_status, unread_count")
      .eq("user_id", user.id)
      .is("assigned_to", null)
      .not("attending_status", "eq", "finalizado")
      .order("last_message_at", { ascending: false });

    if (!error && data) {
      // Group by phone to avoid duplicate clients
      const phoneMap = new Map<string, QueueItem>();
      data.forEach((item) => {
        const key = item.phone.replace(/\D/g, "");
        if (!key) return;
        const existing = phoneMap.get(key);
        if (!existing || new Date(item.last_message_at) > new Date(existing.last_message_at)) {
          phoneMap.set(key, {
            ...item,
            // Sum unread counts
            unread_count: (existing?.unread_count || 0) + item.unread_count,
          });
        } else {
          // Still add unread count from this entry
          phoneMap.set(key, { ...existing, unread_count: existing.unread_count + item.unread_count });
        }
      });
      setItems(Array.from(phoneMap.values()).sort((a, b) => 
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      ));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 15000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("queue-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` }, () => {
        fetchQueue();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchQueue]);

  const handleAssign = async (item: QueueItem) => {
    if (!user) return;
    setAssigning(item.id);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      const { error } = await supabase
        .from("conversations")
        .update({
          assigned_to: user.id,
          assigned_name: profile?.full_name || user.email || "Atendente",
          attending_status: "em_atendimento",
        })
        .eq("id", item.id);

      if (error) throw error;

      toast.success(`Você assumiu a conversa com ${item.name}`);
      navigate(`/dashboard/conversations?open=${item.id}`);
    } catch {
      toast.error("Erro ao assumir conversa");
    } finally {
      setAssigning(null);
    }
  };

  const filtered = items.filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.name.toLowerCase().includes(q) || i.phone.includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Fila de Atendimento</h1>
          <p className="text-sm text-muted-foreground">Conversas aguardando um responsável</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchQueue} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Carregando fila...</div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 gap-3">
          <Inbox className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm font-medium">Nenhuma conversa na fila</p>
          <p className="text-muted-foreground/60 text-xs">Todas as conversas já possuem responsável</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <Card key={item.id} className="flex items-center gap-4 p-4 hover:bg-accent/30 transition-colors">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground truncate">{item.name}</span>
                  {item.unread_count > 0 && (
                    <Badge variant="destructive" className="text-[10px] h-5 px-1.5">{item.unread_count}</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] h-5 capitalize">
                    {item.attending_status?.replace("_", " ") || "nova"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.phone}</p>
                <p className="text-xs text-muted-foreground/80 truncate max-w-md">{item.last_message || "Sem mensagens"}</p>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {item.last_message_at
                    ? formatDistanceToNow(new Date(item.last_message_at), { addSuffix: true, locale: ptBR })
                    : "—"}
                </span>
                <Button
                  size="sm"
                  onClick={() => handleAssign(item)}
                  disabled={assigning === item.id}
                  className="gap-1.5 h-8 text-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {assigning === item.id ? "Assumindo..." : "Assumir"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConversationQueue;
