import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Shuffle } from "lucide-react";
import type { FlowNodeData } from "./types";

export function RandomNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const branches = d.randomBranches || [];
  const totalWeight = branches.reduce((s, b) => s + (b.weight || 1), 0) || 1;

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-150 w-[260px] border bg-card
        ${selected
          ? "border-fuchsia-500/60 shadow-[0_0_0_3px_hsl(292_84%_61%/0.15)] shadow-xl"
          : "border-border/50 shadow-lg hover:border-fuchsia-500/30 hover:shadow-xl"
        }`}
    >
      <div className="h-[3px] bg-gradient-to-r from-fuchsia-500 to-fuchsia-400" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-fuchsia-500 !border-[2px] !border-card !rounded-full !-left-1.5"
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-fuchsia-500/12 flex items-center justify-center shrink-0 border border-fuchsia-500/15">
          <Shuffle className="w-4 h-4 text-fuchsia-400" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-none truncate">{d.label}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {branches.length === 0 ? "Sem caminhos" : `${branches.length} caminho${branches.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {/* Branches */}
      <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
        {branches.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/40 italic text-center py-1">
            Adicione caminhos no painel
          </p>
        ) : (
          branches.map((b) => {
            const pct = Math.round(((b.weight || 1) / totalWeight) * 100);
            return (
              <div key={b.id} className="relative flex items-center">
                <div className="flex-1 text-[11px] font-medium py-1.5 px-2.5 rounded-lg bg-fuchsia-500/8 text-fuchsia-400 border border-fuchsia-500/20 flex items-center justify-between">
                  <span className="truncate">{b.label || "Caminho"}</span>
                  <span className="text-[10px] text-fuchsia-400/60 ml-2 shrink-0 font-bold">{pct}%</span>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`branch-${b.id}`}
                  className="!w-3 !h-3 !bg-fuchsia-500 !border-[2px] !border-card !rounded-full !-right-1.5"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
