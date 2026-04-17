import type { RealConversation, RealMessage } from "./useConversations";

/** Raw row payload from a conversation realtime event. */
export type ConversationRow = Partial<RealConversation> & {
  id: string;
  user_id?: string;
  status?: string;
  phone?: string | null;
  remote_jid?: string | null;
  unread_count?: number;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_direction?: string | null;
  last_message_status?: string | null;
};

/** Pending UPDATE buffer used by the debounce coalescer. */
export type PendingConversationUpdates = Map<string, ConversationRow>;

/** Shared params used by the realtime sub-hooks. */
export interface ConversationListRealtimeParams {
  user: { id: string } | null;
  selectedConvIdRef: React.MutableRefObject<string | null>;
  realtimeConnectedRef: React.MutableRefObject<boolean>;
  setConversations: React.Dispatch<React.SetStateAction<RealConversation[]>>;
  setArchivedConversations: React.Dispatch<React.SetStateAction<RealConversation[]>>;
  upsertConversationInState: (items: RealConversation[], row: ConversationRow) => RealConversation[];
  sortConversations: (items: RealConversation[]) => RealConversation[];
  getConversationContactKey: (conv: { phone?: string | null; remote_jid?: string | null }) => string;
  isOwnDevice: (phone: string | null | undefined) => boolean;
  notifyTabs: (event: TabSyncEvent) => void;
}

export interface MessagesRealtimeParams {
  user: { id: string } | null;
  conversationsRef: React.MutableRefObject<RealConversation[]>;
  selectedConvIdRef: React.MutableRefObject<string | null>;
  setConversations: React.Dispatch<React.SetStateAction<RealConversation[]>>;
  setMessages: React.Dispatch<React.SetStateAction<RealMessage[]>>;
  upsertConversationInState: (items: RealConversation[], row: ConversationRow) => RealConversation[];
  sortConversations: (items: RealConversation[]) => RealConversation[];
  getConversationIdsForSameContact: (convId: string) => string[];
  markConversationGroupAsRead: (convId: string) => Promise<void>;
  updateStatus: (convId: string, newStatus: string) => Promise<void>;
  notifyTabs: (event: TabSyncEvent) => void;
}

/** Cross-tab sync events broadcast over BroadcastChannel("conv-sync"). */
export type TabSyncEvent =
  | { type: "conv-updated"; convId: string; userId: string; ts: number }
  | { type: "msg-inserted"; convId: string; userId: string; ts: number }
  | { type: "conv-read"; convId: string; userId: string; ts: number };
