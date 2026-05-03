import { Card } from "@/components/ui/card";

interface GroupPlaceholderProps {
  title: string;
  description: string;
}

const GroupPlaceholder = ({ title, description }: GroupPlaceholderProps) => {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card className="p-12 border-dashed flex flex-col items-center justify-center text-center space-y-4 bg-card/50">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-2xl">🚀</span>
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Em breve</h3>
          <p className="text-muted-foreground max-w-sm">
            Esta funcionalidade está sendo preparada e estará disponível em breve no seu painel de Gestão de Grupos.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default GroupPlaceholder;
