import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";


import {
  Smartphone,
  Wifi,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Signal,
  Shield,
  Ban,
  RotateCcw,
  Layers,
  Gauge,
  TrendingUp,
  Search,
  Zap,
  HeartPulse,
  CircleDot,
} from "lucide-react";

const CustomModule = () => {
  const [checklist, setChecklist] = useState({
    formatted: false,
    whatsapp: false,
    structure: false,
    intensity: false,
    noMix: false,
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Guia de Aquecimento</h1>
        <p className="text-sm text-muted-foreground">
          Orientações completas para preparar o aparelho, configurar a rede e conduzir o aquecimento de forma segura e organizada.
        </p>
      </div>

      {/* Indicador de estado */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatusIndicator color="emerald" label="Conta Estável" description="Pronta para aumentar volume gradualmente" />
        <StatusIndicator color="amber" label="Conta Sensível" description="Precisa de progressão lenta e acompanhamento constante" />
        <StatusIndicator color="red" label="Conta Crítica" description="Risco alto — foque em estabilizar antes de qualquer envio" />
      </div>

      <Accordion type="multiple" className="space-y-4">
        {/* ───── 0. Antes de QR Code — Chip novo ───── */}
        <AccordionItem value="before-qr" className="border-0">
          <Card className="border-border/60 bg-card overflow-hidden rounded-xl shadow-sm">
            <AccordionTrigger className="px-5 py-4 hover:no-underline gap-3 [&>svg]:text-amber-500">
              <span className="flex items-center gap-3 text-base font-semibold text-foreground">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                Antes do QR Code — Chip novo
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Após as atualizações recentes do WhatsApp, chips que conectam o QR Code sem nenhuma atividade manual prévia
                  têm maior chance de sofrer restrições logo nos primeiros dias de uso.
                </p>
                <p>
                  <strong className="text-foreground font-medium">O que fazer antes:</strong> Use o aparelho normalmente por alguns minutos — 
                  envie de <strong className="text-foreground font-medium">1 a 3 mensagens reais</strong> para contatos conhecidos. 
                  Isso gera um histórico mínimo de atividade humana que ajuda a proteger o número.
                </p>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex gap-2.5">
                  <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-400">
                    Essa etapa leva menos de 5 minutos e reduz consideravelmente o risco de bloqueio nos primeiros dias de aquecimento.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* ───── 1. Preparação do Aparelho ───── */}
        <AccordionItem value="prep" className="border-0">
            <Card className="border-border/60 bg-card overflow-hidden rounded-xl shadow-sm">
            <AccordionTrigger className="px-5 py-4 hover:no-underline gap-3 [&>svg]:text-emerald-500">
              <span className="flex items-center gap-3 text-base font-semibold text-foreground">
                <Smartphone className="w-5 h-5 text-emerald-500 shrink-0" />
                Preparação do Aparelho
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Passo 1 */}
                <StepCard step={1} title="Formatação do aparelho" icon={<RotateCcw className="w-4 h-4 text-emerald-500" />}>
                  <p className="text-sm text-muted-foreground mb-2">A formatação é obrigatória quando o aparelho:</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Já foi usado para envios em massa ou automação</li>
                    <li>Já teve algum número bloqueado ou restrito</li>
                    <li>Operou com mais de um chip ao mesmo tempo</li>
                    <li>Teve apps modificados (GB WhatsApp, clones etc.)</li>
                  </ul>
                  <p className="text-sm text-muted-foreground mt-3 mb-1">A formatação completa elimina:</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Resíduos de sessões e conexões anteriores</li>
                    <li>Tokens e credenciais armazenados</li>
                    <li>Cache de apps que pode causar conflitos</li>
                    <li>Configurações residuais de uso anterior</li>
                  </ul>
                  <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-400">Faça sempre o reset completo de fábrica. Uma formatação parcial não remove todos os rastros e pode comprometer o processo.</p>
                  </div>
                </StepCard>

                {/* Passo 2 */}
                <StepCard step={2} title="Instalação limpa" icon={<Shield className="w-4 h-4 text-emerald-500" />}>
                  <p className="text-sm text-muted-foreground mb-2">Após formatar, siga esta ordem de instalação:</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Faça login com uma conta Google limpa</li>
                    <li>Baixe apenas o WhatsApp oficial pela Play Store</li>
                    <li>Verifique se a versão instalada é a original (não modificada)</li>
                    <li>Se fizer parte da sua estratégia, remova a conta Google após instalar</li>
                    <li>Não instale nenhum outro app de mensagens, clones ou ferramentas de automação</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-3 italic">
                    Quanto mais limpo o ambiente do aparelho, menor a chance de o WhatsApp associar seu número a comportamentos suspeitos.
                  </p>
                </StepCard>

                {/* Passo 3 */}
                <StepCard step={3} title="Escolha da conexão" icon={<Signal className="w-4 h-4 text-emerald-500" />}>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p><strong className="text-foreground">Chip sem histórico negativo:</strong> Pode usar Wi-Fi durante a instalação inicial sem problemas.</p>
                    <p><strong className="text-foreground">Chip com histórico de bloqueio:</strong> Use dados móveis (4G) desde o primeiro momento para evitar associação com IPs problemáticos.</p>
                    <p><strong className="text-foreground">Após configurar tudo:</strong> Mantenha o aparelho conectado preferencialmente via 4G durante toda a operação.</p>
                    <p className="text-xs italic mt-2">Alternar frequentemente entre Wi-Fi e 4G pode gerar inconsistências de IP que levantam suspeitas no WhatsApp.</p>
                  </div>
                </StepCard>

                {/* Passo 4 */}
                <StepCard step={4} title="Separação de aparelhos" icon={<Layers className="w-4 h-4 text-emerald-500" />}>
                  <p className="text-sm text-muted-foreground mb-2">Evite as seguintes práticas:</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Manter 3 ou mais WhatsApps ativos no mesmo aparelho</li>
                    <li>Colocar contas saudáveis junto com contas já restritas</li>
                    <li>Usar o aparelho principal da operação como contingência</li>
                  </ul>
                  <div className="mt-3 rounded-md border border-border/30 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Regra de ouro:</strong> Mantenha o mínimo de números por aparelho. Se uma conta restrita for bloqueada, ela pode arrastar as outras junto — é o chamado efeito cascata.
                    </p>
                  </div>
                </StepCard>
              </div>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* ───── 2. Estrutura e Rede ───── */}
        <AccordionItem value="network" className="border-0">
            <Card className="border-border/60 bg-card overflow-hidden rounded-xl shadow-sm">
            <AccordionTrigger className="px-5 py-4 hover:no-underline gap-3 [&>svg]:text-emerald-500">
              <span className="flex items-center gap-3 text-base font-semibold text-foreground">
                <Wifi className="w-5 h-5 text-emerald-500 shrink-0" />
                Estrutura e Rede
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  O aquecimento não depende apenas de como você envia — <strong className="text-foreground">a qualidade da sua rede e infraestrutura é igualmente determinante.</strong>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <CheckItem label="IP fixo e estável" />
                  <CheckItem label="Proxy residencial ativo" />
                  <CheckItem label="Proxy fora de data center" />
                  <CheckItem label="Conexão instável ou oscilando" invert />
                  <CheckItem label="IP com histórico de spam" invert />
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Se a infraestrutura estiver mal configurada, nenhum processo de aquecimento será eficiente — mesmo com a melhor estratégia de envio.
                </p>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <p className="text-sm font-medium text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    O que fazer em caso de bloqueio temporário
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Ative o modo avião por 3 a 5 minutos para liberar a conexão</li>
                    <li>Reative os dados móveis — isso força a renovação do IP automaticamente</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    Se o problema continuar após renovar o IP: <strong className="text-foreground">pare os envios imediatamente</strong>. Revise toda a infraestrutura (proxy, aparelho, isolamento de contas) antes de tentar novamente.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* ───── 3. Modelagem do Aquecimento ───── */}
        <AccordionItem value="warmup" className="border-0">
            <Card className="border-border/60 bg-card overflow-hidden rounded-xl shadow-sm">
            <AccordionTrigger className="px-5 py-4 hover:no-underline gap-3 [&>svg]:text-emerald-500">
              <span className="flex items-center gap-3 text-base font-semibold text-foreground">
                <Activity className="w-5 h-5 text-emerald-500 shrink-0" />
                Estratégia de Aquecimento
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">A escolha da intensidade deve levar em conta três fatores do chip:</p>
                <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground">
                  <div className="rounded-md border border-border/30 bg-muted/30 p-3 text-center">
                    <p className="text-foreground font-medium">Tempo de vida</p>
                  </div>
                  <div className="rounded-md border border-border/30 bg-muted/30 p-3 text-center">
                    <p className="text-foreground font-medium">Histórico de uso</p>
                  </div>
                  <div className="rounded-md border border-border/30 bg-muted/30 p-3 text-center">
                    <p className="text-foreground font-medium">Situação atual</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <IntensityCard label="Suave" icon={<HeartPulse className="w-4 h-4" />} color="emerald" description="Indicado para chips novos ou sensíveis. Frequência baixa com aumento muito gradual ao longo dos dias." />
                  <IntensityCard label="Moderado" icon={<Gauge className="w-4 h-4" />} color="amber" description="Para chips estáveis e sem histórico negativo. Volume controlado com crescimento progressivo e monitorado." />
                  <IntensityCard label="Intenso" icon={<Zap className="w-4 h-4" />} color="red" description="Exclusivo para chips maduros, com semanas de uso consistente e nenhum registro de restrição anterior." />
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-amber-400">Aquecimento não se resolve em 24 horas.</strong> É um processo de maturação que exige paciência. Pular etapas ou acelerar o ritmo quase sempre leva a restrições.
                  </p>
                </div>

                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex gap-3">
                  <TrendingUp className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    A chave é a consistência: aumente a intensidade somente quando o chip estiver estável por vários dias consecutivos. Progressão controlada garante resultados duradouros.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* ───── 4. Diagnóstico e Estado Crítico ───── */}
        <AccordionItem value="diagnostic" className="border-0">
          <Card className="border-border/60 bg-card overflow-hidden rounded-xl shadow-sm">
            <AccordionTrigger className="px-5 py-4 hover:no-underline gap-3 [&>svg]:text-emerald-500">
              <span className="flex items-center gap-3 text-base font-semibold text-foreground">
                <AlertTriangle className="w-5 h-5 text-emerald-500 shrink-0" />
                Diagnóstico e Recuperação
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <div className="space-y-4">
                {/* Alerta amarelo */}
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-amber-400 flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    O chip não consegue enviar sequer uma mensagem?
                  </p>
                  <p className="text-xs text-muted-foreground">Esse comportamento geralmente aponta para um ou mais dos seguintes problemas:</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Infraestrutura de rede comprometida (IP, proxy, conexão)</li>
                    <li>IP ou proxy já associado a atividades de spam</li>
                    <li>Chip compartilhando aparelho com contas já restritas</li>
                    <li>Acúmulo de infrações anteriores no número</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">Antes de fazer qualquer tentativa de envio, valide cada um desses pontos:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                    <MiniCheck label="IP e reputação" />
                    <MiniCheck label="Tipo de proxy" />
                    <MiniCheck label="Estado do aparelho" />
                    <MiniCheck label="Isolamento de contas" />
                  </div>
                </div>

                {/* Alerta vermelho */}
                <div className="rounded-lg border-2 border-red-500/40 bg-red-500/5 p-4 space-y-3">
                  <p className="text-sm font-semibold text-red-400 flex items-center gap-2">
                    <Ban className="w-4 h-4" />
                    Chip em estado crítico — como agir
                  </p>
                  <p className="text-xs text-red-300/70">Nesta situação, forçar envios só vai piorar. Aplique imediatamente:</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Reduza a intensidade do aquecimento ao mínimo absoluto</li>
                    <li>Aumente consideravelmente os intervalos entre mensagens</li>
                    <li>Elimine qualquer pico de volume — mantenha envios constantes e baixos</li>
                    <li>Suspenda completamente envios manuais ou paralelos neste chip</li>
                  </ul>
                  <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 p-3">
                    <p className="text-xs text-red-300 font-medium">
                      O único objetivo nesta fase é <strong>estabilizar o chip</strong> — não tentar escalar.
                    </p>
                    <p className="text-xs text-red-300/60 mt-1">
                      Insistir em enviar com um chip em estado crítico leva, na grande maioria dos casos, ao bloqueio definitivo da conta.
                    </p>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </Card>
        </AccordionItem>

      </Accordion>

      {/* ───── Checklist ───── */}
      <Card className="border-border/60 bg-card rounded-xl shadow-sm">
        <CardContent className="p-5 space-y-4">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            Checklist — Confirme antes de iniciar o aquecimento
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: "formatted" as const, label: "Aparelho passou por reset completo de fábrica" },
              { key: "whatsapp" as const, label: "WhatsApp oficial instalado e versão verificada" },
              { key: "structure" as const, label: "Rede validada: IP estável, proxy residencial ativo" },
              { key: "intensity" as const, label: "Intensidade do aquecimento compatível com o estado do chip" },
              { key: "noMix" as const, label: "Chips restritos separados fisicamente dos saudáveis" },
            ]).map((item) => (
              <label key={item.key} className="flex items-center gap-3 cursor-pointer group">
                <Checkbox
                  checked={checklist[item.key]}
                  onCheckedChange={(v) => setChecklist((prev) => ({ ...prev, [item.key]: !!v }))}
                  className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <span className={`text-sm transition-colors ${checklist[item.key] ? "text-primary line-through" : "text-muted-foreground group-hover:text-foreground"}`}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/* ─── Sub-components ─── */

function StepCard({ step, title, icon, children }: { step: number; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/50 dark:bg-muted/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold">{step}</span>
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function IntensityCard({ label, icon, color, description }: { label: string; icon: React.ReactNode; color: "emerald" | "amber" | "red"; description: string }) {
  const styles = {
    emerald: "border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
    amber: "border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/5 text-amber-600 dark:text-amber-400",
    red: "border-red-500/40 bg-red-500/10 dark:bg-red-500/5 text-red-600 dark:text-red-400",
  };
  return (
    <div className={`rounded-lg border p-4 space-y-2 ${styles[color]}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function StatusIndicator({ color, label, description }: { color: "emerald" | "amber" | "red"; label: string; description: string }) {
  const styles = {
    emerald: "border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-500/5",
    amber: "border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/5",
    red: "border-red-500/40 bg-red-500/10 dark:bg-red-500/5",
  };
  const dotStyles = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  };
  const textStyles = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
  };
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${styles[color]}`}>
      <span className={`w-3 h-3 rounded-full ${dotStyles[color]} shrink-0`} />
      <div>
        <p className={`text-sm font-semibold ${textStyles[color]}`}>{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function CheckItem({ label, invert }: { label: string; invert?: boolean }) {
  return (
    <div className={`rounded-md border p-2.5 text-xs flex items-center gap-2 ${invert ? "border-red-500/30 bg-red-500/10 dark:bg-red-500/5 text-red-600 dark:text-red-300" : "border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"}`}>
      <CircleDot className="w-3 h-3 shrink-0" />
      {label}
    </div>
  );
}

function MiniCheck({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-border/30 bg-muted/30 p-2 text-xs text-muted-foreground flex items-center gap-1.5">
      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
      {label}
    </div>
  );
}


/* ─── Warmup Plan Data & Component ─── */

export default CustomModule;
