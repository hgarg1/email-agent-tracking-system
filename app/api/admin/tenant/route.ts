import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { getTenant, updateTenant } from "@/src/lib/store";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenant = getTenant(admin.tenantId);
  return NextResponse.json({ tenant });
}

export async function PATCH(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const tenant = getTenant(admin.tenantId);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  const allowedMailboxes = ["board", "general", "lsi", "cytos"];
  const next = {
    ...tenant,
    name: typeof body?.name === "string" ? body.name : tenant.name,
    primaryMailbox: allowedMailboxes.includes(body?.primaryMailbox)
      ? body.primaryMailbox
      : tenant.primaryMailbox
  };
  updateTenant(next);
  return NextResponse.json({ ok: true, tenant: next });
}
