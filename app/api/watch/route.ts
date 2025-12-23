import { NextResponse } from "next/server";
import { isMailboxId, resolveTenantFromMailbox, watchMailbox } from "@/src/lib/gmail";
import { MailboxId } from "@/src/lib/types";
import { requireAdmin } from "@/src/lib/auth";

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const mailboxValue = typeof body?.mailbox === "string" ? body.mailbox : "";
  if (!mailboxValue || !isMailboxId(mailboxValue)) {
    return NextResponse.json({ error: "mailbox must be a known mailbox id" }, { status: 400 });
  }
  const mailbox = mailboxValue as MailboxId;

  if (resolveTenantFromMailbox(mailbox) !== admin.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (!admin.mailboxAccess.includes(mailbox)) {
    return NextResponse.json({ error: "Mailbox access denied" }, { status: 403 });
  }

  const response = await watchMailbox(mailbox);
  return NextResponse.json({ ok: true, watch: response });
}
