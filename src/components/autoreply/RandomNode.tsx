import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Shuffle } from "lucide-react";
import type { FlowNodeData } from "./types";

export function RandomNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const branches = d.randomBranches || [];
  const totalWeight = branches.reduce((s, b) => s + (b.weight || 1), 0) || 1;

  return (
    <div
      className={`rounded-lg overflow-hidden transition-all duration-150 w-[230px]
        ${selected
          ? "ring-2 ring-fuchsia-400/70 shadow-[0_0_24px_-4px_hsl(var(--primary)/0.3)]"
          : "ring-1 ring-white/[0.06] shadow-md hover:ring-white/[0.1]"
        }`}
      style={{ background: "hsl(var(--card))" }}
    >
      <div className="h-1 bg-fuchsia-500" />
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-2.5 !h-2.5 !bg-fuchsia-500 !border-[1.5px] !border-card !rounded-full !-left-1.5"
      />

      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-5 h-5 rounded bg-fuchsia-500/15 flex items-center justify-center shrink-0">
          <Shuffle className="w-3 h-3 text-fuchsia-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground/90 leading-none truncate">{d.label}</p>
          <p className="text-[9px] text-muted-foreground/50 mt-0.5">Distribui aleatoriamente</p>
        </div>
      </div>

      <div className="border-t border-white/[0.04] px-2.5 py-1.5 space-y-1">
        {branches.length === 0 && (
          <p className="text-[9px] text-muted-foreground/40 italic text-center py-1">
            Adicione caminhos no painel
          </p>
        )}
        {branches.map((b) => {
          const pct = Math.round(((b.weight || 1) / totalWeight) * 100);
          return (
            <div key={b.id} className="relative flex items-center gap-1">
              <div className="flex-1 text-[9px] font-medium py-1 px-1.5 rounded bg-fuchsia-500/8 text-fuchsia-300/80 border border-fuchsia-500/10 flex items-center justify-between">
                <span className="truncate">{b.label || "Caminho"}</span>
                <span className="text-fuchsia-400/50 ml-1 shrink-0">{pct}%</span>
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={`branch-${b.id}`}
                className="!w-2.5 !h-2.5 !bg-fuchsia-500 !border-[1.5px] !border-card !rounded-full !-right-1.5"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
