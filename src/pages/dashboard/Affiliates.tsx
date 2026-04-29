import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DollarSign, Users, TrendingUp, Copy, Crown, MessageCircle, Ticket, Wallet,
  CheckCircle2, Clock, XCircle, Send,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

const COMMISSION_TIERS = [
  { month: "1º mês", percent: 30, desc: "Sobre o valor pago" },
  { month: "2º mês", percent: 30, desc: "Sobre o valor pago" },
  { month: "3º mês", percent: 30, desc: "Sobre o valor pago" },
];

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

type Coupon = {
  id: string; code: string; discount_percent: number; plan_name: string | null;
  max_uses: number | null; uses_count: number; is_active: boolean;
};
type Referral = {
  id: string; referred_name: string | null; referred_email: string | null;
  coupon_code: string | null; plan_name: string; paid_amount: number;
  commission_total: number; status: string; created_at: string;
};
type Payment = {
  id: string; referral_id: string; month_number: number; amount: number;
  commission_amount: number; status: string; paid_at: string | null;
};
type Payout = {
  id: string; amount: number; pix_key: string; status: string; created_at: string; paid_at: string | null;
};

export default function Affiliates() {
  const { session, user } = useAuth();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("CPF");
  const [requesting, setRequesting] = useState(false);

  const referralCode = useMemo(() => {
    const id = session?.user?.id ?? "";
    return id ? id.slice(0, 8).toUpperCase() : "";
  }, [session]);

  const referralUrl = useMemo(() => {
    if (!referralCode) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/?ref=${referralCode}`;
  }, [referralCode]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [cRes, rRes, pRes, poRes] = await Promise.all([
        supabase.from("affiliate_coupons").select("id,code,discount_percent,plan_name,max_uses,uses_count,is_active").eq("affiliate_user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("affiliate_referrals").select("id,referred_name,referred_email,coupon_code,plan_name,paid_amount,commission_total,status,created_at").eq("affiliate_user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("affiliate_payments").select("id,referral_id,month_number,amount,commission_amount,status,paid_at").eq("affiliate_user_id", user.id),
        supabase.from("affiliate_payouts").select("id,amount,pix_key,status,created_at,paid_at").eq("affiliate_user_id", user.id).order("created_at", { ascending: false }),
      ]);
      setCoupons((cRes.data || []) as Coupon[]);
      setReferrals((rRes.data || []) as Referral[]);
      setPayments((pRes.data || []) as Payment[]);
      setPayouts((poRes.data || []) as Payout[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user?.id]);

  // Stats
  const totalEarned = useMemo(
    () => payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.commission_amount || 0), 0),
    [payments]
  );
  const totalPending = useMemo(
    () => payments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.commission_amount || 0), 0),
    [payments]
  );
  const reservedInPayouts = useMemo(
    () => payouts.filter((p) => ["requested", "approved", "paid"].includes(p.status)).reduce((s, p) => s + Number(p.amount || 0), 0),
    [payouts]
  );
  const availableBalance = Math.max(0, totalEarned - reservedInPayouts);

  const activeReferralsCount = referrals.filter((r) => r.status === "active").length;

  const paymentsByReferral = useMemo(() => {
    const map: Record<string, Payment[]> = {};
    for (const p of payments) (map[p.referral_id] ||= []).push(p);
    for (const arr of Object.values(map)) arr.sort((a, b) => a.month_number - b.month_number);
    return map;
  }, [payments]);

  const handleCopy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copiado!"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  const openWhatsApp = () => {
    if (!referralUrl) return;
    const msg = `Olha essa ferramenta que estou usando pra automação no WhatsApp 👇 ${referralUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  };

  const handleRequestPayout = async () => {
    const amt = Number(payoutAmount.replace(",", "."));
    if (!amt || amt <= 0) return toast.error("Informe um valor válido");
    if (!pixKey.trim()) return toast.error("Informe sua chave Pix");
    if (amt > availableBalance) return toast.error("Saldo insuficiente");

    setRequesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("affiliate-request-payout", {
        body: { amount: amt, pix_key: pixKey.trim(), pix_key_type: pixKeyType },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Saque solicitado! Aguarde o pagamento via Pix.");
      setPayoutOpen(false);
      setPayoutAmount(""); setPixKey("");
      loadData();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao solicitar saque");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
          <Crown className="w-6 h-6 text-emerald-400" strokeWidth={1.8} />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Ganhe com a DG CONTINGÊNCIA PRO</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Indique e receba 30% de comissão durante 3 meses por cliente ativo
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="relative overflow-hidden border-emerald-500/20">
          <div className="pointer-events-none absolute -top-20 -right-20 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl" />
          <CardContent className="relative p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total ganho</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400">{formatBRL(totalEarned)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Saldo disponível</span>
              <Wallet className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-xl sm:text-2xl font-bold">{formatBRL(availableBalance)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">A receber</span>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-xl sm:text-2xl font-bold">{formatBRL(totalPending)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Indicações ativas</span>
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-xl sm:text-2xl font-bold">{activeReferralsCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Cupom + Link */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Cupom */}
        <Card className="border-emerald-500/20 bg-emerald-500/[0.04]">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Ticket className="w-5 h-5 text-emerald-400" /> Seus cupons
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Quando o cliente usar seu cupom no checkout, a indicação é registrada automaticamente
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {coupons.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Você ainda não tem cupons. Entre em contato com o suporte para gerar o seu.
              </p>
            ) : (
              coupons.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-background/40 border border-border px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="font-mono font-semibold text-emerald-400">{c.code}</code>
                      <Badge variant="outline" className="text-[10px]">{c.discount_percent}% OFF</Badge>
                      {!c.is_active && <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">Inativo</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {c.plan_name ? `Plano ${c.plan_name}` : "Todos os planos"} • Usos: {c.uses_count}{c.max_uses ? `/${c.max_uses}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleCopy(c.code)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Link */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Seu link de indicação</CardTitle>
            <p className="text-xs text-muted-foreground">Compartilhe e ganhe quando o cliente assinar</p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="px-3 py-2.5 rounded-lg bg-muted/40 border border-border font-mono text-xs truncate">
              {referralUrl || "—"}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => handleCopy(referralUrl)} disabled={!referralUrl}>
                <Copy className="w-4 h-4" /> Copiar link
              </Button>
              <Button size="sm" onClick={openWhatsApp} disabled={!referralUrl} className="bg-emerald-500 text-emerald-950 hover:bg-emerald-400 font-semibold">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comissões */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Você ganha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {COMMISSION_TIERS.map((t) => (
              <div key={t.month} className="rounded-xl border border-border bg-card p-5 hover:border-emerald-500/40 transition-colors">
                <Badge variant="outline" className="text-[10px] border-border bg-background/50 mb-3">{t.month}</Badge>
                <div className="text-3xl font-bold text-emerald-400">{t.percent}%</div>
                <div className="text-xs text-muted-foreground mt-1">{t.desc}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground pt-1">
            Pagamento via Pix mensal — repasse manual feito pela equipe quando você solicitar saque.
          </p>
        </CardContent>
      </Card>

      {/* Saque */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base sm:text-lg">Saques via Pix</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Solicite o repasse do seu saldo disponível</p>
          </div>
          <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
            <DialogTrigger asChild>
              <Button disabled={availableBalance <= 0} className="bg-emerald-500 text-emerald-950 hover:bg-emerald-400 font-semibold">
                <Send className="w-4 h-4" /> Solicitar saque
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Solicitar saque via Pix</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label>Valor (R$)</Label>
                  <Input value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} placeholder={`Disponível: ${formatBRL(availableBalance)}`} />
                </div>
                <div>
                  <Label>Tipo de chave</Label>
                  <select value={pixKeyType} onChange={(e) => setPixKeyType(e.target.value)} className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="TELEFONE">Telefone</option>
                    <option value="ALEATORIA">Aleatória</option>
                  </select>
                </div>
                <div>
                  <Label>Chave Pix</Label>
                  <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Sua chave Pix" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayoutOpen(false)}>Cancelar</Button>
                <Button onClick={handleRequestPayout} disabled={requesting}>{requesting ? "Enviando..." : "Solicitar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {payouts.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">Nenhum saque solicitado ainda</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Chave Pix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[200px]">{p.pix_key}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        p.status === "paid" ? "border-emerald-500/30 text-emerald-400" :
                        p.status === "rejected" ? "border-destructive/30 text-destructive" :
                        "border-amber-500/30 text-amber-400"
                      }>
                        {p.status === "paid" ? "Pago" : p.status === "approved" ? "Aprovado" : p.status === "rejected" ? "Rejeitado" : "Solicitado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatBRL(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Indicações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Suas indicações</CardTitle>
          <p className="text-xs text-muted-foreground">Acompanhe os pagamentos mês a mês de cada cliente indicado</p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : referrals.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Nenhuma indicação ainda. Compartilhe seu cupom ou link e comece a ganhar.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Cupom</TableHead>
                    <TableHead>1º mês</TableHead>
                    <TableHead>2º mês</TableHead>
                    <TableHead>3º mês</TableHead>
                    <TableHead className="text-right">Total comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((r) => {
                    const ps = paymentsByReferral[r.id] || [];
                    const monthCell = (n: number) => {
                      const p = ps.find((x) => x.month_number === n);
                      if (!p) return <span className="text-xs text-muted-foreground">—</span>;
                      const icon = p.status === "paid" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> :
                                   p.status === "cancelled" ? <XCircle className="w-3.5 h-3.5 text-destructive" /> :
                                   <Clock className="w-3.5 h-3.5 text-amber-400" />;
                      return (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            {icon} {formatBRL(Number(p.commission_amount))}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {p.status === "paid" ? `Pago ${formatDate(p.paid_at)}` : p.status === "cancelled" ? "Cancelado" : "Aguardando"}
                          </span>
                        </div>
                      );
                    };
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{r.referred_name || r.referred_email || "Cliente"}</div>
                          {r.referred_email && <div className="text-[11px] text-muted-foreground">{r.referred_email}</div>}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{r.plan_name}</Badge></TableCell>
                        <TableCell><code className="text-xs font-mono text-emerald-400">{r.coupon_code || "—"}</code></TableCell>
                        <TableCell>{monthCell(1)}</TableCell>
                        <TableCell>{monthCell(2)}</TableCell>
                        <TableCell>{monthCell(3)}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-400">{formatBRL(Number(r.commission_total))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
