import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { addAuditEvent, getTenantSettings, upsertTenantSettings } from "@/src/lib/store";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ settings: getTenantSettings(admin.tenantId) });
}

export async function PATCH(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const current = getTenantSettings(admin.tenantId);
  const settings = {
    tenantId: admin.tenantId,
    aiTriageEnabled: typeof body?.aiTriageEnabled === "boolean" ? body.aiTriageEnabled : current.aiTriageEnabled,
    aiDraftEnabled: typeof body?.aiDraftEnabled === "boolean" ? body.aiDraftEnabled : current.aiDraftEnabled,
    aiReviewEnabled: typeof body?.aiReviewEnabled === "boolean" ? body.aiReviewEnabled : current.aiReviewEnabled,
    retentionDays:
      typeof body?.retentionDays === "number" && body.retentionDays > 0
        ? Math.round(body.retentionDays)
        : current.retentionDays
  };

  upsertTenantSettings(settings);
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: admin.tenantId,
    actorId: admin.id,
    action: "tenant_settings_updated",
    targetType: "tenant_settings",
    targetId: admin.tenantId,
    timestamp: new Date().toISOString()
  });

  return NextResponse.json({ ok: true, settings });
}
