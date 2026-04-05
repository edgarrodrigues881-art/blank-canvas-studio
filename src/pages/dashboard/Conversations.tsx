import { MessageSquare } from "lucide-react";

const Conversations = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <MessageSquare className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Conversas</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas conversas em tempo real</p>
        </div>
      </div>

      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Em breve</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            A central de conversas está sendo desenvolvida. Em breve você poderá gerenciar todas as suas conversas aqui.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Conversations;
