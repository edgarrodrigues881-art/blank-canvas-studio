import { useState } from "react";
import { ArrowRight, Sparkles, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6 border border-amber-500/20 bg-amber-500/5 text-amber-400">
          <Sparkles className="w-3.5 h-3.5" />
          Créditos de Prospecção
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Compre créditos para prospectar novos leads
        </h2>
        <p className="text-sm mt-3 text-muted-foreground max-w-lg mx-auto">
          Use créditos para buscar leads qualificados diretamente do Google Maps. Quanto mais créditos, menor o custo por lead.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {creditPacks.map((pack) => (
          <div
            key={pack.name}
            className={`group relative flex flex-col rounded-2xl transition-all duration-200 hover:scale-[1.02] ${
              pack.popular
                ? "border-2 border-amber-500/40 shadow-[0_0_30px_-8px_rgba(245,158,11,0.2)] hover:border-amber-500/60 hover:shadow-[0_0_40px_-8px_rgba(245,158,11,0.35)]"
                : "border border-border/60 hover:border-border"
            }`}
          >
            <div className="relative flex flex-col h-full rounded-2xl p-5 xl:p-4 2xl:p-5 bg-card">
              {pack.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-[9px] xl:text-[8px] 2xl:text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap shadow-[0_0_20px_-4px_rgba(245,158,11,0.5)]">
                  ⭐ Mais Escolhido
                </span>
              )}

              {/* Name */}
              <div className="min-h-[40px]">
                <h3 className="text-base xl:text-sm 2xl:text-base font-semibold text-foreground mt-1">
                  {pack.name}
                </h3>
                <p className="text-[11px] xl:text-[10px] 2xl:text-[11px] text-muted-foreground">
                  {pack.credits.toLocaleString("pt-BR")} créditos
                </p>
              </div>

              {/* Description */}
              <p className="text-[11px] xl:text-[10px] 2xl:text-[11px] text-muted-foreground/60 leading-relaxed mt-2 min-h-[36px]">
                {pack.subtitle}
              </p>

              {/* Price */}
              <div className="mt-3 mb-3 min-h-[40px] flex items-end">
                <div className="flex items-baseline">
                  <span className="text-2xl xl:text-xl 2xl:text-2xl font-bold text-foreground">
                    R$ {pack.price}
                  </span>
                </div>
              </div>

              <div className="h-px bg-border/50 mb-4" />

              {/* Value prop */}
              <div className="flex-1 space-y-2 xl:space-y-1.5 2xl:space-y-2 mb-5">
                <div className="flex items-start gap-2 text-[11px] xl:text-[10px] 2xl:text-[11px] text-muted-foreground">
                  <Check className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] shrink-0 mt-px text-muted-foreground/50" />
                  <span className="leading-snug">
                    {pack.credits.toLocaleString("pt-BR")} créditos de prospecção
                  </span>
                </div>
                <div className="flex items-start gap-2 text-[11px] xl:text-[10px] 2xl:text-[11px] text-muted-foreground">
                  <Check className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] shrink-0 mt-px text-muted-foreground/50" />
                  <span className="leading-snug">Créditos não expiram</span>
                </div>
                <div className="flex items-start gap-2 text-[11px] xl:text-[10px] 2xl:text-[11px] text-muted-foreground">
                  <Check className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] shrink-0 mt-px text-muted-foreground/50" />
                  <span className="leading-snug">Adição imediata ao saldo</span>
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={() => handleBuyCredits(pack)}
                disabled={loadingPack === pack.name}
                className={`mt-auto w-full h-11 xl:h-10 2xl:h-11 rounded-lg font-semibold text-[13px] xl:text-[11px] 2xl:text-[13px] whitespace-nowrap flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.98] hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed ${
                  pack.popular
                    ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold shadow-[0_0_20px_-4px_rgba(245,158,11,0.4)]"
                    : "bg-muted text-muted-foreground border border-border/60 hover:bg-muted/80"
                }`}
              >
                {loadingPack === pack.name ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {pack.cta}
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CreditPackCards;
