import { useState } from "react";
import { Check, ArrowRight, Crown, Bell, Zap, Shield, Sparkles, BarChart3, Lock, Activity, TrendingUp, MessageSquare, Loader2 } from "lucide-react";
import CreditPackCards from "@/components/credits/CreditPackCards";
import { startCheckout } from "@/lib/stripe";
import { toast } from "sonner";

const buildCustomWhatsappUrl = () => {
  const msg = `Olá, quero um plano customizado para alta escala`;
  return `https://wa.me/5562994192500?text=${encodeURIComponent(msg)}`;
};

const buildAddonWhatsappUrl = () => {
  const msg = `Olá, tudo bem?\nTenho interesse em contratar o addon Relatórios via WhatsApp no valor de R$ 18,90/mês.\nPode me enviar os dados para ativação?`;
  return `https://wa.me/5562994192500?text=${encodeURIComponent(msg)}`;
};


const baseFeaturesNoWA = [
  "Todas as funcionalidades inclusas",
  "Mesmo nível de suporte",
  "Monitoramento em tempo real",
  "Infraestrutura completa",
];

const plans = [
  {
    name: "Essencial",
    instances: 5,
    price: "99,00",
    subtitle: "Ideal para quem está começando com poucas instâncias.",
    extraCopy: null,
    cta: "Começar agora",
    popular: false,
    highlight: false,
    reportsIncluded: false,
    features: [...baseFeaturesNoWA],
    whatsappLine: "Relatórios via WhatsApp",
    whatsappIncluded: false,
  },
  {
    name: "Start",
    instances: 10,
    price: "187,00",
    subtitle: "Ideal para quem quer aumentar a capacidade.",
    extraCopy: null,
    cta: "Começar agora",
    popular: false,
    highlight: false,
    reportsIncluded: false,
    features: [...baseFeaturesNoWA],
    whatsappLine: "Relatórios via WhatsApp",
    whatsappIncluded: false,
  },
  {
    name: "Pro",
    instances: 30,
    price: "397,00",
    subtitle: "Ideal para operações em crescimento.",
    extraCopy: "Mais escolhido",
    cta: "Escalar operação",
    popular: true,
    highlight: false,
    reportsIncluded: true,
    features: [...baseFeaturesNoWA],
    whatsappLine: "Relatórios via WhatsApp incluso",
    whatsappIncluded: true,
  },
  {
    name: "Scale",
    instances: 50,
    price: "597,00",
    subtitle: "Para quem precisa escalar com múltiplas instâncias.",
    extraCopy: null,
    cta: "Escalar operação",
    popular: false,
    highlight: true,
    reportsIncluded: true,
    features: [...baseFeaturesNoWA],
    whatsappLine: "Relatórios via WhatsApp incluso",
    whatsappIncluded: true,
  },
  {
    name: "Elite",
    instances: 100,
    price: "1.197,00",
    subtitle: "Alta capacidade para operações grandes.",
    extraCopy: null,
    cta: "Ir para o Elite",
    popular: false,
    highlight: false,
    reportsIncluded: true,
    features: [...baseFeaturesNoWA],
    whatsappLine: "Relatórios via WhatsApp incluso",
    whatsappIncluded: true,
  },
  {
    name: "Custom",
    instances: "200+",
    price: "",
    subtitle: "Solução personalizada para grande escala.",
    extraCopy: null,
    cta: "Falar com suporte",
    popular: false,
    highlight: false,
    reportsIncluded: true,
    isCustom: true,
    features: [...baseFeaturesNoWA],
    whatsappLine: "Relatórios via WhatsApp incluso",
    whatsappIncluded: true,
  },
];

const comparisonRows = [
  { label: "Instâncias", values: ["5", "10", "30", "50", "100", "200+"] },
  { label: "Todas as funcionalidades", values: [true, true, true, true, true, true] },
  { label: "Mesmo nível de suporte", values: [true, true, true, true, true, true] },
  { label: "Monitoramento em tempo real", values: [true, true, true, true, true, true] },
  { label: "Infraestrutura completa", values: [true, true, true, true, true, true] },
  { label: "Relatórios via WhatsApp", values: [false, false, "Incluso", "Incluso", "Incluso", "Incluso"] },
];

const MyPlan = () => {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSelectPlan = async (plan: typeof plans[0]) => {
    const isCustom = "isCustom" in plan && plan.isCustom;
    if (isCustom) {
      window.open(buildCustomWhatsappUrl(), "_blank");
      return;
    }
    setLoadingPlan(plan.name);
    try {
      await startCheckout({
        planName: plan.name,
        instances: plan.instances,
        price: plan.price,
      });
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar checkout");
    } finally {
      setLoadingPlan(null);
    }
  };

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
                    <div className={`flex items-start gap-2 text-[11px] xl:text-[10px] 2xl:text-[11px] ${plan.whatsappIncluded ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                      {plan.whatsappIncluded ? (
                        <Check className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] shrink-0 mt-px text-muted-foreground/50" />
                      ) : (
                        <span className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] shrink-0 mt-px flex items-center justify-center text-muted-foreground/30 font-bold text-xs">✕</span>
                      )}
                      <span className="leading-snug">{plan.whatsappLine}</span>
                    </div>
                  </div>

                  {/* ── CTA BUTTON: always at bottom ── */}
                  <button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={loadingPlan === plan.name}
                    className={`mt-auto w-full h-11 xl:h-10 2xl:h-11 rounded-lg font-semibold text-[13px] xl:text-[11px] 2xl:text-[13px] whitespace-nowrap flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.98] hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed ${
                      plan.popular
                        ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold shadow-[0_0_20px_-4px_rgba(245,158,11,0.4)]"
                        : plan.highlight
                        ? "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80"
                        : "bg-muted text-muted-foreground border border-border/60 hover:bg-muted/80"
                    }`}
                  >
                    {loadingPlan === plan.name ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        {plan.cta}
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
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
