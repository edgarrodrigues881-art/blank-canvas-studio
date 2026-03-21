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
      className={`group rounded-2xl bg-card/95 backdrop-blur-sm min-w-[250px] max-w-[320px] transition-all duration-200 ease-out
        ${selected
          ? "shadow-[0_0_0_2px_hsl(var(--primary)),0_8px_32px_-8px_hsl(var(--primary)/0.25)] scale-[1.02]"
          : "shadow-[0_2px_12px_-4px_hsl(var(--foreground)/0.08)] hover:shadow-[0_4px_20px_-6px_hsl(var(--foreground)/0.12)] hover:scale-[1.01] border border-border/40"
        }`}
    >
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center ring-1 ${
            isTemplate ? "bg-primary/10 ring-primary/20" : "bg-emerald-500/10 ring-emerald-500/20"
          }`}
        >
          {isTemplate ? (
            <FileText className="w-4 h-4 text-primary" />
          ) : (
            <Zap className="w-4 h-4 text-emerald-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-tight truncate">
            {isTemplate ? (d.templateName || "Template") : d.label}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {isTemplate ? "Template" : triggerLabels[d.trigger || "keyword"]}
          </p>
        </div>
      </div>

      {isTemplate ? (
        <>
          <div className="px-4 pb-3 space-y-1.5">
            {hasTemplateImage && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                <Image className="w-3 h-3" />
                <span>Imagem anexada</span>
              </div>
            )}
            {d.text && (
              <p className="text-[11px] text-foreground/60 whitespace-pre-line leading-relaxed">
                {d.text.replace(/\{(\w+)\}/g, (_, v) => `«${v}»`)}
              </p>
            )}
          </div>

          {hasTemplateButtons ? (
            <div className="border-t border-border/30 px-3 py-2.5 space-y-1.5">
              {d.buttons!.map((btn) => (
                <div key={btn.id} className="relative flex items-center">
                  <div className="flex-1 text-[11px] font-medium text-center py-1.5 px-3 rounded-lg bg-primary/6 text-primary/80 border border-primary/10">
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
          ) : (
            <Handle
              type="source"
              position={Position.Right}
              id="out"
              className="!w-5 !h-5 !bg-primary !border-[3px] !border-card !rounded-full !shadow-[0_0_8px_hsl(var(--primary)/0.35)] !-right-2.5"
            />
          )}
        </>
      ) : (
        <>
          {d.trigger === "keyword" && d.keyword && (
            <div className="px-4 pb-3">
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/8 text-emerald-500 border border-emerald-500/15">
                "{d.keyword}"
              </span>
            </div>
          )}
          <Handle
            type="source"
            position={Position.Right}
            id="out"
            className="!w-5 !h-5 !bg-emerald-500 !border-[3px] !border-card !rounded-full !shadow-[0_0_8px_hsl(142_71%_45%/0.35)] !-right-2.5"
          />
        </>
      )}
    </div>
  );
}

