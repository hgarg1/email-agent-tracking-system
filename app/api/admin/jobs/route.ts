import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { enqueueJob, listJobs } from "@/src/lib/store";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const jobs = listJobs(admin.tenantId);
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const type = body?.type === "sync" ? "sync" : "ai_retry";
  const payload = typeof body?.payload === "object" ? body.payload : {};
  const job = {
    id: `job-${Date.now()}`,
    tenantId: admin.tenantId,
    type,
    payload,
    status: "queued",
    attempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  enqueueJob(job);
  return NextResponse.json({ ok: true, job });
}
