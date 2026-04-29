import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, Loader2, Smartphone, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { startCheckout } from "@/lib/stripe";
import { toast } from "sonner";
import AnimateOnView from "@/components/AnimateOnView";

const WA_GREEN = "#25D366";
const WA_GREEN_DARK = "#07C160";

interface Plan {
  name: string;
  instances: number;
  price: string;
  tagline: string;
  cta: string;
  popular: boolean;
  benefits: string[];
  whatsappIncluded: boolean;
}

// ─── Mesmos planos do MyPlan (sistema interno) ───
const plans: Plan[] = [
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

const PlansSection = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSelectPlan = async (plan: Plan) => {
    if (!session) {
      navigate("/auth");
      return;
    }
    setLoadingPlan(plan.name);
    try {
      await startCheckout({
        planName: plan.name,
        instances: String(plan.instances),
        price: plan.price,
      });
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar checkout");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section id="planos" className="py-24 lg:py-32 px-4 sm:px-6 lg:px-8 scroll-mt-24">
      <div className="max-w-[1440px] mx-auto">
        <AnimateOnView animation="slide-up">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-4 text-white">
            Escolha o plano ideal para escalar sua operação com estabilidade
          </h2>
          <p className="text-white/40 text-center text-base mb-16 max-w-2xl mx-auto leading-relaxed">
            Acesso completo em todos os planos. Muda apenas a capacidade e o nível de suporte.
          </p>
        </AnimateOnView>

        {/* Grid 6 colunas — espelhado do MyPlan */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 xl:gap-3 pt-4">
          {plans.map((p, i) => {
            const isPopular = p.popular;
            const loading = loadingPlan === p.name;
            return (
              <AnimateOnView key={p.name} animation="slide-up" delay={Math.min(i + 1, 4)}>
                <div
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
                    disabled={loading}
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
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        {p.cta}
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </>
                    )}
                  </button>
                </div>
              </AnimateOnView>
            );
          })}
        </div>

        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-8 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0 text-emerald-500/60" />
            Sem fidelidade
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0 text-emerald-500/60" />
            Upgrade imediato
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0 text-emerald-500/60" />
            Garantia de 7 dias
          </div>
        </div>
      </div>
    </section>
  );
};

export default PlansSection;
