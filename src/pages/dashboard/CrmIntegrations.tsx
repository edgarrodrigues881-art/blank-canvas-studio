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
  Sparkles,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

type Category = "Essenciais" | "Comunicação" | "Automação" | "Avançado";

type Automation = {
  id: string;
  label: string;        // chip label (curto)
  title: string;        // título no painel
  description: string;  // o que faz
  defaultOn?: boolean;
};

type Integration = {
  id: string;
  name: string;
  description: string;
  category: Category;
  icon: typeof HardDrive;
  accent: string;
  bg: string;
  configFields?: { key: string; label: string; placeholder?: string; type?: string }[];
  automations: Automation[];
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
    automations: [
      {
        id: "auto_save_media",
        label: "Salvar mídias",
        title: "Salvar arquivos e mídias automaticamente",
        description: "Toda mídia recebida nas conversas é arquivada em uma pasta organizada por contato.",
        defaultOn: true,
      },
      {
        id: "backup_exports",
        label: "Backup de exports",
        title: "Backup automático de exportações",
        description: "Relatórios e listas exportadas são salvas automaticamente no Drive.",
      },
    ],
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Sincronize leads e dados com planilhas em tempo real.",
    category: "Essenciais",
    icon: Sheet,
    accent: "text-emerald-500",
    bg: "bg-emerald-500/10",
    automations: [
      {
        id: "save_new_leads",
        label: "Auto salvar leads",
        title: "Salvar novos leads automaticamente",
        description: "Cada novo lead capturado vira uma linha em uma planilha do Sheets.",
        defaultOn: true,
      },
      {
        id: "sync_status",
        label: "Sync status",
        title: "Atualizar status dos leads",
        description: "Mudanças de etapa no pipeline atualizam o status na planilha em tempo real.",
        defaultOn: true,
      },
      {
        id: "daily_report",
        label: "Resumo diário",
        title: "Enviar resumo diário",
        description: "Uma aba é atualizada diariamente com métricas consolidadas do CRM.",
      },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Centralize notas, documentos e bases de conhecimento.",
    category: "Essenciais",
    icon: NotebookPen,
    accent: "text-foreground",
    bg: "bg-muted",
    automations: [
      {
        id: "page_per_lead",
        label: "Página por lead",
        title: "Criar páginas para novos leads",
        description: "Cada novo lead gera uma página no Notion com dados, contato e histórico.",
        defaultOn: true,
      },
      {
        id: "log_interactions",
        label: "Histórico",
        title: "Registrar histórico de interações",
        description: "Mensagens importantes e mudanças de etapa são registradas na página do lead.",
      },
    ],
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
    automations: [
      {
        id: "welcome_email",
        label: "E-mail de boas-vindas",
        title: "Enviar e-mail de boas-vindas",
        description: "Novos leads recebem automaticamente um e-mail de apresentação.",
        defaultOn: true,
      },
      {
        id: "stage_notification",
        label: "Notificar etapas",
        title: "Notificar mudanças de etapa",
        description: "Envia um e-mail quando o lead avança para etapas-chave do pipeline.",
      },
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
    automations: [
      {
        id: "auto_reply",
        label: "Resposta automática",
        title: "Resposta automática para novos contatos",
        description: "Mensagens recebidas fora do horário recebem uma resposta padrão.",
        defaultOn: true,
      },
      {
        id: "lead_capture",
        label: "Captura de leads",
        title: "Capturar leads das conversas",
        description: "Novos contatos viram leads no CRM automaticamente.",
        defaultOn: true,
      },
    ],
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
    automations: [
      {
        id: "send_events",
        label: "Enviar eventos",
        title: "Enviar eventos do CRM",
        description: "Eventos como novo lead, mensagem recebida e mudança de etapa são enviados ao seu sistema.",
        defaultOn: true,
      },
      {
        id: "receive_events",
        label: "Receber eventos",
        title: "Receber eventos externos",
        description: "Sistemas externos podem criar leads e atualizar dados via webhook.",
      },
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
    automations: [
      {
        id: "trigger_zaps",
        label: "Disparar Zaps",
        title: "Disparar Zaps com eventos do CRM",
        description: "Use eventos do CRM como gatilho para fluxos no Zapier ou Make.",
        defaultOn: true,
      },
    ],
  },
  {
    id: "stripe",
    name: "Stripe / Mercado Pago",
    description: "Processe pagamentos e acompanhe assinaturas no CRM.",
    category: "Avançado",
    icon: CreditCard,
    accent: "text-indigo-500",
    bg: "bg-indigo-500/10",
    automations: [
      {
        id: "track_payments",
        label: "Rastrear pagamentos",
        title: "Rastrear pagamentos por lead",
        description: "Vincula pagamentos recebidos ao lead correspondente no CRM.",
        defaultOn: true,
      },
      {
        id: "move_on_payment",
        label: "Mover ao pagar",
        title: "Avançar etapa após pagamento",
        description: "Leads que efetuam pagamento são movidos automaticamente para 'Cliente'.",
      },
    ],
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Banco de dados visual para gestão flexível de informações.",
    category: "Avançado",
    icon: Database,
    accent: "text-pink-500",
    bg: "bg-pink-500/10",
    automations: [
      {
        id: "sync_leads",
        label: "Sync leads",
        title: "Sincronizar leads com Airtable",
        description: "Mantém uma base do Airtable espelhada com os leads do CRM.",
        defaultOn: true,
      },
    ],
  },
];

const CATEGORIES: Category[] = ["Essenciais", "Comunicação", "Automação", "Avançado"];

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

type AutomationState = Record<string, Record<string, boolean>>; // integrationId -> automationId -> enabled

export default function CrmIntegrations() {
  const [connected, setConnected] = useState<Record<string, boolean>>(() =>
    loadJSON<Record<string, boolean>>(STORAGE_KEY, {})
  );
  const [automations, setAutomations] = useState<AutomationState>(() =>
    loadJSON<AutomationState>(AUTOMATIONS_KEY, {})
  );
  const [active, setActive] = useState<Integration | null>(null);
  const [mode, setMode] = useState<"connect" | "configure">("connect");
  const [submitting, setSubmitting] = useState(false);

  const persistConnected = (next: Record<string, boolean>) => {
    setConnected(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };
  const persistAutomations = (next: AutomationState) => {
    setAutomations(next);
    try { localStorage.setItem(AUTOMATIONS_KEY, JSON.stringify(next)); } catch {}
  };

  const getAutoState = (it: Integration): Record<string, boolean> => {
    const saved = automations[it.id];
    if (saved) return saved;
    // defaults from catalog
    return Object.fromEntries(it.automations.map(a => [a.id, !!a.defaultOn]));
  };

  const activeChipsFor = (it: Integration) => {
    const state = getAutoState(it);
    return it.automations.filter(a => state[a.id]);
  };

  const handleConnect = async () => {
    if (!active) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    persistConnected({ ...connected, [active.id]: true });
    // initialize automations with defaults if not set
    if (!automations[active.id]) {
      persistAutomations({
        ...automations,
        [active.id]: Object.fromEntries(active.automations.map(a => [a.id, !!a.defaultOn])),
      });
    }
    setSubmitting(false);
    toast({ title: "Integração conectada", description: `${active.name} foi conectada com sucesso.` });
    setActive(null);
  };

  const handleDisconnect = (id: string, name: string) => {
    const next = { ...connected };
    delete next[id];
    persistConnected(next);
    toast({ title: "Integração desconectada", description: `${name} foi desconectada.` });
  };

  const toggleAutomation = (integrationId: string, automationId: string, value: boolean) => {
    const it = INTEGRATIONS.find(i => i.id === integrationId)!;
    const current = automations[integrationId] ?? Object.fromEntries(it.automations.map(a => [a.id, !!a.defaultOn]));
    persistAutomations({
      ...automations,
      [integrationId]: { ...current, [automationId]: value },
    });
  };

  const openConnect = (it: Integration) => { setActive(it); setMode("connect"); };
  const openConfigure = (it: Integration) => { setActive(it); setMode("configure"); };

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
                  const activeChips = isConnected ? activeChipsFor(it) : [];
                  return (
                    <Card
                      key={it.id}
                      className="group relative overflow-hidden hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex flex-col"
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

                      <CardContent className="pt-0 flex flex-col gap-3 mt-auto">
                        {/* Actions */}
                        {isConnected ? (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              className="flex-1"
                              onClick={() => openConfigure(it)}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                              Configurar automação
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDisconnect(it.id, it.name)}
                            >
                              Desconectar
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" className="w-full" onClick={() => openConnect(it)}>
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

      {/* Dialog */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="sm:max-w-lg">
          {active && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div className={`h-10 w-10 rounded-xl ${active.bg} flex items-center justify-center`}>
                    <active.icon className={`h-5 w-5 ${active.accent}`} />
                  </div>
                  <div>
                    <DialogTitle>
                      {mode === "configure" ? `Configurar ${active.name}` : active.name}
                    </DialogTitle>
                    <DialogDescription className="text-xs">{active.category}</DialogDescription>
                  </div>
                </div>
                <DialogDescription className="pt-2">
                  {mode === "configure"
                    ? "Ative ou desative o que esta integração faz dentro do CRM."
                    : active.description}
                </DialogDescription>
              </DialogHeader>

              {mode === "configure" ? (
                <div className="space-y-2 py-1 max-h-[55vh] overflow-y-auto pr-1">
                  {active.automations.map((a) => {
                    const state = getAutoState(active);
                    const enabled = !!state[a.id];
                    return (
                      <div
                        key={a.id}
                        className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3 hover:border-border transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{a.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(v) => toggleAutomation(active.id, a.id, v)}
                        />
                      </div>
                    );
                  })}
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
                {mode === "configure" ? (
                  <Button onClick={() => { toast({ title: "Configuração salva", description: `Automações de ${active.name} atualizadas.` }); setActive(null); }}>
                    Salvar configurações
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => setActive(null)}>Cancelar</Button>
                    <Button onClick={handleConnect} disabled={submitting}>
                      {submitting ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" />Conectando...</>
                      ) : (
                        <><ExternalLink className="h-3.5 w-3.5" />Conectar agora</>
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
