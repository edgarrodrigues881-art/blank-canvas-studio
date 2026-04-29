import { useState } from "react";
import { Check, ArrowRight, Sparkles, BarChart3, Lock, Activity, TrendingUp, Smartphone, CheckCircle2, Loader2, MessageSquareText, BellRing, LineChart, Clock } from "lucide-react";
import CreditPackCards from "@/components/credits/CreditPackCards";
import { startCheckout } from "@/lib/stripe";
import { toast } from "sonner";

// ─── Planos espelhados da Landing Page ───
const plans = [
  {
    name: "Starter",
    instances: 1,
    price: "39,99",
    tagline: "Tudo para começar a vender mais pelo WhatsApp com um número. CRM, disparo, automações, IA e prospecção em um só lugar.",
    cta: "Começar agora",
    popular: false,
    benefits: [
      "1 chip simultâneo",
      "CRM, automações e IA inclusos",
      "Aquecimento e disparo inclusos",
    ],
    whatsappIncluded: false,
  },
  {
    name: "Essencial",
    instances: 5,
    price: "99,99",
    tagline: "Opere com consistência usando até 5 números. Distribua atendimentos, mantenha backup e escale seus disparos sem travar a operação.",
    cta: "Testar o sistema",
    popular: false,
    benefits: [
      "Até 5 chips simultâneos",
      "CRM, automações e IA inclusos",
      "Aquecimento e disparo inclusos",
    ],
    whatsappIncluded: false,
  },
  {
    name: "Pro",
    instances: 10,
    price: "187,99",
    tagline: "Operação profissional com 10 números trabalhando juntos. Mais alcance no disparo, mais leads no CRM e mais produtividade no time.",
    cta: "Começar agora",
    popular: false,
    benefits: [
      "Até 10 chips simultâneos",
      "CRM completo + pipelines",
      "Prospecção e IA inclusos",
    ],
    whatsappIncluded: false,
  },
  {
    name: "Scale",
    instances: 30,
    price: "397,99",
    tagline: "Escale com 30 números, automações avançadas e relatórios direto no WhatsApp. Ideal para times que vendem em alto volume todos os dias.",
    cta: "Começar agora",
    popular: true,
    benefits: [
      "Até 30 chips simultâneos",
      "Suporte prioritário no WhatsApp",
      "Relatórios e alertas via WhatsApp",
    ],
    whatsappIncluded: true,
  },
  {
    name: "Business",
    instances: 50,
    price: "597,99",
    tagline: "Estrutura robusta com 50 números para empresas que precisam de performance, organização e controle total da operação comercial.",
    cta: "Começar agora",
    popular: false,
    benefits: [
      "Até 50 chips simultâneos",
      "Suporte prioritário no WhatsApp",
      "Relatórios e alertas via WhatsApp",
    ],
    whatsappIncluded: true,
  },
  {
    name: "Enterprise",
    instances: 100,
    price: "1.097,99",
    tagline: "Máxima capacidade com 100 números simultâneos. Para grandes operações que exigem escala industrial, IA dedicada e prospecção em larga escala.",
    cta: "Começar agora",
    popular: false,
    benefits: [
      "Até 100 chips simultâneos",
      "Suporte prioritário dedicado",
      "Relatórios e alertas via WhatsApp",
    ],
    whatsappIncluded: true,
  },
];

const WA_GREEN = "#25D366";
const WA_GREEN_DARK = "#07C160";

const comparisonRows = [
  { label: "Instâncias", values: ["1", "5", "10", "30", "50", "100"] },
  { label: "CRM completo", values: [true, true, true, true, true, true] },
  { label: "Automações e IA", values: [true, true, true, true, true, true] },
  { label: "Aquecimento e disparo", values: [true, true, true, true, true, true] },
  { label: "Monitoramento em tempo real", values: [true, true, true, true, true, true] },
  { label: "Suporte prioritário no WhatsApp", values: [true, true, true, true, true, true] },
  { label: "Relatórios via WhatsApp", values: [false, false, false, "Incluso", "Incluso", "Incluso"] },
];

const MyPlan = () => {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSelectPlan = async (plan: typeof plans[0]) => {
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
            Acesso completo em todos os planos. Muda apenas a capacidade e o nível de suporte.
          </p>
        </div>

        {/* Plans Grid — espelhado da Landing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 xl:gap-3 pt-4">
          {plans.map((p) => {
            const isPopular = p.popular;
            return (
              <div
                key={p.name}
                style={
                  isPopular
                    ? { boxShadow: "0 0 0 1px rgba(234,179,8,0.35), 0 20px 60px -20px rgba(234,179,8,0.35)" }
                    : undefined
                }
                className={`relative rounded-2xl flex flex-col h-full p-5 transition-all duration-300 ease-out hover:-translate-y-1 ${
                  isPopular
                    ? "bg-gradient-to-b from-yellow-500/[0.07] via-card to-card border border-yellow-500/50 xl:scale-[1.04]"
                    : "bg-card border border-border/60 hover:border-[#25D366]/50 hover:shadow-[0_0_30px_-8px_rgba(37,211,102,0.35)]"
                }`}
              >
                {isPopular && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] text-slate-900 shadow-[0_8px_20px_-6px_rgba(234,179,8,0.6)] whitespace-nowrap"
                    style={{ background: "linear-gradient(135deg, #FCD34D 0%, #EAB308 100%)" }}
                  >
                    ★ Mais escolhido
                  </span>
                )}

                {/* Nome */}
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/45 mb-3">
                  {p.name}
                </h3>

                {/* Preço */}
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-[12px] font-medium text-foreground/40">R$</span>
                  <span className="text-[2rem] font-bold tracking-[-0.03em] leading-none text-foreground">
                    {p.price.split(",")[0]}
                  </span>
                  <span className="text-[14px] font-semibold text-foreground/55">,{p.price.split(",")[1]}</span>
                  <span className="text-[11px] text-foreground/35 ml-0.5">/mês</span>
                </div>

                {/* Destaque instâncias */}
                <div
                  className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-lg mb-4 border"
                  style={{
                    background: isPopular ? "rgba(234,179,8,0.10)" : "rgba(37,211,102,0.08)",
                    borderColor: isPopular ? "rgba(234,179,8,0.35)" : "rgba(37,211,102,0.25)",
                  }}
                >
                  <Smartphone className="w-3.5 h-3.5" style={{ color: isPopular ? "#FCD34D" : WA_GREEN }} />
                  <span className="text-[12px] font-bold text-foreground tracking-tight">
                    {p.instances} {p.instances === 1 ? "Instância" : "Instâncias"}
                  </span>
                </div>

                <div className="border-t border-border/50 mb-4" />

                <p className="text-[11px] text-muted-foreground leading-[1.55] mb-4 line-clamp-3">
                  {p.tagline}
                </p>

                <ul className="space-y-2 mb-5 flex-1">
                  {p.benefits.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[11.5px] text-foreground/70 leading-[1.45]">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-[2px]" style={{ color: WA_GREEN }} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(p)}
                  disabled={loadingPlan === p.name}
                  style={
                    isPopular
                      ? {
                          background: `linear-gradient(135deg, ${WA_GREEN} 0%, ${WA_GREEN_DARK} 100%)`,
                          color: "#ffffff",
                          boxShadow: "0 8px 20px -6px rgba(7,193,96,0.5)",
                        }
                      : undefined
                  }
                  className={`w-full h-10 text-[12.5px] font-semibold rounded-lg mt-auto flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${
                    isPopular
                      ? "hover:brightness-110 hover:shadow-[0_10px_30px_-8px_rgba(37,211,102,0.7)] border-0"
                      : "bg-transparent text-foreground border border-[#25D366]/40 hover:border-[#25D366] hover:bg-[#25D366]/10"
                  }`}
                >
                  {loadingPlan === p.name ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {p.cta}
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>


        {/* ════════════ ADD-ON: RELATÓRIOS VIA WHATSAPP ════════════ */}
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-5 border"
              style={{ borderColor: "rgba(234,179,8,0.35)", background: "rgba(234,179,8,0.08)", color: "#FCD34D" }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Complemento opcional
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Adicione Relatórios via WhatsApp ao seu plano
            </h2>
            <p className="text-sm mt-3 text-muted-foreground max-w-xl mx-auto">
              Receba métricas, alertas e resumos diários direto no seu WhatsApp — disponível para qualquer plano como complemento mensal.
            </p>
          </div>

          <div
            className="relative rounded-2xl p-6 sm:p-8 border overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, rgba(37,211,102,0.06) 0%, rgba(20,20,30,0.4) 50%, rgba(234,179,8,0.06) 100%)",
              borderColor: "rgba(37,211,102,0.25)",
              boxShadow: "0 20px 60px -25px rgba(37,211,102,0.35)",
            }}
          >
            {/* Glow decorativo */}
            <div
              className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(37,211,102,0.18) 0%, transparent 70%)" }}
            />

            <div className="relative grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
              {/* Lado esquerdo — descrição + benefícios */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${WA_GREEN} 0%, ${WA_GREEN_DARK} 100%)`,
                      boxShadow: "0 8px 20px -6px rgba(7,193,96,0.5)",
                    }}
                  >
                    <MessageSquareText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground leading-tight">
                      Relatórios via WhatsApp
                    </h3>
                    <p className="text-[12px] text-muted-foreground">
                      Add-on mensal · funciona com qualquer plano
                    </p>
                  </div>
                </div>

                <ul className="space-y-2.5 mt-5">
                  {[
                    { icon: BellRing, text: "Alertas em tempo real de desconexões e falhas" },
                    { icon: LineChart, text: "Resumos diários de disparos, leads e conversões" },
                    { icon: Clock, text: "Relatórios programados nos horários que você definir" },
                    { icon: CheckCircle2, text: "Cobertura para todas as instâncias da sua conta" },
                  ].map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13px] text-foreground/80 leading-[1.5]">
                      <b.icon className="w-4 h-4 flex-shrink-0 mt-[2px]" style={{ color: WA_GREEN }} />
                      <span>{b.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Lado direito — preço + CTA */}
              <div
                className="rounded-xl p-6 border bg-card/60 backdrop-blur-sm"
                style={{ borderColor: "rgba(37,211,102,0.30)" }}
              >
                <div className="text-center">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
                    A partir de
                  </span>
                  <div className="flex items-baseline justify-center gap-1 mt-2 mb-1">
                    <span className="text-[12px] font-medium text-foreground/40">R$</span>
                    <span className="text-[2.5rem] font-bold tracking-[-0.03em] leading-none text-foreground">
                      29
                    </span>
                    <span className="text-[16px] font-semibold text-foreground/55">,99</span>
                    <span className="text-[11px] text-foreground/35 ml-0.5">/mês</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-5">
                    Cobre todas as instâncias da conta
                  </p>

                  <button
                    onClick={() =>
                      handleSelectPlan({
                        name: "Add-on Relatórios WhatsApp",
                        instances: 0,
                        price: "29,99",
                      } as any)
                    }
                    disabled={loadingPlan === "Add-on Relatórios WhatsApp"}
                    style={{
                      background: `linear-gradient(135deg, ${WA_GREEN} 0%, ${WA_GREEN_DARK} 100%)`,
                      color: "#ffffff",
                      boxShadow: "0 8px 20px -6px rgba(7,193,96,0.5)",
                    }}
                    className="w-full h-11 text-[13px] font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.98] hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loadingPlan === "Add-on Relatórios WhatsApp" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Ativar add-on
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </>
                    )}
                  </button>

                  <p className="text-[10.5px] text-muted-foreground/70 mt-3 leading-[1.4]">
                    Já incluso nos planos Scale, Business e Enterprise
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════ COMPARISON TABLE ════════════ */}
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-5 border" style={{ borderColor: "rgba(37,211,102,0.30)", background: "rgba(37,211,102,0.08)", color: WA_GREEN }}>
              <BarChart3 className="w-3.5 h-3.5" />
              Comparação rápida
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Veja o que cada plano oferece
            </h2>
            <p className="text-sm mt-3 text-muted-foreground">
              Tudo lado a lado para você decidir com clareza.
            </p>
          </div>

          <div
            className="overflow-x-auto rounded-2xl border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ borderColor: "rgba(255,255,255,0.08)", boxShadow: "0 20px 60px -30px rgba(0,0,0,0.5)" }}
          >
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr style={{ background: "linear-gradient(180deg, rgba(37,211,102,0.06) 0%, transparent 100%)" }}>
                  <th className="text-left px-5 py-4 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] w-[180px] text-muted-foreground">
                    Recurso
                  </th>
                  {plans.map(p => (
                    <th
                      key={p.name}
                      className={`relative text-center px-2 py-4 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] ${
                        p.popular ? "text-slate-900" : "text-foreground/60"
                      }`}
                      style={
                        p.popular
                          ? { background: "linear-gradient(180deg, #FCD34D 0%, #EAB308 100%)" }
                          : undefined
                      }
                    >
                      {p.popular && (
                        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] tracking-[0.16em]">★</span>
                      )}
                      <div className="mt-1">{p.name}</div>
                      <div className={`text-[9px] font-semibold mt-0.5 ${p.popular ? "text-slate-900/70" : "text-foreground/35"}`}>
                        {p.instances} {p.instances === 1 ? "inst." : "insts."}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-t transition-colors duration-100 hover:bg-muted/20"
                    style={{ borderColor: "rgba(255,255,255,0.05)" }}
                  >
                    <td className="px-5 py-3.5 text-[12px] font-medium text-foreground/80">
                      {row.label}
                    </td>
                    {row.values.map((val, vi) => {
                      const isPro = plans[vi].popular;
                      return (
                        <td
                          key={vi}
                          className="text-center px-2 py-3.5 align-middle"
                          style={isPro ? { background: "rgba(234,179,8,0.06)" } : undefined}
                        >
                          {typeof val === "boolean" ? (
                            val ? (
                              <CheckCircle2
                                className="w-4 h-4 mx-auto"
                                style={{ color: isPro ? "#EAB308" : WA_GREEN }}
                                strokeWidth={2.5}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground/30">—</span>
                            )
                          ) : (
                            <span
                              className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10.5px] font-bold"
                              style={
                                isPro
                                  ? { background: "rgba(234,179,8,0.18)", color: "#FCD34D" }
                                  : { background: "rgba(37,211,102,0.12)", color: WA_GREEN }
                              }
                            >
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

        {/* ════════════ CREDIT PACKS ════════════ */}
        <CreditPackCards />

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
