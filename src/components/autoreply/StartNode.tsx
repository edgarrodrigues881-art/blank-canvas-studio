import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap, FileText, Image } from "lucide-react";
import type { FlowNodeData } from "./types";

const triggerLabels: Record<string, string> = {
  any_message: "Qualquer mensagem",
  keyword: "Palavra-chave",
  new_contact: "Novo contato",
  start_chat: "Início de atendimento",
  template: "Template",
};

export function StartNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const isTemplate = d.trigger === "template";
  const hasTemplateImage = isTemplate && !!d.imageUrl;
  const hasTemplateButtons = isTemplate && !!d.buttons && d.buttons.length > 0;

  return (
    <div
      className={`rounded-lg overflow-hidden transition-all duration-150 w-[220px]
        ${selected
          ? "ring-2 ring-emerald-400/70 shadow-[0_0_24px_-4px_rgba(52,211,153,0.3)]"
          : "ring-1 ring-white/[0.06] shadow-md hover:ring-white/[0.1]"
        }`}
      style={{ background: "hsl(var(--card))" }}
    >
      {/* Colored top bar */}
      <div className="h-1 bg-emerald-500" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-5 h-5 rounded bg-emerald-500/15 flex items-center justify-center shrink-0">
          {isTemplate ? (
            <FileText className="w-3 h-3 text-emerald-400" />
          ) : (
            <Zap className="w-3 h-3 text-emerald-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground/90 leading-none truncate">
            {isTemplate ? (d.templateName || "Template") : d.label}
          </p>
          <p className="text-[9px] text-muted-foreground/50 mt-0.5 truncate">
            {isTemplate ? "Template" : triggerLabels[d.trigger || "keyword"]}
          </p>
        </div>
      </div>

      {isTemplate ? (
        <>
          <div className="px-3 pb-2 space-y-1">
            {hasTemplateImage && (
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground/40">
                <Image className="w-2.5 h-2.5" />
                <span>Imagem</span>
              </div>
            )}
            {d.text && (
              <p className="text-[9px] text-foreground/40 whitespace-pre-line leading-relaxed line-clamp-2">
                {d.text.replace(/\{(\w+)\}/g, (_, v) => `«${v}»`)}
              </p>
            )}
          </div>

          {hasTemplateButtons ? (
            <div className="border-t border-white/[0.04] px-2.5 py-1.5 space-y-1">
              {d.buttons!.map((btn) => (
                <div key={btn.id} className="relative flex items-center">
                  <div className="flex-1 text-[9px] font-medium text-center py-1 rounded bg-emerald-500/8 text-emerald-400/70 border border-emerald-500/10">
                    {btn.label}
                  </div>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`btn-${btn.id}`}
                    className="!w-2.5 !h-2.5 !bg-emerald-400 !border-[1.5px] !border-card !rounded-full !-right-1.5"
                  />
                </div>
              ))}
            </div>
          ) : (
            <Handle
              type="source"
              position={Position.Right}
              id="out"
              className="!w-2.5 !h-2.5 !bg-emerald-400 !border-[1.5px] !border-card !rounded-full !-right-1.5"
            />
          )}
        </>
      ) : (
        <>
          {d.trigger === "keyword" && d.keyword && (
            <div className="px-3 pb-2">
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/8 text-emerald-400/70 border border-emerald-500/10">
                "{d.keyword}"
              </span>
            </div>
          )}
          <Handle
            type="source"
            position={Position.Right}
            id="out"
            className="!w-2.5 !h-2.5 !bg-emerald-400 !border-[1.5px] !border-card !rounded-full !-right-1.5"
          />
        </>
      )}
    </div>
  );
}
