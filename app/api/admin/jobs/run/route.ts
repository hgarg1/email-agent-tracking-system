import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { getThread, listJobs, updateJob } from "@/src/lib/store";
import { draftReply, reviewOutboundEmail, triageInboundEmail } from "@/src/ai/llmService";
import { fullSyncMailbox, syncMailboxHistory } from "@/src/lib/gmail";

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = typeof body?.limit === "number" ? body.limit : 3;
  const jobs = listJobs(admin.tenantId, "queued").slice(0, limit);

  for (const job of jobs) {
    job.status = "running";
    job.updatedAt = new Date().toISOString();
    updateJob(job);
    try {
      if (job.type === "sync") {
        const mailbox = job.payload.mailbox as "board" | "general";
        const mode = job.payload.mode as "incremental" | "full";
        if (mode === "full") {
          await fullSyncMailbox(mailbox);
        } else {
          await syncMailboxHistory(mailbox);
        }
      }
      if (job.type === "ai_retry") {
        const threadId = job.payload.threadId;
        const action = job.payload.action as "triage" | "draft" | "review";
        if (threadId) {
          const thread = getThread(admin.tenantId, threadId);
          if (thread) {
            const lastMessage = thread.messages[thread.messages.length - 1];
            if (action === "triage" && lastMessage) {
              await triageInboundEmail({
                subject: lastMessage.subject,
                bodyText: lastMessage.bodyText,
                from: lastMessage.from,
                tenantId: admin.tenantId
              });
            }
            if (action === "draft" && lastMessage) {
              await draftReply({
                subject: thread.subject,
                lastMessage: lastMessage.bodyText,
                mailbox: thread.mailbox,
                tenantId: admin.tenantId
              });
            }
            if (action === "review") {
              const reviewBody =
                job.payload.body ?? thread.messages[thread.messages.length - 1]?.bodyText ?? "";
              await reviewOutboundEmail({
                subject: thread.subject,
                body: reviewBody,
                mailbox: thread.mailbox,
                tenantId: admin.tenantId
              });
            }
          }
        }
      }
      job.status = "completed";
      job.updatedAt = new Date().toISOString();
      updateJob(job);
    } catch (error) {
      job.status = "failed";
      job.attempts += 1;
      job.lastError = String(error);
      job.updatedAt = new Date().toISOString();
      updateJob(job);
    }
  }

  return NextResponse.json({ ok: true, processed: jobs.length });
}
