import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, Loader2 } from "lucide-react";
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

const standardFeatures = [
  "Todas as funcionalidades inclusas",
  "Mesmo nível de suporte",
  "Monitoramento em tempo real",
  "Infraestrutura completa",
  "Relatórios via WhatsApp (add-on)",
];

const topPlans: Plan[] = [
  {
    name: "Essencial", instances: "5", price: "89,90",
    subtitle: "Ideal para operações pequenas que estão começando.",
    extraCopy: null, cta: "Começar agora", popular: false,
    features: standardFeatures,
    addon: null,
  },
  {
    name: "Start", instances: "10", price: "159,90",
    subtitle: "Ideal para quem deseja aumentar a capacidade com mais instâncias.",
    extraCopy: null, cta: "Começar agora", popular: false,
    features: standardFeatures,
    addon: null,
  },
  {
    name: "Pro", instances: "30", price: "349,90",
    subtitle: "Ideal para operações ativas que precisam de mais volume.",
    extraCopy: "Mais escolhido", cta: "Escalar operação", popular: true, highlight: "amber",
    features: standardFeatures,
    addon: null,
  },
];

const bottomPlans: Plan[] = [
  {
    name: "Scale", instances: "50", price: "549,90",
    subtitle: "Para quem precisa escalar com múltiplas instâncias simultâneas.",
    extraCopy: null, cta: "Escalar operação", popular: false,
    features: standardFeatures,
    addon: null,
  },
  {
    name: "Elite", instances: "100", price: "999,90",
    subtitle: "Alta capacidade para operações grandes e exigentes.",
    extraCopy: null, cta: "Ir para o Elite", popular: false,
    features: standardFeatures,
    addon: null,
  },
  {
    name: "Custom", instances: "200+", price: null, priceLabel: "Sob consulta",
    subtitle: "Solução sob medida para operações de larga escala.",
    extraCopy: null, cta: "Falar com suporte", popular: false, isCustom: true,
    features: standardFeatures,
    addon: null,
  },
];

const PlanCard = ({ plan, onContratarPlano, loading }: { plan: Plan; onContratarPlano: (plan: Plan) => void; loading: boolean }) => (
  <div
    className={`relative flex flex-col rounded-2xl card-hover-lift ${
      plan.highlight === "amber"
        ? "border border-amber-500/40"
        : "border border-white/[0.06]"
    }`}
  >
    <div className={`relative flex flex-col rounded-2xl p-7 h-full bg-[#0f1419]`}>
      <div className="mb-1">
        <h3 className="text-xl font-bold text-white/90">{plan.name}</h3>
        <p className="text-sm text-white/30">{plan.instances} instâncias</p>
      </div>

      <p className="text-xs text-white/25 leading-relaxed mb-2 min-h-[2.5rem]">{plan.subtitle}</p>

      {plan.extraCopy && (
        <p className={`text-xs font-semibold mb-3 ${plan.highlight === "amber" ? "text-amber-400/80" : "text-emerald-400/70"}`}>
          {plan.extraCopy}
        </p>
      )}
      {!plan.extraCopy && <div className="mb-3" />}

      <div className="mb-4">
        {plan.price ? (
          <>
            <span className="text-sm text-white/30">R$ </span>
            <span className="text-4xl font-extrabold text-white/90 italic">{plan.price.split(',')[0]}</span>
            <span className="text-lg font-bold text-white/90 italic">,{plan.price.split(',')[1]}</span>
            <span className="text-white/30 text-sm"> / mês</span>
          </>
        ) : (
          <span className="text-4xl font-extrabold text-white/90 italic">{plan.priceLabel}</span>
        )}
      </div>

      <div className="h-px bg-white/[0.05] mb-5" />

      <div className="space-y-3 mb-6 flex-1">
        {plan.features.map((f, fi) => (
          <div key={fi} className="flex items-start gap-3 text-sm text-white/50">
            <Check className="w-4 h-4 min-w-[16px] min-h-[16px] text-white/30 shrink-0 mt-0.5" />
            {f}
          </div>
        ))}
      </div>

      <button
        onClick={() => onContratarPlano(plan)}
        disabled={loading}
        className={`w-full py-3.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 btn-press disabled:opacity-60 disabled:cursor-not-allowed ${
          plan.highlight === "amber"
            ? "bg-amber-500 text-black font-bold hover:bg-amber-400"
            : "bg-white/[0.05] text-white/60 hover:bg-white/[0.08] border border-white/[0.06]"
        }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            {plan.cta}
            <ArrowRight className="w-4 h-4 flex-shrink-0" />
          </>
        )}
      </button>
    </div>
  </div>
);

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

        {/* Top row: 3 plans */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto mb-6">
          {topPlans.map((plan, i) => (
            <AnimateOnView key={plan.name} animation="slide-up" delay={Math.min(i + 1, 4)}>
              <PlanCard plan={plan} onContratarPlano={handleContratarPlano} loading={loadingPlan === plan.name} />
            </AnimateOnView>
          ))}
        </div>

        {/* Bottom row: 3 plans */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {bottomPlans.map((plan, i) => (
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
