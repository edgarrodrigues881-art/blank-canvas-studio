import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageCircleReply, Clock } from "lucide-react";
import type { FlowNodeData } from "./types";

export function WaitResponseNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const timeout = d.waitTimeoutSeconds ?? 0;

  return (
    <div
      className={`rounded-lg overflow-hidden transition-all duration-150 w-[220px]
        ${selected
          ? "ring-2 ring-blue-400/70 shadow-[0_0_24px_-4px_hsl(var(--primary)/0.3)]"
          : "ring-1 ring-white/[0.06] shadow-md hover:ring-white/[0.1]"
        }`}
      style={{ background: "hsl(var(--card))" }}
    >
      <div className="h-1 bg-blue-500" />
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-2.5 !h-2.5 !bg-blue-500 !border-[1.5px] !border-card !rounded-full !-left-1.5"
      />

      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-5 h-5 rounded bg-blue-500/15 flex items-center justify-center shrink-0">
          <MessageCircleReply className="w-3 h-3 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground/90 leading-none truncate">{d.label}</p>
          <p className="text-[9px] text-muted-foreground/50 mt-0.5">
            Espera resposta {d.saveReplyAs ? `→ {${d.saveReplyAs}}` : ""}
          </p>
        </div>
        {timeout > 0 && (
          <span className="flex items-center gap-0.5 text-[8px] text-muted-foreground/40 bg-white/[0.03] px-1 py-0.5 rounded">
            <Clock className="w-2 h-2" /> {timeout}s
          </span>
        )}
      </div>

      <div className="border-t border-white/[0.04] px-2.5 py-1.5 space-y-1">
        <div className="relative flex items-center">
          <span className="flex-1 text-[9px] text-foreground/60 px-1">Quando responder</span>
          <Handle
            type="source"
            position={Position.Right}
            id="out-reply"
            className="!w-2.5 !h-2.5 !bg-blue-500 !border-[1.5px] !border-card !rounded-full !-right-1.5"
          />
        </div>
        <div className="relative flex items-center">
          <span className="flex-1 text-[9px] text-muted-foreground/50 px-1">Se não responder</span>
          <Handle
            type="source"
            position={Position.Right}
            id="out-timeout"
            className="!w-2.5 !h-2.5 !bg-muted !border-[1.5px] !border-card !rounded-full !-right-1.5"
            style={{ top: "auto", bottom: 8 }}
          />
        </div>
      </div>
    </div>
  );
}
