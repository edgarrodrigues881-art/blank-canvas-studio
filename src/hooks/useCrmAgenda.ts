import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export type AgendaEventType = "compromisso" | "tarefa" | "reuniao" | "visita" | "call";
export type AgendaStatus = "pendente" | "concluido" | "cancelado";
export type AgendaPriority = "baixa" | "media" | "alta";

export interface AgendaEvent {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  event_type: AgendaEventType;
  category_id: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  link: string | null;
  color: string | null;
  status: AgendaStatus;
  priority: AgendaPriority;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  pipeline_stage: string | null;
  reminder_minutes_before: number | null;
  whatsapp_reminder: boolean;
  whatsapp_reminder_phone: string | null;
  whatsapp_reminder_sent_at: string | null;
  google_event_id: string | null;
  google_synced_at: string | null;
  google_sync_enabled: boolean;
  completed_at: string | null;
  recurrence: any;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export type AgendaEventInput = Partial<Omit<AgendaEvent, "id" | "user_id" | "created_at" | "updated_at">> & {
  title: string;
  start_at: string;
};

export function useCrmAgenda() {
  const { user } = useAuth();
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("crm_agenda_events" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("start_at", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar agenda");
      console.error(error);
    } else {
      setEvents((data as any) || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("crm_agenda_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_agenda_events", filter: `user_id=eq.${user.id}` },
        () => fetchEvents()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchEvents]);

  const createEvent = async (input: AgendaEventInput) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("crm_agenda_events" as any)
      .insert({ ...input, user_id: user.id } as any)
      .select()
      .single();
    if (error) {
      toast.error("Erro ao criar evento: " + error.message);
      return null;
    }
    toast.success("Evento criado");
    return data;
  };

  const updateEvent = async (id: string, patch: Partial<AgendaEventInput>) => {
    const { error } = await supabase
      .from("crm_agenda_events" as any)
      .update(patch as any)
      .eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar: " + error.message);
      return false;
    }
    return true;
  };

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from("crm_agenda_events" as any).delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return false;
    }
    toast.success("Evento removido");
    return true;
  };

  const toggleComplete = async (event: AgendaEvent) => {
    const newStatus: AgendaStatus = event.status === "concluido" ? "pendente" : "concluido";
    return updateEvent(event.id, {
      status: newStatus,
      completed_at: newStatus === "concluido" ? new Date().toISOString() : null,
    });
  };

  return { events, loading, fetchEvents, createEvent, updateEvent, deleteEvent, toggleComplete };
}
