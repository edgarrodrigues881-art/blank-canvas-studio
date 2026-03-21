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
        className="!w-5 !h-5 !bg-primary !border-[3px] !border-card !rounded-full !shadow-[0_0_8px_hsl(var(--primary)/0.35)] !-left-2.5"
      />

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
          <MessageSquare className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-tight truncate">{d.label}</p>
          {isUsingModel && (
            <div className="flex items-center gap-1 mt-0.5">
              <FileText className="w-2.5 h-2.5 text-primary/50" />
              <span className="text-[9px] text-primary/50 font-medium truncate">{d.templateName}</span>
            </div>
          )}
        </div>
        {d.delay && d.delay > 0 ? (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70 bg-muted/30 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" /> {d.delay}s
          </span>
        ) : null}
      </div>

      {/* Body */}
      <div className="px-4 pb-3 space-y-1.5">
        {hasImage && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
            <Image className="w-3 h-3" />
            <span>Imagem anexada</span>
          </div>
        )}
        {d.text && (
          <p className={`text-[11px] text-foreground/60 whitespace-pre-line leading-relaxed ${isUsingModel ? '' : 'line-clamp-2'}`}>
            {d.text.replace(/\{(\w+)\}/g, (_, v) => `«${v}»`)}
          </p>
        )}
      </div>

      {/* Buttons */}
      {hasButtons && (
        <div className="border-t border-border/30 px-3 py-2.5 space-y-1.5">
          {d.buttons!.map((btn) => (
            <div key={btn.id} className="relative flex items-center">
              <div className="flex-1 text-[11px] font-medium text-center py-1.5 px-3 rounded-lg bg-primary/6 text-primary/80 border border-primary/10 transition-colors hover:bg-primary/10">
                {btn.label}
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={`btn-${btn.id}`}
                className="!w-5 !h-5 !bg-primary !border-[3px] !border-card !rounded-full !-right-2.5 !shadow-[0_0_8px_hsl(var(--primary)/0.35)]"
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
          className="!w-5 !h-5 !bg-primary !border-[3px] !border-card !rounded-full !shadow-[0_0_8px_hsl(var(--primary)/0.35)] !-right-2.5"
        />
      )}
    </div>
  );
}
