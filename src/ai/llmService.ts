import OpenAI from "openai";
import { addAiUsage } from "@/src/lib/store";

let client: OpenAI | null = null;

type TriageResult = {
  category: "billing" | "bug" | "account" | "feature" | "legal" | "partnership" | "other";
  urgency: "P0" | "P1" | "P2" | "P3";
  sentiment: "angry" | "neutral" | "positive";
  suggestedQueue: string;
  confidence: number;
};

type DraftResult = {
  subject?: string;
  body: string;
  tone: "friendly" | "professional" | "firm";
  disclaimers?: string[];
};

type ReviewResult = {
  okToSend: boolean;
  issues: string[];
  recommendedEdits?: string[];
};

const triageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      enum: ["billing", "bug", "account", "feature", "legal", "partnership", "other"]
    },
    urgency: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
    sentiment: { type: "string", enum: ["angry", "neutral", "positive"] },
    suggestedQueue: { type: "string" },
    confidence: { type: "number" }
  },
  required: ["category", "urgency", "sentiment", "suggestedQueue", "confidence"]
};

const draftSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    tone: { type: "string", enum: ["friendly", "professional", "firm"] },
    disclaimers: { type: "array", items: { type: "string" } }
  },
  required: ["body", "tone"]
};

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    okToSend: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
    recommendedEdits: { type: "array", items: { type: "string" } }
  },
  required: ["okToSend", "issues"]
};

function redactSecrets(text: string) {
  return text
    .replace(/(api[_-]?key|token|password|secret)\\s*[:=]\\s*\\S+/gi, "$1:[redacted]")
    .replace(/bearer\\s+[a-z0-9\\-\\._~\\+\\/]+=*/gi, "Bearer [redacted]")
    .replace(/\\bsk-[a-z0-9]{10,}\\b/gi, "sk-[redacted]");
}

function stripQuoted(text: string) {
  const lines = text.split("\\n");
  const filtered = lines.filter(
    (line) =>
      !line.trim().startsWith(">") &&
      !line.trim().match(/^on\\s.+wrote:$/i) &&
      !line.trim().match(/^from:\\s/i) &&
      !line.trim().match(/^sent:\\s/i) &&
      !line.trim().match(/^to:\\s/i) &&
      !line.trim().match(/^subject:\\s/i)
  );
  return filtered.join("\\n").split("\\n--\\s*\\n")[0];
}

function minimize(text: string) {
  return redactSecrets(stripQuoted(text)).slice(0, 4000);
}

async function callJson<T>(params: {
  system: string;
  user: string;
  schema: object;
  name: string;
  tenantId: string;
  action: "triage" | "draft" | "review";
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!client) {
    client = new OpenAI({ apiKey });
  }
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: params.name,
        schema: params.schema,
        strict: true
      }
    }
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const usage = response.usage;
  const inputCost = Number(process.env.OPENAI_COST_PER_1M_INPUT ?? "5");
  const outputCost = Number(process.env.OPENAI_COST_PER_1M_OUTPUT ?? "15");
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const costUsd =
    (promptTokens / 1_000_000) * inputCost + (completionTokens / 1_000_000) * outputCost;
  addAiUsage({
    id: `ai-${Date.now()}`,
    tenantId: params.tenantId as any,
    action: params.action,
    model: "gpt-4o",
    promptTokens,
    completionTokens,
    costUsd,
    createdAt: new Date().toISOString()
  });
  return JSON.parse(content) as T;
}

export async function triageInboundEmail(input: {
  subject: string;
  bodyText: string;
  from: string;
  tenantId: string;
}) {
  const user = JSON.stringify({
    subject: minimize(input.subject),
    from: minimize(input.from),
    body: minimize(input.bodyText)
  });
  return callJson<TriageResult>({
    system:
      "You classify inbound support emails. Provide a category, urgency, sentiment, suggestedQueue, and confidence.",
    user,
    schema: triageSchema,
    name: "TriageResult",
    tenantId: input.tenantId,
    action: "triage"
  });
}

export async function draftReply(context: {
  subject: string;
  lastMessage: string;
  customerName?: string;
  mailbox: string;
  tenantId: string;
}) {
  const user = JSON.stringify({
    subject: minimize(context.subject),
    mailbox: context.mailbox,
    customerName: context.customerName,
    lastMessage: minimize(context.lastMessage)
  });
  return callJson<DraftResult>({
    system:
      "You draft replies for support agents. Keep it concise, accurate, and human-in-the-loop. Do not claim actions were taken.",
    user,
    schema: draftSchema,
    name: "DraftResult",
    tenantId: context.tenantId,
    action: "draft"
  });
}

export async function reviewOutboundEmail(draft: {
  subject: string;
  body: string;
  mailbox: string;
  tenantId: string;
}) {
  const user = JSON.stringify({
    subject: minimize(draft.subject),
    mailbox: draft.mailbox,
    body: minimize(draft.body)
  });
  return callJson<ReviewResult>({
    system:
      "You review outbound emails for risk, compliance, and tone. Flag any issues and suggest edits.",
    user,
    schema: reviewSchema,
    name: "ReviewResult",
    tenantId: draft.tenantId,
    action: "review"
  });
}
