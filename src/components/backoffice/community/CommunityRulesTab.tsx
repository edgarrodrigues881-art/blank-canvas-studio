import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, ShieldCheck, RotateCcw, Users, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

const CommunityRulesTab = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["community-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-data?action=community-settings-get");
      if (error) throw error;
      return data?.settings || [];
    },
  });

  useEffect(() => {
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((s: any) => { map[s.key] = s.value; });
      setLocal(map);
    }
  }, [data]);

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase.functions.invoke("admin-data?action=community-settings-update", {
        body: { key, value },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-settings"] });
      toast({ title: "Configuração salva!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleSave = (key: string) => {
    updateSetting.mutate({ key, value: local[key] });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const rules = [
    {
      key: "min_phase_required_for_pool",
      icon: ShieldCheck,
      title: "Fase mínima para o pool",
      description: "Instâncias precisam estar nessa fase ou acima para serem elegíveis.",
      type: "select" as const,
      options: [
        { value: "pre_24h", label: "pre_24h" },
        { value: "groups_only", label: "groups_only" },
        { value: "autosave_enabled", label: "autosave_enabled" },
        { value: "community_enabled", label: "community_enabled" },
      ],
      defaultValue: "autosave_enabled",
    },
    {
      key: "max_active_pairs_per_instance",
      icon: Users,
      title: "Máx. pares ativos por instância",
      description: "Limita quantos pares simultâneos cada instância pode ter.",
      type: "number" as const,
      min: 1,
      max: 10,
      defaultValue: "1",
    },
    {
      key: "rotation_policy_last_n",
      icon: RotateCcw,
      title: "Política de rotação",
      description: "Evita repetir o mesmo par nas últimas N execuções.",
      type: "number" as const,
      min: 0,
      max: 50,
      defaultValue: "3",
    },
    {
      key: "show_community_to_users",
      icon: Eye,
      title: "Visibilidade para clientes",
      description: "Se ativo, clientes veem o status de comunidade em suas instâncias.",
      type: "toggle" as const,
      defaultValue: "false",
    },
  ];

  return (
    <div className="space-y-3 max-w-xl">
      {rules.map(rule => {
        const Icon = rule.icon;
        return (
          <div key={rule.key} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-muted/50 shrink-0">
                <Icon size={15} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{rule.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{rule.description}</p>
              </div>
            </div>

            {rule.type === "select" && (
              <div className="flex gap-2 pl-11">
                <Select value={local[rule.key] || rule.defaultValue} onValueChange={v => setLocal(prev => ({ ...prev, [rule.key]: v }))}>
                  <SelectTrigger className="bg-background border-border text-xs h-8 flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {rule.options!.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 px-3" onClick={() => handleSave(rule.key)} disabled={updateSetting.isPending}>
                  <Save size={13} />
                </Button>
              </div>
            )}

            {rule.type === "number" && (
              <div className="flex gap-2 pl-11">
                <Input
                  type="number"
                  min={rule.min}
                  max={rule.max}
                  value={local[rule.key] || rule.defaultValue}
                  onChange={e => setLocal(prev => ({ ...prev, [rule.key]: e.target.value }))}
                  className="bg-background border-border w-24 text-xs h-8"
                />
                <Button size="sm" className="h-8 px-3" onClick={() => handleSave(rule.key)} disabled={updateSetting.isPending}>
                  <Save size={13} />
                </Button>
              </div>
            )}

            {rule.type === "toggle" && (
              <div className="flex items-center gap-3 pl-11">
                <Switch
                  checked={local[rule.key] === "true"}
                  onCheckedChange={v => {
                    setLocal(prev => ({ ...prev, [rule.key]: v ? "true" : "false" }));
                    updateSetting.mutate({ key: rule.key, value: v ? "true" : "false" });
                  }}
                />
                <span className="text-xs text-muted-foreground">{local[rule.key] === "true" ? "Visível" : "Oculto"}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CommunityRulesTab;
