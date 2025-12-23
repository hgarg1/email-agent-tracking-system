import { NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth";
import { listRoutingRules } from "@/src/lib/store";

export async function GET(request: Request) {
  const agent = requireAuth(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rules = listRoutingRules(agent.tenantId);
  return NextResponse.json({ rules });
}
