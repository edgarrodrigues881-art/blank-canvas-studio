import { Zap, MessageSquare, CircleStop, Timer, GitBranch } from "lucide-react";
import { toast } from "sonner";

const blocks = [
  { type: "startNode", label: "Início", desc: "Gatilho do fluxo", icon: Zap, accent: "text-emerald-500", bg: "bg-emerald-500/10", ring: "ring-emerald-500/15" },
  { type: "messageNode", label: "Mensagem", desc: "Texto, imagem, botões", icon: MessageSquare, accent: "text-primary", bg: "bg-primary/10", ring: "ring-primary/15" },
  { type: "conditionNode", label: "Condição", desc: "Ramificar o fluxo", icon: GitBranch, accent: "text-violet-500", bg: "bg-violet-500/10", ring: "ring-violet-500/15" },
  { type: "delayNode", label: "Temporizador", desc: "Delay entre msgs", icon: Timer, accent: "text-amber-500", bg: "bg-amber-500/10", ring: "ring-amber-500/15" },
  { type: "endNode", label: "Finalizar", desc: "Encerra o fluxo", icon: CircleStop, accent: "text-rose-500", bg: "bg-rose-500/10", ring: "ring-rose-500/15" },
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
    <div className="w-[190px] shrink-0 border-r border-border/30 bg-card/20 p-3 space-y-1 hidden md:block">
      <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/30 font-semibold px-2 mb-3">
        Blocos
      </p>
      {blocks.map((b) => {
        const isDisabled = b.type === "startNode" && hasStartNode;
        return (
          <div
            key={b.type}
            draggable={!isDisabled}
            onDragStart={(e) => onDragStart(e, b.type)}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150 group
              ${isDisabled
                ? "opacity-30 cursor-not-allowed"
                : "cursor-grab active:cursor-grabbing hover:bg-muted/20 active:scale-[0.97]"
              }`}
          >
            <div className={`w-7 h-7 rounded-lg ${b.bg} flex items-center justify-center ring-1 ${b.ring} transition-all ${!isDisabled ? "group-hover:scale-105" : ""}`}>
              <b.icon className={`w-3.5 h-3.5 ${b.accent}`} />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground/80 leading-tight">{b.label}</p>
              <p className="text-[9px] text-muted-foreground/40 mt-0.5">{b.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
