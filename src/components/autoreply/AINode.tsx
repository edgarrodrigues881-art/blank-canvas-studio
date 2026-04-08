import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";
import type { FlowNodeData } from "./types";

export function AINode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;

  return (
    <div
      className={`rounded-lg overflow-hidden transition-all duration-150 w-[200px]
        ${selected
          ? "ring-2 ring-cyan-400/70 shadow-[0_0_24px_-4px_rgba(34,211,238,0.3)]"
          : "ring-1 ring-white/[0.06] shadow-md hover:ring-white/[0.1]"
        }`}
      style={{ background: "hsl(var(--card))" }}
    >
      <div className="h-1 bg-cyan-500" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-2.5 !h-2.5 !bg-cyan-400 !border-[1.5px] !border-card !rounded-full !-left-1.5"
      />

      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-5 h-5 rounded bg-cyan-500/15 flex items-center justify-center shrink-0">
          <Bot className="w-3 h-3 text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground/90 leading-none truncate">{d.label}</p>
          <p className="text-[9px] text-muted-foreground/50 mt-0.5">Resposta IA</p>
        </div>
      </div>

      {d.aiPrompt && (
        <div className="px-3 pb-2">
          <p className="text-[9px] text-foreground/40 line-clamp-2 leading-relaxed">{d.aiPrompt}</p>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-2.5 !h-2.5 !bg-cyan-400 !border-[1.5px] !border-card !rounded-full !-right-1.5"
      />
    </div>
  );
}
