import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import type { FlowNodeData } from "./types";

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const conditions = d.conditions || [];

  return (
    <div
      className={`rounded-lg overflow-hidden transition-all duration-150 w-[220px]
        ${selected
          ? "ring-2 ring-violet-400/70 shadow-[0_0_24px_-4px_rgba(139,92,246,0.25)]"
          : "ring-1 ring-white/[0.06] shadow-md hover:ring-white/[0.1]"
        }`}
      style={{ background: "hsl(var(--card))" }}
    >
      <div className="h-1 bg-violet-500" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-2.5 !h-2.5 !bg-violet-400 !border-[1.5px] !border-card !rounded-full !-left-1.5"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-5 h-5 rounded bg-violet-500/15 flex items-center justify-center shrink-0">
          <GitBranch className="w-3 h-3 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground/90 leading-none truncate">{d.label}</p>
          <p className="text-[9px] text-muted-foreground/50 mt-0.5">
            {conditions.length === 0 ? "Sem condições" : `${conditions.length} condição${conditions.length !== 1 ? "ões" : ""}`}
          </p>
        </div>
      </div>

      {/* Branches */}
      <div className="border-t border-white/[0.04] px-2.5 py-1.5 space-y-1">
        {conditions.map((cond, idx) => (
          <div key={cond.id} className="relative flex items-center">
            <div className="flex-1 text-[9px] font-medium py-1 px-2 rounded bg-violet-500/8 text-violet-400/70 border border-violet-500/10">
              <span className="text-[7px] uppercase text-violet-500/40 mr-1">SE</span>
              {cond.label || `Condição ${idx + 1}`}
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id={`cond-${cond.id}`}
              className="!w-2.5 !h-2.5 !bg-violet-400 !border-[1.5px] !border-card !rounded-full !-right-1.5"
            />
          </div>
        ))}
        <div className="relative flex items-center">
          <div className="flex-1 text-[9px] font-medium py-1 px-2 rounded bg-white/[0.02] text-muted-foreground/40 border border-white/[0.04]">
            <span className="text-[7px] uppercase text-muted-foreground/30 mr-1">SENÃO</span>
            Padrão
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="else"
            className="!w-2.5 !h-2.5 !bg-muted-foreground/40 !border-[1.5px] !border-card !rounded-full !-right-1.5"
          />
        </div>
      </div>
    </div>
  );
}
