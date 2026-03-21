import { Zap, MessageSquare, CircleStop, Timer } from "lucide-react";
import { toast } from "sonner";

const blocks = [
  { type: "startNode", label: "Início", desc: "Gatilho do fluxo", icon: Zap, accent: "text-emerald-500", bg: "bg-emerald-500/8", ring: "ring-emerald-500/15" },
  { type: "messageNode", label: "Mensagem", desc: "Texto, imagem, botões", icon: MessageSquare, accent: "text-primary", bg: "bg-primary/8", ring: "ring-primary/15" },
  { type: "delayNode", label: "Temporizador", desc: "Delay entre mensagens", icon: Timer, accent: "text-amber-500", bg: "bg-amber-500/8", ring: "ring-amber-500/15" },
  { type: "endNode", label: "Finalizar", desc: "Encerra o fluxo", icon: CircleStop, accent: "text-rose-500", bg: "bg-rose-500/8", ring: "ring-rose-500/15" },
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
    <div className="w-[200px] shrink-0 border-r border-border/40 bg-card/30 backdrop-blur-sm p-4 space-y-2 hidden md:block">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 font-semibold px-1 mb-4">
        Blocos
      </p>
      {blocks.map((b) => {
        const isDisabled = b.type === "startNode" && hasStartNode;
        return (
          <div
            key={b.type}
            draggable={!isDisabled}
            onDragStart={(e) => onDragStart(e, b.type)}
            className={`flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-150 group
              ${isDisabled
                ? "opacity-40 cursor-not-allowed"
                : "cursor-grab active:cursor-grabbing hover:bg-muted/30 hover:scale-[1.02] active:scale-[0.98]"
              }`}
          >
            <div className={`w-9 h-9 rounded-xl ${b.bg} flex items-center justify-center ring-1 ${b.ring} transition-all ${!isDisabled ? "group-hover:scale-105" : ""}`}>
              <b.icon className={`w-4 h-4 ${b.accent}`} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground leading-tight">{b.label}</p>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">{b.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
