import { NextResponse } from "next/server";
import { addAuditEvent, getThread, readAgents, upsertThread } from "@/src/lib/store";
import { Priority } from "@/src/lib/types";
import { requireAuth } from "@/src/lib/auth";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const agent = requireAuth(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thread = getThread(agent.tenantId, params.id);
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!agent.mailboxAccess.includes(thread.mailbox)) {
    return NextResponse.json({ error: "Mailbox access denied" }, { status: 403 });
  }

  const body = await request.json();
  const status = body?.status as "open" | "pending" | "closed" | undefined;
  const priority = body?.priority as Priority | undefined;
  const assignedTo = typeof body?.assignedTo === "string" ? body.assignedTo : undefined;
  const tags = Array.isArray(body?.tags) ? body.tags.filter((tag) => typeof tag === "string") : undefined;
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (status) thread.status = status;
  if (priority) thread.priority = priority;
  if (assignedTo !== undefined) {
    const agentIds = new Set(readAgents(agent.tenantId).map((item) => item.id));
    thread.assignedTo = assignedTo && agentIds.has(assignedTo) ? assignedTo : undefined;
  }
  if (tags) thread.tags = tags;

  if (note) {
    thread.internalNotes = [
      {
        id: `note-${Date.now()}`,
        authorId: agent.id,
        body: note,
        date: new Date().toISOString()
      },
      ...thread.internalNotes
    ];
  }

  thread.updatedAt = new Date().toISOString();
  upsertThread(thread);

  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: agent.tenantId,
    actorId: agent.id,
    action: "triage_update",
    targetType: "thread",
    targetId: thread.id,
    timestamp: new Date().toISOString()
  });

  return NextResponse.json({ ok: true, thread });
}
