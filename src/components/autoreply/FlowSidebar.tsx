import { Zap, MessageSquare, CircleStop, Timer, GitBranch, Bot, MessageCircleReply, Shuffle, Wand2 } from "lucide-react";
import { toast } from "sonner";

const blocks = [
  { type: "startNode",        label: "Início",        icon: Zap,               color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/20" },
  { type: "messageNode",      label: "Mensagem",      icon: MessageSquare,     color: "text-blue-400",    bg: "bg-blue-500/15",    border: "border-blue-500/20"    },
  { type: "actionNode",       label: "Ações",         icon: Wand2,             color: "text-amber-400",   bg: "bg-amber-500/15",   border: "border-amber-500/20"   },
  { type: "conditionNode",    label: "Condições",     icon: GitBranch,         color: "text-violet-400",  bg: "bg-violet-500/15",  border: "border-violet-500/20"  },
  { type: "waitResponseNode", label: "Espera",        icon: MessageCircleReply,color: "text-sky-400",     bg: "bg-sky-500/15",     border: "border-sky-500/20"     },
  { type: "randomNode",       label: "Randomizador",  icon: Shuffle,           color: "text-fuchsia-400", bg: "bg-fuchsia-500/15", border: "border-fuchsia-500/20" },
  { type: "aiNode",           label: "IA",            icon: Bot,               color: "text-cyan-400",    bg: "bg-cyan-500/15",    border: "border-cyan-500/20"    },
  { type: "delayNode",        label: "Delay",         icon: Timer,             color: "text-orange-400",  bg: "bg-orange-500/15",  border: "border-orange-500/20"  },
  { type: "endNode",          label: "Finalizar",     icon: CircleStop,        color: "text-rose-400",    bg: "bg-rose-500/15",    border: "border-rose-500/20"    },
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
    <div className="w-[180px] shrink-0 border-l border-border/40 bg-card/60 backdrop-blur-sm p-3 hidden md:flex flex-col gap-1.5 overflow-y-auto">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-semibold px-1 pb-1 pt-0.5">
        Blocos
      </p>
      {blocks.map((b) => {
        const isDisabled = b.type === "startNode" && hasStartNode;
        return (
          <div
            key={b.type}
            draggable={!isDisabled}
            onDragStart={(e) => onDragStart(e, b.type)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150 group
              ${isDisabled
                ? `opacity-25 cursor-not-allowed ${b.border} bg-transparent`
                : `cursor-grab active:cursor-grabbing ${b.border} bg-card/80 hover:bg-card hover:shadow-sm active:scale-[0.97]`
              }`}
          >
            <div className={`w-8 h-8 rounded-lg ${b.bg} flex items-center justify-center shrink-0 transition-transform ${!isDisabled ? "group-hover:scale-105" : ""}`}>
              <b.icon className={`w-4 h-4 ${b.color}`} strokeWidth={1.8} />
            </div>
            <span className={`text-[13px] font-medium leading-none ${isDisabled ? "text-muted-foreground/30" : "text-foreground/80 group-hover:text-foreground"}`}>
              {b.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
