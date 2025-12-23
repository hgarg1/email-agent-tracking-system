import { NextResponse } from "next/server";
import { readAudit } from "@/src/lib/store";
import { requireAdmin } from "@/src/lib/auth";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ events: readAudit(admin.tenantId) });
}
