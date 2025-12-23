import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { addAuditEvent, createPasswordReset, getAgent } from "@/src/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = getAgent(params.id);
  if (!agent || agent.tenantId !== admin.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
  createPasswordReset({ token, agentId: agent.id, expiresAt });
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: admin.tenantId,
    actorId: admin.id,
    action: "password_reset_created",
    targetType: "agent",
    targetId: agent.id,
    timestamp: new Date().toISOString()
  });

  return NextResponse.json({ ok: true, token, expiresAt });
}
