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
      className={`group rounded-xl bg-card border transition-all duration-200 ease-out min-w-[240px] max-w-[300px]
        ${selected
          ? "border-emerald-500/60 shadow-[0_0_20px_-4px_hsl(142_71%_45%/0.2)] scale-[1.01]"
          : "border-border/50 shadow-sm hover:shadow-md hover:border-border/70"
        }`}
    >
      {/* Header bar */}
      <div className={`flex items-center gap-2 px-3.5 py-2.5 border-b ${selected ? "border-emerald-500/20" : "border-border/30"}`}>
        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center ${
            isTemplate ? "bg-primary/10" : "bg-emerald-500/10"
          }`}
        >
          {isTemplate ? (
            <FileText className="w-3 h-3 text-primary" />
          ) : (
            <Zap className="w-3 h-3 text-emerald-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight truncate">
            {isTemplate ? (d.templateName || "Template") : d.label}
          </p>
          <p className="text-[10px] text-muted-foreground/60 truncate">
            {isTemplate ? "Template" : triggerLabels[d.trigger || "keyword"]}
          </p>
        </div>
      </div>

      {isTemplate ? (
        <>
          <div className="px-3.5 py-2.5 space-y-1">
            {hasTemplateImage && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                <Image className="w-3 h-3" />
                <span>Imagem anexada</span>
              </div>
            )}
            {d.text && (
              <p className="text-[10px] text-foreground/50 whitespace-pre-line leading-relaxed line-clamp-3">
                {d.text.replace(/\{(\w+)\}/g, (_, v) => `«${v}»`)}
              </p>
            )}
          </div>

          {hasTemplateButtons ? (
            <div className="border-t border-border/20 px-3 py-2 space-y-1">
              {d.buttons!.map((btn) => (
                <div key={btn.id} className="relative flex items-center">
                  <div className="flex-1 text-[10px] font-medium text-center py-1 px-2 rounded-md bg-primary/5 text-primary/70 border border-primary/10">
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
          ) : (
            <Handle
              type="source"
              position={Position.Right}
              id="out"
              className="!w-3 !h-3 !bg-primary !border-2 !border-card !rounded-full !shadow-[0_0_6px_hsl(var(--primary)/0.3)] !-right-1.5"
            />
          )}
        </>
      ) : (
        <>
          {d.trigger === "keyword" && d.keyword && (
            <div className="px-3.5 py-2.5">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/8 text-emerald-500/80 border border-emerald-500/15">
                "{d.keyword}"
              </span>
            </div>
          )}
          <Handle
            type="source"
            position={Position.Right}
            id="out"
            className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-card !rounded-full !shadow-[0_0_6px_hsl(142_71%_45%/0.3)] !-right-1.5"
          />
        </>
      )}
    </div>
  );
}
