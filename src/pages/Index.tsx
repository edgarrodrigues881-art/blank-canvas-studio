import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut, Wifi } from "lucide-react";
import logo from "@/assets/logo-new.png";

const Index = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="DG Contingência Pro" className="w-10 h-10 rounded-lg" />
            <span className="text-lg font-bold text-foreground">DG Contingência Pro</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container py-16">
        <div className="max-w-2xl mx-auto text-center animate-fade-up">
          <div className="w-20 h-20 rounded-3xl bg-accent flex items-center justify-center mx-auto mb-6">
            <Wifi className="w-10 h-10 text-accent-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            Conecte seu WhatsApp
          </h1>
          <p className="text-muted-foreground text-lg mb-8">
            Em breve você poderá escanear o QR Code e começar a disparar mensagens para seus clientes.
          </p>
          <Button size="lg" className="gap-2" disabled>
            <Wifi className="w-4 h-4" />
            Conectar chip (em breve)
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Index;
