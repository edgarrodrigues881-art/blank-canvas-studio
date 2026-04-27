import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageCircleReply, Clock, CheckCircle, XCircle } from "lucide-react";
import type { FlowNodeData } from "./types";

export function WaitResponseNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const timeout = d.waitTimeoutSeconds ?? 0;

  const formatTimeout = (s: number) => {
    if (s >= 3600) return `${Math.floor(s / 3600)}h`;
    if (s >= 60) return `${Math.floor(s / 60)}min`;
    return `${s}s`;
  };

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-150 w-[260px] border bg-card
        ${selected
          ? "border-sky-500/60 shadow-[0_0_0_3px_hsl(199_89%_48%/0.15)] shadow-xl"
          : "border-border/50 shadow-lg hover:border-sky-500/30 hover:shadow-xl"
        }`}
    >
      <div className="h-[3px] bg-gradient-to-r from-sky-500 to-sky-400" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-sky-500 !border-[2px] !border-card !rounded-full !-left-1.5"
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-sky-500/12 flex items-center justify-center shrink-0 border border-sky-500/15">
          <MessageCircleReply className="w-4 h-4 text-sky-400" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-none truncate">{d.label}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {d.saveReplyAs ? `Salvar em {${d.saveReplyAs}}` : "Aguarda resposta"}
          </p>
        </div>
        {timeout > 0 && (
          <div className="flex items-center gap-1 bg-sky-500/8 border border-sky-500/20 px-2 py-1 rounded-lg shrink-0">
            <Clock className="w-2.5 h-2.5 text-sky-400" />
            <span className="text-[10px] text-sky-400 font-medium">{formatTimeout(timeout)}</span>
          </div>
        )}
      </div>

      {/* Output branches */}
      <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
        <div className="relative flex items-center">
          <div className="flex-1 text-[11px] font-medium py-1.5 px-2.5 rounded-lg bg-sky-500/8 text-sky-400 border border-sky-500/20 flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 shrink-0" />
            <span>Quando responder</span>
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="out-reply"
            className="!w-3 !h-3 !bg-sky-500 !border-[2px] !border-card !rounded-full !-right-1.5"
          />
        </div>
        <div className="relative flex items-center">
          <div className="flex-1 text-[11px] font-medium py-1.5 px-2.5 rounded-lg bg-muted/20 text-muted-foreground/50 border border-border/30 flex items-center gap-1.5">
            <XCircle className="w-3 h-3 shrink-0" />
            <span>Se não responder</span>
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="out-timeout"
            className="!w-3 !h-3 !bg-muted-foreground/50 !border-[2px] !border-card !rounded-full !-right-1.5"
          />
        </div>
      </div>
    </div>
  );
}
