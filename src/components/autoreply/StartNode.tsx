import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap, FileText, Image, Hash } from "lucide-react";
import type { FlowNodeData } from "./types";

const triggerLabels: Record<string, string> = {
  any_message: "Qualquer mensagem",
  keyword:     "Palavra-chave",
  new_contact: "Novo contato",
  start_chat:  "Início de atendimento",
  template:    "Template",
};

export function StartNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const isTemplate = d.trigger === "template";
  const hasTemplateButtons = isTemplate && !!d.buttons && d.buttons.length > 0;

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-150 w-[260px] border bg-card
        ${selected
          ? "border-emerald-500/60 shadow-[0_0_0_3px_hsl(142_71%_45%/0.15)] shadow-xl"
          : "border-border/50 shadow-lg hover:border-emerald-500/30 hover:shadow-xl"
        }`}
    >
      <div className="h-[3px] bg-gradient-to-r from-emerald-500 to-emerald-400" />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/12 flex items-center justify-center shrink-0 border border-emerald-500/15">
          {isTemplate
            ? <FileText className="w-4 h-4 text-emerald-400" strokeWidth={1.8} />
            : <Zap className="w-4 h-4 text-emerald-400" strokeWidth={1.8} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-none truncate">
            {isTemplate ? (d.templateName || "Template") : d.label}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1 truncate">
            {isTemplate ? "Template de disparo" : triggerLabels[d.trigger || "keyword"]}
          </p>
        </div>
      </div>

      {/* Keyword badge */}
      {d.trigger === "keyword" && d.keyword && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 w-fit">
            <Hash className="w-3 h-3 text-emerald-400" />
            <span className="text-[11px] font-mono text-emerald-400 font-medium">{d.keyword}</span>
          </div>
        </div>
      )}

      {/* Template preview */}
      {isTemplate && d.text && (
        <div className="px-4 pb-3 space-y-1.5">
          {d.imageUrl && (
            <div className="flex items-center gap-1.5 bg-muted/30 rounded-lg px-2.5 py-1.5">
              <Image className="w-3 h-3 text-muted-foreground/60" />
              <span className="text-[10px] text-muted-foreground/70">Imagem</span>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground/60 line-clamp-2 leading-relaxed bg-muted/20 rounded-lg px-2.5 py-1.5">
            {d.text.replace(/\{(\w+)\}/g, (_, v) => `«${v}»`)}
          </p>
        </div>
      )}

      {/* Template buttons */}
      {hasTemplateButtons ? (
        <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
          {d.buttons!.map((btn) => (
            <div key={btn.id} className="relative flex items-center">
              <div className="flex-1 text-[11px] font-medium text-center py-1.5 rounded-lg bg-emerald-500/8 text-emerald-400 border border-emerald-500/20">
                {btn.label}
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={`btn-${btn.id}`}
                className="!w-3 !h-3 !bg-emerald-500 !border-[2px] !border-card !rounded-full !-right-1.5"
              />
            </div>
          ))}
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!w-3 !h-3 !bg-emerald-500 !border-[2px] !border-card !rounded-full !-right-1.5"
        />
      )}
    </div>
  );
}
