import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import type { FlowNodeData } from "./types";

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const conditions = d.conditions || [];

  return (
    <div
      className={`group rounded-2xl bg-card/95 backdrop-blur-sm min-w-[250px] max-w-[320px] transition-all duration-200 ease-out
        ${selected
          ? "shadow-[0_0_0_2px_hsl(var(--primary)),0_8px_32px_-8px_hsl(var(--primary)/0.25)] scale-[1.02]"
          : "shadow-[0_2px_12px_-4px_hsl(var(--foreground)/0.08)] hover:shadow-[0_4px_20px_-6px_hsl(var(--foreground)/0.12)] hover:scale-[1.01] border border-border/40"
        }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-5 !h-5 !bg-violet-500 !border-[3px] !border-card !rounded-full !shadow-[0_0_8px_hsl(262_83%_58%/0.35)] !-left-2.5"
      />

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center ring-1 ring-violet-500/20">
          <GitBranch className="w-4 h-4 text-violet-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-tight truncate">{d.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {conditions.length === 0 ? "Nenhuma condição" : `${conditions.length} condição${conditions.length !== 1 ? "ões" : ""}`}
          </p>
        </div>
      </div>

      {/* Condition branches */}
      <div className="border-t border-border/30 px-3 py-2.5 space-y-1.5">
        {conditions.length > 0 ? (
          conditions.map((cond, idx) => (
            <div key={cond.id} className="relative flex items-center">
              <div className="flex-1 text-[11px] font-medium py-1.5 px-3 rounded-lg bg-violet-500/6 text-violet-400 border border-violet-500/10">
                <span className="text-[9px] uppercase text-violet-500/50 mr-1.5">Se</span>
                {cond.label || `Condição ${idx + 1}`}
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={`cond-${cond.id}`}
                className="!w-5 !h-5 !bg-violet-500 !border-[3px] !border-card !rounded-full !-right-2.5 !shadow-[0_0_8px_hsl(262_83%_58%/0.35)]"
              />
            </div>
          ))
        ) : null}
        {/* Default / else branch */}
        <div className="relative flex items-center">
          <div className="flex-1 text-[11px] font-medium py-1.5 px-3 rounded-lg bg-muted/30 text-muted-foreground/60 border border-border/20">
            <span className="text-[9px] uppercase text-muted-foreground/40 mr-1.5">Senão</span>
            Padrão
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="else"
            className="!w-5 !h-5 !bg-muted-foreground/50 !border-[3px] !border-card !rounded-full !-right-2.5 !shadow-[0_0_8px_hsl(var(--muted-foreground)/0.2)]"
          />
        </div>
      </div>
    </div>
  );
}
