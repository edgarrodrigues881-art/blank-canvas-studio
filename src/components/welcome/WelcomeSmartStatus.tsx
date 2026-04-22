import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, RefreshCw, Hourglass, ShieldAlert, Smartphone, Pause } from "lucide-react";
import type { WelcomeQueueItem } from "@/hooks/useWelcomeAutomation";

function formatRelative(targetIso: string): { label: string; isPast: boolean } {
  const target = new Date(targetIso).getTime();
  const diff = target - Date.now();
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  let label: string;
  if (sec < 60) label = `${sec}s`;
  else if (min < 60) label = `${min}min`;
  else label = `${hr}h`;
  return { label, isPast: diff < 0 };
}

interface SmartHintProps {
  item: WelcomeQueueItem;
  maxRetries?: number;
}

/**
 * Renders an intelligent contextual hint next to the status badge:
 * - "Agendado para Xs"
 * - "Em retry (tentativa 2/3)"
 * - "Bloqueado por limite"
 * - "Aguardando device disponível"
 */
export function WelcomeSmartHint({ item, maxRetries = 3 }: SmartHintProps) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(x => x + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  // Pending items waiting for their scheduled send_at
  if (item.status === "pending" && item.send_at) {
    const { label, isPast } = formatRelative(item.send_at);
    if (!isPast) {
      return (
        <Tip label={`Agendado para ${label}`} icon={Clock} tone="text-blue-400 bg-blue-500/10 border-blue-500/30"
             tooltip="Este envio respeita o delay inteligente para simular comportamento humano e evitar bloqueios." />
      );
    }
    return (
      <Tip label="Aguardando device disponível" icon={Smartphone} tone="text-amber-400 bg-amber-500/10 border-amber-500/30"
           tooltip="Pronto para envio. Aguardando um remetente liberar o slot (limite por minuto, cooldown ou diário)." />
    );
  }

  if (item.status === "pending" && !item.send_at) {
    return (
      <Tip label="Aguardando processamento" icon={Hourglass} tone="text-slate-400 bg-slate-500/10 border-slate-500/30"
           tooltip="Item será processado no próximo ciclo do worker." />
    );
  }

  if (item.status === "processing") {
    return (
      <Tip label="Enviando agora" icon={RefreshCw} tone="text-blue-400 bg-blue-500/10 border-blue-500/30 animate-pulse"
           tooltip="Mensagem em rota — aguarde a confirmação." />
    );
  }

  if (item.status === "aguardando_pausa") {
    return (
      <Tip label="Pausa programada" icon={Pause} tone="text-purple-400 bg-purple-500/10 border-purple-500/30"
           tooltip="Worker está em pausa programada para humanização do envio." />
    );
  }

  if (item.status === "aguardando_janela") {
    return (
      <Tip label="Fora do horário" icon={Clock} tone="text-indigo-400 bg-indigo-500/10 border-indigo-500/30"
           tooltip="Será enviado quando entrar na janela permitida (ex: 08:00–20:00 BRT)." />
    );
  }

  if (item.status === "duplicate_blocked") {
    return (
      <Tip label="Bloqueado por dedupe" icon={ShieldAlert} tone="text-orange-400 bg-orange-500/10 border-orange-500/30"
           tooltip="Já enviado anteriormente para este contato dentro da janela de deduplicação." />
    );
  }

  if (item.status === "failed") {
    if (item.attempts > 0 && item.attempts < maxRetries) {
      return (
        <Tip label={`Em retry (tentativa ${item.attempts}/${maxRetries})`} icon={RefreshCw}
             tone="text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
             tooltip="Erro temporário detectado — backoff progressivo aplicado." />
      );
    }
    if (item.attempts >= maxRetries) {
      return (
        <Tip label="Bloqueado por limite" icon={ShieldAlert} tone="text-red-400 bg-red-500/10 border-red-500/30"
             tooltip="Tentativas esgotadas ou erro permanente (número inválido / instância bloqueada)." />
      );
    }
  }

  return null;
}

function Tip({ label, icon: Icon, tone, tooltip }: { label: string; icon: any; tone: string; tooltip: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1.5 text-[10px] font-medium border px-2 py-0.5 ${tone}`}>
            <Icon className="w-3 h-3" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
