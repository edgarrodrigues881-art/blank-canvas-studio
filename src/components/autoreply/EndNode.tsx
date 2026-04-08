import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CircleStop } from "lucide-react";
import type { FlowNodeData } from "./types";

const actionLabels: Record<string, string> = {
  end_flow: "Encerrar fluxo",
  wait_response: "Aguardar resposta",
  transfer_human: "Transferir humano",
};

export function EndNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <div
      className={`rounded-lg overflow-hidden transition-all duration-150 w-[180px]
        ${selected
          ? "ring-2 ring-rose-400/70 shadow-[0_0_24px_-4px_rgba(244,63,94,0.25)]"
          : "ring-1 ring-white/[0.06] shadow-md hover:ring-white/[0.1]"
        }`}
      style={{ background: "hsl(var(--card))" }}
    >
      <div className="h-1 bg-rose-500" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-2.5 !h-2.5 !bg-rose-400 !border-[1.5px] !border-card !rounded-full !-left-1.5"
      />
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-5 h-5 rounded bg-rose-500/15 flex items-center justify-center shrink-0">
          <CircleStop className="w-3 h-3 text-rose-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground/90 leading-none">{d.label}</p>
          <p className="text-[9px] text-muted-foreground/50 mt-0.5">{actionLabels[d.action || "end_flow"]}</p>
        </div>
      </div>
    </div>
  );
}
