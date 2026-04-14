import { UserPlus, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const Leads = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <UserPlus className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Leads</h1>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Gestão de Leads</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Em breve você poderá gerenciar todos os seus leads capturados, classificar por interesse e acompanhar o funil de vendas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Leads;
