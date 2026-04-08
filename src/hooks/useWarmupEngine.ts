import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureGate } from "@/hooks/useFeatureGate";

export function useWarmupEngine() {
  const qc = useQueryClient();
  const { checkRoute } = useFeatureGate();

  return useMutation({
    mutationFn: async (params: {
      action: "start" | "pause" | "resume" | "stop";
      device_id?: string;
      chip_state?: string;
      days_total?: number;
      plan_id?: string;
      start_day?: number;
    }) => {
      // Block warmup actions when feature is in maintenance
      if (!checkRoute("/dashboard/warmup-v2")) {
        throw new Error("Funcionalidade em manutenção");
      }

      const { data, error } = await supabase.functions.invoke("warmup-engine", {
        body: params,
      });

      // supabase.functions.invoke wraps non-2xx as a generic error.
      // Extract the real message from the response context when available.
      if (error) {
        // The SDK puts the parsed body into `data` even on error
        if (data?.error) {
          const err = new Error(data.error) as any;
          err.code = data.code; // e.g. "NO_ACTIVE_PLAN"
          throw err;
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, variables) => {
      // Only invalidate the minimum necessary queries based on action
      qc.invalidateQueries({ queryKey: ["warmup_cycles"] });
      qc.invalidateQueries({ queryKey: ["warmup_cycle_device"] });
      qc.invalidateQueries({ queryKey: ["warmup_audit_logs"] });
      qc.invalidateQueries({ queryKey: ["warmup_jobs_scheduled"] });
      
      // Heavy queries only for start/stop which change structural data
      if (variables.action === "start" || variables.action === "stop") {
        qc.invalidateQueries({ queryKey: ["warmup_instance_groups"] });
        qc.invalidateQueries({ queryKey: ["warmup_jobs"] });
      }
    },
  });
}
