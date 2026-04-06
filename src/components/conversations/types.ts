export type AttendingStatus = "nova" | "em_atendimento" | "aguardando" | "finalizado" | "pausado";

export interface Conversation {
  id: string;
  name: string;
  phone: string;
  avatar_url?: string;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageStatus?: "sent" | "delivered" | "read";
  lastMessageDirection?: "sent" | "received";
  unreadCount: number;
  status: "online" | "offline" | "typing";
  attendingStatus: AttendingStatus;
  tags: string[];
  category?: "vendas" | "financeiro" | "suporte";
  email?: string;
  notes?: string;
  deviceName?: string;
  assignedTo?: string;
  assignedName?: string;
  statusChangedAt?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  type: "sent" | "received";
  timestamp: string;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "document" | "video" | "sticker" | "contact" | "location";
  fileName?: string;
  audioDuration?: number;
  isAiResponse?: boolean;
  whatsappMessageId?: string;
  quotedMessageId?: string;
  quotedContent?: string;
}

// Mock data for initial UI
export const mockConversations: Conversation[] = [
  {
    id: "1",
    name: "João Silva",
    phone: "+55 11 99999-1234",
    lastMessage: "Olá, gostaria de saber mais sobre o plano Pro",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    unreadCount: 3,
    status: "online",
    attendingStatus: "em_atendimento",
    tags: ["Novo Lead", "interessado"],
    category: "vendas",
    email: "joao@email.com",
    deviceName: "Chip 01",
  },
  {
    id: "2",
    name: "Maria Oliveira",
    phone: "+55 21 98888-5678",
    lastMessage: "Obrigada pelo atendimento!",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    unreadCount: 0,
    status: "offline",
    attendingStatus: "finalizado",
    tags: ["cliente"],
    category: "financeiro",
    email: "maria@email.com",
    deviceName: "Chip 02",
  },
  {
    id: "3",
    name: "Carlos Santos",
    phone: "+55 31 97777-9012",
    lastMessage: "Quando vocês vão liberar a nova funcionalidade?",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    unreadCount: 1,
    status: "typing",
    attendingStatus: "em_atendimento",
    tags: ["suporte"],
    category: "suporte",
    deviceName: "Chip 01",
  },
  {
    id: "4",
    name: "Ana Costa",
    phone: "+55 41 96666-3456",
    lastMessage: "Vou verificar e te retorno",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    unreadCount: 0,
    status: "offline",
    attendingStatus: "aguardando",
    tags: ["prospect"],
    category: "vendas",
    deviceName: "Chip 03",
  },
  {
    id: "5",
    name: "Pedro Mendes",
    phone: "+55 51 95555-7890",
    lastMessage: "Preciso de ajuda com a configuração",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    unreadCount: 2,
    status: "offline",
    attendingStatus: "nova",
    tags: ["suporte", "urgente"],
    category: "suporte",
    email: "pedro@empresa.com",
    deviceName: "Chip 01",
  },
  {
    id: "6",
    name: "Fernanda Lima",
    phone: "+55 61 94444-2345",
    lastMessage: "Perfeito, vamos fechar então!",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    unreadCount: 0,
    status: "offline",
    attendingStatus: "pausado",
    tags: ["cliente", "vip"],
    category: "vendas",
    deviceName: "Chip 02",
  },
];

export const mockMessages: Record<string, Message[]> = {
  "1": [
    { id: "m1", conversationId: "1", content: "Boa tarde! Vi o anúncio de vocês no Instagram.", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
    { id: "m2", conversationId: "1", content: "Boa tarde, João! Que bom que nos encontrou 😊 Como posso ajudar?", type: "sent", timestamp: new Date(Date.now() - 1000 * 60 * 28).toISOString(), status: "read", isAiResponse: true },
    { id: "m3", conversationId: "1", content: "Gostaria de saber mais sobre o plano Pro, qual o valor?", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString() },
    { id: "m4", conversationId: "1", content: "O plano Pro custa R$ 197/mês e inclui até 10 instâncias, aquecimento ilimitado e suporte prioritário.", type: "sent", timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString(), status: "read", isAiResponse: true },
    { id: "m5", conversationId: "1", content: "", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(), mediaType: "audio", audioDuration: 12 },
    { id: "m6", conversationId: "1", content: "Vocês têm teste grátis?", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
    { id: "m7", conversationId: "1", content: "", type: "sent", timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(), status: "delivered", mediaType: "audio", audioDuration: 8 },
    { id: "m8", conversationId: "1", content: "Olá, gostaria de saber mais sobre o plano Pro", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString() },
  ],
  "2": [
    { id: "m9", conversationId: "2", content: "Oi, preciso de ajuda com minha conta", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
    { id: "m10", conversationId: "2", content: "Claro! O que está acontecendo?", type: "sent", timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(), status: "read" },
    { id: "m11", conversationId: "2", content: "Já resolvi, era só atualizar a página", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString() },
    { id: "m12", conversationId: "2", content: "Obrigada pelo atendimento!", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
  ],
  "3": [
    { id: "m13", conversationId: "3", content: "Quando vocês vão liberar a nova funcionalidade?", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
  ],
  "5": [
    { id: "m14", conversationId: "5", content: "Oi, preciso de ajuda com a configuração do proxy", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
    { id: "m15", conversationId: "5", content: "", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4.5).toISOString(), mediaType: "audio", audioDuration: 23 },
    { id: "m16", conversationId: "5", content: "Preciso de ajuda com a configuração", type: "received", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString() },
  ],
};
