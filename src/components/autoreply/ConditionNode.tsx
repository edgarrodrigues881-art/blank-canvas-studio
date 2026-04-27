import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import type { FlowNodeData } from "./types";

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const conditions = d.conditions || [];

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-150 w-[260px] border bg-card
        ${selected
          ? "border-violet-500/60 shadow-[0_0_0_3px_hsl(263_70%_50%/0.15)] shadow-xl"
          : "border-border/50 shadow-lg hover:border-violet-500/30 hover:shadow-xl"
        }`}
    >
      <div className="h-[3px] bg-gradient-to-r from-violet-500 to-violet-400" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-violet-500 !border-[2px] !border-card !rounded-full !-left-1.5"
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-violet-500/12 flex items-center justify-center shrink-0 border border-violet-500/15">
          <GitBranch className="w-4 h-4 text-violet-400" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-none truncate">{d.label}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {conditions.length === 0 ? "Sem condições" : `${conditions.length} condição${conditions.length !== 1 ? "ões" : ""}`}
          </p>
        </div>
      </div>

      {/* Branches */}
      <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
        {conditions.map((cond, idx) => (
          <div key={cond.id} className="relative flex items-center">
            <div className="flex-1 text-[11px] font-medium py-1.5 px-2.5 rounded-lg bg-violet-500/8 text-violet-400 border border-violet-500/20 flex items-center gap-1.5">
              <span className="text-[9px] uppercase text-violet-500/50 font-semibold shrink-0">SE</span>
              <span className="truncate">{cond.label || `Condição ${idx + 1}`}</span>
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id={`cond-${cond.id}`}
              className="!w-3 !h-3 !bg-violet-500 !border-[2px] !border-card !rounded-full !-right-1.5"
            />
          </div>
        ))}
        <div className="relative flex items-center">
          <div className="flex-1 text-[11px] font-medium py-1.5 px-2.5 rounded-lg bg-muted/20 text-muted-foreground/50 border border-border/30 flex items-center gap-1.5">
            <span className="text-[9px] uppercase text-muted-foreground/40 font-semibold shrink-0">SENÃO</span>
            <span>Padrão</span>
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="else"
            className="!w-3 !h-3 !bg-muted-foreground/50 !border-[2px] !border-card !rounded-full !-right-1.5"
          />
        </div>
      </div>
    </div>
  );
}
