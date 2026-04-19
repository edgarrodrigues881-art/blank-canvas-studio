export type TutorialCategory = "Conexões" | "Campanhas" | "Aquecimento" | "Ferramentas";

export interface TutorialItem {
  id: string;
  title: string;
  subtitle: string;
  category: TutorialCategory;
  videoUrl: string | null;
  /** Routes where the "Ver como usar" button should map to this tutorial */
  routes?: string[];
}

export const TUTORIALS: TutorialItem[] = [
  { id: "connect", title: "Conectar instância", subtitle: "Conecte um WhatsApp em segundos.", category: "Conexões", videoUrl: null, routes: ["/dashboard/warmup-v2", "/dashboard/devices"] },
  { id: "send-message", title: "Enviar mensagem", subtitle: "Envie mensagens manuais pelo CRM.", category: "Conexões", videoUrl: null, routes: ["/dashboard/conversations"] },
  { id: "campaign", title: "Criar campanha", subtitle: "Importe contatos e dispare em massa.", category: "Campanhas", videoUrl: null, routes: ["/dashboard/campaigns", "/dashboard/campaign-list"] },
  { id: "group-dispatch", title: "Disparo em grupo", subtitle: "Mensagens e carrosséis para grupos.", category: "Campanhas", videoUrl: null, routes: ["/dashboard/group-carousel-dispatch"] },
  { id: "templates", title: "Templates", subtitle: "Modelos reutilizáveis com variáveis.", category: "Campanhas", videoUrl: null, routes: ["/dashboard/templates"] },
  { id: "warmup", title: "Aquecimento de chips", subtitle: "Configure o ciclo de aquecimento.", category: "Aquecimento", videoUrl: null, routes: ["/dashboard/warmup-v2"] },
  { id: "chip-conversation", title: "Conversa entre chips", subtitle: "Mantenha chips ativos automaticamente.", category: "Aquecimento", videoUrl: null, routes: ["/dashboard/chip-conversation"] },
  { id: "autoreply", title: "Resposta automática", subtitle: "Fluxos de auto-reply com IA.", category: "Ferramentas", videoUrl: null, routes: ["/dashboard/autoreply"] },
  { id: "welcome", title: "Boas-vindas automáticas", subtitle: "Receba novos contatos sem esforço.", category: "Ferramentas", videoUrl: null, routes: ["/dashboard/welcome-automation"] },
  { id: "prospecting", title: "Prospecção", subtitle: "Encontre leads pelo mapa.", category: "Ferramentas", videoUrl: null, routes: ["/dashboard/prospeccao"] },
  { id: "verifier", title: "Verificador de WhatsApp", subtitle: "Valide números em massa.", category: "Ferramentas", videoUrl: null, routes: ["/dashboard/whatsapp-verifier"] },
];

export const CATEGORY_ORDER: TutorialCategory[] = ["Conexões", "Campanhas", "Aquecimento", "Ferramentas"];

export const getTutorialForRoute = (path: string): TutorialItem | undefined =>
  TUTORIALS.find((t) => t.routes?.some((r) => path.startsWith(r)));
