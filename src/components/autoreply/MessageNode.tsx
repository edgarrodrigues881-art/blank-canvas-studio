import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare, Image, Clock, FileText, Mic, Paperclip, Link2, CheckCircle2, AlertTriangle, XCircle, MessageCircleReply, Phone } from "lucide-react";
import type { FlowNodeData } from "./types";

export function MessageNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const mediaType = d.mediaType || (d.imageUrl ? "image" : "none");
  const hasButtons = d.buttons && d.buttons.length > 0;
  const hasReplyButtons = hasButtons && d.buttons!.some((b) => !b.type || b.type === "reply");
  const isUsingModel = !!d.templateId;

  const mediaMeta: Record<string, { icon: any; label: string }> = {
    image:       { icon: Image,     label: "Imagem"                                       },
    audio:       { icon: Mic,       label: "Áudio"                                        },
    file:        { icon: Paperclip, label: d.fileName || "Arquivo"                        },
    dynamic_url: { icon: Link2,     label: `Mídia dinâmica (${d.dynamicMediaKind || "auto"})` },
  };
  const media = mediaType !== "none" ? mediaMeta[mediaType] : null;

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-150 w-[260px] border bg-card
        ${selected
          ? "border-blue-500/60 shadow-[0_0_0_3px_hsl(217_91%_60%/0.15)] shadow-xl"
          : "border-border/50 shadow-lg hover:border-blue-500/30 hover:shadow-xl"
        }`}
    >
      {/* Top color bar */}
      <div className="h-[3px] bg-gradient-to-r from-blue-500 to-blue-400" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-blue-500 !border-[2px] !border-card !rounded-full !-left-1.5"
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-blue-500/12 flex items-center justify-center shrink-0 border border-blue-500/15">
          <MessageSquare className="w-4 h-4 text-blue-400" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-none truncate">{d.label}</p>
          <div className="flex items-center gap-1 mt-1">
            {isUsingModel ? (
              <>
                <FileText className="w-2.5 h-2.5 text-blue-400/50" />
                <span className="text-[10px] text-blue-400/60 truncate">{d.templateName}</span>
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground/60">Mensagem de texto</span>
            )}
          </div>
        </div>
        {d.delay && d.delay > 0 ? (
          <div className="flex items-center gap-1 bg-amber-500/8 border border-amber-500/20 px-2 py-1 rounded-lg">
            <Clock className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-[10px] text-amber-400 font-medium">{d.delay}s</span>
          </div>
        ) : null}
      </div>

      {/* Content preview */}
      {(media || d.text) && (
        <div className="px-4 pb-3 space-y-1.5">
          {media && (
            <div className="flex items-center gap-1.5 bg-muted/30 rounded-lg px-2.5 py-1.5">
              <media.icon className="w-3 h-3 text-muted-foreground/60" />
              <span className="text-[10px] text-muted-foreground/70 truncate">{media.label}</span>
            </div>
          )}
          {d.text && (
            <p className="text-[11px] text-muted-foreground/60 line-clamp-2 leading-relaxed bg-muted/20 rounded-lg px-2.5 py-1.5">
              {d.text.replace(/\{(\w+)\}/g, (_, v) => `«${v}»`)}
            </p>
          )}
        </div>
      )}

      {/* Buttons */}
      {hasButtons && (
        <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
          {d.buttons!.map((btn) => {
            const BtnIcon = btn.type === "url" ? Link2 : btn.type === "phone" ? Phone : MessageCircleReply;
            const btnColor = btn.type === "url"
              ? "bg-violet-500/8 text-violet-400 border-violet-500/20"
              : btn.type === "phone"
              ? "bg-emerald-500/8 text-emerald-400 border-emerald-500/20"
              : "bg-blue-500/8 text-blue-400 border-blue-500/20";
            const handleColor = btn.type === "url"
              ? "!bg-violet-500"
              : btn.type === "phone"
              ? "!bg-emerald-500"
              : "!bg-blue-500";
            return (
              <div key={btn.id} className="relative flex items-center">
                <div className={`flex-1 text-[11px] font-medium flex items-center justify-center gap-1.5 py-1.5 rounded-lg border ${btnColor}`}>
                  <BtnIcon className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{btn.label}</span>
                </div>
                {btn.type === "reply" && (
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`btn-${btn.id}`}
                    className={`!w-3 !h-3 ${handleColor} !border-[2px] !border-card !rounded-full !-right-1.5`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center border-t border-border/30 divide-x divide-border/30">
        {[
          { label: "Sucessos", value: 0, color: "text-emerald-400", icon: CheckCircle2 },
          { label: "Alertas",  value: 0, color: "text-amber-400",   icon: AlertTriangle },
          { label: "Erros",    value: 0, color: "text-rose-400",    icon: XCircle },
        ].map((s) => (
          <div key={s.label} className="flex-1 text-center py-2">
            <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[9px] text-muted-foreground/50 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Default output — shown when no reply buttons (URL/phone buttons don't branch the flow) */}
      {!hasReplyButtons && (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!w-3 !h-3 !bg-blue-500 !border-[2px] !border-card !rounded-full !-right-1.5"
        />
      )}
    </div>
  );
}
