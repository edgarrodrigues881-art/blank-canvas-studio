export interface TutorialItem {
  id: string;
  title: string;
  description: string;
  videoUrl: string | null;
  /** Routes where the "Ver como usar" button should map to this tutorial */
  routes?: string[];
}

export const TUTORIALS: TutorialItem[] = [
  { id: "connect", title: "Conectar instância", description: "Conecte um WhatsApp via QR Code ou código de pareamento.", videoUrl: null, routes: ["/dashboard/warmup-v2", "/dashboard/devices"] },
  { id: "send-message", title: "Enviar mensagem", description: "Envie uma mensagem manual a partir do CRM.", videoUrl: null, routes: ["/dashboard/conversations"] },
  { id: "campaign", title: "Criar campanha", description: "Importe contatos e dispare sua primeira campanha.", videoUrl: null, routes: ["/dashboard/campaigns", "/dashboard/campaign-list"] },
  { id: "group-dispatch", title: "Disparo em grupo", description: "Envie mensagens e carrosséis para grupos.", videoUrl: null, routes: ["/dashboard/group-carousel-dispatch"] },
  { id: "templates", title: "Templates de mensagem", description: "Crie templates reutilizáveis com variáveis.", videoUrl: null, routes: ["/dashboard/templates"] },
  { id: "warmup", title: "Aquecimento de chips", description: "Configure o ciclo de aquecimento das instâncias.", videoUrl: null, routes: ["/dashboard/warmup-v2"] },
  { id: "chip-conversation", title: "Conversa entre chips", description: "Mantenha chips ativos com conversas automáticas.", videoUrl: null, routes: ["/dashboard/chip-conversation"] },
  { id: "autoreply", title: "Resposta automática", description: "Crie fluxos de auto-reply com IA.", videoUrl: null, routes: ["/dashboard/autoreply"] },
  { id: "welcome", title: "Mensagem de boas-vindas", description: "Receba novos contatos automaticamente.", videoUrl: null, routes: ["/dashboard/welcome-automation"] },
  { id: "prospecting", title: "Prospecção", description: "Encontre leads de comércios pelo mapa.", videoUrl: null, routes: ["/dashboard/prospeccao"] },
  { id: "verifier", title: "Verificador de WhatsApp", description: "Valide números em massa.", videoUrl: null, routes: ["/dashboard/whatsapp-verifier"] },
];

export const getTutorialForRoute = (path: string): TutorialItem | undefined =>
  TUTORIALS.find((t) => t.routes?.some((r) => path.startsWith(r)));
