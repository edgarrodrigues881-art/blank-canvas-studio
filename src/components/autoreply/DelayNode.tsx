import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Timer } from "lucide-react";
import type { FlowNodeData } from "./types";

export function DelayNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const seconds = d.delaySeconds ?? 5;

  const formatDelay = (s: number) => {
    if (s >= 60) {
      const min = Math.floor(s / 60);
      const sec = s % 60;
      return sec > 0 ? `${min}min ${sec}s` : `${min}min`;
    }
    return `${s}s`;
  };

  return (
    <div
      className={`group rounded-xl bg-card border transition-all duration-200 ease-out min-w-[200px]
        ${selected
          ? "border-amber-500/60 shadow-[0_0_20px_-4px_hsl(38_92%_50%/0.2)] scale-[1.01]"
          : "border-border/50 shadow-sm hover:shadow-md hover:border-border/70"
        }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-card !rounded-full !shadow-[0_0_6px_hsl(38_92%_50%/0.3)] !-left-1.5"
      />
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Timer className="w-3 h-3 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight">{d.label}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Aguardar <span className="font-mono text-amber-500/80 font-semibold">{formatDelay(seconds)}</span>
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-card !rounded-full !shadow-[0_0_6px_hsl(38_92%_50%/0.3)] !-right-1.5"
      />
    </div>
  );
}
