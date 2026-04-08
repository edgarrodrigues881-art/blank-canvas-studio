import { Zap, MessageSquare, CircleStop, Timer, GitBranch, Bot } from "lucide-react";
import { toast } from "sonner";

const blocks = [
  { type: "startNode", label: "Início", desc: "Gatilho", icon: Zap, color: "text-emerald-400", bar: "bg-emerald-500", bg: "bg-emerald-500/12" },
  { type: "messageNode", label: "Mensagem", desc: "Texto / mídia", icon: MessageSquare, color: "text-primary", bar: "bg-primary", bg: "bg-primary/12" },
  { type: "aiNode", label: "IA", desc: "Resposta IA", icon: Bot, color: "text-cyan-400", bar: "bg-cyan-500", bg: "bg-cyan-500/12" },
  { type: "conditionNode", label: "Condição", desc: "Ramificar", icon: GitBranch, color: "text-violet-400", bar: "bg-violet-500", bg: "bg-violet-500/12" },
  { type: "delayNode", label: "Delay", desc: "Temporizador", icon: Timer, color: "text-amber-400", bar: "bg-amber-500", bg: "bg-amber-500/12" },
  { type: "endNode", label: "Finalizar", desc: "Encerrar", icon: CircleStop, color: "text-rose-400", bar: "bg-rose-500", bg: "bg-rose-500/12" },
];

interface Props {
  hasStartNode?: boolean;
}

export function FlowSidebar({ hasStartNode = false }: Props) {
  const onDragStart = (e: React.DragEvent, type: string) => {
    if (type === "startNode" && hasStartNode) {
      e.preventDefault();
      toast.error("Só é permitido um bloco de Início por fluxo");
      return;
    }
    e.dataTransfer.setData("application/reactflow", type);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-[170px] shrink-0 border-r border-white/[0.06] bg-[hsl(var(--card)/0.4)] p-2.5 space-y-0.5 hidden md:block">
      <p className="text-[8px] uppercase tracking-[0.2em] text-muted-foreground/30 font-bold px-2 pt-1 pb-2">
        Blocos
      </p>
      {blocks.map((b) => {
        const isDisabled = b.type === "startNode" && hasStartNode;
        return (
          <div
            key={b.type}
            draggable={!isDisabled}
            onDragStart={(e) => onDragStart(e, b.type)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-all duration-100 group
              ${isDisabled
                ? "opacity-25 cursor-not-allowed"
                : "cursor-grab active:cursor-grabbing hover:bg-white/[0.04] active:scale-[0.96]"
              }`}
          >
            <div className={`w-6 h-6 rounded ${b.bg} flex items-center justify-center transition-transform ${!isDisabled ? "group-hover:scale-110" : ""}`}>
              <b.icon className={`w-3 h-3 ${b.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-foreground/80 leading-none">{b.label}</p>
              <p className="text-[8px] text-muted-foreground/35 mt-0.5">{b.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
