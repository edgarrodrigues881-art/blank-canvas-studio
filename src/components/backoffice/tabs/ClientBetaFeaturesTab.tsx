import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Sparkles } from "lucide-react";
import { useAdminAction, type AdminUser } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { BETA_FEATURES, type BetaFeatureKey } from "@/hooks/useBetaFeatures";

interface Props {
  client: AdminUser;
  detail: any;
}

const ClientBetaFeaturesTab = ({ client, detail }: Props) => {
  const profile = detail?.profile || {};
  const initial: string[] = Array.isArray(profile.beta_features) ? profile.beta_features : [];
  const [enabled, setEnabled] = useState<Set<string>>(new Set(initial));
  const [dirty, setDirty] = useState(false);
  const { mutate, isPending, invalidateClient } = useAdminAction();
  const { toast } = useToast();

  // Reset when switching client
  useEffect(() => {
    setEnabled(new Set(Array.isArray(profile.beta_features) ? profile.beta_features : []));
    setDirty(false);
  }, [client.id, profile.beta_features?.join(",")]);

  const toggle = (key: BetaFeatureKey, value: boolean) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
    setDirty(true);
  };

  const handleSave = () => {
    mutate(
      {
        action: "update-beta-features",
        body: { target_user_id: client.id, beta_features: Array.from(enabled) },
      },
      {
        onSuccess: () => {
          toast({ title: "Funcionalidades atualizadas" });
          setDirty(false);
          invalidateClient(client.id);
        },
        onError: (e: any) =>
          toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Sparkles size={16} className="text-primary" /> Funcionalidades Beta
        </CardTitle>
        <CardDescription>
          Libere ou bloqueie funcionalidades em fase de testes para este cliente. As mudanças
          aparecem no menu lateral do cliente assim que ele recarregar a página.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {BETA_FEATURES.map((feature) => (
            <div
              key={feature.key}
              className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-3"
            >
              <div className="space-y-0.5 min-w-0">
                <Label htmlFor={`beta-${feature.key}`} className="text-sm font-medium text-foreground">
                  {feature.label}
                </Label>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
              <Switch
                id={`beta-${feature.key}`}
                checked={enabled.has(feature.key)}
                onCheckedChange={(v) => toggle(feature.key, !!v)}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={!dirty || isPending} size="sm">
            {isPending ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Save size={14} className="mr-1.5" />
            )}
            Salvar alterações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientBetaFeaturesTab;
