import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { addAuditEvent, getTenantTheme, upsertTenantTheme } from "@/src/lib/store";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const theme = getTenantTheme(admin.tenantId);
  return NextResponse.json({ theme });
}

export async function PATCH(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const theme = {
    tenantId: admin.tenantId,
    brandName: body?.brandName ?? "Tenant",
    logoUrl: body?.logoUrl ?? "",
    primaryColor: body?.primaryColor ?? "#0ea5e9",
    accentColor: body?.accentColor ?? "#14b8a6",
    backgroundColor: body?.backgroundColor ?? "#ffffff",
    textColor: body?.textColor ?? "#0f172a"
  };
  upsertTenantTheme(theme);
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: admin.tenantId,
    actorId: admin.id,
    action: "theme_updated",
    targetType: "tenant_theme",
    targetId: admin.tenantId,
    timestamp: new Date().toISOString()
  });
  return NextResponse.json({ ok: true, theme });
}
