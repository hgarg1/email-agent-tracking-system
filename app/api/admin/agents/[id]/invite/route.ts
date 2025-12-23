import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { addAuditEvent, createPasswordReset, getAgent, getTenant, getTenantTheme } from "@/src/lib/store";
import { gmailConfigured, isMailboxId, listMailboxesForTenant, sendOutboundEmail } from "@/src/lib/gmail";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = getAgent(params.id);
  if (!agent || agent.tenantId !== admin.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
  createPasswordReset({ token, agentId: agent.id, expiresAt });

  const origin = new URL(request.url).origin;
  const link = `${origin}/reset?token=${token}`;
  const tenant = getTenant(agent.tenantId);
  const theme = getTenantTheme(agent.tenantId);
  const primaryMailbox = tenant?.primaryMailbox ?? "general";
  const mailbox = isMailboxId(primaryMailbox)
    ? primaryMailbox
    : listMailboxesForTenant(agent.tenantId)[0]?.id ?? "general";
  const subject = `You're invited to ${tenant?.name ?? "Dream-X Orchestrator"}`;
  const text = `Hi ${agent.name},\n\nYou're invited to ${tenant?.name ?? "Dream-X Orchestrator"}. Confirm your account and set a secure password here:\n${link}\n\nThis link expires in 30 minutes.`;
  const brandColor = theme.primaryColor ?? "#0ea5e9";
  const accentColor = theme.accentColor ?? "#14b8a6";
  const html = `
    <div style="font-family: Arial, sans-serif; background:#f8fafc; padding:32px;">
      <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:18px; border:1px solid #e2e8f0; overflow:hidden;">
        <div style="padding:18px 24px; background:linear-gradient(120deg, ${brandColor}, ${accentColor}); color:#ffffff;">
          <strong style="font-size:16px;">${tenant?.name ?? "Dream-X Orchestrator"}</strong>
          <div style="font-size:12px; opacity:0.85;">Agent onboarding</div>
        </div>
        <div style="padding:24px; color:#0f172a;">
          <h2 style="margin:0 0 12px; font-size:22px;">You're invited, ${agent.name}</h2>
          <p style="margin:0 0 16px; line-height:1.6;">
            Confirm your account and set a secure password to start working in the inbox.
          </p>
          <a href="${link}" style="display:inline-block; padding:12px 18px; border-radius:999px; background:${brandColor}; color:#ffffff; text-decoration:none; font-weight:600;">
            Accept invite
          </a>
          <p style="margin:18px 0 0; font-size:12px; color:#64748b;">
            This invite link expires in 30 minutes. If you did not expect this email, you can ignore it.
          </p>
        </div>
      </div>
    </div>
  `;

  try {
    const sent = await sendOutboundEmail({
      mailbox,
      to: agent.email,
      subject,
      body: text,
      bodyHtml: html
    });
    const status = gmailConfigured() ? "sent" : "mock";
    addAuditEvent({
      id: `audit-${Date.now()}`,
      tenantId: admin.tenantId,
      actorId: admin.id,
      action: "invite_email_sent",
      targetType: "agent",
      targetId: agent.id,
      timestamp: new Date().toISOString(),
      metadata: {
        mailbox,
        messageId: sent.id ?? "unknown",
        provider: gmailConfigured() ? "gmail" : "mock",
        status
      }
    });
    return NextResponse.json({
      ok: true,
      status,
      messageId: sent.id ?? null,
      link,
      expiresAt
    });
  } catch (error) {
    addAuditEvent({
      id: `audit-${Date.now()}`,
      tenantId: admin.tenantId,
      actorId: admin.id,
      action: "invite_email_failed",
      targetType: "agent",
      targetId: agent.id,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        link,
        expiresAt
      },
      { status: 500 }
    );
  }
}
