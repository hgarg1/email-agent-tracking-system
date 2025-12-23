import { NextResponse } from "next/server";
import { addAuditEvent, getTenantSettings, getTenantTheme, getThread, readTemplates, upsertThread } from "@/src/lib/store";
import { getMailboxEmail, listMailboxesForTenant, sendReply } from "@/src/lib/gmail";
import { Message } from "@/src/lib/types";
import { requireAuth } from "@/src/lib/auth";
import { reviewOutboundEmail } from "@/src/ai/llmService";
import { renderEmail } from "@/src/lib/emailBuilder";


export async function POST(request: Request, { params }: { params: { id: string } }) {
  const agent = requireAuth(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const mailboxEmails = listMailboxesForTenant(agent.tenantId).map((entry) =>
    entry.email.toLowerCase()
  );
  const thread = getThread(agent.tenantId, params.id);
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!agent.mailboxAccess.includes(thread.mailbox)) {
    return NextResponse.json({ error: "Mailbox access denied" }, { status: 403 });
  }

  const body = await request.json();
  const replyText = typeof body?.body === "string" ? body.body.trim() : "";
  const templateId = typeof body?.templateId === "string" ? body.templateId : "";
  const useAiReview = Boolean(body?.useAiReview);
  const useBuilder = Boolean(body?.useBuilder);
  if (!replyText) {
    return NextResponse.json({ error: "Reply body required" }, { status: 400 });
  }

  const templates = readTemplates(agent.tenantId);
  const template = templates.find(
    (tpl) => tpl.id === templateId && (tpl.mailbox === "all" || tpl.mailbox === thread.mailbox)
  );
  const signature = template?.signature ? `\n\n${template.signature}` : "";
  let composedBody = `${replyText}${signature}`;
  let composedHtml = "";
  if (useBuilder && template?.blocks && template.isBuilder) {
    const theme = getTenantTheme(agent.tenantId);
    const rendered = renderEmail(template.blocks, theme);
    composedBody = rendered.text;
    composedHtml = rendered.html;
  }

  const customerEmail =
    body?.to ||
    thread.participants.find((email) => !mailboxEmails.includes(email.toLowerCase()));

  if (!customerEmail) {
    return NextResponse.json({ error: "No recipient found" }, { status: 400 });
  }

  const settings = getTenantSettings(agent.tenantId);
  if (useAiReview && (process.env.AI_REVIEW_ENABLED !== "true" || !settings.aiReviewEnabled)) {
    return NextResponse.json({ error: "AI review disabled" }, { status: 400 });
  }

  if (useAiReview && process.env.AI_REVIEW_ENABLED === "true") {
    try {
      const review = await reviewOutboundEmail({
        subject: thread.subject,
        body: composedBody,
        mailbox: thread.mailbox,
        tenantId: agent.tenantId
      });
      addAuditEvent({
        id: `audit-${Date.now()}`,
        tenantId: agent.tenantId,
        actorId: agent.id,
        action: "ai_review",
        targetType: "thread",
        targetId: thread.id,
        timestamp: new Date().toISOString(),
        metadata: { okToSend: String(review.okToSend) }
      });
      if (!review.okToSend) {
        addAuditEvent({
          id: `audit-${Date.now() + 1}`,
          tenantId: agent.tenantId,
          actorId: agent.id,
          action: "ai_review_blocked",
          targetType: "thread",
          targetId: thread.id,
          timestamp: new Date().toISOString(),
          metadata: { issues: review.issues.slice(0, 3).join("; ") }
        });
        return NextResponse.json({ error: "Review failed", review }, { status: 409 });
      }
    } catch (error) {
      try {
        const { enqueueJob } = await import("@/src/lib/store");
        enqueueJob({
          id: `job-${Date.now()}`,
          tenantId: agent.tenantId,
          type: "ai_retry",
          payload: { threadId: thread.id, action: "review", body: composedBody },
          status: "queued",
          attempts: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      } catch {
        // no-op
      }
      return NextResponse.json({ error: "AI review failed" }, { status: 502 });
    }
  }

  await sendReply({
    mailbox: thread.mailbox,
    to: customerEmail,
    subject: thread.subject,
    body: composedBody,
    bodyHtml: composedHtml || undefined,
    threadId: thread.id
  });

  const message: Message = {
    id: `local-${Date.now()}`,
    threadId: thread.id,
    from: getMailboxEmail(thread.mailbox),
    to: [customerEmail],
    cc: [],
    subject: thread.subject,
    date: new Date().toISOString(),
    snippet: replyText.slice(0, 120),
    bodyText: composedBody,
    bodyHtml: composedHtml,
    attachments: []
  };

  thread.messages = [...thread.messages, message];
  thread.snippet = message.snippet;
  thread.updatedAt = message.date;
  upsertThread(thread);
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: agent.tenantId,
    actorId: agent.id,
    action: "reply_sent",
    targetType: "thread",
    targetId: thread.id,
    timestamp: new Date().toISOString(),
    metadata: { mailbox: thread.mailbox }
  });

  return NextResponse.json({ ok: true });
}
