import type { FlowNodeData } from "./types";

interface Props {
  data: FlowNodeData;
}

export function MessagePreview({ data }: Props) {
  const escaped = (data.text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const text = escaped.replace(
    /\{(\w+)\}/g,
    (_, v) => `<span class="font-medium text-primary/80">«${v}»</span>`
  );

  return (
    <div className="bg-muted/15 border border-border/30 rounded-2xl overflow-hidden">
      <div className="p-3.5 space-y-2.5">
        {data.imageUrl && (
          <div className="rounded-xl overflow-hidden border border-border/20">
            <img src={data.imageUrl} alt="" className="w-full h-28 object-cover" />
            {data.imageCaption && (
              <p className="text-[11px] text-foreground/50 px-3 py-2">{data.imageCaption}</p>
            )}
          </div>
        )}
        {data.text && (
          <div className="bg-card/80 rounded-xl px-3.5 py-2.5 border border-border/20">
            <p
              className="text-[11px] text-foreground/70 whitespace-pre-line leading-relaxed"
              dangerouslySetInnerHTML={{ __html: text }}
            />
          </div>
        )}
        {data.buttons && data.buttons.length > 0 && (
          <div className="space-y-1.5">
            {data.buttons.map((btn) => (
              <div
                key={btn.id}
                className="text-[11px] font-medium text-center py-2 rounded-xl bg-primary/6 text-primary/70 border border-primary/10"
              >
                {btn.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
