import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type { RealConversation, RealMessage } from "./useConversations";

/**
 * useConversationSync
 * Owns ALL conversation/message state.
 * Handles: fetching, syncing, initial load, polling, auth token, helpers.
 */
export function useConversationSync() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<RealConversation[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<RealConversation[]>([]);
  const [messages, setMessages] = useState<RealMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  // Cached auth token
  const cachedTokenRef = useRef<string | null>(null);
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "amizwispkprvyrnwypws";

  const getToken = useCallback(async () => {
    if (cachedTokenRef.current) return cachedTokenRef.current;
    const { data } = await supabase.auth.getSession();
    cachedTokenRef.current = data?.session?.access_token || null;
    return cachedTokenRef.current;
  }, []);

  // Keep token fresh
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      cachedTokenRef.current = session?.access_token || null;
    });
    supabase.auth.getSession().then(({ data }) => {
      cachedTokenRef.current = data?.session?.access_token || null;
    });
    return () => subscription.unsubscribe();
  }, []);

  // Ref for conversations to avoid stale closures
  const conversationsRef = useRef(conversations);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  const selectedConvIdRef = useRef(selectedConvId);
  useEffect(() => { selectedConvIdRef.current = selectedConvId; }, [selectedConvId]);

  // ─── Helpers ───
  const mapConversationRow = useCallback((row: any): RealConversation => ({
    ...row,
    tags: row.tags || [],
    attending_status: row.attending_status || "nova",
    last_message: row.last_message || "",
    last_message_at: row.last_message_at || row.updated_at || row.created_at || new Date().toISOString(),
    unread_count: row.unread_count ?? 0,
    status: row.status || "offline",
    status_changed_at: row.status_changed_at || row.created_at || new Date().toISOString(),
    deviceName: row.devices?.name || row.deviceName || undefined,
  }), []);

  const sortConversations = useCallback((items: RealConversation[]) => {
    return [...items].sort((a, b) => {
      const aTs = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTs = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTs - aTs;
    });
  }, []);

  const normalizePhone = useCallback((phone: string) => phone.replace(/\D/g, ""), []);

  const getConversationContactKey = useCallback((conversation: { phone?: string | null; remote_jid?: string | null }) => {
    const raw = conversation.phone || conversation.remote_jid?.split("@")[0] || "";
    return normalizePhone(raw);
  }, [normalizePhone]);

  const getConversationIdsForSameContact = useCallback((convId: string) => {
    const target = conversationsRef.current.find((c) => c.id === convId);
    if (!target) return [convId];
    const targetKey = getConversationContactKey(target);
    if (!targetKey) return [convId];
    return conversationsRef.current
      .filter((c) => getConversationContactKey(c) === targetKey)
      .map((c) => c.id);
  }, [getConversationContactKey]);

  const upsertConversationInState = useCallback((items: RealConversation[], row: any) => {
    const mapped = mapConversationRow(row);
    return sortConversations([mapped, ...items.filter((item) => item.id !== mapped.id)]);
  }, [mapConversationRow, sortConversations]);

  // ─── Fetch user device numbers to filter self-conversations ───
  const [ownPhones, setOwnPhones] = useState<Set<string>>(new Set());
  const [ownPhonesLoaded, setOwnPhonesLoaded] = useState(false);
  useEffect(() => {
    if (!user) return;
    supabase
      .from("devices")
      .select("number")
      .eq("user_id", user.id)
      .not("number", "is", null)
      .then(({ data }) => {
        const phones = new Set(
          (data || []).map((d: any) => (d.number || "").replace(/\D/g, "")).filter(Boolean)
        );
        setOwnPhones(phones);
        setOwnPhonesLoaded(true);
      });
  }, [user]);

  const isOwnDevice = useCallback((phone: string | null | undefined) => {
    if (!phone || ownPhones.size === 0) return false;
    const normalized = phone.replace(/\D/g, "");
    // Check exact match or suffix match (last 10-11 digits)
    if (ownPhones.has(normalized)) return true;
    for (const own of ownPhones) {
      if (own.length >= 10 && normalized.length >= 10) {
        const ownSuffix = own.slice(-10);
        const phoneSuffix = normalized.slice(-10);
        if (ownSuffix === phoneSuffix) return true;
      }
    }
    return false;
  }, [ownPhones]);

  // ─── Fetch ───
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    const [activeRes, archivedRes] = await Promise.all([
      supabase
        .from("conversations")
        .select("*, devices!conversations_device_id_fkey(name)")
        .eq("user_id", user.id)
        .neq("status", "archived")
        .order("last_message_at", { ascending: false }),
      supabase
        .from("conversations")
        .select("*, devices!conversations_device_id_fkey(name)")
        .eq("user_id", user.id)
        .eq("status", "archived")
        .order("last_message_at", { ascending: false })
        .limit(100),
    ]);

    if (activeRes.error) {
      console.error("Error fetching conversations:", activeRes.error);
      return;
    }

    // Filter out conversations with own devices (chip-to-chip warmup)
    const filterSelf = (rows: any[]) => rows.filter((r) => !isOwnDevice(r.phone));

    const mapped = sortConversations(filterSelf(activeRes.data || []).map(mapConversationRow));
    setConversations(mapped);
    setArchivedConversations(filterSelf(archivedRes.data || []).map(mapConversationRow));
    setLoading(false);
  }, [user, mapConversationRow, sortConversations, isOwnDevice]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    const groupIds = getConversationIdsForSameContact(conversationId);

    const { data, error } = await supabase
      .from("conversation_messages")
      .select("*")
      .in("conversation_id", groupIds)
      .neq("origin", "warmup")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
      return;
    }

    const deviceMap = new Map<string, string>();
    conversationsRef.current.forEach((c) => {
      if (c.deviceName) deviceMap.set(c.id, c.deviceName);
    });

    const nextMessages = (data || []).map((m: any) => ({
      ...m,
      direction: m.direction as "sent" | "received",
      deviceName: deviceMap.get(m.conversation_id),
    }));

    setMessages((prev) => {
      const pendingMessages = prev.filter(
        (m) => groupIds.includes(m.conversation_id) && m.status === "sending" && !nextMessages.some((next: any) => next.id === m.id)
      );
      return [...nextMessages, ...pendingMessages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }, [getConversationIdsForSameContact]);

  // ─── Sync from UAZAPI ───
  const syncConversations = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const webhookResp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/webhook-conversations`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "setup_all_webhooks" }),
        }
      );
      const webhookResult = await webhookResp.json();
      console.log("Webhook setup result:", webhookResult);

      try {
        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/sync-conversations`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          }
        );
        const result = await resp.json();
        console.log("Sync result:", result);
      } catch (e) {
        console.log("Sync-conversations skipped:", e);
      }

      const configuredCount = webhookResult.configured || 0;
      toast.success(
        configuredCount > 0
          ? `Webhooks configurados em ${configuredCount} dispositivos. Conversas aparecerão automaticamente!`
          : "Sincronização concluída. Envie/receba mensagens para ver as conversas."
      );
      await fetchConversations();
    } catch (err: any) {
      console.error("Sync error:", err);
      toast.error("Erro ao sincronizar conversas: " + err.message);
    } finally {
      setSyncing(false);
    }
  }, [syncing, fetchConversations, getToken, projectId]);

  // ─── Select conversation + fetch fresh messages from UAZAPI ───
  const selectConversation = useCallback((convId: string | null) => {
    setSelectedConvId(convId);
    setMessages([]);
    if (convId) {
      fetchMessages(convId);

      // Background: pull fresh messages (sent + received) from UAZAPI
      (async () => {
        try {
          const token = await getToken();
          if (!token) return;
          const resp = await fetch(
            `https://${projectId}.supabase.co/functions/v1/sync-conversations`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ conversation_id: convId }),
            }
          );
          const result = await resp.json();
          if (result.synced > 0) {
            console.log(`[conv-sync] ${result.synced} new messages synced`);
            fetchMessages(convId);
          }
        } catch (e) {
          console.log("[conv-sync] skipped:", e);
        }
      })();
    }
  }, [fetchMessages, getToken, projectId]);

  // ─── Initial load + auto background sync ───
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (user) {
      fetchConversations();
      if (!hasSyncedRef.current) {
        hasSyncedRef.current = true;
        (async () => {
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (!token) return;

            fetch(`https://${projectId}.supabase.co/functions/v1/webhook-conversations`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ action: "setup_all_webhooks" }),
            }).catch(() => {});

            const resp = await fetch(`https://${projectId}.supabase.co/functions/v1/sync-conversations`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            });
            const result = await resp.json();
            console.log("[auto-sync] background sync result:", result);
            if (result.synced > 0) {
              fetchConversations();
            }
          } catch (e) {
            console.log("[auto-sync] background sync skipped:", e);
          }
        })();
      }
    }
  }, [user, fetchConversations, projectId]);

  // ─── Light polling fallback ───
  useEffect(() => {
    if (!user) return;
    let isActive = true;

    const interval = window.setInterval(() => {
      if (isActive && document.visibilityState === "visible") {
        fetchConversations();
      }
    }, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchConversations();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isActive = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user, fetchConversations]);

  return {
    // State
    user,
    conversations,
    archivedConversations,
    messages,
    loading,
    syncing,
    selectedConvId,
    // Setters (for actions/realtime to use)
    setConversations,
    setArchivedConversations,
    setMessages,
    // Refs
    conversationsRef,
    selectedConvIdRef,
    projectId,
    // Helpers
    mapConversationRow,
    sortConversations,
    normalizePhone,
    getConversationContactKey,
    getConversationIdsForSameContact,
    upsertConversationInState,
    getToken,
    // Operations
    fetchConversations,
    fetchMessages,
    syncConversations,
    selectConversation,
  };
}
