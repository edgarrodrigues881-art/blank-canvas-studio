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
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, variables) => {
      // Only invalidate the minimum necessary queries based on action
      qc.invalidateQueries({ queryKey: ["warmup_cycles"] });
      
      // Heavy queries only for start/stop which change structural data
      if (variables.action === "start" || variables.action === "stop") {
        qc.invalidateQueries({ queryKey: ["warmup_cycle_device"] });
        qc.invalidateQueries({ queryKey: ["warmup_instance_groups"] });
        qc.invalidateQueries({ queryKey: ["warmup_audit_logs"] });
        qc.invalidateQueries({ queryKey: ["warmup_jobs"] });
      }
    },
  });
}
