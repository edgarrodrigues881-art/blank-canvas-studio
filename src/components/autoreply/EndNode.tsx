import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CircleStop, UserCheck, Clock } from "lucide-react";
import type { FlowNodeData } from "./types";

const actionMeta: Record<string, { label: string; icon: any }> = {
  end_flow:       { label: "Encerrar fluxo",      icon: CircleStop },
  wait_response:  { label: "Aguardar resposta",   icon: Clock },
  transfer_human: { label: "Transferir humano",   icon: UserCheck },
};

export function EndNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const meta = actionMeta[d.action || "end_flow"] || actionMeta.end_flow;
  const Icon = meta.icon;

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-150 w-[240px] border bg-card
        ${selected
          ? "border-rose-500/60 shadow-[0_0_0_3px_hsl(347_77%_50%/0.15)] shadow-xl"
          : "border-border/50 shadow-lg hover:border-rose-500/30 hover:shadow-xl"
        }`}
    >
      <div className="h-[3px] bg-gradient-to-r from-rose-500 to-rose-400" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-rose-500 !border-[2px] !border-card !rounded-full !-left-1.5"
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-rose-500/12 flex items-center justify-center shrink-0 border border-rose-500/15">
          <CircleStop className="w-4 h-4 text-rose-400" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-none">{d.label}</p>
          <div className="flex items-center gap-1 mt-1">
            <Icon className="w-2.5 h-2.5 text-rose-400/60" />
            <span className="text-[10px] text-muted-foreground/60">{meta.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
