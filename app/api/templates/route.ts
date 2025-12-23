import { NextResponse } from "next/server";
import { addAuditEvent, getTenant, readAllTemplates, readTemplates, upsertTemplate } from "@/src/lib/store";
import { isSuperAdmin, requireAuth, requireAdmin } from "@/src/lib/auth";

export async function GET(request: Request) {
  const agent = requireAuth(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (agent.role === "admin" && isSuperAdmin(agent)) {
    return NextResponse.json({ templates: readAllTemplates() });
  }
  return NextResponse.json({ templates: readTemplates(agent.tenantId) });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const tenant = getTenant(admin.tenantId);
  const allowedMailboxes = tenant?.primaryMailbox === "board" ? ["board"] : ["general"];
  const mailbox = allowedMailboxes.includes(body?.mailbox) ? body.mailbox : "all";
  const template = {
    id: `tpl-${Date.now()}`,
    tenantId: admin.tenantId,
    mailbox,
    name: body?.name ?? "New template",
    subject: body?.subject ?? "",
    body: body?.body ?? "",
    signature: body?.signature ?? "",
    blocks: Array.isArray(body?.blocks) ? body.blocks : undefined,
    isBuilder: Boolean(body?.isBuilder)
  };

  upsertTemplate(template);
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: admin.tenantId,
    actorId: admin.id,
    action: "template_created",
    targetType: "template",
    targetId: template.id,
    timestamp: new Date().toISOString()
  });
  return NextResponse.json({ ok: true, template });
}
