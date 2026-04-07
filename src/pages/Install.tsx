import { useState, useEffect } from "react";
import { Download, Smartphone, Monitor, Apple, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);
  const [showAndroidSteps, setShowAndroidSteps] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const [showPCSteps, setShowPCSteps] = useState(false);

  const handleInstallPC = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setIsInstalled(true);
      setDeferredPrompt(null);
    } else {
      setShowPCSteps(true);
      setShowIOSSteps(false);
      setShowAndroidSteps(false);
    }
  };

  const handleInstallAndroid = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setIsInstalled(true);
      setDeferredPrompt(null);
    } else {
      setShowAndroidSteps(true);
      setShowIOSSteps(false);
      setShowPCSteps(false);
    }
  };

  const handleInstallIOS = () => {
    setShowIOSSteps(true);
    setShowAndroidSteps(false);
    setShowPCSteps(false);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-primary/30">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
            <h1 className="text-2xl font-bold text-foreground">App instalado!</h1>
            <p className="text-muted-foreground">
              Procure o ícone <strong className="text-foreground">"DG Pro"</strong> na tela inicial do seu dispositivo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Download className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Baixar DG Contingência Pro</h1>
          <p className="text-muted-foreground text-sm">
            Escolha seu dispositivo e instale com um clique.
          </p>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full py-6 text-base gap-3 justify-start"
            onClick={handleInstallPC}
          >
            <Monitor className="w-6 h-6 flex-shrink-0" />
            <div className="text-left">
              <div className="font-semibold">Instalar no Computador</div>
              <div className="text-xs opacity-70 font-normal">Windows, Mac ou Linux</div>
            </div>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="w-full py-6 text-base gap-3 justify-start border-primary/30 hover:bg-primary/5"
            onClick={handleInstallAndroid}
          >
            <Smartphone className="w-6 h-6 flex-shrink-0 text-primary" />
            <div className="text-left">
              <div className="font-semibold">Instalar no Android</div>
              <div className="text-xs text-muted-foreground font-normal">Samsung, Motorola, Xiaomi...</div>
            </div>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="w-full py-6 text-base gap-3 justify-start border-primary/30 hover:bg-primary/5"
            onClick={handleInstallIOS}
          >
            <Apple className="w-6 h-6 flex-shrink-0 text-primary" />
            <div className="text-left">
              <div className="font-semibold">Instalar no iPhone / iPad</div>
              <div className="text-xs text-muted-foreground font-normal">iOS 16.4 ou superior</div>
            </div>
          </Button>
        </div>

        {/* Android Steps */}
        {showAndroidSteps && (
          <Card className="animate-fade-in border-primary/20">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-foreground text-sm">📱 Como instalar no Android:</h3>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary font-bold">1.</span>
                  Abra este site no <strong className="text-foreground">Chrome</strong>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-bold">2.</span>
                  Toque nos <strong className="text-foreground">⋮ 3 pontinhos</strong> (canto superior direito)
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-bold">3.</span>
                  Toque em <strong className="text-foreground">"Instalar aplicativo"</strong>
                </li>
              </ol>
            </CardContent>
          </Card>
        )}

        {/* iOS Steps */}
        {showIOSSteps && (
          <Card className="animate-fade-in border-primary/20">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-foreground text-sm">🍎 Como instalar no iPhone:</h3>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary font-bold">1.</span>
                  Abra este site no <strong className="text-foreground">Safari</strong>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-bold">2.</span>
                  Toque no ícone <strong className="text-foreground">Compartilhar</strong> (⬆️) na barra inferior
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-bold">3.</span>
                  Toque em <strong className="text-foreground">"Adicionar à Tela de Início"</strong>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-bold">4.</span>
                  Toque em <strong className="text-foreground">"Adicionar"</strong>
                </li>
              </ol>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          100% gratuito • Sem loja de apps • Ocupa pouquíssimo espaço
        </p>
      </div>
    </div>
  );
}