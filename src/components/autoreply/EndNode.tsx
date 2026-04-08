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
      className={`group rounded-xl bg-card border transition-all duration-200 ease-out min-w-[200px]
        ${selected
          ? "border-rose-500/60 shadow-[0_0_20px_-4px_hsl(0_84%_60%/0.2)] scale-[1.01]"
          : "border-border/50 shadow-sm hover:shadow-md hover:border-border/70"
        }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-rose-500 !border-2 !border-card !rounded-full !shadow-[0_0_6px_hsl(0_84%_60%/0.3)] !-left-1.5"
      />
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <div className="w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center">
          <CircleStop className="w-3 h-3 text-rose-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight">{d.label}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{actionLabels[d.action || "end_flow"]}</p>
        </div>
      </div>
    </div>
  );
}
