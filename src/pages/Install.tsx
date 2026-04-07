import { useState, useEffect } from "react";
import { Download, Smartphone, Monitor, Share2, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Download className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Instalar DG Contingência Pro</h1>
          <p className="text-muted-foreground">
            Use o app direto na tela inicial do seu celular, sem precisar abrir o navegador.
          </p>
        </div>

        {isInstalled ? (
          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="p-6 text-center space-y-2">
              <div className="text-3xl">✅</div>
              <p className="font-semibold text-foreground">App já instalado!</p>
              <p className="text-sm text-muted-foreground">
                Procure o ícone "DG Pro" na tela inicial do seu dispositivo.
              </p>
            </CardContent>
          </Card>
        ) : deferredPrompt ? (
          <Card>
            <CardContent className="p-6 text-center space-y-4">
              <p className="text-foreground font-medium">Pronto para instalar!</p>
              <Button size="lg" className="w-full text-lg py-6" onClick={handleInstall}>
                <Download className="w-5 h-5 mr-2" />
                Instalar agora
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {isIOS ? (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-6 h-6 text-primary" />
                    <h2 className="font-semibold text-foreground">iPhone / iPad</h2>
                  </div>
                  <ol className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">1</span>
                      <span>Toque no ícone <Share2 className="inline w-4 h-4 mx-1 text-primary" /> <strong className="text-foreground">Compartilhar</strong> na barra inferior do Safari</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">2</span>
                      <span>Role para baixo e toque em <Plus className="inline w-4 h-4 mx-1 text-primary" /> <strong className="text-foreground">Adicionar à Tela de Início</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">3</span>
                      <span>Toque em <strong className="text-foreground">Adicionar</strong> no canto superior direito</span>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-6 h-6 text-primary" />
                    <h2 className="font-semibold text-foreground">Android</h2>
                  </div>
                  <ol className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">1</span>
                      <span>Abra este site no <strong className="text-foreground">Chrome</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">2</span>
                      <span>Toque nos <MoreVertical className="inline w-4 h-4 mx-1 text-primary" /> <strong className="text-foreground">3 pontinhos</strong> no canto superior direito</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">3</span>
                      <span>Toque em <strong className="text-foreground">Instalar aplicativo</strong> ou <strong className="text-foreground">Adicionar à tela inicial</strong></span>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Monitor className="w-6 h-6 text-primary" />
                  <h2 className="font-semibold text-foreground">Computador</h2>
                </div>
                <ol className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">1</span>
                    <span>No Chrome, clique no ícone de <strong className="text-foreground">instalação</strong> na barra de endereço (à direita)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">2</span>
                    <span>Clique em <strong className="text-foreground">Instalar</strong></span>
                  </li>
                </ol>
              </CardContent>
            </Card>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          O app funciona offline e ocupa pouquíssimo espaço no seu dispositivo.
        </p>
      </div>
    </div>
  );
}