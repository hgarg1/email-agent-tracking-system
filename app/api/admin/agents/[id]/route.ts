import { NextResponse } from "next/server";
import { addAuditEvent, deleteAgent, getAgent, getTenant, upsertAgent } from "@/src/lib/store";
import { hashPassword } from "@/src/lib/passwords";
import { requireAdmin } from "@/src/lib/auth";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = getAgent(params.id);
  if (!agent || agent.tenantId !== admin.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body?.name === "string") agent.name = body.name.trim();
  if (typeof body?.email === "string") agent.email = body.email.trim();
  if (typeof body?.role === "string") agent.role = body.role === "admin" ? "admin" : "agent";
  if (Array.isArray(body?.mailboxAccess)) {
    const tenant = getTenant(admin.tenantId);
    const allowedMailboxes = tenant?.primaryMailbox === "board" ? ["board"] : ["general"];
    agent.mailboxAccess = body.mailboxAccess.filter((mailbox: string) =>
      allowedMailboxes.includes(mailbox)
    );
  }
  if (typeof body?.availability === "string") {
    agent.availability = body.availability === "offline" ? "offline" : body.availability === "away" ? "away" : "available";
  }
  if (typeof body?.active === "boolean") agent.active = body.active;
  if (typeof body?.password === "string") agent.password = hashPassword(body.password);

  upsertAgent(agent);
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: admin.tenantId,
    actorId: admin.id,
    action: "agent_updated",
    targetType: "agent",
    targetId: agent.id,
    timestamp: new Date().toISOString()
  });
  return NextResponse.json({
    ok: true,
    agent: {
      id: agent.id,
      tenantId: agent.tenantId,
      name: agent.name,
      email: agent.email,
      role: agent.role,
      mailboxAccess: agent.mailboxAccess,
      active: agent.active,
      mfaEnabled: agent.mfaEnabled,
      availability: agent.availability
    }
  });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = getAgent(params.id);
  if (!agent || agent.tenantId !== admin.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  deleteAgent(params.id);
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: admin.tenantId,
    actorId: admin.id,
    action: "agent_deleted",
    targetType: "agent",
    targetId: params.id,
    timestamp: new Date().toISOString()
  });
  return NextResponse.json({ ok: true });
}
