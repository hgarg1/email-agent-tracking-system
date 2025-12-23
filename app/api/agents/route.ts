import { NextResponse } from "next/server";
import { readAgents } from "@/src/lib/store";
import { requireAuth } from "@/src/lib/auth";

export async function GET(request: Request) {
  const agent = requireAuth(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agents = readAgents(agent.tenantId).filter((item) => item.active);
  return NextResponse.json({
    agents: agents.map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      role: item.role,
      mailboxAccess: item.mailboxAccess,
      tenantId: item.tenantId,
      availability: item.availability
    }))
  });
}
