import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { listQueueBuckets, listRoutingRules, upsertQueueBuckets, upsertRoutingRules } from "@/src/lib/store";
import type { QueueBucket, RoutingRule, TriageCategory } from "@/src/lib/types";

const categories: TriageCategory[] = [
  "billing",
  "bug",
  "account",
  "feature",
  "legal",
  "partnership",
  "other"
];

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rules = listRoutingRules(admin.tenantId);
  const buckets = listQueueBuckets(admin.tenantId);
  return NextResponse.json({ rules, buckets });
}

export async function PATCH(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const payload = Array.isArray(body?.rules) ? body.rules : [];
  const bucketPayload = Array.isArray(body?.buckets) ? body.buckets : [];
  const rules = payload
    .filter((rule: RoutingRule) => categories.includes(rule.category))
    .map((rule: RoutingRule) => ({
      tenantId: admin.tenantId,
      category: rule.category,
      queue: typeof rule.queue === "string" && rule.queue.trim() ? rule.queue.trim() : "General"
    }));
  upsertRoutingRules(admin.tenantId, rules);
  if (bucketPayload.length) {
    const buckets = bucketPayload
      .map((bucket: QueueBucket) => ({
        tenantId: admin.tenantId,
        name: String(bucket.name ?? "").trim() || "General",
        slaHours: Number(bucket.slaHours ?? 24),
        fallback: Boolean(bucket.fallback),
        keywords: Array.isArray(bucket.keywords) ? bucket.keywords : [],
        notifyEmails: Array.isArray(bucket.notifyEmails) ? bucket.notifyEmails : [],
        slackWebhook: bucket.slackWebhook ? String(bucket.slackWebhook) : undefined,
        quietHoursStart: bucket.quietHoursStart ? String(bucket.quietHoursStart) : undefined,
        quietHoursEnd: bucket.quietHoursEnd ? String(bucket.quietHoursEnd) : undefined,
        maxOpenPerAgent:
          bucket.maxOpenPerAgent !== undefined ? Number(bucket.maxOpenPerAgent) : undefined,
        allowedAvailability: Array.isArray(bucket.allowedAvailability)
          ? bucket.allowedAvailability
          : ["available"]
      }))
      .filter((bucket) => bucket.name);
    const fallbackIndex = buckets.findIndex((bucket) => bucket.fallback);
    if (fallbackIndex === -1 && buckets.length) {
      buckets[0].fallback = true;
    }
    if (fallbackIndex > -1) {
      buckets.forEach((bucket, index) => {
        bucket.fallback = index === fallbackIndex;
      });
    }
    upsertQueueBuckets(admin.tenantId, buckets);
  }
  return NextResponse.json({
    ok: true,
    rules: listRoutingRules(admin.tenantId),
    buckets: listQueueBuckets(admin.tenantId)
  });
}
