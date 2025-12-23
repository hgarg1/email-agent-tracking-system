import { NextResponse } from "next/server";
import { addAuditEvent, getTenant, readAgents, upsertAgent } from "@/src/lib/store";
import { hashPassword } from "@/src/lib/passwords";
import { requireAdmin } from "@/src/lib/auth";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const agents = readAgents(admin.tenantId).map((item) => ({
    id: item.id,
    tenantId: item.tenantId,
    name: item.name,
    email: item.email,
    role: item.role,
    mailboxAccess: item.mailboxAccess,
    active: item.active,
    mfaEnabled: item.mfaEnabled,
    availability: item.availability
  }));
  return NextResponse.json({ agents });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const role = body?.role === "admin" ? "admin" : "agent";
  const tenant = getTenant(admin.tenantId);
  const allowedMailboxes = tenant?.primaryMailbox === "board" ? ["board"] : ["general"];
  const mailboxAccess = Array.isArray(body?.mailboxAccess)
    ? body.mailboxAccess.filter((mailbox: string) => allowedMailboxes.includes(mailbox))
    : [];
  const password = typeof body?.password === "string" ? body.password : "changeme";
  const validPassword =
    password.length >= 10 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email required" }, { status: 400 });
  }
  if (!validPassword) {
    return NextResponse.json(
      { error: "Password must be 10+ chars with upper, lower, number, and symbol." },
      { status: 400 }
    );
  }

  const agent = {
    id: `agent-${Date.now()}`,
    tenantId: admin.tenantId,
    name,
    email,
    role,
    mailboxAccess: mailboxAccess.length ? mailboxAccess : allowedMailboxes,
    active: true,
    password: hashPassword(password),
    availability: "available",
    mfaEnabled: false
  };

  upsertAgent(agent);
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: admin.tenantId,
    actorId: admin.id,
    action: "agent_created",
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
