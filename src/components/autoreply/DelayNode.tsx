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
      className={`rounded-xl overflow-hidden transition-all duration-150 w-[240px] border bg-card
        ${selected
          ? "border-orange-500/60 shadow-[0_0_0_3px_hsl(25_95%_53%/0.15)] shadow-xl"
          : "border-border/50 shadow-lg hover:border-orange-500/30 hover:shadow-xl"
        }`}
    >
      <div className="h-[3px] bg-gradient-to-r from-orange-500 to-orange-400" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-orange-500 !border-[2px] !border-card !rounded-full !-left-1.5"
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-orange-500/12 flex items-center justify-center shrink-0 border border-orange-500/15">
          <Timer className="w-4 h-4 text-orange-400" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-none">{d.label}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Aguardar antes de continuar</p>
        </div>
        <div className="flex items-center gap-1 bg-orange-500/8 border border-orange-500/20 px-2.5 py-1.5 rounded-lg shrink-0">
          <span className="text-[13px] font-bold text-orange-400 font-mono">{formatDelay(seconds)}</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-3 !h-3 !bg-orange-500 !border-[2px] !border-card !rounded-full !-right-1.5"
      />
    </div>
  );
}
