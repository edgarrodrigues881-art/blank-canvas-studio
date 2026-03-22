export interface FlowButton {
  id: string;
  label: string;
  targetNodeId: string;
}

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  // Start node
  trigger?: "any_message" | "keyword" | "new_contact" | "start_chat" | "template";
  keyword?: string;
  // Message node
  text?: string;
  imageUrl?: string;
  imageCaption?: string;
  delay?: number;
  buttons?: FlowButton[];
  // Model integration
  templateId?: string;
  templateName?: string;
  // Delay node
  delaySeconds?: number;
  // End node
  action?: "end_flow" | "wait_response" | "transfer_human";
}

// Unique ID generator to avoid collisions across sessions
let _nodeIdCounter = Date.now();
export function nextNodeId(prefix: string): string {
  return `${prefix}-${++_nodeIdCounter}`;
}

let _btnIdCounter = Date.now() + 1000;
export function nextBtnId(): string {
  return `btn-${++_btnIdCounter}`;
}
