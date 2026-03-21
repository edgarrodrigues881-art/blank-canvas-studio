import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Flame, MessageSquare, Users, Phone, Shield, Sparkles, AlertTriangle, Skull } from "lucide-react";

interface DayPlan {
  day: number;
  phase: string;
  title: string;
  goals: string[];
  checklist: string[];
  tips?: string;
  msgTarget: { min: number; max: number };
  groupTarget: number;
  recipientTarget: number;
}

const PHASES: Record<string, { label: string; color: string }> = {
  pre_24h: { label: "Pré-24h", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  groups_only: { label: "Grupos", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  autosave: { label: "AutoSave", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  community_light: { label: "Comunidade Leve", color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  community_full: { label: "Comunidade Total", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  consolidation: { label: "Consolidação", color: "bg-primary/20 text-primary border-primary/30" },
  observation: { label: "Observação", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  recovery: { label: "Recuperação", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  reentry: { label: "Reentrada", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
};

// ═══════════════════════════════════════════════
// CHIP NOVO — 30 dias, ciclo completo
// ═══════════════════════════════════════════════
const ROADMAP_NOVO: DayPlan[] = [
  {
    day: 1, phase: "pre_24h", title: "Silêncio inicial",
    goals: ["Conectar via QR Code e verificar status Ready", "Aguardar 5-8 horas sem nenhuma atividade", "Após espera, iniciar entrada gradual nos 8 grupos"],
    checklist: ["Instância conectada com sucesso", "Proxy residencial configurado", "Aguardou 5-8h sem enviar nada", "Entrada nos grupos iniciada (distribuída ao longo do dia)"],
    tips: "O primeiro dia é SILÊNCIO. Não envie mensagens. Apenas conecte e entre nos grupos de forma gradual após o período de espera.",
    msgTarget: { min: 0, max: 5 }, groupTarget: 8, recipientTarget: 0,
  },
  {
    day: 2, phase: "groups_only", title: "Ativação nos grupos",
    goals: ["Enviar 200-500 mensagens nos 8 grupos", "Distribuir envios na janela 07:00-19:00", "Alternar entre os grupos com intervalos aleatórios"],
    checklist: ["200-500 msgs enviadas em grupos", "Mensagens distribuídas ao longo do dia", "Sem erros de envio", "Intervalos aleatórios entre mensagens"],
    tips: "Volume alto apenas em grupos. Nunca para números diretos neste dia.",
    msgTarget: { min: 200, max: 500 }, groupTarget: 8, recipientTarget: 0,
  },
  {
    day: 3, phase: "autosave", title: "Grupos + Auto Save",
    goals: ["Manter 200-500 msgs em grupos", "Ativar Auto Save: 5 números × 3 msgs = 15/dia", "Números devem ser novos todos os dias"],
    checklist: ["200-500 msgs nos grupos", "15 msgs Auto Save enviadas", "5 destinatários únicos no AutoSave", "Distribuição ao longo do dia"],
    msgTarget: { min: 215, max: 515 }, groupTarget: 8, recipientTarget: 5,
  },
  {
    day: 4, phase: "autosave", title: "Consolidando Auto Save",
    goals: ["Manter volume de grupos (200-500)", "Continuar Auto Save (5 números novos × 3 msgs)", "Monitorar health check"],
    checklist: ["Grupos + AutoSave funcionando", "Nenhum bloqueio ou warning", "15 msgs Auto Save", "Instância estável"],
    msgTarget: { min: 215, max: 515 }, groupTarget: 8, recipientTarget: 5,
  },
  {
    day: 5, phase: "autosave", title: "Auto Save consolidado",
    goals: ["Manter volume de grupos (200-500)", "Auto Save: 5 números × 3 msgs = 15/dia", "Preparar para fase comunitária amanhã"],
    checklist: ["Grupos + AutoSave estáveis por 3 dias", "Nenhum bloqueio ou warning", "15 msgs Auto Save", "Instância saudável"],
    msgTarget: { min: 215, max: 515 }, groupTarget: 8, recipientTarget: 5,
  },
  {
    day: 6, phase: "community_light", title: "Comunidade inicial",
    goals: ["Manter grupos (50-120) + AutoSave (25)", "Ativar conversas comunitárias: 2 pares", "Cada conversa: 4 bursts × 3-7 msgs (conversa real)"],
    checklist: ["Grupos + AutoSave mantidos", "2 conversas comunitárias ativas", "~24-56 msgs comunitárias", "Mensagens parecem naturais (emojis, textos curtos)"],
    tips: "As conversas comunitárias são entre instâncias da plataforma. Devem parecer orgânicas.",
    msgTarget: { min: 99, max: 201 }, groupTarget: 8, recipientTarget: 7,
  },
  // Days 7-30: Community Full — progressão segura (< 350 msgs/dia)
  ...Array.from({ length: 24 }, (_, i) => {
    const day = i + 7;
    const isCheckpoint = [7, 14, 21, 30].includes(day);
    const daysSinceCommunity = day - 6; // community starts day 6

    // Progressão de pares: 2→3→4→5→6→7
    const communityPairs = daysSinceCommunity <= 1 ? 2 :
                           daysSinceCommunity <= 5 ? 3 :
                           daysSinceCommunity <= 10 ? 4 :
                           daysSinceCommunity <= 15 ? 5 :
                           daysSinceCommunity <= 20 ? 6 : 7;

    // Bursts por par: 4→5→5→6→6→7
    const burstsPerPeer = daysSinceCommunity <= 1 ? 4 :
                          daysSinceCommunity <= 5 ? 5 :
                          daysSinceCommunity <= 10 ? 5 :
                          daysSinceCommunity <= 15 ? 6 :
                          daysSinceCommunity <= 20 ? 6 : 7;

    // Cada burst = 3-7 msgs → média 5
    const communityMsgsMin = communityPairs * burstsPerPeer * 3;
    const communityMsgsMax = communityPairs * burstsPerPeer * 7;

    return {
      day,
      phase: day >= 25 ? "consolidation" : "community_full",
      title: day === 7 ? "Comunidade completa ativada" :
             day === 14 ? "Checkpoint: 2 semanas ✅" :
             day === 21 ? "3 semanas de maturação 🔥" :
             day === 25 ? "Fase de consolidação" :
             day === 30 ? "Chip aquecido! 🎉🔥" :
             `Dia ${day} — Maturação contínua`,
      goals: [
        "Grupos: 50-120 mensagens nos 8 grupos",
        "Auto Save: 5 números × 5 msgs = 25/dia",
        `Comunitário: ${communityPairs} pares × ${burstsPerPeer} bursts (3-7 msgs cada)`,
        ...(isCheckpoint ? ["Health check completo da instância"] : []),
      ],
      checklist: [
        "Volume de grupos mantido (50-120)",
        "Auto Save ativo (25 msgs/dia)",
        `${communityPairs} conversas comunitárias (~${communityMsgsMin}-${communityMsgsMax} msgs)`,
        ...(isCheckpoint ? ["Zero bloqueios ou restrições", "Instância estável e saudável"] : ["Sem erros nos logs"]),
        ...(day === 30 ? ["🏆 Ciclo de 30 dias completo!", "Chip pronto para campanhas com delays seguros"] : []),
      ],
      tips: day === 7 ? "Primeira semana completa! Se não houve bloqueios, o chip está no caminho certo." :
            day === 14 ? "Duas semanas sem problemas = chip saudável. Continue o ritmo." :
            day === 21 ? "3 semanas! O chip já tem boa reputação. Mantenha a consistência." :
            day === 30 ? "🎉 Parabéns! O chip completou 30 dias de maturação. Use com delays seguros em campanhas." :
            undefined,
      msgTarget: { min: 50 + 25 + communityMsgsMin, max: 120 + 25 + communityMsgsMax },
      groupTarget: 8,
      recipientTarget: 5 + communityPairs,
    } as DayPlan;
  }),
];



// ═══════════════════════════════════════════════
// CHIP RECUPERADO — 30 dias, cautela máxima
// ═══════════════════════════════════════════════
const ROADMAP_BANIDO: DayPlan[] = [
  {
    day: 1, phase: "pre_24h", title: "🚨 Silêncio + Entrada nos grupos",
    goals: ["Conectar via QR Code", "Aguardar 3-6 horas sem atividade", "Entrar nos 8 grupos gradualmente ao longo do dia", "Não enviar grande volume"],
    checklist: ["Instância conectada (Ready)", "Proxy NOVO residencial configurado", "Aguardou período de espera", "Entrada nos 8 grupos distribuída"],
    tips: "⚠️ ATENÇÃO MÁXIMA! Chips com histórico de ban são sensíveis. Entrada gradual nos grupos, sem volume de mensagens.",
    msgTarget: { min: 0, max: 5 }, groupTarget: 8, recipientTarget: 0,
  },
  {
    day: 2, phase: "groups_only", title: "Primeiras mensagens nos grupos",
    goals: ["Enviar 80-150 mensagens nos 8 grupos", "Janela: 08:00-19:00", "Apenas textos curtos e emojis"],
    checklist: ["80-150 msgs em grupos", "Sem erros de envio", "Nenhuma restrição"],
    tips: "Volume CONSERVADOR. Muito abaixo do chip novo. Textos curtos e leves.",
    msgTarget: { min: 80, max: 150 }, groupTarget: 8, recipientTarget: 0,
  },
  {
    day: 3, phase: "groups_only", title: "Consolidando nos grupos",
    goals: ["Manter 80-150 msgs em grupos", "Monitorar de perto", "Verificar status da conta"],
    checklist: ["80-150 msgs", "Conta estável", "Sem warnings"],
    msgTarget: { min: 80, max: 150 }, groupTarget: 8, recipientTarget: 0,
  },
  {
    day: 4, phase: "autosave", title: "Auto Save cauteloso",
    goals: ["Grupos: 120-250 msgs", "Auto Save: 3 números × 2 msgs = 6/dia", "Volume reduzido vs chip novo"],
    checklist: ["Grupos + AutoSave funcionando", "6 msgs Auto Save", "3 destinatários únicos", "Sem restrições"],
    tips: "AutoSave com volume MENOR que chip novo. Apenas 3 números × 2 msgs.",
    msgTarget: { min: 126, max: 256 }, groupTarget: 8, recipientTarget: 3,
  },
  {
    day: 5, phase: "autosave", title: "AutoSave consolidando",
    goals: ["Grupos: 120-250 msgs", "Auto Save: 4 números × 2 msgs = 8/dia", "Monitorar estabilidade"],
    checklist: ["Grupos + AutoSave estáveis", "8 msgs Auto Save", "4 destinatários únicos", "Sem restrições"],
    msgTarget: { min: 128, max: 258 }, groupTarget: 8, recipientTarget: 4,
  },
  {
    day: 6, phase: "autosave", title: "AutoSave maduro",
    goals: ["Grupos: 120-250 msgs", "Auto Save: 5 números × 2 msgs = 10/dia", "Preparando para comunidade"],
    checklist: ["Grupos + AutoSave estáveis por 3 dias", "10 msgs Auto Save", "Sem restrições", "Instância saudável"],
    msgTarget: { min: 130, max: 260 }, groupTarget: 8, recipientTarget: 5,
  },
  {
    day: 7, phase: "community_light", title: "Comunidade leve + Checkpoint 1 semana ✅",
    goals: ["Grupos: 50-120 msgs", "Auto Save: 5 números × 2 msgs = 10/dia", "Comunitário: 2 pares × 3 bursts (3-7 msgs)", "Health check completo"],
    checklist: ["1 semana sem bloqueio!", "Grupos + AutoSave + Comunidade OK", "2 pares comunitários ativos", "~18-42 msgs comunitárias", "Conta saudável"],
    tips: "Uma semana sem ban! Bom sinal, mas mantenha a cautela. Chips banidos podem ter recaídas.",
    msgTarget: { min: 78, max: 172 }, groupTarget: 8, recipientTarget: 7,
  },
  // Days 8-30: Community Full (conservative) — progressão segura
  ...Array.from({ length: 23 }, (_, i) => {
    const day = i + 8;
    const isCheckpoint = [14, 21, 30].includes(day);
    const daysSinceCommunity = day - 7; // recovered community starts later

    // Progressão conservadora: 2→2→3→4→5→5
    const communityPairs = daysSinceCommunity <= 2 ? 2 :
                           daysSinceCommunity <= 6 ? 3 :
                           daysSinceCommunity <= 12 ? 4 :
                           daysSinceCommunity <= 18 ? 5 : 5;

    const burstsPerPeer = daysSinceCommunity <= 2 ? 3 :
                          daysSinceCommunity <= 6 ? 4 :
                          daysSinceCommunity <= 12 ? 4 :
                          daysSinceCommunity <= 18 ? 5 : 5;

    const communityMsgsMin = communityPairs * burstsPerPeer * 3;
    const communityMsgsMax = communityPairs * burstsPerPeer * 7;

    return {
      day,
      phase: day >= 25 ? "consolidation" : "community_full",
      title: day === 8 ? "Comunidade completa (conservadora)" :
             day === 14 ? "Checkpoint: 2 semanas ✅" :
             day === 21 ? "3 semanas de recuperação 🛡️" :
             day === 25 ? "Fase de consolidação" :
             day === 30 ? "Recuperação completa! 🎉🛡️" :
             `Dia ${day} — Recuperação contínua`,
      goals: [
        "Grupos: 50-120 msgs (conservador)",
        "Auto Save: 5 números × 5 msgs = 25/dia",
        `Comunitário: ${communityPairs} pares × ${burstsPerPeer} bursts`,
        ...(isCheckpoint ? ["Health check completo"] : []),
      ],
      checklist: [
        "Volume controlado (abaixo do chip novo)",
        "Auto Save: 25 msgs/dia",
        `${communityPairs} conversas comunitárias (~${communityMsgsMin}-${communityMsgsMax} msgs)`,
        ...(isCheckpoint ? ["Zero bloqueios ou restrições", "Instância estável"] : ["Logs limpos"]),
        ...(day === 30 ? ["🛡️ 30 dias de recuperação completo!", "Chip recuperado — usar com delays maiores que normal"] : []),
      ],
      tips: day === 14 ? "2 semanas de recuperação! Continue mantendo cautela." :
            day === 21 ? "3 semanas! Se não houve problemas, o chip está se recuperando bem." :
            day === 30 ? "🛡️ Recuperação de 30 dias completa! Use SEMPRE com delays maiores e volume menor que chips novos." : undefined,
      msgTarget: { min: 50 + 25 + communityMsgsMin, max: 120 + 25 + communityMsgsMax },
      groupTarget: 8,
      recipientTarget: 5 + communityPairs,
    } as DayPlan;
  }),
];

// ═══════════════════════════════════════════════
// CHIP FRACO — 30 dias, ultra-conservador
// ═══════════════════════════════════════════════
const ROADMAP_SENSIVEL: DayPlan[] = [
  {
    day: 1, phase: "pre_24h", title: "Entrada nos grupos apenas",
    goals: ["Conectar via QR Code", "Entrar nos 8 grupos gradualmente", "Sem envio intenso de mensagens"],
    checklist: ["Instância conectada (Ready)", "Proxy residencial configurado", "8 grupos ingressados (distribuído)", "Sem mensagens enviadas"],
    tips: "⚠️ Chip extremamente sensível. Apenas entre nos grupos, sem enviar nada.",
    msgTarget: { min: 0, max: 5 }, groupTarget: 8, recipientTarget: 0,
  },
  ...Array.from({ length: 3 }, (_, i) => ({
    day: i + 2,
    phase: "groups_only",
    title: i === 0 ? "Primeiras msgs conservadoras" : `Dia ${i + 2} — Grupos apenas`,
    goals: ["Enviar 50-120 mensagens nos grupos", "Janela: 09:00-18:00 (reduzida)", "Sem Auto Save, sem comunitário"],
    checklist: ["50-120 msgs em grupos", "Janela 09:00-18:00 respeitada", "Sem restrições", "Instância estável"],
    tips: i === 0 ? "Volume MUITO baixo. 50-120 msgs é o máximo. Janela reduzida de 09:00 a 18:00." : undefined,
    msgTarget: { min: 50, max: 120 }, groupTarget: 8, recipientTarget: 0,
  } as DayPlan)),
  {
    day: 5, phase: "autosave", title: "Auto Save leve",
    goals: ["Grupos: 120-200 msgs", "Ativar Auto Save: 3 números × 2 msgs = 6/dia"],
    checklist: ["120-200 msgs nos grupos", "6 msgs Auto Save", "3 destinatários", "Sem problemas"],
    tips: "Auto Save com volume mínimo: apenas 3 números com 2 msgs cada.",
    msgTarget: { min: 126, max: 206 }, groupTarget: 8, recipientTarget: 3,
  },
  ...Array.from({ length: 3 }, (_, i) => ({
    day: i + 6,
    phase: "autosave",
    title: i === 1 ? "Checkpoint: 1 semana ✅" : `Dia ${i + 6} — Grupos + AutoSave`,
    goals: ["Grupos: 120-220 msgs", "Auto Save: 3-4 números × 2 msgs"],
    checklist: ["120-220 msgs grupos", "6-8 msgs Auto Save", "Sem restrições"],
    tips: i === 1 ? "1 semana sem ban! Mas mantenha cautela — chip fraco pode recair." : undefined,
    msgTarget: { min: 126, max: 228 }, groupTarget: 8, recipientTarget: 4,
  } as DayPlan)),
  // Days 9-30: community_light — progressão ultra-conservadora (início Dia 9)
  ...Array.from({ length: 22 }, (_, i) => {
    const day = i + 9;
    const isCheckpoint = [14, 21, 30].includes(day);
    const daysSinceCommunity = day - 9;

    // Ultra-conservador: 1→2→2→3→3→4
    const communityPairs = daysSinceCommunity <= 2 ? 1 :
                           daysSinceCommunity <= 6 ? 2 :
                           daysSinceCommunity <= 10 ? 2 :
                           daysSinceCommunity <= 15 ? 3 : 4;

    const burstsPerPeer = daysSinceCommunity <= 2 ? 3 :
                          daysSinceCommunity <= 6 ? 3 :
                          daysSinceCommunity <= 10 ? 4 :
                          daysSinceCommunity <= 15 ? 4 : 5;

    const communityMsgsMin = communityPairs * burstsPerPeer * 3;
    const communityMsgsMax = communityPairs * burstsPerPeer * 7;

    return {
      day,
      phase: day >= 25 ? "consolidation" : "community_light",
      title: day === 9 ? "Comunitário leve ativado" :
             day === 14 ? "Checkpoint: 2 semanas ✅" :
             day === 21 ? "3 semanas de maturação 🛡️" :
             day === 25 ? "Consolidação final" :
             day === 30 ? "Chip estabilizado! 🎉🛡️" :
             `Dia ${day} — Maturação contínua`,
      goals: [
        "Grupos: 50-120 msgs (ultra-conservador)",
        "Auto Save: 5 números × 5 msgs = 25/dia",
        `Comunitário leve: ${communityPairs} pares × ${burstsPerPeer} bursts`,
        ...(isCheckpoint ? ["Health check completo"] : []),
      ],
      checklist: [
        "Volume controlado (< 250 msgs/dia)",
        "Auto Save: 25 msgs/dia",
        `${communityPairs} conversas comunitárias (~${communityMsgsMin}-${communityMsgsMax} msgs)`,
        ...(isCheckpoint ? ["Zero bloqueios", "Instância estável"] : ["Logs limpos"]),
        ...(day === 30 ? ["🛡️ 30 dias completos!", "Chip estabilizado — usar com delays seguros"] : []),
      ],
      tips: day === 14 ? "2 semanas! Continue conservador." :
            day === 21 ? "3 semanas sem problemas. O chip está melhorando." :
            day === 30 ? "🛡️ Ciclo completo! Use SEMPRE com delays maiores e volume conservador." : undefined,
      msgTarget: { min: 50 + 25 + communityMsgsMin, max: 120 + 25 + communityMsgsMax },
      groupTarget: 8,
      recipientTarget: 5 + communityPairs,
    } as DayPlan;
  }),
];

interface CategoryConfig {
  key: string;
  label: string;
  subtitle: string;
  icon: typeof Sparkles;
  iconColor: string;
  headerBg: string;
  message: string;
  roadmap: DayPlan[];
  days: number;
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: "novo",
    label: "🟢 Chip Novo",
    subtitle: "Número recém-ativado, sem histórico",
    icon: Sparkles,
    iconColor: "text-emerald-400",
    headerBg: "from-emerald-500/10 to-emerald-500/5",
    message: "Ciclo completo de 30 dias para maturação de um número virgem. O chip nunca foi usado no WhatsApp Business ou para disparos em massa. Segue o roteiro mais completo e seguro, passando por todas as fases de aquecimento gradual.",
    roadmap: ROADMAP_NOVO,
    days: 30,
  },
  {
    key: "banido",
    label: "🔴 Chip Recuperado",
    subtitle: "Número com histórico de bloqueio/restrição",
    icon: Skull,
    iconColor: "text-red-400",
    headerBg: "from-red-500/10 to-red-500/5",
    message: "⚠️ Ciclo de recuperação de 30 dias com cautela máxima. Este número já sofreu ban ou restrição. O volume é reduzido em todas as fases (80-350 msgs em grupos vs 200-500 do chip novo). AutoSave usa 2 msgs/contato (vs 3). Comunidade com pares menores. Mesmo após 30 dias, use sempre com delays maiores.",
    roadmap: ROADMAP_BANIDO,
    days: 30,
  },
  {
    key: "sensivel",
    label: "🟡 Chip Fraco",
    subtitle: "Número que sofre restrição facilmente",
    icon: AlertTriangle,
    iconColor: "text-yellow-400",
    headerBg: "from-yellow-500/10 to-yellow-500/5",
    message: "⚠️ Ciclo ultra-conservador de 30 dias. Para números que sofrem restrição muito facilmente. Volume reduzido (50-300 msgs), janela horária menor (09:00-18:00), AutoSave tardio (dia 6), e comunitário leve só a partir do dia 11. Nunca atinge community_enabled.",
    roadmap: ROADMAP_SENSIVEL,
    days: 30,
  },
];

const AdminWarmupRoadmap = () => {
  const [activeTab, setActiveTab] = useState("novo");
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({});

  const toggleCheck = (key: string) => {
    setCompletedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggle = (day: number) => {
    setExpandedDay(prev => prev === day ? null : day);
  };

  const activeCategory = CATEGORIES.find(c => c.key === activeTab)!;
  const roadmap = activeCategory.roadmap;

  // Group by phase
  const phaseOrder = [...new Set(roadmap.map(d => d.phase))];
  const phaseGroups = phaseOrder.map(phase => ({
    key: phase,
    days: roadmap.filter(d => d.phase === phase),
  }));

  return (
    <div className="space-y-4 max-h-[calc(100vh-180px)] overflow-y-auto pr-1" style={{ contain: "layout style", willChange: "scroll-position", overscrollBehavior: "contain" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Flame size={20} className="text-primary" />
        <div>
          <h2 className="text-base font-bold text-foreground">Roteiro de Aquecimento</h2>
          <p className="text-xs text-muted-foreground">Guia dia-a-dia por categoria de chip</p>
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setExpandedDay(null); }}>
        <TabsList className="w-full grid grid-cols-3 h-auto p-1">
          {CATEGORIES.map(cat => (
            <TabsTrigger key={cat.key} value={cat.key} className="text-xs py-2 data-[state=active]:shadow-sm">
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map(cat => (
          <TabsContent key={cat.key} value={cat.key} className="mt-4 space-y-4">
            {/* Category header card */}
            <div className={`rounded-xl border border-border bg-gradient-to-br ${cat.headerBg} p-4 space-y-2`}>
              <div className="flex items-center gap-2">
                <cat.icon size={18} className={cat.iconColor} />
                <div>
                  <p className="text-sm font-bold text-foreground">{cat.subtitle}</p>
                  <p className="text-[10px] text-muted-foreground">{cat.days} dias de ciclo</p>
                </div>
              </div>
              <p className="text-xs text-foreground/70 leading-relaxed">{cat.message}</p>
            </div>
          </TabsContent>
        ))}
      </Tabs>


      {/* Roadmap */}
      {phaseGroups.map(({ key, days }) => {
        const phase = PHASES[key] || { label: key, color: "bg-muted text-muted-foreground border-border" };
        return (
          <div key={`${activeTab}-${key}`} className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${phase.color.split(" ")[0]}`} />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {phase.label} — Dias {days[0].day}{days.length > 1 ? ` a ${days[days.length - 1].day}` : ""}
              </p>
            </div>

            <div className="space-y-1">
              {days.map((plan) => {
                const isOpen = expandedDay === plan.day;
                const dayChecks = plan.checklist.map((_, i) => `${activeTab}-d${plan.day}-c${i}`);
                const completedCount = dayChecks.filter(k => completedItems[k]).length;
                const allDone = completedCount === plan.checklist.length;

                return (
                  <div key={plan.day} className="bg-card border border-border rounded-lg overflow-hidden" style={{ contain: "content" }}>
                    <button
                      onClick={() => toggle(plan.day)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${
                        allDone ? "bg-emerald-500/20 text-emerald-400" : "bg-muted/50 text-muted-foreground"
                      }`}>
                        {plan.day}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{plan.title}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <MessageSquare size={10} /> {plan.msgTarget.min}-{plan.msgTarget.max}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Users size={10} /> {plan.recipientTarget}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Phone size={10} /> {plan.groupTarget}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${phase.color} hidden sm:flex`}>
                        {phase.label}
                      </Badge>
                      {allDone && <CheckCircle2 size={16} className="text-emerald-400" />}
                      <span className="text-[10px] text-muted-foreground">{completedCount}/{plan.checklist.length}</span>
                      {isOpen ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Objetivos do Dia</p>
                          <ul className="space-y-1.5">
                            {plan.goals.map((goal, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                                <span className="text-primary mt-0.5">•</span>
                                {goal}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Checklist</p>
                          <ul className="space-y-1.5">
                            {plan.checklist.map((item, i) => {
                              const key = `${activeTab}-d${plan.day}-c${i}`;
                              const done = !!completedItems[key];
                              return (
                                <li key={i}>
                                  <button
                                    onClick={() => toggleCheck(key)}
                                    className="flex items-center gap-2 text-sm text-left w-full hover:bg-muted/20 rounded px-1 py-0.5 transition-colors"
                                  >
                                    {done ? (
                                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                                    ) : (
                                      <Circle size={14} className="text-muted-foreground/40 shrink-0" />
                                    )}
                                    <span className={done ? "text-muted-foreground line-through" : "text-foreground/80"}>
                                      {item}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        {plan.tips && (
                          <div className={`flex items-start gap-2 rounded-lg px-3 py-2 ${
                            activeTab === "banido"
                              ? "bg-red-500/5 border border-red-500/20"
                              : "bg-primary/5 border border-primary/20"
                          }`}>
                            {activeTab === "banido" ? (
                              <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                            ) : (
                              <Shield size={14} className="text-primary mt-0.5 shrink-0" />
                            )}
                            <p className="text-xs text-foreground/70">{plan.tips}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-muted/20 rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-foreground">{plan.msgTarget.min}-{plan.msgTarget.max}</p>
                            <p className="text-[10px] text-muted-foreground">Msgs/dia</p>
                          </div>
                          <div className="bg-muted/20 rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-foreground">{plan.recipientTarget}</p>
                            <p className="text-[10px] text-muted-foreground">Destinatários</p>
                          </div>
                          <div className="bg-muted/20 rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-foreground">{plan.groupTarget}</p>
                            <p className="text-[10px] text-muted-foreground">Grupos</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AdminWarmupRoadmap;
