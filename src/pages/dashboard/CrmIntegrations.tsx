import { useState } from "react";
import {
  CheckCircle2,
  Plug,
  ExternalLink,
  Settings2,
  Loader2,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Trash2,
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
import { useIntegrationSettings } from "@/hooks/useIntegrationSettings";
import { cn } from "@/lib/utils";

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
  configFields?: {
    key: string;
    label: string;
    placeholder?: string;
    type?: string;
  }[];
};

const INTEGRATIONS: Integration[] = [
  {
    id: "google_drive",
    name: "Google Drive",
    description: "Use o Google Drive como base de conhecimento para sua IA e armazene mídias automaticamente.",
    logo: "/google-drive.png",
    accent: "from-blue-500 to-blue-600",
    bg: "bg-blue-500/5",
    configFields: [
      { key: "token", label: "Token de Acesso Google", placeholder: "Cole seu token aqui", type: "password" },
      { key: "drive_folder_id", label: "ID da Pasta (opcional)", placeholder: "ID da pasta no Drive" },
    ],
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
    accent: "from-emerald-500 to-emerald-600",
    bg: "bg-emerald-500/5",
    configFields: [
      { key: "token", label: "Token de Acesso Google", placeholder: "Cole seu token aqui", type: "password" },
      { key: "sheet_id", label: "ID da Planilha", placeholder: "ID da sua planilha" },
      { key: "sheet_range", label: "Intervalo (opcional)", placeholder: "Ex: Sheet1!A1:Z" },
    ],
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
    accent: "from-slate-700 to-slate-800",
    bg: "bg-slate-500/5",
    configFields: [
      { key: "token", label: "Token de Acesso Notion", placeholder: "Cole seu token aqui", type: "password" },
      { key: "notion_database_id", label: "ID do Banco de Dados", placeholder: "ID do seu banco de dados" },
    ],
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

export default function CrmIntegrations() {
  const { integrations, loading, saving, saveIntegration, disconnectIntegration, isConnected, isAutomationEnabled, toggleAutomation } = useIntegrationSettings();
  const [active, setActive] = useState<Integration | null>(null);
  const [mode, setMode] = useState<"connect" | "configure">("connect");
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const handleConnect = async () => {
    if (!active) return;
    setSubmitting(true);

    try {
      await saveIntegration(active.id, {
        is_connected: true,
        token: formData.token,
        sheet_id: formData.sheet_id,
        sheet_range: formData.sheet_range,
        notion_database_id: formData.notion_database_id,
        drive_folder_id: formData.drive_folder_id,
      });

      setMode("configure");
      setFormData({});
      toast({
        title: "Conectado com sucesso!",
        description: `${active.name} agora está integrado ao seu CRM.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao conectar",
        description: "Verifique seus dados e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!active) return;
    setSubmitting(true);

    try {
      await disconnectIntegration(active.id);
      setActive(null);
      toast({
        title: "Desconectado",
        description: `${active.name} foi desconectado.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao desconectar",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8 space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Integrações
        </h1>
        <p className="text-muted-foreground text-lg">
          Conecte suas ferramentas favoritas para automatizar seu fluxo de trabalho. Cada integração é individual e segura.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 auto-rows-max">
        {INTEGRATIONS.map((it) => {
          const config = integrations[it.id];
          const connected = config?.is_connected || false;

          return (
            <Card
              key={it.id}
              className={cn(
                "group relative overflow-hidden border-2 transition-all duration-300 hover:shadow-2xl cursor-pointer",
                connected
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-border/50 hover:border-primary/30 bg-card"
              )}
              onClick={() => {
                setActive(it);
                setMode(connected ? "configure" : "connect");
                setFormData({
                  token: config?.token ?? "",
                  sheet_id: config?.sheet_id ?? "",
                  sheet_range: config?.sheet_range ?? "",
                  notion_database_id: config?.notion_database_id ?? "",
                  drive_folder_id: config?.drive_folder_id ?? "",
                });
              }}
            >
              <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500", it.bg)} />

              <CardHeader className="relative space-y-4 pb-4">
                <div className="flex justify-between items-start">
                  <div className={cn(
                    "h-16 w-16 rounded-2xl bg-white p-3 shadow-lg border-2 group-hover:scale-110 transition-transform duration-300",
                    connected ? "border-emerald-500/30" : "border-border/50"
                  )}>
                    <img src={it.logo} alt={it.name} className="h-full w-full object-contain" />
                  </div>
                  <Badge
                    className={cn(
                      "font-semibold text-xs px-3 py-1",
                      connected
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-0"
                        : "bg-muted text-muted-foreground border border-border/50"
                    )}
                  >
                    {connected ? "✓ Conectado" : "Disponível"}
                  </Badge>
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    {it.name}
                  </CardTitle>
                  <CardDescription className="mt-2 leading-relaxed min-h-[60px]">
                    {it.description}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="relative pt-0 space-y-4">
                <div className="space-y-2">
                  {it.automations.slice(0, 2).map((auto) => (
                    <div key={auto.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      {auto.title}
                    </div>
                  ))}
                </div>

                <Button
                  className={cn(
                    "w-full font-semibold transition-all duration-300 group/btn",
                    connected
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20"
                      : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/20"
                  )}
                >
                  {connected ? "Gerenciar" : "Conectar"}
                  <ChevronRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="sm:max-w-[600px] border-2 border-border/50 shadow-2xl">
          {active && (
            <>
              <DialogHeader className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-white p-3 shadow-md border-2 border-border/50">
                    <img src={active.logo} alt={active.name} className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-bold">
                      {mode === "configure" ? `Configurar ${active.name}` : `Conectar ao ${active.name}`}
                    </DialogTitle>
                    <DialogDescription>
                      {mode === "configure"
                        ? "Gerencie as automações e configurações desta integração."
                        : "Forneça suas credenciais para conectar com segurança."}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="py-6 space-y-6">
                {mode === "configure" ? (
                  <>
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-foreground">Automações Ativas</div>
                      {active.automations.map((a) => {
                        const enabled = isAutomationEnabled(active.id, a.id);
                        return (
                          <div
                            key={a.id}
                            className="flex items-start justify-between gap-4 rounded-xl border border-border/40 bg-muted/20 p-4 hover:bg-muted/30 transition-colors"
                          >
                            <div className="space-y-1 flex-1">
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

                    <div className="border-t pt-4 space-y-3">
                      <div className="text-sm font-semibold text-foreground">Informações da Conexão</div>
                      {integrations[active.id]?.token && (
                        <div className="rounded-lg bg-muted/40 p-3 flex items-center justify-between">
                          <div className="text-xs text-muted-foreground">Token salvo com segurança</div>
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                            ✓ Ativo
                          </Badge>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    {active.configFields?.map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label className="text-sm font-semibold">{field.label}</Label>
                        <div className="relative">
                          <Input
                            type={showPasswords[field.key] ? "text" : field.type || "text"}
                            placeholder={field.placeholder}
                            value={formData[field.key] || ""}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            className="pr-10 border-2 border-border/50 focus:border-primary/50"
                          />
                          {field.type === "password" && (
                            <button
                              type="button"
                              onClick={() =>
                                setShowPasswords((prev) => ({
                                  ...prev,
                                  [field.key]: !prev[field.key],
                                }))
                              }
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showPasswords[field.key] ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                      <p className="font-semibold text-foreground mb-2">🔒 Segurança</p>
                      <p>Seus tokens são criptografados e armazenados com segurança. Nunca compartilhamos seus dados.</p>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                {mode === "configure" ? (
                  <>
                    <Button
                      variant="destructive"
                      onClick={handleDisconnect}
                      disabled={submitting}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Desconectar
                    </Button>
                    <Button
                      onClick={() => setActive(null)}
                      variant="outline"
                    >
                      Fechar
                    </Button>
                  </>
                ) : (
                  <div className="flex w-full gap-3">
                    <Button variant="ghost" className="flex-1" onClick={() => setActive(null)}>
                      Cancelar
                    </Button>
                    <Button
                      className="flex-[2] bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold"
                      onClick={handleConnect}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Conectando...</>
                      ) : (
                        <><CheckCircle2 className="mr-2 h-4 w-4" /> Conectar Agora</>
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
