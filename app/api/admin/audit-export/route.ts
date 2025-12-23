import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { readAudit } from "@/src/lib/store";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const events = readAudit(admin.tenantId);
  return new NextResponse(JSON.stringify({ events }, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="audit-${admin.tenantId}.json"`
    }
  });
}
