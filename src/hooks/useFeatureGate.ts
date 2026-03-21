import { useFeatureControls } from "@/hooks/useFeatureControls";
import { toast } from "sonner";

/**
 * Hook that provides a gate function to check if a feature is available.
 * Use before executing actions tied to a feature (e.g., starting warmup, launching campaign).
 * Returns false and shows a toast when blocked.
 */
export function useFeatureGate() {
  const { features, isFeatureBlocked, getFeatureByKey } = useFeatureControls();

  /**
   * Check if a feature is available by route path.
   * Returns true if available, false if blocked.
   */
  const checkRoute = (routePath: string): boolean => {
    const blocked = isFeatureBlocked(routePath);
    if (blocked) {
      toast.error(`${blocked.feature_name} está em manutenção`, {
        description: blocked.maintenance_message || "Esta funcionalidade está temporariamente indisponível.",
      });
      return false;
    }
    return true;
  };

  /**
   * Check if a feature is available by feature key.
   * Returns true if available, false if blocked.
   */
  const checkKey = (key: string): boolean => {
    const feature = getFeatureByKey(key);
    if (feature && feature.status !== "active") {
      toast.error(`${feature.feature_name} está em manutenção`, {
        description: feature.maintenance_message || "Esta funcionalidade está temporariamente indisponível.",
      });
      return false;
    }
    return true;
  };

  return { checkRoute, checkKey, isFeatureBlocked, getFeatureByKey };
}
