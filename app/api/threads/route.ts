import { NextResponse } from "next/server";
import { listSummaries } from "@/src/lib/store";
import { requireAuth } from "@/src/lib/auth";

export async function GET(request: Request) {
  const agent = requireAuth(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const status = url.searchParams.get("status");
  const mailbox = url.searchParams.get("mailbox");
  const assignedTo = url.searchParams.get("assignedTo");
  const tag = url.searchParams.get("tag");
  const priority = url.searchParams.get("priority");

  let threads = listSummaries(agent.tenantId).filter((thread) =>
    agent.mailboxAccess.includes(thread.mailbox)
  );

  if (mailbox) {
    threads = threads.filter((thread) => thread.mailbox === mailbox);
  }
  if (status) {
    threads = threads.filter((thread) => thread.status === status);
  }
  if (assignedTo) {
    if (assignedTo === "unassigned") {
      threads = threads.filter((thread) => !thread.assignedTo);
    } else {
      threads = threads.filter((thread) => thread.assignedTo === assignedTo);
    }
  }
  if (priority) {
    threads = threads.filter((thread) => thread.priority === priority);
  }
  if (tag) {
    threads = threads.filter((thread) => thread.tags.includes(tag));
  }
  if (q) {
    threads = threads.filter((thread) => {
      const haystack = [thread.subject, thread.snippet, thread.participants.join(" ")].join(" ");
      return haystack.toLowerCase().includes(q);
    });
  }

  return NextResponse.json({ threads });
}
