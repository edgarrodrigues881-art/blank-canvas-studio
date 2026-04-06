import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

// All permission keys mapped to their menu labels
export const PERMISSION_KEYS = {
  // CONEXÕES
  perm_dashboard: { label: "Dashboard", group: "Conexões" },
  perm_instances: { label: "Instâncias", group: "Conexões" },
  perm_send_message: { label: "Enviar Mensagem", group: "Conexões" },
  perm_campaigns: { label: "Campanhas", group: "Conexões" },
  perm_templates: { label: "Template", group: "Conexões" },
  perm_carousel_templates: { label: "Template Carrossel", group: "Conexões" },
  // AQUECIMENTO
  perm_warmup: { label: "Aquecimento", group: "Aquecimento" },
  perm_proxy: { label: "Proxy", group: "Aquecimento" },
  perm_chip_conversation: { label: "Conversa entre Chips", group: "Aquecimento" },
  perm_group_interaction: { label: "Interação de Grupos", group: "Aquecimento" },
  // CENTRAL DE ATENDIMENTO
  perm_conversations: { label: "Conversas", group: "Central de Atendimento" },
  perm_service_contacts: { label: "Base de Atendimento", group: "Central de Atendimento" },
  perm_schedules: { label: "Agendamentos", group: "Central de Atendimento" },
  perm_team: { label: "Equipe", group: "Central de Atendimento" },
  perm_ai_settings: { label: "IA", group: "Central de Atendimento" },
  // FERRAMENTAS
  perm_contacts: { label: "Meus Contatos", group: "Ferramentas" },
  perm_group_extractor: { label: "Extrator de Grupos", group: "Ferramentas" },
  perm_whatsapp_verifier: { label: "Verificador WhatsApp", group: "Ferramentas" },
  perm_prospection: { label: "Prospecção", group: "Ferramentas" },
  perm_group_join: { label: "Entrada em Grupos", group: "Ferramentas" },
  perm_mass_inject: { label: "Adição em Massa", group: "Ferramentas" },
  perm_welcome: { label: "Boas-vindas", group: "Ferramentas" },
  perm_groups: { label: "Grupos", group: "Ferramentas" },
  perm_autosave: { label: "Auto Save", group: "Ferramentas" },
  perm_report_wa: { label: "Relatório via WhatsApp", group: "Ferramentas" },
  // SUPORTE
  perm_my_plan: { label: "Meu Plano", group: "Suporte" },
  perm_community: { label: "Comunidade", group: "Suporte" },
  perm_help: { label: "Ajuda", group: "Suporte" },
} as const;

export type PermissionKey = keyof typeof PERMISSION_KEYS;

// Map routes to permission keys
const ROUTE_PERMISSION_MAP: Record<string, PermissionKey> = {
  "/dashboard": "perm_dashboard",
  "/dashboard/devices": "perm_instances",
  "/dashboard/campaigns": "perm_send_message",
  "/dashboard/campaign-list": "perm_campaigns",
  "/dashboard/templates": "perm_templates",
  "/dashboard/carousel-templates": "perm_carousel_templates",
  "/dashboard/warmup-v2": "perm_warmup",
  "/dashboard/proxy": "perm_proxy",
  "/dashboard/chip-conversation": "perm_chip_conversation",
  "/dashboard/group-interaction": "perm_group_interaction",
  "/dashboard/conversations": "perm_conversations",
  "/dashboard/service-contacts": "perm_service_contacts",
  "/dashboard/schedules": "perm_schedules",
  "/dashboard/team": "perm_team",
  "/dashboard/ai-settings": "perm_ai_settings",
  "/dashboard/contacts": "perm_contacts",
  "/dashboard/group-capture": "perm_group_extractor",
  "/dashboard/whatsapp-verifier": "perm_whatsapp_verifier",
  "/dashboard/prospeccao": "perm_prospection",
  "/dashboard/group-join": "perm_group_join",
  "/dashboard/mass-inject": "perm_mass_inject",
  "/dashboard/welcome": "perm_welcome",
  "/dashboard/groups": "perm_groups",
  "/dashboard/autosave": "perm_autosave",
  "/dashboard/reports/whatsapp": "perm_report_wa",
  "/dashboard/my-plan": "perm_my_plan",
  "/dashboard/community-warmup": "perm_community",
  "/dashboard/notifications": "perm_help",
};

export type PermissionValues = Record<PermissionKey, boolean>;

export interface PermissionPreset {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: Record<string, boolean>;
}

const ALL_TRUE: PermissionValues = Object.keys(PERMISSION_KEYS).reduce(
  (acc, key) => ({ ...acc, [key]: true }),
  {} as PermissionValues
);

export function usePermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<PermissionValues>(ALL_TRUE);
  const [permissionMode, setPermissionMode] = useState<"lock" | "hide">("lock");
  const [isOwner, setIsOwner] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      // Check if user is a team member (not owner)
      const { data: membership } = await supabase
        .from("team_members")
        .select("owner_id, role")
        .eq("member_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!membership) {
        // User is the owner — full access
        setIsOwner(true);
        setPermissions(ALL_TRUE);
        setLoading(false);
        return;
      }

      if (membership.role === "admin") {
        setIsOwner(false);
        setPermissions(ALL_TRUE);
        setLoading(false);
        return;
      }

      // Load permissions from team_permissions
      const { data: perms } = await supabase
        .from("team_permissions")
        .select("*")
        .eq("user_id", user.id)
        .eq("team_owner_id", membership.owner_id)
        .maybeSingle();

      if (perms) {
        const loaded: PermissionValues = { ...ALL_TRUE };
        for (const key of Object.keys(PERMISSION_KEYS) as PermissionKey[]) {
          loaded[key] = (perms as any)[key] ?? true;
        }
        setPermissions(loaded);
        setPermissionMode((perms.permission_mode as "lock" | "hide") || "lock");
      }

      setIsOwner(false);
      setLoading(false);
    };

    load();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("team-permissions-" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_permissions", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          if (payload.new) {
            const newPerms = payload.new;
            const loaded: PermissionValues = { ...ALL_TRUE };
            for (const key of Object.keys(PERMISSION_KEYS) as PermissionKey[]) {
              loaded[key] = newPerms[key] ?? true;
            }
            setPermissions(loaded);
            setPermissionMode(newPerms.permission_mode || "lock");
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const hasPermission = useCallback(
    (key: PermissionKey): boolean => {
      if (isOwner) return true;
      return permissions[key] ?? true;
    },
    [permissions, isOwner]
  );

  const hasRoutePermission = useCallback(
    (route: string): boolean => {
      if (isOwner) return true;
      const key = ROUTE_PERMISSION_MAP[route];
      if (!key) return true;
      return permissions[key] ?? true;
    },
    [permissions, isOwner]
  );

  return {
    permissions,
    permissionMode,
    isOwner,
    loading,
    hasPermission,
    hasRoutePermission,
    ROUTE_PERMISSION_MAP,
  };
}

// Hook for admins to manage member permissions
export function useManagePermissions(memberId: string | null, teamOwnerId: string | null) {
  const [permissions, setPermissions] = useState<PermissionValues>(ALL_TRUE);
  const [permissionMode, setPermissionMode] = useState<"lock" | "hide">("lock");
  const [presets, setPresets] = useState<PermissionPreset[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load presets
  useEffect(() => {
    supabase
      .from("permission_presets")
      .select("*")
      .then(({ data }) => {
        if (data) setPresets(data as any[]);
      });
  }, []);

  // Load member permissions
  useEffect(() => {
    if (!memberId || !teamOwnerId) return;
    setLoading(true);

    supabase
      .from("team_permissions")
      .select("*")
      .eq("user_id", memberId)
      .eq("team_owner_id", teamOwnerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const loaded: PermissionValues = { ...ALL_TRUE };
          for (const key of Object.keys(PERMISSION_KEYS) as PermissionKey[]) {
            loaded[key] = (data as any)[key] ?? true;
          }
          setPermissions(loaded);
          setPermissionMode((data.permission_mode as "lock" | "hide") || "lock");
        } else {
          setPermissions(ALL_TRUE);
          setPermissionMode("lock");
        }
        setLoading(false);
      });
  }, [memberId, teamOwnerId]);

  const togglePermission = useCallback((key: PermissionKey) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const selectAll = useCallback(() => {
    setPermissions(ALL_TRUE);
  }, []);

  const removeAll = useCallback(() => {
    const allFalse = Object.keys(PERMISSION_KEYS).reduce(
      (acc, key) => ({ ...acc, [key]: false }),
      {} as PermissionValues
    );
    setPermissions(allFalse);
  }, []);

  const applyPreset = useCallback((preset: PermissionPreset) => {
    const applied: PermissionValues = { ...ALL_TRUE };
    for (const [key, val] of Object.entries(preset.permissions)) {
      if (key in applied) {
        (applied as any)[key] = val;
      }
    }
    setPermissions(applied);
  }, []);

  const save = useCallback(async () => {
    if (!memberId || !teamOwnerId) return;
    setSaving(true);
    try {
      const payload: any = {
        user_id: memberId,
        team_owner_id: teamOwnerId,
        permission_mode: permissionMode,
        ...permissions,
      };

      const { error } = await supabase
        .from("team_permissions")
        .upsert(payload, { onConflict: "user_id,team_owner_id" });

      if (error) throw error;
      toast.success("Permissões salvas com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }, [memberId, teamOwnerId, permissions, permissionMode]);

  return {
    permissions,
    permissionMode,
    setPermissionMode,
    presets,
    loading,
    saving,
    togglePermission,
    selectAll,
    removeAll,
    applyPreset,
    save,
  };
}
