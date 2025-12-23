import { NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth";
import { upsertAgent } from "@/src/lib/store";

const allowed = ["available", "away", "offline"] as const;

export async function PATCH(request: Request) {
  const agent = requireAuth(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const availability = allowed.includes(body?.availability) ? body.availability : agent.availability;
  upsertAgent({ ...agent, availability });
  return NextResponse.json({ ok: true, availability });
}
