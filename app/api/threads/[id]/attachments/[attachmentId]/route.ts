import { NextResponse } from "next/server";
import { requireAuthQuery } from "@/src/lib/auth";
import { downloadAttachment } from "@/src/lib/gmail";
import { getThread, upsertThread } from "@/src/lib/store";
import { getAttachmentSasUrl, uploadAttachment } from "@/src/lib/azure";

export async function GET(
  request: Request,
  { params }: { params: { id: string; attachmentId: string } }
) {
  const agent = requireAuthQuery(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thread = getThread(agent.tenantId, params.id);
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!agent.mailboxAccess.includes(thread.mailbox)) {
    return NextResponse.json({ error: "Mailbox access denied" }, { status: 403 });
  }

  const messageIndex = thread.messages.findIndex((message) =>
    message.attachments.some((item) => item.id === params.attachmentId)
  );
  const attachmentIndex =
    messageIndex >= 0
      ? thread.messages[messageIndex].attachments.findIndex((item) => item.id === params.attachmentId)
      : -1;
  const attachment =
    messageIndex >= 0 && attachmentIndex >= 0
      ? thread.messages[messageIndex].attachments[attachmentIndex]
      : undefined;

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  if (attachment.storedUrl) {
    return NextResponse.redirect(attachment.storedUrl);
  }

  const data = await downloadAttachment({
    mailbox: thread.mailbox,
    messageId: attachment.messageId,
    attachmentId: attachment.id
  });

  if (!data) {
    return NextResponse.json({ error: "Attachment unavailable" }, { status: 404 });
  }

  const buffer = Buffer.from(data, "base64");
  const blobName = `${thread.tenantId}/${thread.id}/${attachment.messageId}/${attachment.id}-${attachment.filename}`;
  await uploadAttachment({
    blobName,
    contentType: attachment.mimeType,
    data: buffer
  });
  const signedUrl = getAttachmentSasUrl(blobName);
  thread.messages[messageIndex].attachments[attachmentIndex] = {
    ...attachment,
    storedUrl: signedUrl,
    storedAt: new Date().toISOString()
  };
  upsertThread(thread);
  return NextResponse.redirect(signedUrl);
}
