import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Sparkles, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { FlowNodeData } from "./types";

export function AINode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-150 w-[260px] border bg-card
        ${selected
          ? "border-cyan-500/60 shadow-[0_0_0_3px_hsl(189_94%_43%/0.15)] shadow-xl"
          : "border-border/50 shadow-lg hover:border-cyan-500/30 hover:shadow-xl"
        }`}
    >
      <div className="h-[3px] bg-gradient-to-r from-cyan-500 to-cyan-400" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-cyan-500 !border-[2px] !border-card !rounded-full !-left-1.5"
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-cyan-500/12 flex items-center justify-center shrink-0 border border-cyan-500/15">
          <Bot className="w-4 h-4 text-cyan-400" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-none truncate">{d.label}</p>
          <div className="flex items-center gap-1 mt-1">
            <Sparkles className="w-2.5 h-2.5 text-cyan-400/50" />
            <span className="text-[10px] text-muted-foreground/60">Resposta via IA</span>
          </div>
        </div>
      </div>

      {/* Prompt preview */}
      {d.aiPrompt && (
        <div className="px-4 pb-3">
          <p className="text-[11px] text-muted-foreground/60 line-clamp-2 leading-relaxed bg-muted/20 rounded-lg px-2.5 py-1.5">
            {d.aiPrompt}
          </p>
        </div>
      )}

      {/* Stats bar removida — métrica unificada na lista de fluxos */}

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-3 !h-3 !bg-cyan-500 !border-[2px] !border-card !rounded-full !-right-1.5"
      />
    </div>
  );
}
