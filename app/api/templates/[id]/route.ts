import { NextResponse } from "next/server";
import { addAuditEvent, deleteTemplate, getTenant, readTemplates, upsertTemplate } from "@/src/lib/store";
import { requireAdmin } from "@/src/lib/auth";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = readTemplates(admin.tenantId);
  const template = templates.find((tpl) => tpl.id === params.id);
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body?.mailbox === "string") {
    const tenant = getTenant(admin.tenantId);
    const allowedMailboxes = tenant?.primaryMailbox === "board" ? ["board"] : ["general"];
    template.mailbox = allowedMailboxes.includes(body.mailbox) ? body.mailbox : "all";
  }
  if (typeof body?.name === "string") template.name = body.name;
  if (typeof body?.subject === "string") template.subject = body.subject;
  if (typeof body?.body === "string") template.body = body.body;
  if (typeof body?.signature === "string") template.signature = body.signature;
  if (Array.isArray(body?.blocks)) template.blocks = body.blocks;
  if (typeof body?.isBuilder === "boolean") template.isBuilder = body.isBuilder;

  upsertTemplate(template);
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: admin.tenantId,
    actorId: admin.id,
    action: "template_updated",
    targetType: "template",
    targetId: template.id,
    timestamp: new Date().toISOString()
  });
  return NextResponse.json({ ok: true, template });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const templates = readTemplates(admin.tenantId);
  const template = templates.find((tpl) => tpl.id === params.id);
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  deleteTemplate(params.id);
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: admin.tenantId,
    actorId: admin.id,
    action: "template_deleted",
    targetType: "template",
    targetId: params.id,
    timestamp: new Date().toISOString()
  });
  return NextResponse.json({ ok: true });
}
