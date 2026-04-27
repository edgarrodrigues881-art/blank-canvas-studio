export type FlowButtonType = "reply" | "url" | "phone";

export interface FlowButton {
  id: string;
  label: string;
  type: FlowButtonType;
  targetNodeId: string;
  url?: string;
  phone?: string;
}

export interface FlowCondition {
  id: string;
  label: string;
  variable: string;
  operator: "equals" | "contains" | "starts_with" | "ends_with" | "not_equals" | "exists";
  value: string;
}

export type MessageMediaType = "none" | "image" | "audio" | "file" | "dynamic_url";

export type FlowActionType =
  | "add_tag"
  | "remove_tag"
  | "set_pipeline_stage"
  | "assign_attendant"
  | "release_attendant";

export interface FlowAction {
  id: string;
  type: FlowActionType;
  /** Tag name (add_tag/remove_tag) */
  tag?: string;
  /** Pipeline stage label (set_pipeline_stage) */
  stage?: string;
  /** Attendant user_id (assign_attendant) */
  attendantId?: string;
  attendantName?: string;
}

export interface RandomBranch {
  id: string;
  label: string;
  /** Weight 1-100; normalized at runtime */
  weight: number;
}

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  // Start node
  trigger?:
    | "any_message"
    | "keyword"
    | "new_contact"
    | "start_chat"
    | "template"
    | "lead_created"
    | "lead_stage_changed"
    | "tag_added"
    | "tag_removed";
  keyword?: string;
  /** For lead_stage_changed */
  triggerStage?: string;
  /** For tag_added/tag_removed */
  triggerTag?: string;
  // Message node
  text?: string;
  imageUrl?: string;
  imageCaption?: string;
  delay?: number;
  buttons?: FlowButton[];
  /** Media type for the message body */
  mediaType?: MessageMediaType;
  /** URL of static audio (mediaType=audio) */
  audioUrl?: string;
  /** URL of static file (mediaType=file) */
  fileUrl?: string;
  fileName?: string;
  /** Dynamic URL template that resolves at send time (e.g. https://api.x/voucher/{telefone}.pdf) */
  dynamicMediaUrl?: string;
  dynamicMediaKind?: "image" | "audio" | "file" | "video";
  // Model integration
  templateId?: string;
  templateName?: string;
  // Delay node
  delaySeconds?: number;
  // End node
  action?: "end_flow" | "wait_response" | "transfer_human";
  // Condition node
  conditions?: FlowCondition[];
  // AI node
  aiPrompt?: string;
  aiModel?: string;
  // Action node
  actions?: FlowAction[];
  // Wait response node
  waitTimeoutSeconds?: number;
  /** Save the user's reply into this variable name */
  saveReplyAs?: string;
  // Random node
  randomBranches?: RandomBranch[];
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

let _condIdCounter = Date.now() + 2000;
export function nextCondId(): string {
  return `cond-${++_condIdCounter}`;
}

let _actionIdCounter = Date.now() + 3000;
export function nextActionId(): string {
  return `act-${++_actionIdCounter}`;
}

let _branchIdCounter = Date.now() + 4000;
export function nextBranchId(): string {
  return `brn-${++_branchIdCounter}`;
}
