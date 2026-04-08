import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import type { FlowNodeData } from "./types";

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const conditions = d.conditions || [];

  return (
    <div
      className={`group rounded-xl bg-card border transition-all duration-200 ease-out min-w-[240px] max-w-[300px]
        ${selected
          ? "border-violet-500/60 shadow-[0_0_20px_-4px_hsl(262_83%_58%/0.2)] scale-[1.01]"
          : "border-border/50 shadow-sm hover:shadow-md hover:border-border/70"
        }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-card !rounded-full !shadow-[0_0_6px_hsl(262_83%_58%/0.3)] !-left-1.5"
      />

      {/* Header */}
      <div className={`flex items-center gap-2 px-3.5 py-2.5 border-b ${selected ? "border-violet-500/20" : "border-border/30"}`}>
        <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <GitBranch className="w-3 h-3 text-violet-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight truncate">{d.label}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {conditions.length === 0 ? "Nenhuma condição" : `${conditions.length} condição${conditions.length !== 1 ? "ões" : ""}`}
          </p>
        </div>
      </div>

      {/* Condition branches */}
      <div className="px-3 py-2 space-y-1">
        {conditions.map((cond, idx) => (
          <div key={cond.id} className="relative flex items-center">
            <div className="flex-1 text-[10px] font-medium py-1 px-2 rounded-md bg-violet-500/5 text-violet-400/80 border border-violet-500/10">
              <span className="text-[8px] uppercase text-violet-500/40 mr-1">Se</span>
              {cond.label || `Condição ${idx + 1}`}
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id={`cond-${cond.id}`}
              className="!w-3 !h-3 !bg-violet-500 !border-2 !border-card !rounded-full !-right-1.5 !shadow-[0_0_6px_hsl(262_83%_58%/0.3)]"
            />
          </div>
        ))}
        {/* Default / else branch */}
        <div className="relative flex items-center">
          <div className="flex-1 text-[10px] font-medium py-1 px-2 rounded-md bg-muted/20 text-muted-foreground/50 border border-border/20">
            <span className="text-[8px] uppercase text-muted-foreground/30 mr-1">Senão</span>
            Padrão
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="else"
            className="!w-3 !h-3 !bg-muted-foreground/40 !border-2 !border-card !rounded-full !-right-1.5"
          />
        </div>
      </div>
    </div>
  );
}
