import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface IntegrationConfig {
  id: string;
  user_id: string;
  integration_id: string;
  is_connected: boolean;
  token?: string;
  sheet_id?: string;
  sheet_range?: string;
  notion_database_id?: string;
  drive_folder_id?: string;
  automations: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export function useIntegrationSettings() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState<Record<string, IntegrationConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Carregar integrações do usuário
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchIntegrations = async () => {
      try {
        const { data, error } = await supabase
          .from("user_integrations")
          .select("*")
          .eq("user_id", user.id);

        if (error) throw error;

        const integrationsMap: Record<string, IntegrationConfig> = {};
        (data || []).forEach((integration: any) => {
          integrationsMap[integration.integration_id] = integration;
        });

        setIntegrations(integrationsMap);
      } catch (err) {
        console.error("Erro ao carregar integrações:", err);
        toast.error("Erro ao carregar integrações");
      } finally {
        setLoading(false);
      }
    };

    fetchIntegrations();
  }, [user]);

  const saveIntegration = async (integrationId: string, config: Partial<IntegrationConfig>) => {
    if (!user) return;
    setSaving(true);

    try {
      const existing = integrations[integrationId];

      if (existing) {
        const { error } = await supabase
          .from("user_integrations")
          .update({
            ...config,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_integrations")
          .insert({
            user_id: user.id,
            integration_id: integrationId,
            is_connected: config.is_connected || false,
            token: config.token,
            sheet_id: config.sheet_id,
            sheet_range: config.sheet_range,
            notion_database_id: config.notion_database_id,
            drive_folder_id: config.drive_folder_id,
            automations: config.automations || {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      // Atualizar state local
      setIntegrations((prev) => ({
        ...prev,
        [integrationId]: {
          ...prev[integrationId],
          ...config,
          updated_at: new Date().toISOString(),
        } as IntegrationConfig,
      }));

      toast.success("Integração salva com sucesso!");
    } catch (err) {
      console.error("Erro ao salvar integração:", err);
      toast.error("Erro ao salvar integração");
    } finally {
      setSaving(false);
    }
  };

  const disconnectIntegration = async (integrationId: string) => {
    if (!user) return;
    setSaving(true);

    try {
      const existing = integrations[integrationId];
      if (!existing) return;

      const { error } = await supabase
        .from("user_integrations")
        .update({
          is_connected: false,
          token: null,
          sheet_id: null,
          notion_database_id: null,
          drive_folder_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) throw error;

      setIntegrations((prev) => ({
        ...prev,
        [integrationId]: {
          ...prev[integrationId],
          is_connected: false,
          token: undefined,
          sheet_id: undefined,
          notion_database_id: undefined,
          drive_folder_id: undefined,
        } as IntegrationConfig,
      }));

      toast.success("Integração desconectada!");
    } catch (err) {
      console.error("Erro ao desconectar integração:", err);
      toast.error("Erro ao desconectar integração");
    } finally {
      setSaving(false);
    }
  };

  const isConnected = (integrationId: string) => {
    return integrations[integrationId]?.is_connected || false;
  };

  const isAutomationEnabled = (integrationId: string, automationId: string) => {
    return integrations[integrationId]?.automations?.[automationId] || false;
  };

  const toggleAutomation = async (integrationId: string, automationId: string, enabled: boolean) => {
    if (!user) return;

    const config = integrations[integrationId];
    if (!config) return;

    const updatedAutomations = {
      ...config.automations,
      [automationId]: enabled,
    };

    await saveIntegration(integrationId, {
      automations: updatedAutomations,
    });
  };

  return {
    integrations,
    loading,
    saving,
    saveIntegration,
    disconnectIntegration,
    isConnected,
    isAutomationEnabled,
    toggleAutomation,
  };
}
