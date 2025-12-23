import { NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth";
import { getTenantTheme } from "@/src/lib/store";
import { renderEmail } from "@/src/lib/emailBuilder";
import { EmailBlock } from "@/src/lib/types";

export async function POST(request: Request) {
  const agent = requireAuth(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const blocks = Array.isArray(body?.blocks) ? (body.blocks as EmailBlock[]) : [];
  if (!blocks.length) {
    return NextResponse.json({ error: "Blocks required" }, { status: 400 });
  }
  const theme = getTenantTheme(agent.tenantId);
  const rendered = renderEmail(blocks, theme);
  return NextResponse.json(rendered);
}
