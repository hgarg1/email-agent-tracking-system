import { getDb, mapAgent, mapAudit, mapQueueBucket, mapSession, mapTemplate, mapThread } from "./db";
import type { Agent, AiUsage, AuditEvent, InboxSummary, Job, MailboxId, PasswordReset, QueueBucket, RoutingRule, Session, Template, Tenant, TenantId, TenantSettings, TenantTheme, Thread, TriageCategory } from "./types";

export function readThreads(tenantId: TenantId): Thread[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM threads WHERE tenant_id = ? ORDER BY updated_at DESC")
    .all(tenantId);
  return rows.map(mapThread);
}

export function listSummaries(tenantId: TenantId): InboxSummary[] {
  return readThreads(tenantId)
    .map((thread) => ({
      id: thread.id,
      tenantId: thread.tenantId,
      mailbox: thread.mailbox,
      subject: thread.subject,
      snippet: thread.snippet,
      updatedAt: thread.updatedAt,
      participants: thread.participants,
      status: thread.status,
      assignedTo: thread.assignedTo,
      priority: thread.priority,
      tags: thread.tags
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getThread(tenantId: TenantId, threadId: string): Thread | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM threads WHERE tenant_id = ? AND id = ?")
    .get(tenantId, threadId);
  return row ? mapThread(row) : undefined;
}

export function upsertThread(thread: Thread) {
  const db = getDb();
  db.prepare(
    `INSERT INTO threads (id, tenant_id, mailbox, subject, snippet, updated_at, participants, status, assigned_to, priority, tags, notes, messages)
     VALUES (@id, @tenantId, @mailbox, @subject, @snippet, @updatedAt, @participants, @status, @assignedTo, @priority, @tags, @notes, @messages)
     ON CONFLICT(id) DO UPDATE SET
       tenant_id = excluded.tenant_id,
       mailbox = excluded.mailbox,
       subject = excluded.subject,
       snippet = excluded.snippet,
       updated_at = excluded.updated_at,
       participants = excluded.participants,
       status = excluded.status,
       assigned_to = excluded.assigned_to,
       priority = excluded.priority,
       tags = excluded.tags,
       notes = excluded.notes,
       messages = excluded.messages`
  ).run({
    id: thread.id,
    tenantId: thread.tenantId,
    mailbox: thread.mailbox,
    subject: thread.subject,
    snippet: thread.snippet,
    updatedAt: thread.updatedAt,
    participants: JSON.stringify(thread.participants),
    status: thread.status,
    assignedTo: thread.assignedTo ?? null,
    priority: thread.priority,
    tags: JSON.stringify(thread.tags),
    notes: JSON.stringify(thread.internalNotes),
    messages: JSON.stringify(thread.messages)
  });
}

export function readAgents(tenantId?: TenantId): Agent[] {
  const db = getDb();
  const rows = tenantId
    ? db.prepare("SELECT * FROM agents WHERE tenant_id = ?").all(tenantId)
    : db.prepare("SELECT * FROM agents").all();
  return rows.map(mapAgent);
}

export function getTenant(tenantId: TenantId): Tenant | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId);
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    primaryMailbox: row.primary_mailbox
  } as Tenant;
}

export function listTenants(): Tenant[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM tenants ORDER BY name ASC").all();
  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    primaryMailbox: row.primary_mailbox
  })) as Tenant[];
}

export function updateTenant(tenant: Tenant) {
  const db = getDb();
  db.prepare("UPDATE tenants SET name = ?, primary_mailbox = ? WHERE id = ?").run(
    tenant.name,
    tenant.primaryMailbox,
    tenant.id
  );
}

export function createTenant(tenant: Tenant, theme?: TenantTheme) {
  const db = getDb();
  const themeOverrides: Record<string, TenantTheme> = {
    lsi: {
      tenantId: "lsi",
      brandName: "Living Systems Intelligence",
      logoUrl: undefined,
      primaryColor: "#d6a64b",
      accentColor: "#f2c566",
      backgroundColor: "#0b0c12",
      textColor: "#f8f4e6"
    },
    cytos: {
      tenantId: "cytos",
      brandName: "CytosAI",
      logoUrl: undefined,
      primaryColor: "#33e0d2",
      accentColor: "#6cf7a1",
      backgroundColor: "#05070f",
      textColor: "#e8fbff"
    }
  };
  db.prepare("INSERT INTO tenants (id, name, primary_mailbox) VALUES (?, ?, ?)").run(
    tenant.id,
    tenant.name,
    tenant.primaryMailbox
  );
  upsertTenantSettings({
    tenantId: tenant.id,
    aiTriageEnabled: false,
    aiDraftEnabled: false,
    aiReviewEnabled: false,
    retentionDays: 90
  });
  const overrideTheme = themeOverrides[tenant.id];
  upsertTenantTheme(
    theme ??
      overrideTheme ?? {
        tenantId: tenant.id,
        brandName: tenant.name,
        logoUrl: undefined,
        primaryColor: "#0ea5e9",
        accentColor: "#14b8a6",
        backgroundColor: "#ffffff",
        textColor: "#0f172a"
      }
  );
  const defaultQueues = [
    { category: "billing", queue: "Billing" },
    { category: "bug", queue: "Support" },
    { category: "account", queue: "Account" },
    { category: "feature", queue: "Product" },
    { category: "legal", queue: "Legal" },
    { category: "partnership", queue: "Partnerships" },
    { category: "other", queue: "General" }
  ];
  upsertRoutingRules(
    tenant.id,
    defaultQueues.map((rule) => ({
      tenantId: tenant.id,
      category: rule.category as TriageCategory,
      queue: rule.queue
    }))
  );
}

export function getAgent(agentId: string): Agent | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);
  return row ? mapAgent(row) : undefined;
}

export function upsertAgent(agent: Agent) {
  const db = getDb();
  db.prepare(
    `INSERT INTO agents (id, tenant_id, name, email, role, mailbox_access, active, password, availability, mfa_enabled, mfa_secret)
     VALUES (@id, @tenantId, @name, @email, @role, @mailboxAccess, @active, @password, @availability, @mfaEnabled, @mfaSecret)
     ON CONFLICT(id) DO UPDATE SET
       tenant_id = excluded.tenant_id,
       name = excluded.name,
       email = excluded.email,
       role = excluded.role,
       mailbox_access = excluded.mailbox_access,
       active = excluded.active,
       password = excluded.password,
       availability = excluded.availability,
       mfa_enabled = excluded.mfa_enabled,
       mfa_secret = excluded.mfa_secret`
  ).run({
    ...agent,
    mailboxAccess: JSON.stringify(agent.mailboxAccess),
    active: agent.active ? 1 : 0,
    availability: agent.availability ?? "available",
    mfaEnabled: agent.mfaEnabled ? 1 : 0,
    mfaSecret: agent.mfaSecret ?? null
  });
}

export function deleteAgent(agentId: string) {
  const db = getDb();
  db.prepare("DELETE FROM agents WHERE id = ?").run(agentId);
}

export function readTemplates(tenantId: TenantId): Template[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM templates WHERE tenant_id = ?").all(tenantId);
  return rows.map(mapTemplate);
}

export function readAllTemplates(): Template[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM templates").all();
  return rows.map(mapTemplate);
}

export function upsertTemplate(template: Template) {
  const db = getDb();
  db.prepare(
    `INSERT INTO templates (id, tenant_id, mailbox, name, subject, body, signature, blocks_json, is_builder)
     VALUES (@id, @tenantId, @mailbox, @name, @subject, @body, @signature, @blocksJson, @isBuilder)
     ON CONFLICT(id) DO UPDATE SET
       tenant_id = excluded.tenant_id,
       mailbox = excluded.mailbox,
       name = excluded.name,
       subject = excluded.subject,
       body = excluded.body,
       signature = excluded.signature,
       blocks_json = excluded.blocks_json,
       is_builder = excluded.is_builder`
  ).run({
    ...template,
    blocksJson: template.blocks ? JSON.stringify(template.blocks) : null,
    isBuilder: template.isBuilder ? 1 : 0
  });
}

export function deleteTemplate(templateId: string) {
  const db = getDb();
  db.prepare("DELETE FROM templates WHERE id = ?").run(templateId);
}

export function readSessions(): Session[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM sessions").all();
  return rows.map(mapSession);
}

export function addSession(session: Session) {
  const db = getDb();
  db.prepare(
    "INSERT INTO sessions (token, agent_id, tenant_id, created_at) VALUES (@token, @agentId, @tenantId, @createdAt)"
  ).run(session);
}

export function deleteSession(token: string) {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getSession(token: string): Session | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  return row ? mapSession(row) : undefined;
}

export function readAudit(tenantId: TenantId): AuditEvent[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM audit WHERE tenant_id = ? ORDER BY timestamp DESC").all(tenantId);
  return rows.map(mapAudit);
}

export function addAuditEvent(event: AuditEvent) {
  const db = getDb();
  db.prepare(
    "INSERT INTO audit (id, tenant_id, actor_id, action, target_type, target_id, timestamp, metadata) VALUES (@id, @tenantId, @actorId, @action, @targetType, @targetId, @timestamp, @metadata)"
  ).run({
    ...event,
    targetId: event.targetId ?? null,
    metadata: event.metadata ? JSON.stringify(event.metadata) : null
  });
}

export function enqueueJob(job: Job) {
  const db = getDb();
  db.prepare(
    `INSERT INTO jobs (id, tenant_id, type, payload, status, attempts, last_error, created_at, updated_at)
     VALUES (@id, @tenantId, @type, @payload, @status, @attempts, @lastError, @createdAt, @updatedAt)`
  ).run({
    ...job,
    payload: JSON.stringify(job.payload),
    lastError: job.lastError ?? null
  });
}

export function listJobs(tenantId: TenantId, status?: Job["status"]) {
  const db = getDb();
  const rows = status
    ? db
        .prepare("SELECT * FROM jobs WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC")
        .all(tenantId, status)
    : db.prepare("SELECT * FROM jobs WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId);
  return rows.map((row: any) => ({
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type,
    payload: JSON.parse(row.payload),
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })) as Job[];
}

export function updateJob(job: Job) {
  const db = getDb();
  db.prepare(
    `UPDATE jobs SET status = @status, attempts = @attempts, last_error = @lastError, updated_at = @updatedAt WHERE id = @id`
  ).run({
    id: job.id,
    status: job.status,
    attempts: job.attempts,
    lastError: job.lastError ?? null,
    updatedAt: job.updatedAt
  });
}

export function createPasswordReset(reset: PasswordReset) {
  const db = getDb();
  db.prepare(
    `INSERT INTO password_resets (token, agent_id, expires_at, used_at)
     VALUES (@token, @agentId, @expiresAt, @usedAt)`
  ).run({
    ...reset,
    usedAt: reset.usedAt ?? null
  });
}

export function getPasswordReset(token: string) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM password_resets WHERE token = ?").get(token);
  if (!row) return undefined;
  return {
    token: row.token,
    agentId: row.agent_id,
    expiresAt: row.expires_at,
    usedAt: row.used_at ?? undefined
  } as PasswordReset;
}

export function markPasswordResetUsed(token: string) {
  const db = getDb();
  db.prepare("UPDATE password_resets SET used_at = ? WHERE token = ?").run(
    new Date().toISOString(),
    token
  );
}

export function addAiUsage(usage: AiUsage) {
  const db = getDb();
  db.prepare(
    `INSERT INTO ai_usage (id, tenant_id, action, model, prompt_tokens, completion_tokens, cost_usd, created_at)
     VALUES (@id, @tenantId, @action, @model, @promptTokens, @completionTokens, @costUsd, @createdAt)`
  ).run(usage);
}

export function getAiUsageSummary(tenantId: TenantId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as count, SUM(cost_usd) as totalCost, SUM(prompt_tokens) as promptTokens, SUM(completion_tokens) as completionTokens
       FROM ai_usage WHERE tenant_id = ?`
    )
    .get(tenantId) as { count: number; totalCost: number; promptTokens: number; completionTokens: number };
  return {
    count: row.count ?? 0,
    totalCost: row.totalCost ?? 0,
    promptTokens: row.promptTokens ?? 0,
    completionTokens: row.completionTokens ?? 0
  };
}

export function getTenantTheme(tenantId: TenantId): TenantTheme {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tenant_theme WHERE tenant_id = ?").get(tenantId);
  if (!row) {
    return {
      tenantId,
      brandName: "Tenant",
      logoUrl: undefined,
      primaryColor: "#0ea5e9",
      accentColor: "#14b8a6",
      backgroundColor: "#ffffff",
      textColor: "#0f172a"
    };
  }
  return {
    tenantId: row.tenant_id,
    brandName: row.brand_name,
    logoUrl: row.logo_url ?? undefined,
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
    backgroundColor: row.background_color,
    textColor: row.text_color
  };
}

export function upsertTenantTheme(theme: TenantTheme) {
  const db = getDb();
  db.prepare(
    `INSERT INTO tenant_theme (tenant_id, brand_name, logo_url, primary_color, accent_color, background_color, text_color)
     VALUES (@tenantId, @brandName, @logoUrl, @primaryColor, @accentColor, @backgroundColor, @textColor)
     ON CONFLICT(tenant_id) DO UPDATE SET
       brand_name = excluded.brand_name,
       logo_url = excluded.logo_url,
       primary_color = excluded.primary_color,
       accent_color = excluded.accent_color,
       background_color = excluded.background_color,
       text_color = excluded.text_color`
  ).run({
    tenantId: theme.tenantId,
    brandName: theme.brandName,
    logoUrl: theme.logoUrl ?? null,
    primaryColor: theme.primaryColor,
    accentColor: theme.accentColor,
    backgroundColor: theme.backgroundColor,
    textColor: theme.textColor
  });
}

export function listAiUsage(tenantId: TenantId, limit = 50) {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM ai_usage WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(tenantId, limit);
  return rows.map((row: any) => ({
    id: row.id,
    tenantId: row.tenant_id,
    action: row.action,
    model: row.model,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    costUsd: row.cost_usd,
    createdAt: row.created_at
  })) as AiUsage[];
}

export function getTenantSettings(tenantId: TenantId): TenantSettings {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tenant_settings WHERE tenant_id = ?").get(tenantId);
  if (!row) {
    return {
      tenantId,
      aiTriageEnabled: false,
      aiDraftEnabled: false,
      aiReviewEnabled: false,
      retentionDays: 90
    };
  }
  return {
    tenantId: row.tenant_id,
    aiTriageEnabled: Boolean(row.ai_triage_enabled),
    aiDraftEnabled: Boolean(row.ai_draft_enabled),
    aiReviewEnabled: Boolean(row.ai_review_enabled),
    retentionDays: Number(row.retention_days ?? 90)
  };
}

export function upsertTenantSettings(settings: TenantSettings) {
  const db = getDb();
  db.prepare(
    `INSERT INTO tenant_settings (tenant_id, ai_triage_enabled, ai_draft_enabled, ai_review_enabled, retention_days)
     VALUES (@tenantId, @aiTriageEnabled, @aiDraftEnabled, @aiReviewEnabled, @retentionDays)
     ON CONFLICT(tenant_id) DO UPDATE SET
       ai_triage_enabled = excluded.ai_triage_enabled,
       ai_draft_enabled = excluded.ai_draft_enabled,
       ai_review_enabled = excluded.ai_review_enabled,
       retention_days = excluded.retention_days`
  ).run({
    tenantId: settings.tenantId,
    aiTriageEnabled: settings.aiTriageEnabled ? 1 : 0,
    aiDraftEnabled: settings.aiDraftEnabled ? 1 : 0,
    aiReviewEnabled: settings.aiReviewEnabled ? 1 : 0,
    retentionDays: settings.retentionDays ?? 90
  });
}

export function listRoutingRules(tenantId: TenantId): RoutingRule[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM tenant_routing_rules WHERE tenant_id = ? ORDER BY category ASC")
    .all(tenantId);
  return rows.map((row: any) => ({
    tenantId: row.tenant_id,
    category: row.category as TriageCategory,
    queue: row.queue
  }));
}

export function upsertRoutingRules(tenantId: TenantId, rules: RoutingRule[]) {
  const db = getDb();
  const insert = db.prepare(
    "INSERT INTO tenant_routing_rules (tenant_id, category, queue) VALUES (@tenantId, @category, @queue)"
  );
  db.transaction(() => {
    db.prepare("DELETE FROM tenant_routing_rules WHERE tenant_id = ?").run(tenantId);
    rules.forEach((rule) =>
      insert.run({
        tenantId,
        category: rule.category,
        queue: rule.queue
      })
    );
  })();
}

export function listQueueBuckets(tenantId: TenantId): QueueBucket[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM tenant_queue_buckets WHERE tenant_id = ? ORDER BY name ASC").all(tenantId);
  if (!rows.length) {
    return [
      {
        tenantId,
        name: "General",
        slaHours: 24,
        fallback: true,
        keywords: [],
        notifyEmails: [],
        allowedAvailability: ["available"]
      }
    ];
  }
  return rows.map(mapQueueBucket);
}

export function upsertQueueBuckets(tenantId: TenantId, buckets: QueueBucket[]) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO tenant_queue_buckets
     (tenant_id, name, sla_hours, fallback, keywords_json, notify_emails_json, notify_slack, quiet_start, quiet_end, max_open_per_agent, allowed_availability)
     VALUES (@tenantId, @name, @slaHours, @fallback, @keywordsJson, @notifyEmailsJson, @notifySlack, @quietStart, @quietEnd, @maxOpenPerAgent, @allowedAvailability)`
  );
  db.transaction(() => {
    db.prepare("DELETE FROM tenant_queue_buckets WHERE tenant_id = ?").run(tenantId);
    buckets.forEach((bucket) =>
      insert.run({
        tenantId,
        name: bucket.name,
        slaHours: bucket.slaHours ?? 24,
        fallback: bucket.fallback ? 1 : 0,
        keywordsJson: JSON.stringify(bucket.keywords ?? []),
        notifyEmailsJson: JSON.stringify(bucket.notifyEmails ?? []),
        notifySlack: bucket.slackWebhook ?? null,
        quietStart: bucket.quietHoursStart ?? null,
        quietEnd: bucket.quietHoursEnd ?? null,
        maxOpenPerAgent: bucket.maxOpenPerAgent ?? null,
        allowedAvailability: JSON.stringify(bucket.allowedAvailability ?? ["available"])
      })
    );
  })();
}

export function getAgentWorkload(tenantId: TenantId) {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT assigned_to as agentId, COUNT(*) as count FROM threads WHERE tenant_id = ? AND status != 'closed' AND assigned_to IS NOT NULL GROUP BY assigned_to"
    )
    .all(tenantId) as Array<{ agentId: string; count: number }>;
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.agentId] = row.count;
    return acc;
  }, {});
}

export function getMailboxState(tenantId: TenantId, mailbox: MailboxId) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM mailbox_state WHERE tenant_id = ? AND mailbox = ?")
    .get(tenantId, mailbox) as { history_id?: string; updated_at?: string } | undefined;
}

export function listMailboxStates(tenantId: TenantId) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM mailbox_state WHERE tenant_id = ?").all(tenantId);
  return rows.map((row: any) => ({
    mailbox: row.mailbox as MailboxId,
    historyId: row.history_id ?? undefined,
    updatedAt: row.updated_at ?? undefined
  }));
}

export function upsertMailboxState(tenantId: TenantId, mailbox: MailboxId, historyId?: string) {
  const db = getDb();
  db.prepare(
    `INSERT INTO mailbox_state (tenant_id, mailbox, history_id, updated_at)
     VALUES (@tenantId, @mailbox, @historyId, @updatedAt)
     ON CONFLICT(tenant_id, mailbox) DO UPDATE SET
       history_id = excluded.history_id,
       updated_at = excluded.updated_at`
  ).run({
    tenantId,
    mailbox,
    historyId: historyId ?? null,
    updatedAt: new Date().toISOString()
  });
}
