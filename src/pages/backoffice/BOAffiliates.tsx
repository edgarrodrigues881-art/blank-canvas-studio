import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Ticket, Plus, Users, DollarSign, CheckCircle2, XCircle } from "lucide-react";

function fmt(n: number) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function date(s: string | null) { return s ? new Date(s).toLocaleString("pt-BR") : "—"; }

const PLANS = ["Trial", "Essencial", "Start", "Pro", "Scale", "Elite"];

export default function BOAffiliates() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Coupon dialog
  const [couponOpen, setCouponOpen] = useState(false);
  const [cCode, setCCode] = useState("");
  const [cAffiliate, setCAffiliate] = useState("");
  const [cDiscount, setCDiscount] = useState("10");
  const [cPlan, setCPlan] = useState<string>("");
  const [cMaxUses, setCMaxUses] = useState("");

  // Referral dialog
  const [refOpen, setRefOpen] = useState(false);
  const [rAffiliate, setRAffiliate] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rName, setRName] = useState("");
  const [rCoupon, setRCoupon] = useState("");
  const [rPlan, setRPlan] = useState("Essencial");
  const [rPrice, setRPrice] = useState("");
  const [rDiscountAmount, setRDiscountAmount] = useState("0");

  const load = async () => {
    setLoading(true);
    const [c, r, p, po, u] = await Promise.all([
      supabase.from("affiliate_coupons").select("*").order("created_at", { ascending: false }),
      supabase.from("affiliate_referrals").select("*").order("created_at", { ascending: false }),
      supabase.from("affiliate_payments").select("*").order("month_number"),
      supabase.from("affiliate_payouts").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, phone").order("full_name").limit(500),
    ]);
    setCoupons(c.data || []); setReferrals(r.data || []); setPayments(p.data || []);
    setPayouts(po.data || []); setUsers(u.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const userLabel = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.full_name || "—"} (${u.phone || ""})` : id.slice(0, 8);
  };

  const createCoupon = async () => {
    if (!cCode.trim() || !cAffiliate) return toast.error("Código e afiliado obrigatórios");
    const { error } = await supabase.from("affiliate_coupons").insert({
      code: cCode.trim().toUpperCase(),
      affiliate_user_id: cAffiliate,
      discount_percent: Number(cDiscount) || 10,
      plan_name: cPlan || null,
      max_uses: cMaxUses ? Number(cMaxUses) : null,
    });
    if (error) return toast.error(error.message);
    toast.success("Cupom criado");
    setCouponOpen(false);
    setCCode(""); setCDiscount("10"); setCPlan(""); setCMaxUses("");
    load();
  };

  const toggleCoupon = async (id: string, active: boolean) => {
    await supabase.from("affiliate_coupons").update({ is_active: !active }).eq("id", id);
    load();
  };

  const createReferral = async () => {
    if (!rAffiliate || !rPrice) return toast.error("Afiliado e valor obrigatórios");
    const price = Number(rPrice.replace(",", "."));
    const discount = Number(rDiscountAmount.replace(",", ".")) || 0;
    const paid = price - discount;
    const commissionTotal = paid * 0.30 * 3; // 30% por 3 meses
    const monthly = paid * 0.30;

    const couponInfo = coupons.find((c) => c.id === rCoupon);

    const { data: ref, error } = await supabase.from("affiliate_referrals").insert({
      affiliate_user_id: rAffiliate,
      referred_email: rEmail || null,
      referred_name: rName || null,
      coupon_id: rCoupon || null,
      coupon_code: couponInfo?.code || null,
      plan_name: rPlan,
      plan_price: price,
      discount_amount: discount,
      paid_amount: paid,
      commission_percent: 30,
      commission_total: commissionTotal,
    }).select().single();

    if (error) return toast.error(error.message);

    // Cria 3 pagamentos (mês 1 já pago — entrada — outros pendentes)
    const today = new Date();
    const due = (m: number) => {
      const d = new Date(today); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10);
    };
    await supabase.from("affiliate_payments").insert([
      { referral_id: ref.id, affiliate_user_id: rAffiliate, month_number: 1, amount: paid, commission_amount: monthly, status: "paid", due_date: due(0), paid_at: new Date().toISOString() },
      { referral_id: ref.id, affiliate_user_id: rAffiliate, month_number: 2, amount: paid, commission_amount: monthly, status: "pending", due_date: due(1) },
      { referral_id: ref.id, affiliate_user_id: rAffiliate, month_number: 3, amount: paid, commission_amount: monthly, status: "pending", due_date: due(2) },
    ]);

    if (rCoupon) {
      await supabase.from("affiliate_coupons").update({ uses_count: (couponInfo?.uses_count || 0) + 1 }).eq("id", rCoupon);
    }

    toast.success("Indicação registrada com 1º mês como pago");
    setRefOpen(false);
    setREmail(""); setRName(""); setRCoupon(""); setRPrice(""); setRDiscountAmount("0");
    load();
  };

  const togglePayment = async (id: string, status: string) => {
    const next = status === "paid" ? "pending" : "paid";
    await supabase.from("affiliate_payments").update({
      status: next,
      paid_at: next === "paid" ? new Date().toISOString() : null,
    }).eq("id", id);
    load();
  };

  const updatePayoutStatus = async (id: string, status: string) => {
    await supabase.from("affiliate_payouts").update({
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    }).eq("id", id);
    load();
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Backoffice — Afiliados</h1>
        <p className="text-sm text-muted-foreground">Gerencie cupons, indicações e pagamentos via Pix</p>
      </div>

      <Tabs defaultValue="coupons">
        <TabsList>
          <TabsTrigger value="coupons"><Ticket className="w-4 h-4 mr-1.5" /> Cupons</TabsTrigger>
          <TabsTrigger value="referrals"><Users className="w-4 h-4 mr-1.5" /> Indicações</TabsTrigger>
          <TabsTrigger value="payments"><DollarSign className="w-4 h-4 mr-1.5" /> Pagamentos</TabsTrigger>
          <TabsTrigger value="payouts">Saques</TabsTrigger>
        </TabsList>

        {/* CUPONS */}
        <TabsContent value="coupons" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Cupons cadastrados</CardTitle>
              <Dialog open={couponOpen} onOpenChange={setCouponOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4" /> Novo cupom</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Criar cupom de afiliado</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Código</Label><Input value={cCode} onChange={(e) => setCCode(e.target.value.toUpperCase())} placeholder="EX: JOAO10" /></div>
                    <div>
                      <Label>Afiliado</Label>
                      <select value={cAffiliate} onChange={(e) => setCAffiliate(e.target.value)} className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="">Selecione…</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.id.slice(0, 8)} ({u.phone})</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Desconto (%)</Label><Input type="number" value={cDiscount} onChange={(e) => setCDiscount(e.target.value)} /></div>
                      <div><Label>Limite de usos</Label><Input type="number" value={cMaxUses} onChange={(e) => setCMaxUses(e.target.value)} placeholder="Vazio = ilimitado" /></div>
                    </div>
                    <div>
                      <Label>Plano (opcional)</Label>
                      <select value={cPlan} onChange={(e) => setCPlan(e.target.value)} className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="">Todos os planos</option>
                        {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <DialogFooter><Button onClick={createCoupon}>Criar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Código</TableHead><TableHead>Afiliado</TableHead>
                  <TableHead>Desconto</TableHead><TableHead>Plano</TableHead>
                  <TableHead>Usos</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {coupons.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell><code className="text-emerald-400 font-semibold">{c.code}</code></TableCell>
                      <TableCell className="text-xs">{userLabel(c.affiliate_user_id)}</TableCell>
                      <TableCell>{c.discount_percent}%</TableCell>
                      <TableCell>{c.plan_name || "Todos"}</TableCell>
                      <TableCell>{c.uses_count}{c.max_uses ? `/${c.max_uses}` : ""}</TableCell>
                      <TableCell><Badge variant="outline" className={c.is_active ? "border-emerald-500/30 text-emerald-400" : "border-destructive/30 text-destructive"}>{c.is_active ? "Ativo" : "Inativo"}</Badge></TableCell>
                      <TableCell><Button size="sm" variant="outline" onClick={() => toggleCoupon(c.id, c.is_active)}>{c.is_active ? "Desativar" : "Ativar"}</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* REFERRALS */}
        <TabsContent value="referrals" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Indicações</CardTitle>
              <Dialog open={refOpen} onOpenChange={setRefOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4" /> Registrar indicação</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nova indicação (cliente pagou)</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Afiliado que indicou</Label>
                      <select value={rAffiliate} onChange={(e) => setRAffiliate(e.target.value)} className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="">Selecione…</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.id.slice(0, 8)} ({u.phone})</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Nome do cliente</Label><Input value={rName} onChange={(e) => setRName(e.target.value)} /></div>
                      <div><Label>Email do cliente</Label><Input value={rEmail} onChange={(e) => setREmail(e.target.value)} /></div>
                    </div>
                    <div>
                      <Label>Cupom usado</Label>
                      <select value={rCoupon} onChange={(e) => setRCoupon(e.target.value)} className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="">Sem cupom</option>
                        {coupons.filter((c) => !rAffiliate || c.affiliate_user_id === rAffiliate).map((c) => <option key={c.id} value={c.id}>{c.code} ({c.discount_percent}%)</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>Plano</Label>
                        <select value={rPlan} onChange={(e) => setRPlan(e.target.value)} className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div><Label>Valor cheio (R$)</Label><Input value={rPrice} onChange={(e) => setRPrice(e.target.value)} /></div>
                      <div><Label>Desconto (R$)</Label><Input value={rDiscountAmount} onChange={(e) => setRDiscountAmount(e.target.value)} /></div>
                    </div>
                    <p className="text-xs text-muted-foreground">Comissão: 30% do valor pago × 3 meses. O 1º mês já será marcado como PAGO automaticamente.</p>
                  </div>
                  <DialogFooter><Button onClick={createReferral}>Registrar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Afiliado</TableHead><TableHead>Cliente</TableHead>
                  <TableHead>Cupom</TableHead><TableHead>Plano</TableHead>
                  <TableHead className="text-right">Pago</TableHead><TableHead className="text-right">Comissão total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {referrals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{date(r.created_at)}</TableCell>
                      <TableCell className="text-xs">{userLabel(r.affiliate_user_id)}</TableCell>
                      <TableCell className="text-xs">{r.referred_name || r.referred_email || "—"}</TableCell>
                      <TableCell><code className="text-xs text-emerald-400">{r.coupon_code || "—"}</code></TableCell>
                      <TableCell>{r.plan_name}</TableCell>
                      <TableCell className="text-right">{fmt(Number(r.paid_amount))}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-400">{fmt(Number(r.commission_total))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYMENTS */}
        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Pagamentos mensais (controle Pix)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Afiliado</TableHead><TableHead>Indicação</TableHead>
                  <TableHead>Mês</TableHead><TableHead>Vence</TableHead>
                  <TableHead className="text-right">Comissão</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {payments.map((p) => {
                    const ref = referrals.find((r) => r.id === p.referral_id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{userLabel(p.affiliate_user_id)}</TableCell>
                        <TableCell className="text-xs">{ref?.referred_name || ref?.referred_email || "—"}</TableCell>
                        <TableCell>{p.month_number}º</TableCell>
                        <TableCell className="text-xs">{p.due_date || "—"}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(Number(p.commission_amount))}</TableCell>
                        <TableCell>
                          {p.status === "paid" ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border"><CheckCircle2 className="w-3 h-3 mr-1" /> Pago</Badge>
                            : <Badge variant="outline" className="border-amber-500/30 text-amber-400">Pendente</Badge>}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => togglePayment(p.id, p.status)}>
                            {p.status === "paid" ? "Desfazer" : "Marcar pago"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYOUTS */}
        <TabsContent value="payouts" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Solicitações de saque</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Afiliado</TableHead>
                  <TableHead>Chave Pix</TableHead><TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {payouts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{date(p.created_at)}</TableCell>
                      <TableCell className="text-xs">{userLabel(p.affiliate_user_id)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.pix_key}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(Number(p.amount))}</TableCell>
                      <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                      <TableCell className="space-x-1">
                        {p.status !== "paid" && <Button size="sm" variant="outline" onClick={() => updatePayoutStatus(p.id, "paid")}>Marcar pago</Button>}
                        {p.status === "requested" && <Button size="sm" variant="ghost" onClick={() => updatePayoutStatus(p.id, "rejected")}><XCircle className="w-3.5 h-3.5" /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {loading && <p className="text-xs text-center text-muted-foreground">Carregando…</p>}
    </div>
  );
}
