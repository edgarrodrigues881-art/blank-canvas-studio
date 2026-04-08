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
      className={`rounded-lg overflow-hidden transition-all duration-150 w-[180px]
        ${selected
          ? "ring-2 ring-amber-400/70 shadow-[0_0_24px_-4px_rgba(251,191,36,0.25)]"
          : "ring-1 ring-white/[0.06] shadow-md hover:ring-white/[0.1]"
        }`}
      style={{ background: "hsl(var(--card))" }}
    >
      <div className="h-1 bg-amber-500" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-2.5 !h-2.5 !bg-amber-400 !border-[1.5px] !border-card !rounded-full !-left-1.5"
      />
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-5 h-5 rounded bg-amber-500/15 flex items-center justify-center shrink-0">
          <Timer className="w-3 h-3 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground/90 leading-none">{d.label}</p>
          <p className="text-[9px] text-muted-foreground/50 mt-0.5">
            <span className="font-mono text-amber-400/70 font-semibold">{formatDelay(seconds)}</span>
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-2.5 !h-2.5 !bg-amber-400 !border-[1.5px] !border-card !rounded-full !-right-1.5"
      />
    </div>
  );
}
