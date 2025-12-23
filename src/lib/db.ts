import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { mockAgents, mockTemplates, mockTenants, mockThreads } from "./mock";
import { hashPassword } from "./passwords";
import type { Agent, AuditEvent, QueueBucket, Session, Template, Thread } from "./types";

let db: Database.Database | null = null;

function seedThemeForTenant(tenantId: string, name: string) {
  if (tenantId === "dream-x") {
    return {
      brandName: name,
      logoUrl: null,
      primaryColor: "#0ea5e9",
      accentColor: "#14b8a6",
      backgroundColor: "#ffffff",
      textColor: "#0f172a"
    };
  }
  if (tenantId === "playerxchange") {
    return {
      brandName: name,
      logoUrl: null,
      primaryColor: "#16a34a",
      accentColor: "#f59e0b",
      backgroundColor: "#ffffff",
      textColor: "#0f172a"
    };
  }
  if (tenantId === "lsi") {
    return {
      brandName: name,
      logoUrl: null,
      primaryColor: "#d6a64b",
      accentColor: "#f2c566",
      backgroundColor: "#0b0c12",
      textColor: "#f8f4e6"
    };
  }
  if (tenantId === "cytos") {
    return {
      brandName: name,
      logoUrl: null,
      primaryColor: "#33e0d2",
      accentColor: "#6cf7a1",
      backgroundColor: "#05070f",
      textColor: "#e8fbff"
    };
  }
  return {
    brandName: name,
    logoUrl: null,
    primaryColor: "#0ea5e9",
    accentColor: "#14b8a6",
    backgroundColor: "#ffffff",
    textColor: "#0f172a"
  };
}

function initSchema(conn: Database.Database) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      primary_mailbox TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      mailbox_access TEXT NOT NULL,
      active INTEGER NOT NULL,
      password TEXT NOT NULL,
      availability TEXT NOT NULL DEFAULT 'available',
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_secret TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      mailbox TEXT NOT NULL,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      signature TEXT NOT NULL,
      blocks_json TEXT,
      is_builder INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      mailbox TEXT NOT NULL,
      subject TEXT NOT NULL,
      snippet TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      participants TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_to TEXT,
      priority TEXT NOT NULL,
      tags TEXT NOT NULL,
      notes TEXT NOT NULL,
      messages TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      timestamp TEXT NOT NULL,
      metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS mailbox_state (
      tenant_id TEXT NOT NULL,
      mailbox TEXT NOT NULL,
      history_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, mailbox)
    );
    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id TEXT PRIMARY KEY,
      ai_triage_enabled INTEGER NOT NULL,
      ai_draft_enabled INTEGER NOT NULL,
      ai_review_enabled INTEGER NOT NULL,
      retention_days INTEGER NOT NULL DEFAULT 90
    );
    CREATE TABLE IF NOT EXISTS tenant_routing_rules (
      tenant_id TEXT NOT NULL,
      category TEXT NOT NULL,
      queue TEXT NOT NULL,
      PRIMARY KEY (tenant_id, category)
    );
    CREATE TABLE IF NOT EXISTS tenant_queue_buckets (
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sla_hours INTEGER NOT NULL,
      fallback INTEGER NOT NULL DEFAULT 0,
      keywords_json TEXT,
      notify_emails_json TEXT,
      notify_slack TEXT,
      quiet_start TEXT,
      quiet_end TEXT,
      max_open_per_agent INTEGER,
      allowed_availability TEXT,
      PRIMARY KEY (tenant_id, name)
    );
    CREATE TABLE IF NOT EXISTS tenant_theme (
      tenant_id TEXT PRIMARY KEY,
      brand_name TEXT NOT NULL,
      logo_url TEXT,
      primary_color TEXT NOT NULL,
      accent_color TEXT NOT NULL,
      background_color TEXT NOT NULL,
      text_color TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS ai_usage (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      action TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function seedIfEmpty(conn: Database.Database) {
  const tenantCount = conn.prepare("SELECT COUNT(*) as count FROM tenants").get() as {
    count: number;
  };
  if (tenantCount.count === 0) {
    const insertTenant = conn.prepare(
      "INSERT INTO tenants (id, name, primary_mailbox) VALUES (@id, @name, @primaryMailbox)"
    );
    const insertAgent = conn.prepare(
      "INSERT INTO agents (id, tenant_id, name, email, role, mailbox_access, active, password, availability, mfa_enabled, mfa_secret) VALUES (@id, @tenantId, @name, @email, @role, @mailboxAccess, @active, @password, @availability, @mfaEnabled, @mfaSecret)"
    );
    const insertTemplate = conn.prepare(
      "INSERT INTO templates (id, tenant_id, mailbox, name, subject, body, signature, blocks_json, is_builder) VALUES (@id, @tenantId, @mailbox, @name, @subject, @body, @signature, @blocksJson, @isBuilder)"
    );
    const insertThread = conn.prepare(
      "INSERT INTO threads (id, tenant_id, mailbox, subject, snippet, updated_at, participants, status, assigned_to, priority, tags, notes, messages) VALUES (@id, @tenantId, @mailbox, @subject, @snippet, @updatedAt, @participants, @status, @assignedTo, @priority, @tags, @notes, @messages)"
    );
    const insertSettings = conn.prepare(
      "INSERT INTO tenant_settings (tenant_id, ai_triage_enabled, ai_draft_enabled, ai_review_enabled, retention_days) VALUES (@tenantId, @aiTriageEnabled, @aiDraftEnabled, @aiReviewEnabled, @retentionDays)"
    );
    const insertRouting = conn.prepare(
      "INSERT INTO tenant_routing_rules (tenant_id, category, queue) VALUES (@tenantId, @category, @queue)"
    );

    conn.transaction(() => {
      mockTenants.forEach((tenant) => insertTenant.run(tenant));
      mockAgents.forEach((agent) =>
        insertAgent.run({
          ...agent,
          mailboxAccess: JSON.stringify(agent.mailboxAccess),
          active: agent.active ? 1 : 0,
          password: hashPassword(agent.password),
          availability: agent.availability ?? "available",
          mfaEnabled: agent.mfaEnabled ? 1 : 0,
          mfaSecret: agent.mfaSecret ?? null
        })
      );
      mockTemplates.forEach((tpl) =>
        insertTemplate.run({
          ...tpl,
          blocksJson: tpl.blocks ? JSON.stringify(tpl.blocks) : null,
          isBuilder: tpl.isBuilder ? 1 : 0
        })
      );
      mockTenants.forEach((tenant) =>
        conn.prepare(
          "INSERT INTO tenant_theme (tenant_id, brand_name, logo_url, primary_color, accent_color, background_color, text_color) VALUES (@tenantId, @brandName, @logoUrl, @primaryColor, @accentColor, @backgroundColor, @textColor)"
        ).run({
          tenantId: tenant.id,
          ...seedThemeForTenant(tenant.id, tenant.name)
        })
      );
      mockThreads.forEach((thread) =>
        insertThread.run({
          ...thread,
          participants: JSON.stringify(thread.participants),
          tags: JSON.stringify(thread.tags),
          notes: JSON.stringify(thread.internalNotes),
          messages: JSON.stringify(thread.messages)
        })
      );
      mockTenants.forEach((tenant) =>
        insertSettings.run({
          tenantId: tenant.id,
          aiTriageEnabled: 0,
          aiDraftEnabled: 0,
          aiReviewEnabled: 0,
          retentionDays: 90
        })
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
      mockTenants.forEach((tenant) =>
        defaultQueues.forEach((rule) =>
          insertRouting.run({
            tenantId: tenant.id,
            category: rule.category,
            queue: rule.queue
          })
        )
      );
    })();
  }
}

function ensureTenantSeeds(conn: Database.Database) {
  const existing = conn.prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;
  const known = new Set(existing.map((row) => row.id));
  const existingAgents = conn.prepare("SELECT id FROM agents").all() as Array<{ id: string }>;
  const knownAgents = new Set(existingAgents.map((row) => row.id));
  const insertTenant = conn.prepare(
    "INSERT OR IGNORE INTO tenants (id, name, primary_mailbox) VALUES (@id, @name, @primaryMailbox)"
  );
  const insertAgent = conn.prepare(
    "INSERT OR IGNORE INTO agents (id, tenant_id, name, email, role, mailbox_access, active, password, availability, mfa_enabled, mfa_secret) VALUES (@id, @tenantId, @name, @email, @role, @mailboxAccess, @active, @password, @availability, @mfaEnabled, @mfaSecret)"
  );
  const insertSettings = conn.prepare(
    "INSERT OR IGNORE INTO tenant_settings (tenant_id, ai_triage_enabled, ai_draft_enabled, ai_review_enabled, retention_days) VALUES (@tenantId, @aiTriageEnabled, @aiDraftEnabled, @aiReviewEnabled, @retentionDays)"
  );
  const insertTheme = conn.prepare(
    "INSERT OR IGNORE INTO tenant_theme (tenant_id, brand_name, logo_url, primary_color, accent_color, background_color, text_color) VALUES (@tenantId, @brandName, @logoUrl, @primaryColor, @accentColor, @backgroundColor, @textColor)"
  );
  const insertRouting = conn.prepare(
    "INSERT OR IGNORE INTO tenant_routing_rules (tenant_id, category, queue) VALUES (@tenantId, @category, @queue)"
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

  mockTenants.forEach((tenant) => {
    if (!known.has(tenant.id)) {
      insertTenant.run(tenant);
    }
    insertSettings.run({
      tenantId: tenant.id,
      aiTriageEnabled: 0,
      aiDraftEnabled: 0,
      aiReviewEnabled: 0,
      retentionDays: 90
    });
    insertTheme.run({
      tenantId: tenant.id,
      ...seedThemeForTenant(tenant.id, tenant.name)
    });
    defaultQueues.forEach((rule) =>
      insertRouting.run({
        tenantId: tenant.id,
        category: rule.category,
        queue: rule.queue
      })
    );
  });

  mockAgents.forEach((agent) => {
    if (!knownAgents.has(agent.id)) {
      insertAgent.run({
        ...agent,
        mailboxAccess: JSON.stringify(agent.mailboxAccess),
        active: agent.active ? 1 : 0,
        password: hashPassword(agent.password),
        availability: agent.availability ?? "available",
        mfaEnabled: agent.mfaEnabled ? 1 : 0,
        mfaSecret: agent.mfaSecret ?? null
      });
    }
  });
}

export function getDb() {
  if (!db) {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const file = path.join(dataDir, "app.db");
    db = new Database(file);
    db.pragma("journal_mode = WAL");
    initSchema(db);
    const columns = (db.prepare("PRAGMA table_info(agents)").all() as { name: string }[]).map(
      (col) => col.name
    );
    if (!columns.includes("availability")) {
      db.exec(`ALTER TABLE agents ADD COLUMN availability TEXT NOT NULL DEFAULT 'available';`);
    }
    if (!columns.includes("mfa_enabled")) {
      db.exec(`ALTER TABLE agents ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0;`);
    }
    if (!columns.includes("mfa_secret")) {
      db.exec(`ALTER TABLE agents ADD COLUMN mfa_secret TEXT;`);
    }
    const templateColumns = (db.prepare("PRAGMA table_info(templates)").all() as { name: string }[]).map(
      (col) => col.name
    );
    if (!templateColumns.includes("blocks_json")) {
      db.exec(`ALTER TABLE templates ADD COLUMN blocks_json TEXT;`);
    }
    if (!templateColumns.includes("is_builder")) {
      db.exec(`ALTER TABLE templates ADD COLUMN is_builder INTEGER NOT NULL DEFAULT 0;`);
    }
    const themeColumns = (db.prepare("PRAGMA table_info(tenant_theme)").all() as { name: string }[]).map(
      (col) => col.name
    );
    if (themeColumns.length === 0) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tenant_theme (
          tenant_id TEXT PRIMARY KEY,
          brand_name TEXT NOT NULL,
          logo_url TEXT,
          primary_color TEXT NOT NULL,
          accent_color TEXT NOT NULL,
          background_color TEXT NOT NULL,
          text_color TEXT NOT NULL
        );
      `);
      mockTenants.forEach((tenant) => {
        const theme = seedThemeForTenant(tenant.id, tenant.name);
        db.prepare(
          "INSERT OR IGNORE INTO tenant_theme (tenant_id, brand_name, logo_url, primary_color, accent_color, background_color, text_color) VALUES (@tenantId, @brandName, @logoUrl, @primaryColor, @accentColor, @backgroundColor, @textColor)"
        ).run({
          tenantId: tenant.id,
          ...theme
        });
      });
    }
    seedIfEmpty(db);
    ensureTenantSeeds(db);
    const settingsColumns = (db.prepare("PRAGMA table_info(tenant_settings)").all() as { name: string }[]).map(
      (col) => col.name
    );
    if (!settingsColumns.includes("retention_days")) {
      db.exec(`ALTER TABLE tenant_settings ADD COLUMN retention_days INTEGER NOT NULL DEFAULT 90;`);
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_routing_rules (
        tenant_id TEXT NOT NULL,
        category TEXT NOT NULL,
        queue TEXT NOT NULL,
        PRIMARY KEY (tenant_id, category)
      );
    `);
    const routingCount = db.prepare("SELECT COUNT(*) as count FROM tenant_routing_rules").get() as {
      count: number;
    };
    if (routingCount.count === 0) {
      const tenants = db.prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;
      const defaultQueues = [
        { category: "billing", queue: "Billing" },
        { category: "bug", queue: "Support" },
        { category: "account", queue: "Account" },
        { category: "feature", queue: "Product" },
        { category: "legal", queue: "Legal" },
        { category: "partnership", queue: "Partnerships" },
        { category: "other", queue: "General" }
      ];
      const insertRouting = db.prepare(
        "INSERT OR IGNORE INTO tenant_routing_rules (tenant_id, category, queue) VALUES (@tenantId, @category, @queue)"
      );
      tenants.forEach((tenant) => {
        defaultQueues.forEach((rule) => {
          insertRouting.run({
            tenantId: tenant.id,
            category: rule.category,
            queue: rule.queue
          });
        });
      });
    }
    const bucketCount = db.prepare("SELECT COUNT(*) as count FROM tenant_queue_buckets").get() as {
      count: number;
    };
    if (bucketCount.count === 0) {
      const tenants = db.prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;
      const insertBucket = db.prepare(
        `INSERT OR IGNORE INTO tenant_queue_buckets
         (tenant_id, name, sla_hours, fallback, keywords_json, notify_emails_json, notify_slack, quiet_start, quiet_end, max_open_per_agent, allowed_availability)
         VALUES (@tenantId, @name, @slaHours, @fallback, @keywordsJson, @notifyEmailsJson, @notifySlack, @quietStart, @quietEnd, @maxOpenPerAgent, @allowedAvailability)`
      );
      tenants.forEach((tenant) => {
        insertBucket.run({
          tenantId: tenant.id,
          name: "General",
          slaHours: 24,
          fallback: 1,
          keywordsJson: JSON.stringify([]),
          notifyEmailsJson: JSON.stringify([]),
          notifySlack: null,
          quietStart: null,
          quietEnd: null,
          maxOpenPerAgent: null,
          allowedAvailability: JSON.stringify(["available"])
        });
      });
    }
  }
  return db;
}

export function mapAgent(row: any): Agent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    email: row.email,
    role: row.role,
    mailboxAccess: JSON.parse(row.mailbox_access),
    active: Boolean(row.active),
    password: row.password,
    availability: row.availability ?? "available",
    mfaEnabled: Boolean(row.mfa_enabled),
    mfaSecret: row.mfa_secret ?? undefined
  };
}

export function mapTemplate(row: any): Template {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    mailbox: row.mailbox,
    name: row.name,
    subject: row.subject,
    body: row.body,
    signature: row.signature,
    blocks: row.blocks_json ? JSON.parse(row.blocks_json) : undefined,
    isBuilder: Boolean(row.is_builder)
  };
}

export function mapThread(row: any): Thread {
  const messages = (JSON.parse(row.messages) as Thread["messages"]).map((message) => ({
    ...message,
    bodyHtml: message.bodyHtml ?? "",
    attachments: message.attachments ?? []
  }));
  return {
    id: row.id,
    tenantId: row.tenant_id,
    mailbox: row.mailbox,
    subject: row.subject,
    snippet: row.snippet,
    updatedAt: row.updated_at,
    participants: JSON.parse(row.participants),
    messages,
    status: row.status,
    assignedTo: row.assigned_to ?? undefined,
    priority: row.priority,
    tags: JSON.parse(row.tags),
    internalNotes: JSON.parse(row.notes)
  };
}

export function mapSession(row: any): Session {
  return {
    token: row.token,
    agentId: row.agent_id,
    tenantId: row.tenant_id,
    createdAt: row.created_at
  };
}

export function mapAudit(row: any): AuditEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id ?? undefined,
    timestamp: row.timestamp,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined
  };
}

export function mapQueueBucket(row: any): QueueBucket {
  return {
    tenantId: row.tenant_id,
    name: row.name,
    slaHours: Number(row.sla_hours ?? 24),
    fallback: Boolean(row.fallback),
    keywords: row.keywords_json ? JSON.parse(row.keywords_json) : [],
    notifyEmails: row.notify_emails_json ? JSON.parse(row.notify_emails_json) : [],
    slackWebhook: row.notify_slack ?? undefined,
    quietHoursStart: row.quiet_start ?? undefined,
    quietHoursEnd: row.quiet_end ?? undefined,
    maxOpenPerAgent: row.max_open_per_agent ?? undefined,
    allowedAvailability: row.allowed_availability ? JSON.parse(row.allowed_availability) : ["available"]
  };
}
