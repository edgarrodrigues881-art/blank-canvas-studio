import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare, Image, Clock, FileText } from "lucide-react";
import type { FlowNodeData } from "./types";

export function MessageNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const hasImage = !!d.imageUrl;
  const hasButtons = d.buttons && d.buttons.length > 0;
  const isUsingModel = !!d.templateId;

  return (
    <div
      className={`rounded-lg overflow-hidden transition-all duration-150 w-[220px]
        ${selected
          ? "ring-2 ring-primary/70 shadow-[0_0_24px_-4px_hsl(var(--primary)/0.3)]"
          : "ring-1 ring-white/[0.06] shadow-md hover:ring-white/[0.1]"
        }`}
      style={{ background: "hsl(var(--card))" }}
    >
      {/* Colored top bar */}
      <div className="h-1 bg-primary" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-2.5 !h-2.5 !bg-primary !border-[1.5px] !border-card !rounded-full !-left-1.5"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-5 h-5 rounded bg-primary/15 flex items-center justify-center shrink-0">
          <MessageSquare className="w-3 h-3 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground/90 leading-none truncate">{d.label}</p>
          {isUsingModel ? (
            <div className="flex items-center gap-0.5 mt-0.5">
              <FileText className="w-2 h-2 text-primary/40" />
              <span className="text-[8px] text-primary/40 font-medium truncate">{d.templateName}</span>
            </div>
          ) : (
            <p className="text-[9px] text-muted-foreground/50 mt-0.5">Mensagem</p>
          )}
        </div>
        {d.delay && d.delay > 0 ? (
          <span className="flex items-center gap-0.5 text-[8px] text-muted-foreground/40 bg-white/[0.03] px-1 py-0.5 rounded">
            <Clock className="w-2 h-2" /> {d.delay}s
          </span>
        ) : null}
      </div>

      {/* Body */}
      {(hasImage || d.text) && (
        <div className="px-3 pb-2 space-y-0.5">
          {hasImage && (
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground/40">
              <Image className="w-2.5 h-2.5" />
              <span>Imagem</span>
            </div>
          )}
          {d.text && (
            <p className={`text-[9px] text-foreground/40 whitespace-pre-line leading-relaxed ${isUsingModel ? '' : 'line-clamp-2'}`}>
              {d.text.replace(/\{(\w+)\}/g, (_, v) => `«${v}»`)}
            </p>
          )}
        </div>
      )}

      {/* Buttons */}
      {hasButtons && (
        <div className="border-t border-white/[0.04] px-2.5 py-1.5 space-y-1">
          {d.buttons!.map((btn) => (
            <div key={btn.id} className="relative flex items-center">
              <div className="flex-1 text-[9px] font-medium text-center py-1 rounded bg-primary/8 text-primary/70 border border-primary/10">
                {btn.label}
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={`btn-${btn.id}`}
                className="!w-2.5 !h-2.5 !bg-primary !border-[1.5px] !border-card !rounded-full !-right-1.5"
              />
            </div>
          ))}
        </div>
      )}

      {/* Default output */}
      {!hasButtons && (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!w-2.5 !h-2.5 !bg-primary !border-[1.5px] !border-card !rounded-full !-right-1.5"
        />
      )}
    </div>
  );
}
