import { NextResponse } from "next/server";
import { getAgent, getPasswordReset, markPasswordResetUsed, upsertAgent } from "@/src/lib/store";
import { hashPassword } from "@/src/lib/passwords";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!token || !password) {
    return NextResponse.json({ error: "Token and password required" }, { status: 400 });
  }

  const reset = getPasswordReset(token);
  if (!reset || reset.usedAt) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }
  if (Date.parse(reset.expiresAt) < Date.now()) {
    return NextResponse.json({ error: "Token expired" }, { status: 400 });
  }

  const agent = getAgent(reset.agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  agent.password = hashPassword(password);
  upsertAgent(agent);
  markPasswordResetUsed(token);
  return NextResponse.json({ ok: true });
}
