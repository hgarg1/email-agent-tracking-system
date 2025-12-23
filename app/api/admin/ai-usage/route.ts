import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { getAiUsageSummary, listAiUsage } from "@/src/lib/store";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = getAiUsageSummary(admin.tenantId);
  const events = listAiUsage(admin.tenantId, 20);
  return NextResponse.json({ summary, events });
}
