import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CircleStop } from "lucide-react";
import type { FlowNodeData } from "./types";

const actionLabels: Record<string, string> = {
  end_flow: "Encerrar fluxo",
  wait_response: "Aguardar resposta",
  transfer_human: "Transferir para humano",
};

export function EndNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <div
      className={`group rounded-2xl bg-card/95 backdrop-blur-sm min-w-[210px] transition-all duration-200 ease-out
        ${selected
          ? "shadow-[0_0_0_2px_hsl(0_84%_60%),0_8px_32px_-8px_hsl(0_84%_60%/0.25)] scale-[1.02]"
          : "shadow-[0_2px_12px_-4px_hsl(var(--foreground)/0.08)] hover:shadow-[0_4px_20px_-6px_hsl(var(--foreground)/0.12)] hover:scale-[1.01] border border-border/40"
        }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-5 !h-5 !bg-rose-500 !border-[3px] !border-card !rounded-full !shadow-[0_0_8px_hsl(0_84%_60%/0.35)] !-left-2.5"
      />
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center ring-1 ring-rose-500/20">
          <CircleStop className="w-4 h-4 text-rose-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-tight">{d.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{actionLabels[d.action || "end_flow"]}</p>
        </div>
      </div>
    </div>
  );
}
