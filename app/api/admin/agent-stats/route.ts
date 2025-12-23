import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { getAgentWorkload } from "@/src/lib/store";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const assignedCounts = getAgentWorkload(admin.tenantId);
  return NextResponse.json({ assignedCounts });
}
