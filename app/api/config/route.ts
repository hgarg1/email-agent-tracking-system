import { NextResponse } from "next/server";
import { gmailConfigured, listMailboxesForTenant } from "@/src/lib/gmail";
import { requireAuth } from "@/src/lib/auth";
import { getTenant, getTenantSettings } from "@/src/lib/store";

export async function GET(request: Request) {
  const agent = requireAuth(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = getTenantSettings(agent.tenantId);
  const tenant = getTenant(agent.tenantId);
  const primaryMailbox = tenant?.primaryMailbox ?? "general";
  const mailboxes = listMailboxesForTenant(agent.tenantId);
  return NextResponse.json({
    gmailConfigured: gmailConfigured(),
    tenantId: agent.tenantId,
    aiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
    ai: {
      triage: process.env.AI_TRIAGE_ENABLED === "true" && settings.aiTriageEnabled,
      draft: process.env.AI_DRAFT_ENABLED === "true" && settings.aiDraftEnabled,
      review: process.env.AI_REVIEW_ENABLED === "true" && settings.aiReviewEnabled
    },
    mailboxes,
    primaryMailbox
  });
}
