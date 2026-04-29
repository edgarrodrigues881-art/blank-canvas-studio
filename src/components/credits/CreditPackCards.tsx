import { useState } from "react";
import { ArrowRight, Sparkles, CheckCircle2, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const WA_GREEN = "#25D366";
const WA_GREEN_DARK = "#07C160";

const creditPacks = [
  {
    name: "Starter",
    credits: 300,
    price: "19,00",
    subtitle: "Ideal para testar a prospecção",
    cta: "Comprar créditos",
    popular: false,
  },
  {
    name: "Pro",
    credits: 1000,
    price: "59,00",
    subtitle: "Melhor custo-benefício",
    cta: "Comprar créditos",
    popular: true,
  },
  {
    name: "Growth",
    credits: 3000,
    price: "147,00",
    subtitle: "Para quem já está validando",
    cta: "Comprar créditos",
    popular: false,
  },
  {
    name: "Scale",
    credits: 10000,
    price: "297,00",
    subtitle: "Para escalar operação",
    cta: "Comprar créditos",
    popular: false,
  },
];

const CreditPackCards = () => {
  const [loadingPack, setLoadingPack] = useState<string | null>(null);

  const handleBuyCredits = async (pack: typeof creditPacks[0]) => {
    setLoadingPack(pack.name);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-checkout-session",
        {
          body: {
            type: "credits",
            packName: pack.name,
            credits: pack.credits,
            price: pack.price,
          },
        }
      );

      if (error) {
        console.error("Checkout invoke error:", error);
        throw new Error("Erro ao conectar com o servidor de pagamento.");
      }

      if (!data?.url) {
        console.error("Checkout response without url:", data);
        throw new Error(data?.error || "Não foi possível iniciar o checkout.");
      }

      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar checkout");
    } finally {
      setLoadingPack(null);
    }
  };

  const formatCredits = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="text-center">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-5 border"
          style={{ borderColor: "rgba(37,211,102,0.30)", background: "rgba(37,211,102,0.08)", color: WA_GREEN }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Créditos de Prospecção
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Compre créditos para prospectar novos leads
        </h2>
        <p className="text-sm mt-3 text-muted-foreground max-w-lg mx-auto">
          Use créditos para buscar leads qualificados direto do Google Maps. Quanto maior o pacote, menor o custo por lead.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {creditPacks.map((pack) => {
          const isPopular = pack.popular;
          const pricePerLead = (
            parseFloat(pack.price.replace(",", ".")) / pack.credits
          ).toFixed(3);
          return (
            <div
              key={pack.name}
              style={
                isPopular
                  ? { boxShadow: "0 0 0 1px rgba(234,179,8,0.35), 0 20px 60px -20px rgba(234,179,8,0.35)" }
                  : undefined
              }
              className={`relative rounded-2xl flex flex-col h-full p-5 transition-all duration-300 ease-out hover:-translate-y-1 ${
                isPopular
                  ? "bg-gradient-to-b from-yellow-500/[0.07] via-card to-card border border-yellow-500/50 lg:scale-[1.04]"
                  : "bg-card border border-border/60 hover:border-[#25D366]/50 hover:shadow-[0_0_30px_-8px_rgba(37,211,102,0.35)]"
              }`}
            >
              {isPopular && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] text-slate-900 shadow-[0_8px_20px_-6px_rgba(234,179,8,0.6)] whitespace-nowrap"
                  style={{ background: "linear-gradient(135deg, #FCD34D 0%, #EAB308 100%)" }}
                >
                  ★ Melhor custo
                </span>
              )}

              {/* Nome */}
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/45 mb-3">
                {pack.name}
              </h3>

              {/* Preço */}
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-[12px] font-medium text-foreground/40">R$</span>
                <span className="text-[2rem] font-bold tracking-[-0.03em] leading-none text-foreground">
                  {pack.price.split(",")[0]}
                </span>
                <span className="text-[14px] font-semibold text-foreground/55">
                  ,{pack.price.split(",")[1]}
                </span>
              </div>

              {/* Destaque créditos — igual ao destaque de instâncias */}
              <div
                className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-lg mb-4 border"
                style={{
                  background: isPopular ? "rgba(234,179,8,0.10)" : "rgba(37,211,102,0.08)",
                  borderColor: isPopular ? "rgba(234,179,8,0.35)" : "rgba(37,211,102,0.25)",
                }}
              >
                <Zap className="w-3.5 h-3.5" style={{ color: isPopular ? "#FCD34D" : WA_GREEN }} />
                <span className="text-[12px] font-bold text-foreground tracking-tight">
                  {formatCredits(pack.credits)} créditos
                </span>
              </div>

              <div className="border-t border-border/50 mb-4" />

              <p className="text-[11px] text-muted-foreground leading-[1.55] mb-4 line-clamp-2">
                {pack.subtitle}
              </p>

              {/* Benefícios */}
              <ul className="space-y-2 mb-5 flex-1">
                <li className="flex items-start gap-2 text-[11.5px] text-foreground/70 leading-[1.45]">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-[2px]" style={{ color: WA_GREEN }} />
                  <span>{pack.credits.toLocaleString("pt-BR")} créditos de prospecção</span>
                </li>
                <li className="flex items-start gap-2 text-[11.5px] text-foreground/70 leading-[1.45]">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-[2px]" style={{ color: WA_GREEN }} />
                  <span>Créditos não expiram</span>
                </li>
                <li className="flex items-start gap-2 text-[11.5px] text-foreground/70 leading-[1.45]">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-[2px]" style={{ color: WA_GREEN }} />
                  <span>≈ R$ {pricePerLead.replace(".", ",")} por lead</span>
                </li>
              </ul>

              <button
                onClick={() => handleBuyCredits(pack)}
                disabled={loadingPack === pack.name}
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
                {loadingPack === pack.name ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {pack.cta}
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CreditPackCards;
