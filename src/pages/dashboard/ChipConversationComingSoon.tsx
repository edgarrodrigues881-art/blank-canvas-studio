import { useNavigate } from "react-router-dom";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ChipConversationComingSoon() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      <div className="rounded-full bg-muted p-5">
        <Construction className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold text-foreground">Em desenvolvimento</h2>
        <p className="text-muted-foreground">
          A função de <strong>Conversa entre Chips</strong> ainda está em desenvolvimento e será liberada em breve. Fique atento às atualizações!
        </p>
      </div>
      <Button variant="outline" onClick={() => navigate("/dashboard")} className="border-border">
        Voltar ao painel
      </Button>
    </div>
  );
}
