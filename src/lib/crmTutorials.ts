export type CrmTutorialCategory = "Operação" | "Automação" | "Aquisição";

export interface CrmTutorialItem {
  id: string;
  title: string;
  subtitle: string;
  category: CrmTutorialCategory;
  videoUrl: string | null;
  routes?: string[];
  /** Quick intro video shown at top */
  intro?: boolean;
}

export const CRM_TUTORIALS: CrmTutorialItem[] = [
  // Intro
  { id: "crm-intro", title: "Comece pelo básico do CRM", subtitle: "Tour rápido em 2 minutos.", category: "Operação", videoUrl: null, intro: true },

  // Operação
  { id: "crm-dashboard", title: "Dashboard do CRM", subtitle: "Acompanhe métricas e desempenho.", category: "Operação", videoUrl: null, routes: ["/dashboard/crm"] },
  { id: "crm-conversations", title: "Conversas", subtitle: "Atenda clientes em um só lugar.", category: "Operação", videoUrl: null, routes: ["/dashboard/conversations"] },
  { id: "crm-leads", title: "Leads", subtitle: "Qualifique contatos com agilidade.", category: "Operação", videoUrl: null, routes: ["/dashboard/leads"] },
  { id: "crm-pipeline", title: "Pipeline", subtitle: "Mova leads pelo funil de vendas.", category: "Operação", videoUrl: null, routes: ["/dashboard/pipeline"] },
  { id: "crm-schedules", title: "Disparos agendados", subtitle: "Programe envios futuros.", category: "Operação", videoUrl: null, routes: ["/dashboard/crm-agendamentos"] },

  // Automação
  { id: "crm-assistant", title: "Assistente de IA", subtitle: "Configure respostas inteligentes.", category: "Automação", videoUrl: null, routes: ["/dashboard/ai-settings"] },
  { id: "crm-reports", title: "Relatórios", subtitle: "Analise resultados em tempo real.", category: "Automação", videoUrl: null, routes: ["/dashboard/crm-reports"] },

  // Aquisição
  { id: "crm-prospecting", title: "Prospecção", subtitle: "Encontre leads pelo mapa.", category: "Aquisição", videoUrl: null, routes: ["/dashboard/prospeccao"] },
  { id: "crm-dispatches", title: "Disparos", subtitle: "Mensagens em massa para o CRM.", category: "Aquisição", videoUrl: null, routes: ["/dashboard/crm-dispatches"] },
  { id: "crm-campaigns", title: "Campanhas", subtitle: "Crie campanhas direcionadas.", category: "Aquisição", videoUrl: null, routes: ["/dashboard/crm-campaign-list"] },
  { id: "crm-models", title: "Modelos", subtitle: "Templates reutilizáveis de mensagem.", category: "Aquisição", videoUrl: null, routes: ["/dashboard/crm-templates"] },
];

export const CRM_CATEGORY_ORDER: CrmTutorialCategory[] = ["Operação", "Automação", "Aquisição"];

export const getCrmTutorialForRoute = (path: string): CrmTutorialItem | undefined =>
  CRM_TUTORIALS.find((t) => !t.intro && t.routes?.some((r) => path.startsWith(r)));
