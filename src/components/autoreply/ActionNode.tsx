import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap, Tag, Users, GitPullRequestArrow } from "lucide-react";
import type { FlowNodeData } from "./types";

const ACTION_LABELS: Record<string, { label: string; icon: any }> = {
  add_tag: { label: "Adicionar tag", icon: Tag },
  remove_tag: { label: "Remover tag", icon: Tag },
  set_pipeline_stage: { label: "Mover no Pipeline", icon: GitPullRequestArrow },
  assign_attendant: { label: "Atribuir atendente", icon: Users },
  release_attendant: { label: "Liberar atendente", icon: Users },
};

export function ActionNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const actions = d.actions || [];

  return (
    <div
      className={`rounded-lg overflow-hidden transition-all duration-150 w-[220px]
        ${selected
          ? "ring-2 ring-amber-400/70 shadow-[0_0_24px_-4px_hsl(var(--primary)/0.3)]"
          : "ring-1 ring-white/[0.06] shadow-md hover:ring-white/[0.1]"
        }`}
      style={{ background: "hsl(var(--card))" }}
    >
      <div className="h-1 bg-amber-500" />
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-2.5 !h-2.5 !bg-amber-500 !border-[1.5px] !border-card !rounded-full !-left-1.5"
      />

      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-5 h-5 rounded bg-amber-500/15 flex items-center justify-center shrink-0">
          <Zap className="w-3 h-3 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground/90 leading-none truncate">{d.label}</p>
          <p className="text-[9px] text-muted-foreground/50 mt-0.5">Ações</p>
        </div>
      </div>

      <div className="px-3 pb-2 space-y-1">
        {actions.length === 0 && (
          <p className="text-[9px] text-muted-foreground/40 italic">Nenhuma ação configurada</p>
        )}
        {actions.slice(0, 3).map((a) => {
          const meta = ACTION_LABELS[a.type] || { label: a.type, icon: Zap };
          const Icon = meta.icon;
          const detail =
            a.type === "add_tag" || a.type === "remove_tag" ? a.tag :
            a.type === "set_pipeline_stage" ? a.stage :
            a.type === "assign_attendant" ? a.attendantName :
            "";
          return (
            <div key={a.id} className="flex items-center gap-1.5 text-[9px] text-foreground/50">
              <Icon className="w-2.5 h-2.5 text-amber-400/60 shrink-0" />
              <span className="truncate">
                {meta.label}{detail ? `: ${detail}` : ""}
              </span>
            </div>
          );
        })}
        {actions.length > 3 && (
          <p className="text-[8px] text-muted-foreground/30">+{actions.length - 3} mais</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-2.5 !h-2.5 !bg-amber-500 !border-[1.5px] !border-card !rounded-full !-right-1.5"
      />
    </div>
  );
}
