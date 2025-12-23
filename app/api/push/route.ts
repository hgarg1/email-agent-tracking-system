import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { resolveMailboxFromEmail, syncMailboxHistory } from "@/src/lib/gmail";
import { rateLimit } from "@/src/lib/rate-limit";

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limiter = rateLimit(`pubsub:${ip}`, 60, 60_000);
  if (!limiter.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const secret = process.env.GMAIL_WEBHOOK_SECRET;
  if (secret) {
    const header = request.headers.get("x-webhook-secret");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const expectedAud = process.env.GMAIL_PUBSUB_JWT_AUDIENCE;
  const authHeader = request.headers.get("authorization");
  if (expectedAud && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const client = new OAuth2Client();
    try {
      await client.verifyIdToken({ idToken: token, audience: expectedAud });
    } catch (error) {
      return NextResponse.json({ error: "Invalid JWT" }, { status: 401 });
    }
  } else if (expectedAud) {
    return NextResponse.json({ error: "Missing JWT" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const data = body?.message?.data;

  if (!data) {
    return NextResponse.json({ error: "Missing Pub/Sub payload" }, { status: 400 });
  }

  try {
    const decoded = Buffer.from(data, "base64").toString("utf8");
    const payload = JSON.parse(decoded);
    const mailbox = resolveMailboxFromEmail(payload?.emailAddress);
    const historyId = payload?.historyId ? String(payload.historyId) : undefined;

    if (!mailbox) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    await syncMailboxHistory(mailbox, historyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
