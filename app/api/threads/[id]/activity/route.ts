import { NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth";
import { readAudit } from "@/src/lib/store";

export async function GET(request: Request, context: { params: { id: string } }) {
  const agent = requireAuth(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const threadId = context.params.id;
  const events = readAudit(agent.tenantId)
    .filter((event) => event.targetType === "thread" && event.targetId === threadId)
    .slice(0, 20);
  return NextResponse.json({ events });
}
