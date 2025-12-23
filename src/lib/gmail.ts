import { google, gmail_v1 } from "googleapis";
import { buildReplyMime, buildReplyMimeWithHtml, collectAttachments, extractBody, extractHtml, getHeader, sanitizeInboundHtml } from "./email";
import { extractEmails, formatSubject } from "./utils";
import { MailboxId, Message, TenantId, Thread } from "./types";
import { addAuditEvent, getMailboxState, getTenantSettings, listRoutingRules, readThreads, upsertMailboxState, upsertThread } from "./store";
import { triageInboundEmail } from "@/src/ai/llmService";

const scopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify"
];

const mailboxMap: Record<MailboxId, { email: string; tenantId: TenantId }> = {
  board: { email: process.env.MAILBOX_BOARD ?? "board@dream-x.app", tenantId: "dream-x" },
  general: {
    email: process.env.MAILBOX_GENERAL ?? "general@playerxchange.org",
    tenantId: "playerxchange"
  },
  lsi: {
    email: process.env.MAILBOX_LSI ?? "hello@lsi.ai",
    tenantId: "lsi"
  },
  cytos: {
    email: process.env.MAILBOX_CYTOS ?? "hello@cytos.ai",
    tenantId: "cytos"
  }
};

function getJwtClient(subject: string) {
  const clientEmail = process.env.GMAIL_CLIENT_EMAIL;
  const privateKey = process.env.GMAIL_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error("Missing GMAIL_CLIENT_EMAIL or GMAIL_PRIVATE_KEY");
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes,
    subject
  });
}

function getGmail(subject: string) {
  const auth = getJwtClient(subject);
  return google.gmail({ version: "v1", auth });
}

export function gmailConfigured() {
  return Boolean(process.env.GMAIL_CLIENT_EMAIL && process.env.GMAIL_PRIVATE_KEY);
}

export function resolveMailboxFromEmail(email?: string | null): MailboxId | null {
  if (!email) return null;
  const normalized = email.toLowerCase();
  const match = (Object.keys(mailboxMap) as MailboxId[]).find(
    (key) => mailboxMap[key].email.toLowerCase() === normalized
  );
  return match ?? null;
}

export function resolveTenantFromMailbox(mailbox: MailboxId): TenantId {
  return mailboxMap[mailbox].tenantId;
}

export function getMailboxEmail(mailbox: MailboxId) {
  return mailboxMap[mailbox].email;
}

export function listMailboxesForTenant(tenantId: TenantId) {
  return (Object.keys(mailboxMap) as MailboxId[])
    .filter((key) => mailboxMap[key].tenantId === tenantId)
    .map((key) => ({ id: key, email: mailboxMap[key].email }));
}

export function isMailboxId(value: string): value is MailboxId {
  return Object.prototype.hasOwnProperty.call(mailboxMap, value);
}

function parseMessage(message: gmail_v1.Schema$Message): Message {
  const headers = message.payload?.headers ?? [];
  const subject = formatSubject(getHeader(headers, "Subject"));
  const from = getHeader(headers, "From");
  const to = extractEmails(getHeader(headers, "To"));
  const cc = extractEmails(getHeader(headers, "Cc"));
  const date = getHeader(headers, "Date") || new Date().toISOString();
  const bodyHtml = sanitizeInboundHtml(extractHtml(message.payload));

  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    from,
    to,
    cc,
    subject,
    date,
    snippet: message.snippet ?? "",
    bodyText: extractBody(message.payload),
    bodyHtml,
    attachments: collectAttachments(message.payload, message.id ?? "")
  };
}

function threadFromGmail(thread: gmail_v1.Schema$Thread, mailbox: MailboxId, tenantId: TenantId): Thread {
  const messages = (thread.messages ?? []).map((msg) => parseMessage(msg));
  const subject = messages[0]?.subject ?? "(no subject)";
  const participants = Array.from(
    new Set(messages.flatMap((msg) => [msg.from, ...msg.to, ...msg.cc]).filter(Boolean))
  );

  return {
    id: thread.id ?? "",
    tenantId,
    mailbox,
    subject,
    snippet: messages[0]?.snippet ?? "",
    updatedAt: new Date().toISOString(),
    participants,
    messages,
    status: "open",
    assignedTo: undefined,
    priority: "normal",
    tags: [],
    internalNotes: []
  };
}

async function fetchThread(gmail: gmail_v1.Gmail, mailbox: MailboxId, tenantId: TenantId, threadId: string) {
  const fullThread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full"
  });
  const thread = threadFromGmail(fullThread.data, mailbox, tenantId);
  const settings = getTenantSettings(tenantId);
  const enableTriage = process.env.AI_TRIAGE_ENABLED === "true" && settings.aiTriageEnabled;
  const lastMessage = thread.messages[thread.messages.length - 1];
  const mailboxEmail = mailboxMap[mailbox].email.toLowerCase();
  const fromMailbox = lastMessage?.from.toLowerCase().includes(mailboxEmail);

  if (enableTriage && lastMessage && !fromMailbox) {
    const existingNote = thread.internalNotes.find((note) => note.id === `note-ai-${lastMessage.id}`);
    if (!existingNote) {
      try {
        const triage = await triageInboundEmail({
          subject: lastMessage.subject,
          bodyText: lastMessage.bodyText,
          from: lastMessage.from,
          tenantId
        });
        const routingRules = listRoutingRules(tenantId);
        const matchedRule = routingRules.find((rule) => rule.category === triage.category);
        if (matchedRule) {
          triage.suggestedQueue = matchedRule.queue;
        }
        thread.internalNotes.unshift({
          id: `note-ai-${lastMessage.id}`,
          authorId: "system-ai",
          body: `AI triage: ${JSON.stringify(triage)}`,
          date: new Date().toISOString()
        });
        addAuditEvent({
          id: `audit-${Date.now()}`,
          tenantId,
          actorId: "system-ai",
          action: "ai_triage",
          targetType: "thread",
          targetId: thread.id,
          timestamp: new Date().toISOString(),
          metadata: {
            category: triage.category,
            urgency: triage.urgency,
            sentiment: triage.sentiment,
            suggestedQueue: triage.suggestedQueue,
            confidence: String(triage.confidence)
          }
        });
      } catch (error) {
        addAuditEvent({
          id: `audit-${Date.now()}`,
          tenantId,
          actorId: "system-ai",
          action: "ai_triage_failed",
          targetType: "thread",
          targetId: thread.id,
          timestamp: new Date().toISOString()
        });
        try {
          const { enqueueJob } = await import("@/src/lib/store");
          enqueueJob({
            id: `job-${Date.now()}`,
            tenantId,
            type: "ai_retry",
            payload: { threadId: thread.id, action: "triage" },
            status: "queued",
            attempts: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        } catch {
          // no-op
        }
      }
    }
  }
  upsertThread(thread);
  return thread;
}

export async function syncMailbox(mailbox: MailboxId) {
  const tenantId = resolveTenantFromMailbox(mailbox);
  if (!gmailConfigured()) {
    return readThreads(tenantId).filter((thread) => thread.mailbox === mailbox);
  }

  const subject = mailboxMap[mailbox].email;
  const gmail = getGmail(subject);
  const list = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["INBOX"],
    maxResults: 10
  });

  const messageIds = list.data.messages ?? [];
  const threads: Thread[] = [];

  for (const message of messageIds) {
    if (!message.threadId) continue;
    const thread = await fetchThread(gmail, mailbox, tenantId, message.threadId);
    threads.push(thread);
  }

  return threads;
}

export async function fullSyncMailbox(mailbox: MailboxId) {
  const tenantId = resolveTenantFromMailbox(mailbox);
  if (!gmailConfigured()) {
    return readThreads(tenantId).filter((thread) => thread.mailbox === mailbox);
  }

  const subject = mailboxMap[mailbox].email;
  const gmail = getGmail(subject);
  const threads: Thread[] = [];
  const seenThreads = new Set<string>();
  let pageToken: string | undefined;

  do {
    const list = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      maxResults: 100,
      pageToken
    });

    const messageIds = list.data.messages ?? [];
    for (const message of messageIds) {
      if (!message.threadId || seenThreads.has(message.threadId)) continue;
      seenThreads.add(message.threadId);
      const thread = await fetchThread(gmail, mailbox, tenantId, message.threadId);
      threads.push(thread);
    }
    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken);

  return threads;
}

export async function syncMailboxHistory(mailbox: MailboxId, historyId?: string) {
  const tenantId = resolveTenantFromMailbox(mailbox);
  if (!gmailConfigured()) {
    return readThreads(tenantId).filter((thread) => thread.mailbox === mailbox);
  }

  const subject = mailboxMap[mailbox].email;
  const gmail = getGmail(subject);
  const state = getMailboxState(tenantId, mailbox);
  const startHistoryId = historyId || state?.history_id;

  if (!startHistoryId) {
    return syncMailbox(mailbox);
  }

  const threads: Thread[] = [];
  const threadIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId: string | undefined;

  try {
    do {
      const response = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        pageToken
      });
      const history = response.data;
      latestHistoryId = history.historyId ?? latestHistoryId;
      const historyItems = history.history ?? [];
      historyItems.forEach((item) => {
        item.messagesAdded?.forEach((entry) => {
          if (entry.message?.threadId) threadIds.add(entry.message.threadId);
        });
        item.messages?.forEach((entry) => {
          if (entry.threadId) threadIds.add(entry.threadId);
        });
      });
      pageToken = history.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (error) {
    return fullSyncMailbox(mailbox);
  }

  for (const threadId of threadIds) {
    const thread = await fetchThread(gmail, mailbox, tenantId, threadId);
    threads.push(thread);
  }

  if (latestHistoryId) {
    upsertMailboxState(tenantId, mailbox, latestHistoryId);
  }

  return threads;
}

export async function sendReply(params: {
  mailbox: MailboxId;
  to: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  threadId: string;
  inReplyTo?: string;
  references?: string;
}) {
  if (!gmailConfigured()) {
    return { id: "mock-sent" };
  }

  const subject = mailboxMap[params.mailbox].email;
  const gmail = getGmail(subject);
  const raw = params.bodyHtml
    ? buildReplyMimeWithHtml({
        from: subject,
        to: params.to,
        subject: params.subject,
        text: params.body,
        html: params.bodyHtml,
        inReplyTo: params.inReplyTo,
        references: params.references
      })
    : buildReplyMime({
        from: subject,
        to: params.to,
        subject: params.subject,
        body: params.body,
        inReplyTo: params.inReplyTo,
        references: params.references
      });

  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: params.threadId
    }
  });

  return sent.data;
}

export async function sendOutboundEmail(params: {
  mailbox: MailboxId;
  to: string;
  subject: string;
  body: string;
  bodyHtml?: string;
}) {
  if (!gmailConfigured()) {
    return { id: "mock-sent" };
  }

  const subject = mailboxMap[params.mailbox].email;
  const gmail = getGmail(subject);
  const raw = params.bodyHtml
    ? buildReplyMimeWithHtml({
        from: subject,
        to: params.to,
        subject: params.subject,
        text: params.body,
        html: params.bodyHtml
      })
    : buildReplyMime({
        from: subject,
        to: params.to,
        subject: params.subject,
        body: params.body
      });

  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw
    }
  });

  return sent.data;
}

export async function watchMailbox(mailbox: MailboxId) {
  if (!gmailConfigured()) {
    return { mailbox, status: "mock" };
  }

  const topicName = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topicName) {
    throw new Error("Missing GMAIL_PUBSUB_TOPIC for Gmail watch");
  }

  const subject = mailboxMap[mailbox].email;
  const gmail = getGmail(subject);

  const response = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"]
    }
  });

  if (response.data.historyId) {
    upsertMailboxState(resolveTenantFromMailbox(mailbox), mailbox, response.data.historyId);
  }

  return response.data;
}

export async function downloadAttachment(params: {
  mailbox: MailboxId;
  messageId: string;
  attachmentId: string;
}) {
  if (!gmailConfigured()) {
    return null;
  }

  const subject = mailboxMap[params.mailbox].email;
  const gmail = getGmail(subject);
  const response = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId: params.messageId,
    id: params.attachmentId
  });

  return response.data.data ?? null;
}
