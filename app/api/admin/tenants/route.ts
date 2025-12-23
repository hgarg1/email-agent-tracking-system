import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { createTenant, listTenants } from "@/src/lib/store";

const normalizeId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenants = listTenants();
  return NextResponse.json({ tenants });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const rawId = typeof body?.id === "string" ? body.id.trim() : "";
  const allowedMailboxes = ["board", "general", "lsi", "cytos"];
  const primaryMailbox = allowedMailboxes.includes(body?.primaryMailbox) ? body.primaryMailbox : "general";
  const id = rawId ? normalizeId(rawId) : normalizeId(name);

  if (!name || !id) {
    return NextResponse.json({ error: "Tenant name and id required" }, { status: 400 });
  }

  try {
    createTenant({ id, name, primaryMailbox });
  } catch (error) {
    return NextResponse.json({ error: "Tenant already exists" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, tenant: { id, name, primaryMailbox } });
}
