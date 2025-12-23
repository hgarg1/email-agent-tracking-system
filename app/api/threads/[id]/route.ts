import { NextResponse } from "next/server";
import { getThread } from "@/src/lib/store";
import { requireAuth } from "@/src/lib/auth";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const agent = requireAuth(_request);
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
  return NextResponse.json({ thread });
}
