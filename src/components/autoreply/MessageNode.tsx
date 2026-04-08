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
      className={`group rounded-xl bg-card border transition-all duration-200 ease-out min-w-[240px] max-w-[300px]
        ${selected
          ? "border-primary/60 shadow-[0_0_20px_-4px_hsl(var(--primary)/0.2)] scale-[1.01]"
          : "border-border/50 shadow-sm hover:shadow-md hover:border-border/70"
        }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-primary !border-2 !border-card !rounded-full !shadow-[0_0_6px_hsl(var(--primary)/0.3)] !-left-1.5"
      />

      {/* Header */}
      <div className={`flex items-center gap-2 px-3.5 py-2.5 border-b ${selected ? "border-primary/20" : "border-border/30"}`}>
        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
          <MessageSquare className="w-3 h-3 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight truncate">{d.label}</p>
          {isUsingModel && (
            <div className="flex items-center gap-1 mt-0.5">
              <FileText className="w-2.5 h-2.5 text-primary/40" />
              <span className="text-[9px] text-primary/40 font-medium truncate">{d.templateName}</span>
            </div>
          )}
        </div>
        {d.delay && d.delay > 0 ? (
          <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground/50 bg-muted/20 px-1.5 py-0.5 rounded">
            <Clock className="w-2.5 h-2.5" /> {d.delay}s
          </span>
        ) : null}
      </div>

      {/* Body */}
      <div className="px-3.5 py-2.5 space-y-1">
        {hasImage && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
            <Image className="w-3 h-3" />
            <span>Imagem anexada</span>
          </div>
        )}
        {d.text && (
          <p className={`text-[10px] text-foreground/50 whitespace-pre-line leading-relaxed ${isUsingModel ? '' : 'line-clamp-2'}`}>
            {d.text.replace(/\{(\w+)\}/g, (_, v) => `«${v}»`)}
          </p>
        )}
      </div>

      {/* Buttons */}
      {hasButtons && (
        <div className="border-t border-border/20 px-3 py-2 space-y-1">
          {d.buttons!.map((btn) => (
            <div key={btn.id} className="relative flex items-center">
              <div className="flex-1 text-[10px] font-medium text-center py-1 px-2 rounded-md bg-primary/5 text-primary/70 border border-primary/10 transition-colors hover:bg-primary/8">
                {btn.label}
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={`btn-${btn.id}`}
                className="!w-3 !h-3 !bg-primary !border-2 !border-card !rounded-full !-right-1.5 !shadow-[0_0_6px_hsl(var(--primary)/0.3)]"
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
          className="!w-3 !h-3 !bg-primary !border-2 !border-card !rounded-full !shadow-[0_0_6px_hsl(var(--primary)/0.3)] !-right-1.5"
        />
      )}
    </div>
  );
}
