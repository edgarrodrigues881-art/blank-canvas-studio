import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Catalog of beta features that can be toggled per-user from the BackOffice.
 * Add new entries here as features go through beta.
 */
export const BETA_FEATURES = [
  {
    key: "assistant",
    label: "Assistente de IA",
    description: "Habilita o módulo de Assistente (auto-resposta com IA) no menu Automação.",
  },
  {
    key: "mass_inject",
    label: "Adição em Massa",
    description: "Habilita a ferramenta de Adição em Massa em grupos do WhatsApp.",
  },
] as const;

export type BetaFeatureKey = (typeof BETA_FEATURES)[number]["key"];

/**
 * Returns the list of beta features unlocked for the current user.
 * Cached for 5 minutes — features rarely change at runtime.
 */
export function useBetaFeatures() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["beta-features", user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as string[];
      const { data, error } = await supabase
        .from("profiles")
        .select("beta_features")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        console.warn("[useBetaFeatures] error:", error.message);
        return [] as string[];
      }
      return ((data as any)?.beta_features ?? []) as string[];
    },
    enabled: !!user?.id,
    staleTime: 300_000,
  });

  return {
    features: query.data ?? [],
    loaded: !query.isLoading,
    has: (key: BetaFeatureKey) => (query.data ?? []).includes(key),
  };
}
