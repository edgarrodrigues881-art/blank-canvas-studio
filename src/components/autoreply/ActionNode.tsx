import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Wand2, Tag, Users, GitPullRequestArrow, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { FlowNodeData } from "./types";

const ACTION_META: Record<string, { label: string; icon: any }> = {
  add_tag:           { label: "Adicionar tag",     icon: Tag },
  remove_tag:        { label: "Remover tag",        icon: Tag },
  set_pipeline_stage:{ label: "Mover no Pipeline", icon: GitPullRequestArrow },
  assign_attendant:  { label: "Atribuir atendente",icon: Users },
  release_attendant: { label: "Liberar atendente", icon: Users },
};

export function ActionNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const actions = d.actions || [];

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-150 w-[260px] border bg-card
        ${selected
          ? "border-amber-500/60 shadow-[0_0_0_3px_hsl(45_93%_47%/0.15)] shadow-xl"
          : "border-border/50 shadow-lg hover:border-amber-500/30 hover:shadow-xl"
        }`}
    >
      <div className="h-[3px] bg-gradient-to-r from-amber-500 to-amber-400" />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3 !h-3 !bg-amber-500 !border-[2px] !border-card !rounded-full !-left-1.5"
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/12 flex items-center justify-center shrink-0 border border-amber-500/15">
          <Wand2 className="w-4 h-4 text-amber-400" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-none truncate">{d.label}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {actions.length === 0 ? "Nenhuma ação" : `${actions.length} ação${actions.length !== 1 ? "ões" : ""}`}
          </p>
        </div>
      </div>

      {/* Actions list */}
      {actions.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          {actions.slice(0, 3).map((a) => {
            const meta = ACTION_META[a.type] || { label: a.type, icon: Wand2 };
            const Icon = meta.icon;
            const detail =
              a.type === "add_tag" || a.type === "remove_tag" ? a.tag :
              a.type === "set_pipeline_stage" ? a.stage :
              a.type === "assign_attendant" ? a.attendantName : "";
            return (
              <div key={a.id} className="flex items-center gap-1.5 bg-muted/20 rounded-lg px-2.5 py-1.5">
                <Icon className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-[10px] text-muted-foreground/70 truncate">
                  {meta.label}{detail ? `: ${detail}` : ""}
                </span>
              </div>
            );
          })}
          {actions.length > 3 && (
            <p className="text-[10px] text-muted-foreground/40 px-2.5">+{actions.length - 3} mais</p>
          )}
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

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-3 !h-3 !bg-amber-500 !border-[2px] !border-card !rounded-full !-right-1.5"
      />
    </div>
  );
}
