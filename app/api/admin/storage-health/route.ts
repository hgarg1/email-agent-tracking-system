import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { getContainerStatus } from "@/src/lib/azure";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await getContainerStatus();
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json({ status: { ok: false } });
  }
}
