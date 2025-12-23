import { NextResponse } from "next/server";
import { isSuperAdmin, requireAuthWithSession, rotateSession } from "@/src/lib/auth";

export async function GET(request: Request) {
  const sessionInfo = requireAuthWithSession(request);
  if (!sessionInfo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { agent, session, token } = sessionInfo;
  const createdAt = Date.parse(session.createdAt);
  const rotationMs = 1000 * 60 * 60 * 12;
  let newToken: string | null = null;
  if (!Number.isNaN(createdAt) && Date.now() - createdAt > rotationMs) {
    newToken = rotateSession(token, agent);
  }
  return NextResponse.json({
    token: newToken ?? undefined,
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
