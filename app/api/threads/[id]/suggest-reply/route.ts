import { NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth";
import { getThread, addAuditEvent, getTenantSettings } from "@/src/lib/store";
import { draftReply } from "@/src/ai/llmService";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const agent = requireAuth(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = getTenantSettings(agent.tenantId);
  if (process.env.AI_DRAFT_ENABLED !== "true" || !settings.aiDraftEnabled) {
    return NextResponse.json({ error: "AI draft disabled" }, { status: 400 });
  }

  const thread = getThread(agent.tenantId, params.id);
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!agent.mailboxAccess.includes(thread.mailbox)) {
    return NextResponse.json({ error: "Mailbox access denied" }, { status: 403 });
  }

  const lastMessage = thread.messages[thread.messages.length - 1];
  if (!lastMessage) {
    return NextResponse.json({ error: "No messages to draft from" }, { status: 400 });
  }

  let result;
  try {
    result = await draftReply({
      subject: thread.subject,
      lastMessage: lastMessage.bodyText,
      mailbox: thread.mailbox,
      tenantId: agent.tenantId
    });
  } catch (error) {
    try {
      const { enqueueJob } = await import("@/src/lib/store");
      enqueueJob({
        id: `job-${Date.now()}`,
        tenantId: agent.tenantId,
        type: "ai_retry",
        payload: { threadId: thread.id, action: "draft" },
        status: "queued",
        attempts: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch {
      // no-op
    }
    return NextResponse.json({ error: "AI draft failed" }, { status: 502 });
  }

  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: agent.tenantId,
    actorId: agent.id,
    action: "ai_draft",
    targetType: "thread",
    targetId: thread.id,
    timestamp: new Date().toISOString(),
    metadata: { tone: result.tone }
  });

  return NextResponse.json({ draft: result });
}
