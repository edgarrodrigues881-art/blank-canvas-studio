import { useState } from "react";
import { useAdminAction } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";

const CATEGORIES = ["VPS/Servidor", "API WhatsApp", "Proxy", "Ferramentas", "Outros"];

interface Cost {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  cost_date: string;
  created_at: string;
}

const CostsTab = ({ costs, onRefresh }: { costs: Cost[]; onRefresh: () => void }) => {
  const { mutate, isPending } = useAdminAction();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ category: "VPS/Servidor", amount: "", description: "", cost_date: new Date().toISOString().slice(0, 10) });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthCosts = costs.filter(c => new Date(c.cost_date) >= monthStart);
  const monthTotal = monthCosts.reduce((s, c) => s + Number(c.amount), 0);

  const handleSave = () => {
    const action = editId ? "update-cost" : "add-cost";
    const body = editId
      ? { cost_id: editId, ...form, amount: Number(form.amount) }
      : { ...form, amount: Number(form.amount) };
    mutate({ action, body }, {
      onSuccess: () => {
        toast({ title: editId ? "Custo atualizado" : "Custo adicionado" });
        setShowForm(false);
        setEditId(null);
        setForm({ category: "VPS/Servidor", amount: "", description: "", cost_date: new Date().toISOString().slice(0, 10) });
        onRefresh();
      },
      onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  const handleDelete = (id: string) => {
    mutate({ action: "delete-cost", body: { cost_id: id } }, {
      onSuccess: () => { toast({ title: "Custo removido" }); onRefresh(); },
    });
  };

  const startEdit = (c: Cost) => {
    setForm({ category: c.category, amount: String(c.amount), description: c.description || "", cost_date: c.cost_date.slice(0, 10) });
    setEditId(c.id);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Custos & Taxas</h3>
          <p className="text-[11px] text-muted-foreground">Total no mês: R$ {monthTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </div>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setEditId(null); }} className="gap-1 text-xs">
          <Plus size={14} /> Adicionar
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground">Categoria</Label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full h-9 rounded-md border border-border bg-background text-foreground px-2 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Valor (R$)</Label>
              <Input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                className="mt-1 h-9" placeholder="0,00" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Data</Label>
              <Input type="date" value={form.cost_date} onChange={e => setForm({ ...form, cost_date: e.target.value })}
                className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Observação</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="mt-1 h-9" placeholder="Opcional" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={isPending || !form.amount} className="text-xs">
              {isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              {editId ? "Atualizar" : "Salvar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditId(null); }} className="text-xs">Cancelar</Button>
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider">
              <th className="text-left px-3 py-2">Data</th>
              <th className="text-left px-3 py-2">Categoria</th>
              <th className="text-right px-3 py-2">Valor</th>
              <th className="text-left px-3 py-2">Observação</th>
              <th className="text-right px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {costs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">Nenhum custo registrado</td></tr>
            ) : costs.sort((a, b) => b.cost_date.localeCompare(a.cost_date)).map(c => (
              <tr key={c.id} className="hover:bg-muted/20">
                <td className="px-3 py-2 text-xs text-foreground">{new Date(c.cost_date).toLocaleDateString("pt-BR")}</td>
                <td className="px-3 py-2 text-xs text-foreground">{c.category}</td>
                <td className="px-3 py-2 text-xs text-foreground text-right">R$ {Number(c.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{c.description || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(c)} className="h-7 w-7 p-0"><Pencil size={12} /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 size={12} /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CostsTab;
