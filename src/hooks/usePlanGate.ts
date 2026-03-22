import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type PlanState = "noPlan" | "active" | "expired" | "suspended";

// Plans that include WhatsApp reports natively
const PLANS_WITH_REPORTS: Record<string, boolean> = {
  Trial: true,
  Pro: true,
  Scale: true,
  Elite: true,
};

export function usePlanGate() {
  const { session } = useAuth();

  // Single query for all subscriptions — split in JS to avoid 2 round-trips
  const { data: allSubs } = useQuery({
    queryKey: ["my_subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("plan_name, plan_price, max_instances, expires_at")
        .eq("user_id", session!.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!session,
    staleTime: 60_000,
  });

  const subscription = useMemo(() =>
    allSubs?.find(s => s.plan_name !== "Relatórios WhatsApp") ?? null,
  [allSubs]);

  const notificationSub = useMemo(() =>
    allSubs?.find(s => s.plan_name === "Relatórios WhatsApp") ?? null,
  [allSubs]);

  const { data: profile } = useQuery({
    queryKey: ["my_profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("status, instance_override, notificacao_liberada")
        .eq("id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!session,
    staleTime: 60_000,
  });

  const planState: PlanState = useMemo(() => {
    if (profile?.status === "suspended" || profile?.status === "cancelled") return "suspended";
    if (!subscription) return "noPlan";
    if (new Date(subscription.expires_at) < new Date()) return "expired";
    return "active";
  }, [subscription, profile]);

  const isBlocked = planState !== "active";

  // Plan natively includes reports (Scale, Elite)
  const planIncludesReports = useMemo(() => {
    if (planState !== "active" || !subscription) return false;
    return !!PLANS_WITH_REPORTS[subscription.plan_name];
  }, [planState, subscription]);

  // Notification addon active (separate subscription or admin override)
  const notificationAddonActive = useMemo(() => {
    if (profile?.notificacao_liberada) return true;
    if (!notificationSub) return false;
    return new Date(notificationSub.expires_at) >= new Date();
  }, [notificationSub, profile]);

  // Can use WhatsApp reports: plan includes it, addon active, or admin override
  const canUseReports = planIncludesReports || notificationAddonActive;

  // Max notification instances (always 1 when allowed)
  const maxNotificationInstances = canUseReports ? 1 : 0;

  const blockReason = useMemo(() => {
    switch (planState) {
      case "noPlan": return "Você não possui um plano ativo. Contrate um plano para usar esta funcionalidade.";
      case "expired": return "Seu plano expirou. Renove para continuar usando.";
      case "suspended": return "Sua conta está suspensa. Entre em contato com o suporte.";
      default: return "";
    }
  }, [planState]);

  const planBadgeText = useMemo(() => {
    if (planState === "noPlan") return "Sem plano";
    if (planState === "expired") return "Plano vencido";
    if (planState === "suspended") return "Conta suspensa";
    return null;
  }, [planState]);

  return {
    planState,
    isBlocked,
    blockReason,
    planBadgeText,
    subscription,
    profile,
    maxInstances: (subscription?.max_instances ?? 0) + (profile?.instance_override ?? 0),
    planIncludesReports,
    notificationAddonActive,
    notificationSub,
    canUseReports,
    maxNotificationInstances,
  };
}
