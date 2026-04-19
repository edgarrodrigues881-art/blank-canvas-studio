import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DollarSign, Users, TrendingUp, Copy, Crown, Sparkles, Lock, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { usePlanGate } from "@/hooks/usePlanGate";

const COMMISSION_TIERS = [
  { month: "1º mês", percent: 30, label: "Primeiro mês", desc: "Maior comissão na entrada" },
  { month: "2º mês", percent: 20, label: "Segundo mês", desc: "Receita recorrente" },
  { month: "3º mês", percent: 20, label: "Terceiro mês", desc: "Continua rendendo" },
];

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Affiliates() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { planState, isBlocked } = usePlanGate();

  const referralCode = useMemo(() => {
    const id = session?.user?.id ?? "";
    return id ? id.slice(0, 8).toUpperCase() : "";
  }, [session]);

  const referralUrl = useMemo(() => {
    if (!referralCode) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/?ref=${referralCode}`;
  }, [referralCode]);

  // Placeholder values — replace with real data when backend exists
  const stats = { totalEarned: 0, activeReferrals: 0, conversions: 0 };
  const referrals: Array<{ name: string; status: "ativo" | "cancelado"; commission: number }> = [];

  const [copying, setCopying] = useState(false);
  const handleCopy = async () => {
    if (!referralUrl) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    } finally {
      setTimeout(() => setCopying(false), 600);
    }
  };

  const shareMessage = referralUrl
    ? `Olha essa ferramenta que estou usando 👇 ${referralUrl}`
    : "";

  const handleNativeShare = async () => {
    if (!referralUrl) return;
    try {
      await navigator.share({
        title: "DG Contingência Pro",
        text: shareMessage,
        url: referralUrl,
      });
    } catch { /* user cancelled */ }
  };

  const openWhatsApp = () => {
    if (!shareMessage) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, "_blank", "noopener,noreferrer");
  };

  const openTelegram = () => {
    if (!referralUrl) return;
    const url = `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent("Olha essa ferramenta que estou usando 👇")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ───────────────────── BLOCKED VIEW ─────────────────────
  if (isBlocked) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          <Card className="relative overflow-hidden border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.04] to-transparent">
            {/* Glow */}
            <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full bg-emerald-500/10 blur-3xl" />

            <CardContent className="relative p-8 sm:p-12 text-center space-y-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center">
                <Crown className="w-8 h-8 text-emerald-400" strokeWidth={1.8} />
              </div>

              <div className="space-y-2">
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 bg-emerald-500/5">
                  <Lock className="w-3 h-3 mr-1.5" /> Programa de Afiliados
                </Badge>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Ganhe dinheiro indicando a <span className="text-emerald-400">DG Contingência Pro</span>
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
                  Ative seu plano e comece a ganhar comissões recorrentes por cada cliente indicado.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {COMMISSION_TIERS.map((t) => (
                  <div
                    key={t.month}
                    className="rounded-xl border border-emerald-500/20 bg-card/40 p-4 text-center"
                  >
                    <div className="text-xs text-muted-foreground">{t.month}</div>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">{t.percent}%</div>
                  </div>
                ))}
              </div>

              <Button
                size="lg"
                onClick={() => navigate("/dashboard/my-plan")}
                className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold shadow-lg shadow-emerald-500/20"
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Ativar plano
              </Button>

              <p className="text-[11px] text-muted-foreground/70">
                {planState === "expired"
                  ? "Seu plano expirou. Renove para acessar o programa."
                  : planState === "suspended"
                    ? "Sua conta está suspensa. Entre em contato com o suporte."
                    : "Disponível apenas para clientes com plano ativo."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ───────────────────── ACTIVE VIEW ─────────────────────
  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
          <Crown className="w-6 h-6 text-emerald-400" strokeWidth={1.8} />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Ganhe com a DG Contingência</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Indique e receba comissões automáticas por 3 meses
          </p>
        </div>
      </div>

      {/* Earnings cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="relative overflow-hidden border-emerald-500/20">
          <div className="pointer-events-none absolute -top-20 -right-20 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl" />
          <CardContent className="relative p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total ganho</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-emerald-400">
              {formatBRL(stats.totalEarned)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Indicações ativas</span>
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold">{stats.activeReferrals}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Conversões</span>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold">{stats.conversions}</div>
          </CardContent>
        </Card>
      </div>

      {/* Referral link */}
      <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] to-transparent">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Seu link de indicação</CardTitle>
          <p className="text-xs text-muted-foreground">Compartilhe e comece a ganhar agora</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 px-3.5 py-2.5 rounded-[10px] bg-muted/40 border border-border font-mono text-xs sm:text-sm text-foreground/90 truncate">
              {referralUrl || "Carregando..."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCopy} variant="outline" disabled={!referralUrl || copying}>
                <Copy className="w-4 h-4" />
                {copying ? "Copiado" : "Copiar link"}
              </Button>
              <Button onClick={openWhatsApp} disabled={!referralUrl}
                className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold">
                <MessageCircle className="w-4 h-4" />
                Enviar no WhatsApp
              </Button>
            </div>
          </div>

          {/* Message preview */}
          <div className="rounded-[10px] border border-border bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
              Mensagem que será enviada
            </div>
            <p className="text-xs sm:text-sm text-foreground/85 leading-relaxed">
              Olha essa ferramenta que estou usando pra automação 👇{" "}
              <span className="text-emerald-400 break-all">{referralUrl || "..."}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Commission breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Você ganha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {COMMISSION_TIERS.map((t) => (
              <div
                key={t.month}
                className="relative rounded-xl border border-border bg-card p-5 hover:border-emerald-500/40 transition-colors"
              >
                <Badge variant="outline" className="text-[10px] border-border bg-background/50 mb-3">
                  {t.month}
                </Badge>
                <div className="text-3xl font-bold text-emerald-400">{t.percent}%</div>
                <div className="text-xs text-muted-foreground mt-1">{t.desc}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground pt-1">
            Quanto mais você indica, mais você ganha.
          </p>
        </CardContent>
      </Card>

      {/* Referrals list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Suas indicações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {referrals.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Nenhuma indicação ainda. Compartilhe seu link e comece a ganhar.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          r.status === "ativo"
                            ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                            : "border-border text-muted-foreground"
                        }
                      >
                        {r.status === "ativo" ? "Ativo" : "Cancelado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-emerald-400">
                      {formatBRL(r.commission)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
