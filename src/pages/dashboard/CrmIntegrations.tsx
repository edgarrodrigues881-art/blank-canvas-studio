import { useState } from "react";
import {
  HardDrive,
  Sheet,
  NotebookPen,
  Mail,
  MessageCircle,
  Webhook,
  Zap,
  CreditCard,
  Database,
  CheckCircle2,
  Plug,
  ExternalLink,
  Settings2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

type Category = "Essenciais" | "Comunicação" | "Automação" | "Avançado";

type Integration = {
  id: string;
  name: string;
  description: string;
  category: Category;
  icon: typeof HardDrive;
  accent: string; // tailwind text/bg accent (semantic-friendly)
  bg: string;
  helpUrl?: string;
  configFields?: { key: string; label: string; placeholder?: string; type?: string }[];
};

const INTEGRATIONS: Integration[] = [
  {
    id: "google_drive",
    name: "Google Drive",
    description: "Armazene e compartilhe arquivos diretamente do CRM.",
    category: "Essenciais",
    icon: HardDrive,
    accent: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Sincronize leads e dados com planilhas em tempo real.",
    category: "Essenciais",
    icon: Sheet,
    accent: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Centralize notas, documentos e bases de conhecimento.",
    category: "Essenciais",
    icon: NotebookPen,
    accent: "text-foreground",
    bg: "bg-muted",
  },
  {
    id: "email",
    name: "E-mail (SMTP / Gmail)",
    description: "Envie e receba e-mails transacionais a partir do CRM.",
    category: "Comunicação",
    icon: Mail,
    accent: "text-rose-500",
    bg: "bg-rose-500/10",
    configFields: [
      { key: "host", label: "Servidor SMTP", placeholder: "smtp.gmail.com" },
      { key: "user", label: "Usuário", placeholder: "voce@empresa.com" },
      { key: "password", label: "Senha / App Password", type: "password" },
    ],
  },
  {
    id: "whatsapp_api",
    name: "WhatsApp API",
    description: "Conecte uma instância oficial do WhatsApp Business.",
    category: "Comunicação",
    icon: MessageCircle,
    accent: "text-green-500",
    bg: "bg-green-500/10",
  },
  {
    id: "webhooks",
    name: "Webhooks",
    description: "Envie e receba eventos do CRM para sistemas externos.",
    category: "Automação",
    icon: Webhook,
    accent: "text-violet-500",
    bg: "bg-violet-500/10",
    configFields: [
      { key: "url", label: "URL do Webhook", placeholder: "https://api.suaempresa.com/webhook" },
      { key: "secret", label: "Token de assinatura (opcional)" },
    ],
  },
  {
    id: "zapier",
    name: "Zapier / Make",
    description: "Crie automações no-code com milhares de aplicativos.",
    category: "Automação",
    icon: Zap,
    accent: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    id: "stripe",
    name: "Stripe / Mercado Pago",
    description: "Processe pagamentos e acompanhe assinaturas no CRM.",
    category: "Avançado",
    icon: CreditCard,
    accent: "text-indigo-500",
    bg: "bg-indigo-500/10",
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Banco de dados visual para gestão flexível de informações.",
    category: "Avançado",
    icon: Database,
    accent: "text-pink-500",
    bg: "bg-pink-500/10",
  },
];

const CATEGORIES: Category[] = ["Essenciais", "Comunicação", "Automação", "Avançado"];

const STORAGE_KEY = "crm.integrations.connected";

function loadConnected(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function CrmIntegrations() {
  const [connected, setConnected] = useState<Record<string, boolean>>(loadConnected);
  const [active, setActive] = useState<Integration | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateConnected = (next: Record<string, boolean>) => {
    setConnected(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const handleConnect = async () => {
    if (!active) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));
    updateConnected({ ...connected, [active.id]: true });
    setSubmitting(false);
    toast({ title: "Integração conectada", description: `${active.name} foi conectada com sucesso.` });
    setActive(null);
  };

  const handleDisconnect = (id: string, name: string) => {
    const next = { ...connected };
    delete next[id];
    updateConnected(next);
    toast({ title: "Integração desconectada", description: `${name} foi desconectada.` });
  };

  const totalConnected = Object.values(connected).filter(Boolean).length;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Plug className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Integrações</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Conecte ferramentas externas para automatizar e expandir seu CRM.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {totalConnected} conectada{totalConnected === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
            {INTEGRATIONS.length} disponíveis
          </Badge>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-10">
        {CATEGORIES.map((cat) => {
          const items = INTEGRATIONS.filter((i) => i.category === cat);
          if (!items.length) return null;
          return (
            <section key={cat}>
              <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground/70 font-semibold mb-3 px-1">
                {cat}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((it) => {
                  const isConnected = !!connected[it.id];
                  const Icon = it.icon;
                  return (
                    <Card
                      key={it.id}
                      className="group relative overflow-hidden hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className={`h-11 w-11 rounded-xl ${it.bg} flex items-center justify-center shrink-0`}>
                            <Icon className={`h-5 w-5 ${it.accent}`} />
                          </div>
                          {isConnected ? (
                            <Badge className="rounded-full gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30">
                              <CheckCircle2 className="h-3 w-3" />
                              Conectado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="rounded-full text-muted-foreground">
                              Não conectado
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-base sm:text-lg mt-3">{it.name}</CardTitle>
                        <CardDescription className="text-xs sm:text-sm leading-relaxed">
                          {it.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0 flex items-center gap-2">
                        {isConnected ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => setActive(it)}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                              Gerenciar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDisconnect(it.id, it.name)}
                            >
                              Desconectar
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" className="flex-1" onClick={() => setActive(it)}>
                            <Plug className="h-3.5 w-3.5" />
                            Conectar
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Connect / Manage Dialog */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="sm:max-w-md">
          {active && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div className={`h-10 w-10 rounded-xl ${active.bg} flex items-center justify-center`}>
                    <active.icon className={`h-5 w-5 ${active.accent}`} />
                  </div>
                  <div>
                    <DialogTitle>{active.name}</DialogTitle>
                    <DialogDescription className="text-xs">{active.category}</DialogDescription>
                  </div>
                </div>
                <DialogDescription className="pt-2">{active.description}</DialogDescription>
              </DialogHeader>

              {connected[active.id] ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="font-medium text-emerald-700 dark:text-emerald-300">Tudo certo!</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Esta integração está ativa. Você pode desconectá-la a qualquer momento.
                    </p>
                  </div>
                </div>
              ) : active.configFields ? (
                <div className="space-y-3 py-2">
                  {active.configFields.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label className="text-xs">{f.label}</Label>
                      <Input type={f.type || "text"} placeholder={f.placeholder} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Você será redirecionado para autenticar com {active.name} e autorizar o acesso.
                </div>
              )}

              <DialogFooter className="gap-2">
                {connected[active.id] ? (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      handleDisconnect(active.id, active.name);
                      setActive(null);
                    }}
                  >
                    Desconectar
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => setActive(null)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleConnect} disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Conectando...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-3.5 w-3.5" />
                          Conectar agora
                        </>
                      )}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
