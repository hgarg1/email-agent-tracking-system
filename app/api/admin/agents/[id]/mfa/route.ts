import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAdmin } from "@/src/lib/auth";
import { getAgent, upsertAgent } from "@/src/lib/store";
import { generateTotpSecret } from "@/src/lib/mfa";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = getAgent(params.id);
  if (!agent || agent.tenantId !== admin.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = generateTotpSecret(agent.email);
  agent.mfaEnabled = true;
  agent.mfaSecret = secret.base32;
  upsertAgent(agent);

  const qr = await QRCode.toDataURL(secret.otpauth_url ?? "");
  return NextResponse.json({
    ok: true,
    secret: secret.base32,
    otpauth: secret.otpauth_url,
    qr
  });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = getAgent(params.id);
  if (!agent || agent.tenantId !== admin.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  agent.mfaEnabled = false;
  agent.mfaSecret = undefined;
  upsertAgent(agent);
  return NextResponse.json({ ok: true });
}
