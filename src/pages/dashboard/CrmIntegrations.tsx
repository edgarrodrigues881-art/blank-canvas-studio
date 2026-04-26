import { useState } from "react";
import {
  CheckCircle2,
  Plug,
  ExternalLink,
  Settings2,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { toast } from "@/hooks/use-toast";

type Integration = {
  id: string;
  name: string;
  description: string;
  logo: string;
  accent: string;
  bg: string;
  automations: {
    id: string;
    title: string;
    description: string;
    defaultOn?: boolean;
  }[];
};

const INTEGRATIONS: Integration[] = [
  {
    id: "google_drive",
    name: "Google Drive",
    description: "Use o Google Drive como base de conhecimento para sua IA e armazene mídias automaticamente.",
    logo: "/google-drive.png",
    accent: "text-blue-500",
    bg: "bg-blue-500/5",
    automations: [
      {
        id: "ai_knowledge_base",
        title: "Base de Conhecimento IA",
        description: "A IA lerá arquivos (PDF, Docs, Imagens) para responder clientes com precisão.",
        defaultOn: true,
      },
      {
        id: "auto_save_media",
        title: "Backup de Mídias",
        description: "Salva fotos e documentos recebidos no WhatsApp diretamente no Drive.",
        defaultOn: true,
      },
    ],
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Sincronize leads e histórico de mensagens com suas planilhas em tempo real.",
    logo: "/google-sheets.png",
    accent: "text-emerald-500",
    bg: "bg-emerald-500/5",
    automations: [
      {
        id: "save_leads_messages",
        title: "Sincronização Crítica",
        description: "Salva automaticamente Nome, Número, Mensagem e Status em sua planilha.",
        defaultOn: true,
      },
      {
        id: "daily_report",
        title: "Relatório Diário",
        description: "Gera um resumo consolidado de interações ao final do dia.",
      },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Organize seus leads e histórico de interações em páginas estruturadas no Notion.",
    logo: "/notion.png",
    accent: "text-foreground",
    bg: "bg-muted/30",
    automations: [
      {
        id: "page_per_lead",
        title: "Páginas de Leads",
        description: "Cria ou atualiza uma página para cada lead com todo o histórico de conversas.",
        defaultOn: true,
      },
    ],
  },
];

const STORAGE_KEY = "crm.integrations.connected";
const AUTOMATIONS_KEY = "crm.integrations.automations";

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function CrmIntegrations() {
  const [connected, setConnected] = useState<Record<string, boolean>>(() =>
    loadJSON<Record<string, boolean>>(STORAGE_KEY, {})
  );
  const [automations, setAutomations] = useState<Record<string, Record<string, boolean>>>(() =>
    loadJSON<Record<string, Record<string, boolean>>>(AUTOMATIONS_KEY, {})
  );
  const [active, setActive] = useState<Integration | null>(null);
  const [mode, setMode] = useState<"connect" | "configure">("connect");
  const [submitting, setSubmitting] = useState(false);

  const persistConnected = (next: Record<string, boolean>) => {
    setConnected(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const persistAutomations = (next: Record<string, Record<string, boolean>>) => {
    setAutomations(next);
    localStorage.setItem(AUTOMATIONS_KEY, JSON.stringify(next));
  };

  const handleConnect = () => {
    if (!active) return;
    setSubmitting(true);
    setTimeout(() => {
      persistConnected({ ...connected, [active.id]: true });
      setSubmitting(false);
      setMode("configure");
      toast({
        title: "Conectado com sucesso!",
        description: `${active.name} agora está integrado ao seu CRM.`,
      });
    }, 1500);
  };

  const toggleAutomation = (integrationId: string, autoId: string, val: boolean) => {
    const current = automations[integrationId] || {};
    const next = { ...automations, [integrationId]: { ...current, [autoId]: val } };
    persistAutomations(next);
  };

  const getAutoState = (it: Integration) => {
    const saved = automations[it.id];
    if (saved) return saved;
    return Object.fromEntries(it.automations.map(a => [a.id, !!a.defaultOn]));
  };

  return (
    <div className="container max-w-6xl py-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground text-lg">
          Conecte suas ferramentas favoritas para automatizar seu fluxo de trabalho.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {INTEGRATIONS.map((it) => {
          const isConnected = connected[it.id];
          return (
            <Card 
              key={it.id} 
              className="group relative overflow-hidden border-border/50 bg-card hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300"
            >
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${it.bg}`} />
              
              <CardHeader className="relative space-y-4 pb-4">
                <div className="flex justify-between items-start">
                  <div className="h-14 w-14 rounded-2xl bg-white p-2.5 shadow-sm border border-border/50 group-hover:scale-110 transition-transform duration-300">
                    <img src={it.logo} alt={it.name} className="h-full w-full object-contain" />
                  </div>
                  <Badge 
                    variant={isConnected ? "default" : "secondary"}
                    className={isConnected ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted text-muted-foreground"}
                  >
                    {isConnected ? "Conectado" : "Disponível"}
                  </Badge>
                </div>
                <div>
                  <CardTitle className="text-xl font-bold">{it.name}</CardTitle>
                  <CardDescription className="mt-2 leading-relaxed min-h-[60px]">
                    {it.description}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="relative pt-0">
                <div className="space-y-3 mb-6">
                  {it.automations.slice(0, 2).map((auto) => (
                    <div key={auto.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="h-1 w-1 rounded-full bg-primary/40" />
                      {auto.title}
                    </div>
                  ))}
                </div>

                {isConnected ? (
                  <Button 
                    variant="outline" 
                    className="w-full group/btn border-border/50 hover:bg-secondary transition-colors"
                    onClick={() => { setActive(it); setMode("configure"); }}
                  >
                    <Settings2 className="mr-2 h-4 w-4 text-muted-foreground group-hover/btn:rotate-90 transition-transform duration-500" />
                    Configurar
                  </Button>
                ) : (
                  <Button 
                    className="w-full shadow-lg shadow-primary/10 group/btn"
                    onClick={() => { setActive(it); setMode("connect"); }}
                  >
                    Conectar
                    <ChevronRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="sm:max-w-[500px] border-border/50 shadow-2xl">
          {active && (
            <>
              <DialogHeader className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-white p-3 shadow-md border border-border/50">
                    <img src={active.logo} alt={active.name} className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-bold">
                      {mode === "configure" ? `Configurar ${active.name}` : `Conectar ao ${active.name}`}
                    </DialogTitle>
                    <DialogDescription>
                      {mode === "configure" 
                        ? "Gerencie as automações ativas para esta integração."
                        : "Siga os passos para autorizar o acesso do CRM."}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="py-6">
                {mode === "configure" ? (
                  <div className="space-y-4">
                    {active.automations.map((a) => {
                      const state = getAutoState(active);
                      const enabled = !!state[a.id];
                      return (
                        <div
                          key={a.id}
                          className="flex items-start justify-between gap-4 rounded-xl border border-border/40 bg-muted/20 p-4 hover:bg-muted/30 transition-colors"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">{a.title}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {a.description}
                            </p>
                          </div>
                          <Switch
                            checked={enabled}
                            onCheckedChange={(v) => toggleAutomation(active.id, a.id, v)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-primary/10 bg-primary/5 p-6 text-center space-y-4">
                    <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Plug className="h-6 w-6 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground px-4">
                      Você será redirecionado para a página de autorização oficial do <strong>{active.name}</strong> para permitir que o CRM sincronize seus dados com segurança.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                {mode === "configure" ? (
                  <Button 
                    className="w-full"
                    onClick={() => { 
                      toast({ title: "Configurações salvas" }); 
                      setActive(null); 
                    }}
                  >
                    Salvar e Fechar
                  </Button>
                ) : (
                  <div className="flex w-full gap-3">
                    <Button variant="ghost" className="flex-1" onClick={() => setActive(null)}>
                      Cancelar
                    </Button>
                    <Button 
                      className="flex-[2]" 
                      onClick={handleConnect} 
                      disabled={submitting}
                    >
                      {submitting ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Autorizando...</>
                      ) : (
                        <><ExternalLink className="mr-2 h-4 w-4" /> Autorizar Acesso</>
                      )}
                    </Button>
                  </div>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
