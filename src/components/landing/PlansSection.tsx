import { useNavigate } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
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

const topPlans: Plan[] = [
  {
    name: "Essencial", instances: "5", price: "89,90",
    subtitle: "Para quem está começando a aquecer chips com segurança e estrutura profissional.",
    extraCopy: null, cta: "Começar agora", popular: false,
    features: ["Aquecimento automatizado", "Disparo interativo", "Monitoramento em tempo real limitado", "Suporte padrão", "Relatórios via WhatsApp (add-on)", "Módulos extras disponíveis"],
    addon: null,
  },
  {
    name: "Start", instances: "10", price: "159,90",
    subtitle: "Para quem já validou a operação e quer expandir após validar a operação.",
    extraCopy: "Melhor custo-benefício inicial", cta: "Começar agora", popular: false,
    features: ["Aquecimento automatizado", "Disparo interativo", "Painel centralizado", "Monitoramento em tempo real", "Organização de instâncias", "Relatórios via WhatsApp (add-on)", "Módulos extras disponíveis"],
    addon: null,
  },
  {
    name: "Pro", instances: "30", price: "349,90",
    subtitle: "Para operadores ativos que precisam escalar com consistência.",
    extraCopy: "Recomendado para operações reais", cta: "Escalar operação", popular: true, highlight: "amber",
    features: ["Aquecimento automatizado", "Disparo interativo", "Painel centralizado", "Gestão avançada de instâncias", "Monitoramento completo", "Suporte prioritário", "Relatórios via WhatsApp (add-on)", "Módulos extras disponíveis"],
    addon: null,
  },
];

const bottomPlans: Plan[] = [
  {
    name: "Scale", instances: "50", price: "549,90",
    subtitle: "Para quem precisa escalar com mais chips e visibilidade sobre toda a operação.",
    extraCopy: null, cta: "Escalar operação", popular: false,
    features: ["Aquecimento automatizado", "Disparo interativo", "Painel centralizado", "Monitoramento em tempo real", "Suporte prioritário", "Relatórios via WhatsApp incluso", "Módulos extras disponíveis"],
    addon: null,
  },
  {
    name: "Elite", instances: "100", price: "999,90",
    subtitle: "Ideal para operações que exigem volume alto com performance e suporte dedicado.",
    extraCopy: "Alta performance garantida", cta: "Ir para o Elite", popular: false,
    features: ["Aquecimento automatizado em escala", "Disparo avançado", "Monitoramento avançado", "Suporte VIP", "Relatórios via WhatsApp incluso", "Módulos extras disponíveis"],
    addon: null,
  },
  {
    name: "Custom", instances: "200+", price: null, priceLabel: "Sob consulta",
    subtitle: "Soluções personalizadas para operações de grande escala com necessidades específicas.",
    extraCopy: null, cta: "Falar com suporte", popular: false, isCustom: true,
    features: ["Instâncias sob medida", "Aquecimento automatizado em escala", "Estrutura personalizada", "Infraestrutura dedicada", "Suporte VIP", "Ajustes personalizados", "Relatórios via WhatsApp incluso", "Configuração sob consulta"],
    addon: null,
  },
];

const PlanCard = ({ plan, onContratarPlano }: { plan: Plan; onContratarPlano: (plan: Plan) => void }) => (
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
        className={`w-full py-3.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 btn-press ${
          plan.highlight === "amber"
            ? "bg-amber-500 text-black font-bold hover:bg-amber-400"
            : "bg-white/[0.05] text-white/60 hover:bg-white/[0.08] border border-white/[0.06]"
        }`}
      >
        {plan.cta}
        <ArrowRight className="w-4 h-4 flex-shrink-0" />
      </button>
    </div>
  </div>
);

const PlansSection = () => {
  const navigate = useNavigate();
  const { session } = useAuth();

  const handleContratarPlano = (plan: Plan) => {
    if (plan.isCustom) {
      const msg = `Olá, tudo bem?\nTenho interesse no plano Custom (200+ instâncias).\nPode me enviar mais detalhes?`;
      const url = `https://wa.me/5562994192500?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank");
      return;
    }
    const msg = `Olá, tudo bem?\nTenho interesse em contratar o plano DG Contingência – ${plan.name} (${plan.instances} Instâncias) no valor de R$ ${plan.price}/mês.\nPode me enviar os dados para ativação e pagamento?`;
    const url = `https://wa.me/5562994192500?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
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
              <PlanCard plan={plan} onContratarPlano={handleContratarPlano} />
            </AnimateOnView>
          ))}
        </div>

        {/* Bottom row: 3 plans */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {bottomPlans.map((plan, i) => (
            <AnimateOnView key={plan.name} animation="slide-up" delay={Math.min(i + 1, 4)}>
              <PlanCard plan={plan} onContratarPlano={handleContratarPlano} />
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
