import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FeatureControl {
  id: string;
  feature_key: string;
  feature_name: string;
  feature_description: string;
  feature_icon: string;
  status: string;
  maintenance_message: string | null;
  route_path: string | null;
  updated_at: string;
  updated_by: string | null;
}

export function useFeatureControls() {
  const queryClient = useQueryClient();

  const { data: features = [], isLoading } = useQuery({
    queryKey: ["feature-controls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_controls" as any)
        .select("*")
        .order("feature_name");
      if (error) throw error;
      return (data || []) as unknown as FeatureControl[];
    },
    staleTime: 1000 * 30,
  });

  const updateFeature = useMutation({
    mutationFn: async (updates: Partial<FeatureControl> & { id: string }) => {
      const { id, ...rest } = updates;
      const { error } = await (supabase
        .from("feature_controls" as any)
        .update({ ...rest, updated_at: new Date().toISOString() } as any)
        .eq("id", id) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-controls"] });
    },
  });

  const isFeatureBlocked = (routePath: string): FeatureControl | null => {
    const feature = features.find(f => {
      if (!f.route_path) return false;
      if (routePath === f.route_path) return true;
      if (routePath.startsWith(f.route_path + "/")) return true;
      return false;
    });
    if (feature && feature.status !== "active") return feature;
    return null;
  };

  const getFeatureByKey = (key: string): FeatureControl | undefined => {
    return features.find(f => f.feature_key === key);
  };

  return { features, isLoading, updateFeature, isFeatureBlocked, getFeatureByKey };
}
