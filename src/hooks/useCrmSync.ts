import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "crm.integrations.connected";
const AUTOMATIONS_KEY = "crm.integrations.automations";

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useCrmSync() {
  const isConnected = (integrationId: string) => {
    const connected = loadJSON<Record<string, boolean>>(STORAGE_KEY, {});
    return !!connected[integrationId];
  };

  const isAutomationEnabled = (integrationId: string, autoId: string) => {
    const automations = loadJSON<Record<string, Record<string, boolean>>>(AUTOMATIONS_KEY, {});
    return !!automations[integrationId]?.[autoId];
  };

  const syncToSheets = async (data: {
    name: string;
    phone: string;
    lastMessage?: string;
    status: string;
    origin: string;
    timestamp: string;
  }) => {
    if (!isConnected("google_sheets") || !isAutomationEnabled("google_sheets", "save_leads_messages")) {
      return;
    }

    console.log("Sincronizando com Google Sheets:", data);
    // Aqui seria a chamada para a Edge Function ou API do Sheets
    // Por enquanto, simulamos o sucesso
    return true;
  };

  const syncToNotion = async (data: {
    name: string;
    phone: string;
    content: string;
    type: "lead" | "message";
  }) => {
    if (!isConnected("notion") || !isAutomationEnabled("notion", "page_per_lead")) {
      return;
    }

    console.log("Sincronizando com Notion:", data);
    return true;
  };

  const syncToDrive = async (file: File | string, metadata: any) => {
    if (!isConnected("google_drive") || !isAutomationEnabled("google_drive", "auto_save_media")) {
      return;
    }

    console.log("Sincronizando com Google Drive:", metadata);
    return true;
  };

  return {
    syncToSheets,
    syncToNotion,
    syncToDrive,
    isConnected,
    isAutomationEnabled
  };
}
