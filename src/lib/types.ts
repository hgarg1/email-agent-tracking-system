export type TenantId = string;

export type MailboxId = "board" | "general" | "lsi" | "cytos";

export type AgentRole = "agent" | "admin";
export type AgentAvailability = "available" | "away" | "offline";

export type Priority = "low" | "normal" | "high" | "urgent";

export type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  messageId: string;
  storedUrl?: string;
  storedAt?: string;
};

export type Message = {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: string;
  snippet: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: Attachment[];
};

export type InternalNote = {
  id: string;
  authorId: string;
  body: string;
  date: string;
};

export type Thread = {
  id: string;
  tenantId: TenantId;
  mailbox: MailboxId;
  subject: string;
  snippet: string;
  updatedAt: string;
  participants: string[];
  messages: Message[];
  status: "open" | "pending" | "closed";
  assignedTo?: string;
  priority: Priority;
  tags: string[];
  internalNotes: InternalNote[];
};

export type InboxSummary = {
  id: string;
  tenantId: TenantId;
  mailbox: MailboxId;
  subject: string;
  snippet: string;
  updatedAt: string;
  participants: string[];
  status: Thread["status"];
  assignedTo?: string;
  priority: Priority;
  tags: string[];
};

export type Agent = {
  id: string;
  tenantId: TenantId;
  name: string;
  email: string;
  role: AgentRole;
  mailboxAccess: MailboxId[];
  active: boolean;
  password: string;
  availability: AgentAvailability;
  mfaEnabled: boolean;
  mfaSecret?: string;
};

export type Session = {
  token: string;
  agentId: string;
  tenantId: TenantId;
  createdAt: string;
};

export type Template = {
  id: string;
  tenantId: TenantId;
  mailbox: MailboxId | "all";
  name: string;
  subject: string;
  body: string;
  signature: string;
  blocks?: EmailBlock[];
  isBuilder?: boolean;
};

export type AuditEvent = {
  id: string;
  tenantId: TenantId;
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  timestamp: string;
  metadata?: Record<string, string>;
};

export type Tenant = {
  id: TenantId;
  name: string;
  primaryMailbox: MailboxId;
};

export type TenantSettings = {
  tenantId: TenantId;
  aiTriageEnabled: boolean;
  aiDraftEnabled: boolean;
  aiReviewEnabled: boolean;
  retentionDays: number;
};

export type TriageCategory = "billing" | "bug" | "account" | "feature" | "legal" | "partnership" | "other";

export type RoutingRule = {
  tenantId: TenantId;
  category: TriageCategory;
  queue: string;
};

export type QueueBucket = {
  tenantId: TenantId;
  name: string;
  slaHours: number;
  fallback: boolean;
  keywords: string[];
  notifyEmails: string[];
  slackWebhook?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  maxOpenPerAgent?: number;
  allowedAvailability: Array<"available" | "away" | "offline">;
};

export type BlockStyle = {
  textColor?: string;
  backgroundColor?: string;
  textAlign?: "left" | "center" | "right";
  fontSize?: number;
  padding?: number;
  borderRadius?: number;
  borderColor?: string;
};

export type ButtonStyle = {
  variant?: "primary" | "outline" | "ghost";
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  borderRadius?: number;
  padding?: string;
};

export type EmailBlock =
  | { type: "header"; title: string; subtitle?: string; style?: BlockStyle }
  | { type: "paragraph"; text: string; style?: BlockStyle }
  | { type: "button"; label: string; url: string; style?: BlockStyle; buttonStyle?: ButtonStyle }
  | { type: "divider"; style?: BlockStyle }
  | { type: "spacer"; size: "sm" | "md" | "lg"; style?: BlockStyle }
  | { type: "footer"; text: string; style?: BlockStyle }
  | { type: "image"; src: string; alt?: string; width?: number; href?: string; style?: BlockStyle }
  | { type: "columns"; leftTitle?: string; leftText: string; rightTitle?: string; rightText: string; style?: BlockStyle; stackOnMobile?: boolean }
  | { type: "hero"; title: string; subtitle?: string; body: string; imageUrl: string; imageAlt?: string; imagePosition?: "left" | "right"; imageWidth?: number; style?: BlockStyle; stackOnMobile?: boolean }
  | { type: "logoGrid"; logos: string[]; columns?: number; maxLogoWidth?: number; style?: BlockStyle }
  | { type: "testimonial"; quote: string; author: string; role?: string; company?: string; avatarUrl?: string; style?: BlockStyle }
  | { type: "kpis"; items: Array<{ label: string; value: string }>; columns?: number; style?: BlockStyle }
  | { type: "pricing"; plans: Array<{ name: string; price: string; description?: string; ctaLabel?: string; ctaUrl?: string }>; highlightIndex?: number; columns?: number; style?: BlockStyle }
  | { type: "timeline"; steps: Array<{ title: string; detail?: string }>; accentColor?: string; style?: BlockStyle }
  | { type: "faq"; items: Array<{ question: string; answer: string }>; compact?: boolean; style?: BlockStyle }
  | { type: "labeledDivider"; label: string; lineColor?: string; style?: BlockStyle }
  | { type: "signature"; signoff: string; name: string; title?: string; email?: string; phone?: string; avatarUrl?: string; style?: BlockStyle }
  | { type: "legal"; text: string; fontSize?: number; style?: BlockStyle };

export type TenantTheme = {
  tenantId: TenantId;
  brandName: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
};

export type Job = {
  id: string;
  tenantId: TenantId;
  type: "sync" | "ai_retry";
  payload: Record<string, string>;
  status: "queued" | "running" | "failed" | "completed";
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type PasswordReset = {
  token: string;
  agentId: string;
  expiresAt: string;
  usedAt?: string;
};

export type AiUsage = {
  id: string;
  tenantId: TenantId;
  action: "triage" | "draft" | "review";
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  createdAt: string;
};
