import { Check, ArrowRight, Crown, Bell, Zap, Shield, Sparkles, BarChart3, Lock, Activity, TrendingUp, MessageSquare, Bot } from "lucide-react";

const buildWhatsappUrl = (plan: { name: string; instances: number | string; price: string }) => {
  const inst = typeof plan.instances === "number" ? plan.instances : plan.instances;
  const msg = `Olá, tudo bem?\nTenho interesse em contratar o plano DG Contingência – ${plan.name} (${inst} Instâncias) no valor de R$ ${plan.price}/mês.\nPode me enviar os dados para ativação e pagamento?`;
  return `https://wa.me/5562994192500?text=${encodeURIComponent(msg)}`;
};

const buildCustomWhatsappUrl = () => {
  const msg = `Olá, quero um plano customizado para alta escala`;
  return `https://wa.me/5562994192500?text=${encodeURIComponent(msg)}`;
};

const buildAddonWhatsappUrl = () => {
  const msg = `Olá, tudo bem?\nTenho interesse em contratar o addon Relatórios via WhatsApp no valor de R$ 18,90/mês.\nPode me enviar os dados para ativação?`;
  return `https://wa.me/5562994192500?text=${encodeURIComponent(msg)}`;
};

const buildAutoReplyAddonUrl = (tier: string, price: string) => {
  const msg = `Olá, tudo bem?\nTenho interesse em contratar o addon Resposta Automática Inteligente – ${tier} no valor de R$ ${price}/mês.\nPode me enviar os dados para ativação?`;
  return `https://wa.me/5562994192500?text=${encodeURIComponent(msg)}`;
};

const plans = [
  {
    name: "Essencial",
    instances: 5,
    price: "89,90",
    subtitle: "Ideal para quem está iniciando e quer aquecer chips com segurança e estrutura profissional.",
    extraCopy: null,
    cta: "Começar agora",
    popular: false,
    highlight: false,
    reportsIncluded: false,
    features: [
      "Aquecimento automatizado",
      "Disparo interativo",
      "Monitoramento em tempo real limitado",
      "Suporte padrão",
      "Relatórios via WhatsApp (add-on)",
      "Módulos extras disponíveis",
    ],
  },
  {
    name: "Start",
    instances: 10,
    price: "159,90",
    subtitle: "Ideal para quem quer escalar com segurança após validar a operação.",
    extraCopy: "Melhor custo-benefício inicial",
    cta: "Começar agora",
    popular: false,
    highlight: false,
    reportsIncluded: false,
    features: [
      "Aquecimento automatizado",
      "Disparo interativo",
      "Painel centralizado",
      "Monitoramento em tempo real",
      "Organização de instâncias",
      "Relatórios via WhatsApp (add-on)",
      "Módulos extras disponíveis",
    ],
  },
  {
    name: "Pro",
    instances: 30,
    price: "349,90",
    subtitle: "Estrutura ideal para operadores ativos que precisam escalar com consistência.",
    extraCopy: "Recomendado para operações reais",
    cta: "Escalar operação",
    popular: true,
    highlight: false,
    reportsIncluded: false,
    features: [
      "Aquecimento automatizado",
      "Disparo interativo",
      "Painel centralizado",
      "Gestão avançada de instâncias",
      "Monitoramento completo",
      "Suporte prioritário",
      "Relatórios via WhatsApp (add-on)",
      "Módulos extras disponíveis",
    ],
  },
  {
    name: "Scale",
    instances: 50,
    price: "549,90",
    subtitle: "Para quem precisa escalar com mais chips e visibilidade sobre toda a operação.",
    extraCopy: null,
    cta: "Escalar operação",
    popular: false,
    highlight: true,
    reportsIncluded: true,
    features: [
      "Aquecimento automatizado",
      "Disparo interativo",
      "Painel centralizado",
      "Monitoramento em tempo real",
      "Suporte prioritário",
      "Relatórios via WhatsApp incluso",
      "Módulos extras disponíveis",
    ],
  },
  {
    name: "Elite",
    instances: 100,
    price: "999,90",
    subtitle: "Ideal para operações que exigem volume alto com performance e suporte dedicado.",
    extraCopy: "Alta performance garantida",
    cta: "Ir para o Elite",
    popular: false,
    highlight: false,
    reportsIncluded: true,
    features: [
      "Aquecimento automatizado em escala",
      "Disparo avançado",
      "Monitoramento avançado",
      "Suporte VIP",
      "Relatórios via WhatsApp incluso",
      "Módulos extras disponíveis",
    ],
  },
  {
    name: "Custom",
    instances: "200+",
    price: "",
    subtitle: "Soluções personalizadas para operações de grande escala com necessidades específicas.",
    extraCopy: null,
    cta: "Falar com suporte",
    popular: false,
    highlight: false,
    reportsIncluded: true,
    isCustom: true,
    features: [
      "Instâncias sob medida",
      "Aquecimento automatizado em escala",
      "Estrutura personalizada",
      "Infraestrutura dedicada",
      "Suporte VIP",
      "Ajustes personalizados",
      "Relatórios via WhatsApp incluso",
      "Configuração sob consulta",
    ],
  },
];

const comparisonRows = [
  { label: "Instâncias", values: ["5", "10", "30", "50", "100", "200+"] },
  { label: "Aquecimento automático", values: [true, true, true, true, true, true] },
  { label: "Disparo de mensagens", values: [true, true, true, true, true, true] },
  { label: "Monitoramento", values: ["Limitado", "Tempo real", "Completo", "Tempo real", "Avançado", "Avançado"] },
  { label: "Relatórios via WhatsApp", values: ["Add-on", "Add-on", "Add-on", "Incluso", "Incluso", "Incluso"] },
  { label: "Suporte prioritário", values: [false, false, true, true, true, true] },
  { label: "Módulos extras", values: ["Disponível", "Disponível", "Disponível", "Disponível", "Disponível", "Disponível"] },
];

const MyPlan = () => {
  return (
    <div className="min-h-screen pb-24 -m-2.5 sm:-m-5 md:-m-8 bg-background">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 space-y-16 sm:space-y-20">

        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto pt-12 sm:pt-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6 border border-amber-500/20 bg-amber-500/5 text-amber-400">
            <Sparkles className="w-3.5 h-3.5" />
            Planos flexíveis para qualquer escala
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-[2.75rem] font-bold tracking-tight leading-[1.15] text-foreground">
            Escolha o plano ideal para escalar sua operação com estabilidade
          </h1>
          <p className="text-sm sm:text-base mt-5 leading-relaxed max-w-lg mx-auto text-muted-foreground">
            Todos os planos incluem aquecimento automatizado, disparador inteligente e monitoramento em tempo real.
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 xl:gap-3">
          {plans.map((plan) => {
            const isCustom = "isCustom" in plan && plan.isCustom;
            return (
              <div
                key={plan.name}
                className={`group relative flex flex-col rounded-2xl transition-all duration-200 hover:scale-[1.02] ${
                  plan.popular
                    ? "border-2 border-amber-500/40 shadow-[0_0_30px_-8px_rgba(245,158,11,0.2)] hover:border-amber-500/60 hover:shadow-[0_0_40px_-8px_rgba(245,158,11,0.35)]"
                    : plan.highlight
                    ? "border border-border hover:border-border/80"
                    : "border border-border/60 hover:border-border"
                }`}
              >
                <div
                  className={`relative flex flex-col h-full rounded-2xl p-5 xl:p-4 2xl:p-5 ${
                    plan.popular ? "bg-card" : plan.highlight ? "bg-card" : "bg-card"
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-[9px] xl:text-[8px] 2xl:text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap shadow-[0_0_20px_-4px_rgba(245,158,11,0.5)]">
                      ⭐ Mais Escolhido
                    </span>
                  )}

                  {/* ── HEADER: name + instances ── */}
                  <div className="min-h-[40px]">
                    <h3 className="text-base xl:text-sm 2xl:text-base font-semibold text-foreground mt-1">{plan.name}</h3>
                    <p className="text-[11px] xl:text-[10px] 2xl:text-[11px] text-muted-foreground">
                      {typeof plan.instances === "number" ? `${plan.instances} instâncias` : `${plan.instances} instâncias`}
                    </p>
                  </div>

                  {/* ── DESCRIPTION: fixed height ── */}
                  <p className="text-[11px] xl:text-[10px] 2xl:text-[11px] text-muted-foreground/60 leading-relaxed mt-2 min-h-[44px] xl:min-h-[52px]">
                    {plan.subtitle}
                  </p>

                  {/* ── EXTRA COPY ── */}
                  <div className="min-h-[18px] mt-1">
                    {plan.extraCopy && (
                      <p className={`text-[10px] xl:text-[9px] 2xl:text-[10px] font-medium leading-relaxed ${
                        plan.popular ? "text-amber-400/70" : plan.highlight ? "text-teal-400/60" : "text-emerald-400/50"
                      }`}>
                        {plan.extraCopy}
                      </p>
                    )}
                  </div>

                  {/* ── PRICE ── */}
                  <div className="mt-3 mb-3 min-h-[40px] flex items-end">
                    {isCustom ? (
                      <span className="text-xl xl:text-lg 2xl:text-xl font-bold text-foreground">Sob consulta</span>
                    ) : (
                      <div className="flex items-baseline">
                        <span className="text-2xl xl:text-xl 2xl:text-2xl font-bold text-foreground">R$ {plan.price}</span>
                        <span className="text-muted-foreground/60 text-xs ml-1"> / mês</span>
                      </div>
                    )}
                  </div>

                  <div className="h-px bg-border/50 mb-4" />

                  {/* ── FEATURES: flex-1 to push button down ── */}
                  <div className="flex-1 space-y-2 xl:space-y-1.5 2xl:space-y-2 mb-5">
                    {plan.features.map((f, fi) => (
                      <div key={fi} className="flex items-start gap-2 text-[11px] xl:text-[10px] 2xl:text-[11px] text-muted-foreground">
                        <Check className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] shrink-0 mt-px text-muted-foreground/50" />
                        <span className="leading-snug">{f}</span>
                      </div>
                    ))}
                  </div>

                  {/* ── CTA BUTTON: always at bottom ── */}
                  <a
                    href={isCustom ? buildCustomWhatsappUrl() : buildWhatsappUrl(plan as any)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-auto w-full h-11 xl:h-10 2xl:h-11 rounded-lg font-semibold text-[13px] xl:text-[11px] 2xl:text-[13px] whitespace-nowrap flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.98] hover:brightness-110 ${
                      plan.popular
                        ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold shadow-[0_0_20px_-4px_rgba(245,158,11,0.4)]"
                        : plan.highlight
                        ? "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80"
                        : "bg-muted text-muted-foreground border border-border/60 hover:bg-muted/80"
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* ════════════ ADD-ONS ════════════ */}
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-lg font-bold text-foreground flex items-center justify-center gap-2">
              <Zap className="w-4.5 h-4.5 text-amber-400" />
              Add-ons
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Potencialize sua operação com módulos extras.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {/* Addon 1: Relatórios via WhatsApp */}
            <div className="relative flex flex-col rounded-2xl border border-border/60 bg-card hover:border-border transition-all duration-200 hover:scale-[1.01]">
              <div className="p-5 sm:p-6 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/10 border border-amber-500/15">
                    <Bell className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-foreground mb-0.5">Relatórios via WhatsApp</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Receba relatórios automáticos e alertas diretamente no WhatsApp.
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Já incluso nos planos Scale e Elite.</p>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between pt-3 border-t border-border/40">
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-xs font-medium text-muted-foreground">R$</span>
                    <span className="text-xl font-extrabold tracking-tighter leading-none text-foreground">18</span>
                    <span className="text-sm font-bold text-muted-foreground">,90</span>
                    <span className="text-[10px] text-muted-foreground/60 ml-0.5">/mês</span>
                  </div>
                  <a
                    href={buildAddonWhatsappUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 h-9 font-semibold text-xs flex items-center gap-1.5 transition-all duration-200 rounded-lg bg-muted text-muted-foreground border border-border/60 hover:bg-muted/80 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Ativar
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>

            {/* Addon 2: Resposta Automática Inteligente */}
            <div className="relative flex flex-col rounded-2xl border border-border/60 bg-card hover:border-border transition-all duration-200 hover:scale-[1.01]">
              <div className="p-5 sm:p-6 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-teal-500/10 border border-teal-500/15">
                    <Bot className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-foreground mb-0.5">Resposta Automática Inteligente</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Automatize conversas, respostas e fluxos sem intervenção manual.
                    </p>
                  </div>
                </div>

                {/* Two tiers — equal height columns */}
                <div className="mt-auto grid grid-cols-2 gap-3 pt-3 border-t border-border/40">
                  {/* Básico */}
                  <div className="flex flex-col">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Básico</p>
                    <div className="flex items-baseline gap-0.5 mb-2">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <span className="text-lg font-extrabold tracking-tighter leading-none text-foreground">29</span>
                      <span className="text-xs font-bold text-muted-foreground">,90</span>
                      <span className="text-[9px] text-muted-foreground/60 ml-0.5">/mês</span>
                    </div>
                    <div className="space-y-1 mb-3 flex-1">
                      <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Check className="w-3 h-3 shrink-0 text-muted-foreground/50" />Até 3 fluxos</p>
                      <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Check className="w-3 h-3 shrink-0 text-muted-foreground/50" />Respostas automáticas simples</p>
                    </div>
                    <a
                      href={buildAutoReplyAddonUrl("Básico", "29,90")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-auto w-full h-8 font-semibold text-[10px] flex items-center justify-center gap-1 transition-all duration-200 rounded-md bg-muted text-muted-foreground border border-border/60 hover:bg-muted/80 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      Ativar
                    </a>
                  </div>

                  {/* Pro */}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-400/70">Pro</p>
                      <span className="text-[8px] bg-teal-500/15 text-teal-400/70 px-1.5 py-0.5 rounded-full font-semibold">Recomendado</span>
                    </div>
                    <div className="flex items-baseline gap-0.5 mb-2">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <span className="text-lg font-extrabold tracking-tighter leading-none text-foreground">49</span>
                      <span className="text-xs font-bold text-muted-foreground">,90</span>
                      <span className="text-[9px] text-muted-foreground/60 ml-0.5">/mês</span>
                    </div>
                    <div className="space-y-1 mb-3 flex-1">
                      <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Check className="w-3 h-3 shrink-0 text-teal-500/50" />Fluxos ilimitados</p>
                      <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Check className="w-3 h-3 shrink-0 text-teal-500/50" />Automação completa e ilimitada</p>
                      <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Check className="w-3 h-3 shrink-0 text-teal-500/50" />Ideal para escalar atendimento</p>
                    </div>
                    <a
                      href={buildAutoReplyAddonUrl("Pro", "49,90")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-auto w-full h-8 font-semibold text-[10px] flex items-center justify-center gap-1 transition-all duration-200 rounded-md bg-teal-500/10 text-teal-400/80 border border-teal-500/20 hover:bg-teal-500/15 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      Ativar
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════ COMPARISON TABLE ════════════ */}
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-xl font-bold flex items-center justify-center gap-2.5 text-foreground">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              Comparação rápida
            </h2>
            <p className="text-sm mt-2 text-muted-foreground">
              Veja o que cada plano oferece lado a lado.
            </p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left px-4 py-3.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider w-[160px] text-muted-foreground">Recurso</th>
                  {plans.map(p => (
                    <th
                      key={p.name}
                      className={`text-center px-2 py-3.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${
                        p.popular ? "text-amber-400 bg-amber-500/[0.04]" : "text-muted-foreground"
                      }`}
                    >
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, ri) => (
                  <tr
                    key={ri}
                    className={`border-t border-border/40 transition-colors duration-100 hover:bg-muted/20 ${
                      ri % 2 === 1 ? "bg-muted/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-[12px] font-medium text-muted-foreground">
                      {row.label}
                    </td>
                    {row.values.map((val, vi) => {
                      const isPro = plans[vi].popular;
                      return (
                        <td
                          key={vi}
                          className={`text-center px-2 py-3 align-middle ${isPro ? "bg-amber-500/[0.04]" : ""}`}
                        >
                          {typeof val === "boolean" ? (
                            val ? (
                              <Check className={`w-4 h-4 mx-auto ${isPro ? "text-amber-400/70" : "text-emerald-500/60"}`} strokeWidth={2.5} />
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )
                          ) : (
                            <span className={`text-[11px] font-semibold ${isPro ? "text-amber-400/90" : "text-foreground/60"}`}>
                              {val}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trust badges */}
        <div className="space-y-6 pb-8">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-500/50" />
              Sem fidelidade
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-500/50" />
              Upgrade imediato
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-500/50" />
              Garantia de 7 dias
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-10 text-sm text-muted-foreground/60">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              Infraestrutura segura
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 shrink-0" />
              Operação estável
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 shrink-0" />
              Monitoramento contínuo
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyPlan;
