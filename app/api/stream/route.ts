import { listSummaries } from "@/src/lib/store";
import { requireAuthQuery } from "@/src/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const agent = requireAuthQuery(request);
  if (!agent) {
    return new Response("Unauthorized", { status: 401 });
  }
  const encoder = new TextEncoder();
  let summaryInterval: ReturnType<typeof setInterval> | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const pushSummaries = () => {
        const threads = listSummaries(agent.tenantId).filter((thread) =>
          agent.mailboxAccess.includes(thread.mailbox)
        );
        const payload = JSON.stringify({
          threads,
          ts: Date.now()
        });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };

      pushSummaries();
      summaryInterval = setInterval(pushSummaries, 5000);
      pingInterval = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
      }, 15000);
    },
    cancel() {
      if (summaryInterval) clearInterval(summaryInterval);
      if (pingInterval) clearInterval(pingInterval);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
