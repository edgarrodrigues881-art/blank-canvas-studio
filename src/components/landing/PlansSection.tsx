import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, Loader2, Smartphone, Star } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { startCheckout } from "@/lib/stripe";
import { toast } from "sonner";
import AnimateOnView from "@/components/AnimateOnView";

interface Plan {
  name: string;
  instances: string;
  price: string | null;
  priceLabel?: string;
  subtitle: string;
  extraCopy: string | null;
  cta: string;
  popular: boolean;
  highlight?: "amber";
  features: string[];
  addon: string | null;
  isCustom?: boolean;
}

const featuresStarter = [
  "1 chip simultâneo",
  "CRM, automações e IA inclusos",
  "Aquecimento e disparo inclusos",
];

const featuresEssencial = [
  "Até 5 chips simultâneos",
  "CRM, automações e IA inclusos",
  "Aquecimento e disparo inclusos",
];

const featuresPro = [
  "Até 10 chips simultâneos",
  "CRM completo + pipelines",
  "Prospecção e IA inclusos",
];

const featuresScale = [
  "Até 30 chips simultâneos",
  "Suporte prioritário no WhatsApp",
  "Relatórios e alertas via WhatsApp",
];

const featuresBusiness = [
  "Até 50 chips simultâneos",
  "Suporte prioritário no WhatsApp",
  "Relatórios e alertas via WhatsApp",
];

const featuresEnterprise = [
  "Até 100 chips simultâneos",
  "Suporte prioritário dedicado",
  "Relatórios e alertas via WhatsApp",
];

const allPlans: Plan[] = [
  {
    name: "Starter", instances: "1", price: "39,99",
    subtitle: "Tudo para começar a vender mais pelo WhatsApp com um número. CRM, disparo, automações, IA e prospecção em um só lugar.",
    extraCopy: null, cta: "Começar agora", popular: false,
    features: featuresStarter, addon: null,
  },
  {
    name: "Essencial", instances: "5", price: "99,99",
    subtitle: "Opere com consistência usando até 5 números. Distribua atendimentos, mantenha backup e escale seus disparos sem travar.",
    extraCopy: null, cta: "Testar o sistema", popular: false,
    features: featuresEssencial, addon: null,
  },
  {
    name: "Pro", instances: "10", price: "187,99",
    subtitle: "Operação profissional com 10 números trabalhando juntos. Mais alcance no disparo, mais leads no CRM e mais produtividade no time.",
    extraCopy: null, cta: "Começar agora", popular: false,
    features: featuresPro, addon: null,
  },
  {
    name: "Scale", instances: "30", price: "397,99",
    subtitle: "Escale com 30 números, automações avançadas e relatórios direto no WhatsApp. Ideal para times que vendem em alto volume todos os dias.",
    extraCopy: "Mais escolhido", cta: "Começar agora", popular: true, highlight: "amber",
    features: featuresScale, addon: null,
  },
  {
    name: "Business", instances: "50", price: "597,99",
    subtitle: "Estrutura robusta com 50 números para empresas que precisam de performance, organização e controle total da operação comercial.",
    extraCopy: null, cta: "Começar agora", popular: false,
    features: featuresBusiness, addon: null,
  },
  {
    name: "Enterprise", instances: "100", price: "1.097,99",
    subtitle: "Máxima capacidade com 100 números simultâneos. Para grandes operações que exigem escala industrial, IA dedicada e prospecção em larga escala.",
    extraCopy: null, cta: "Começar agora", popular: false,
    features: featuresEnterprise, addon: null,
  },
];

const PlanCard = ({ plan, onContratarPlano, loading }: { plan: Plan; onContratarPlano: (plan: Plan) => void; loading: boolean }) => {
  const isHighlight = plan.highlight === "amber";
  return (
    <div className="relative pt-3">
      {isHighlight && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg shadow-amber-500/30">
            <Star className="w-3 h-3 fill-black" />
            Mais escolhido
          </span>
        </div>
      )}
      <div
        className={`relative flex flex-col rounded-2xl p-5 h-full bg-[#0f1419] card-hover-lift transition-all ${
          isHighlight
            ? "border border-amber-500/60 shadow-[0_0_30px_-8px_rgba(245,158,11,0.4)]"
            : "border border-white/[0.06]"
        }`}
      >
        <div className="mb-3">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-white/40 uppercase">{plan.name}</p>
        </div>

        <div className="mb-4 flex items-baseline">
          <span className="text-xs text-white/40 mr-1">R$</span>
          <span className="text-4xl font-extrabold text-white leading-none">{plan.price!.split(',')[0]}</span>
          <span className="text-base font-bold text-white/80 ml-0.5">,{plan.price!.split(',')[1]}</span>
          <span className="text-white/40 text-xs ml-1">/mês</span>
        </div>

        <div className="mb-5">
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold border ${
              isHighlight
                ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                : "bg-emerald-500/5 border-emerald-500/20 text-emerald-300/90"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            {plan.instances} {plan.instances === "1" ? "Instância" : "Instâncias"}
          </span>
        </div>

        <p className="text-[11px] text-white/35 leading-relaxed mb-4 line-clamp-3 min-h-[3.3rem]">
          {plan.subtitle}
        </p>

        <div className="space-y-2.5 mb-6 flex-1">
          {plan.features.map((f, fi) => (
            <div key={fi} className="flex items-start gap-2 text-[12px] text-white/60">
              <span className="mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/15 shrink-0">
                <Check className="w-2.5 h-2.5 text-emerald-400" strokeWidth={3} />
              </span>
              <span className="leading-snug">{f}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => onContratarPlano(plan)}
          disabled={loading}
          className={`w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 btn-press disabled:opacity-60 disabled:cursor-not-allowed transition ${
            isHighlight
              ? "bg-emerald-500 text-black font-bold hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
              : "bg-white/[0.04] text-white/70 hover:bg-white/[0.08] border border-white/[0.08]"
          }`}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              {plan.cta}
              <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const PlansSection = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleContratarPlano = async (plan: Plan) => {
    if (plan.isCustom) {
      const msg = `Olá, tudo bem?\nTenho interesse no plano Custom (200+ instâncias).\nPode me enviar mais detalhes?`;
      window.open(`https://wa.me/5562994192500?text=${encodeURIComponent(msg)}`, "_blank");
      return;
    }

    if (!session) {
      navigate("/auth");
      return;
    }

    setLoadingPlan(plan.name);
    try {
      await startCheckout({
        planName: plan.name,
        instances: plan.instances,
        price: plan.price!,
      });
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar checkout");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section id="planos" className="py-24 lg:py-32 px-6 scroll-mt-24">
      <div className="max-w-7xl mx-auto">
        <AnimateOnView animation="slide-up">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-4 text-white">
            Escolha o plano ideal para escalar sua operação com estabilidade
          </h2>
          <p className="text-white/30 text-center text-base mb-16 max-w-2xl mx-auto leading-relaxed">
            Todos os planos incluem aquecimento automatizado, disparador inteligente e monitoramento em tempo real.
            <br />A diferença está na capacidade operacional e nível de suporte.
          </p>
        </AnimateOnView>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 max-w-7xl mx-auto">
          {allPlans.map((plan, i) => (
            <AnimateOnView key={plan.name} animation="slide-up" delay={Math.min(i + 1, 4)}>
              <PlanCard plan={plan} onContratarPlano={handleContratarPlano} loading={loadingPlan === plan.name} />
            </AnimateOnView>
          ))}
        </div>

        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-8 text-sm text-white/30">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0 text-emerald-500/50" />
            Sem fidelidade
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0 text-emerald-500/50" />
            Upgrade imediato
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0 text-emerald-500/50" />
            Garantia de 7 dias
          </div>
        </div>
      </div>
    </section>
  );
};

export default PlansSection;
