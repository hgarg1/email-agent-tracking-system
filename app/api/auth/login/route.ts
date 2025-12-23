import { NextResponse } from "next/server";
import { authenticate, authenticateMfa, createSession, isSuperAdmin } from "@/src/lib/auth";
import { addAuditEvent } from "@/src/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const mfaCode = typeof body?.mfaCode === "string" ? body.mfaCode.trim() : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const agent = authenticate(email, password);
  if (!agent) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  if (agent.mfaEnabled && !mfaCode) {
    return NextResponse.json({ error: "MFA required" }, { status: 401 });
  }
  if (agent.mfaEnabled && !authenticateMfa(agent, mfaCode)) {
    return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
  }

  const token = createSession(agent);
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: agent.tenantId,
    actorId: agent.id,
    action: "login",
    targetType: "session",
    timestamp: new Date().toISOString(),
    metadata: { email: agent.email }
  });
  return NextResponse.json({
    token,
    agent: {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
      mailboxAccess: agent.mailboxAccess,
      tenantId: agent.tenantId,
      availability: agent.availability,
      isSuperAdmin: isSuperAdmin(agent)
    }
  });
}
