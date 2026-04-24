import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tag, Plus, Trash2, Sparkles, Info } from "lucide-react";

interface PredefinedTag {
  id: string;
  tag: string;
  description: string | null;
  color: string;
}

const COLOR_OPTIONS = [
  { value: "sky", label: "Azul", className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  { value: "emerald", label: "Verde", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { value: "amber", label: "Amarelo", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { value: "rose", label: "Rosa", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  { value: "purple", label: "Roxo", className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { value: "slate", label: "Cinza", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
];

export default function AIAutoTagging() {
  const { user } = useAuth();
  const [tags, setTags] = useState<PredefinedTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("sky");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_predefined_tags" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    setTags(((data as any[]) || []) as PredefinedTag[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const add = async () => {
    if (!newTag.trim() || !user) return;
    setSaving(true);
    const { error } = await supabase.from("ai_predefined_tags" as any).insert({
      user_id: user.id,
      tag: newTag.trim().toLowerCase().replace(/\s+/g, "-"),
      description: newDesc.trim() || null,
      color: newColor,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Esta tag já existe" : "Erro ao criar tag");
      return;
    }
    setNewTag("");
    setNewDesc("");
    toast.success("Tag adicionada — a IA poderá usá-la automaticamente");
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("ai_predefined_tags" as any).delete().eq("id", id);
    toast.success("Tag removida");
    load();
  };

  const colorClass = (color: string) =>
    COLOR_OPTIONS.find((c) => c.value === color)?.className || COLOR_OPTIONS[0].className;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Auto-Tagging por IA</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            A IA analisa as conversas e adiciona tags automaticamente nos seus leads.
          </p>
        </div>
      </div>

      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex gap-3">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p className="text-foreground font-medium">Modo híbrido ativo</p>
            <p>
              A IA prioriza usar as tags cadastradas abaixo. Caso identifique algo importante que não está na lista,
              poderá sugerir uma nova tag automaticamente (ex: <span className="font-mono text-xs bg-muted/40 px-1 rounded">objeção-preço</span>,{" "}
              <span className="font-mono text-xs bg-muted/40 px-1 rounded">pediu-desconto</span>).
            </p>
          </div>
        </div>
      </Card>

      {/* Adicionar nova tag */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Adicionar tag</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome da tag</label>
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="ex: interessado-plano-pro"
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Cor</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setNewColor(c.value)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition ${c.className} ${newColor === c.value ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Quando a IA deve aplicar essa tag? (descrição clara para a IA)
          </label>
          <Textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="ex: Quando o cliente demonstrar interesse específico no plano Pro ou em recursos avançados"
            rows={2}
            maxLength={300}
          />
        </div>
        <Button onClick={add} disabled={!newTag.trim() || saving} className="w-full sm:w-auto gap-1.5">
          <Plus className="w-4 h-4" /> Adicionar tag
        </Button>
      </Card>

      {/* Lista */}
      <Card className="p-5">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Tag className="w-4 h-4" /> Tags cadastradas
          <Badge variant="secondary" className="ml-1">{tags.length}</Badge>
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : tags.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            Nenhuma tag cadastrada. Adicione tags para guiar a IA.
          </div>
        ) : (
          <div className="space-y-2">
            {tags.map((t) => (
              <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 hover:border-border/80 transition group">
                <div className={`px-2.5 py-1 text-xs rounded-md border font-medium ${colorClass(t.color)} shrink-0`}>
                  {t.tag}
                </div>
                <p className="flex-1 text-sm text-muted-foreground">
                  {t.description || <span className="italic opacity-50">Sem descrição</span>}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(t.id)}
                  className="opacity-0 group-hover:opacity-100 transition h-8 w-8 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
