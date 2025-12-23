import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { listMailboxStates } from "@/src/lib/store";

export async function GET(request: Request) {
  const agent = requireAdmin(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const states = listMailboxStates(agent.tenantId);
  return NextResponse.json({ states });
}
