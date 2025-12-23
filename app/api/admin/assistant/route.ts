import OpenAI from "openai";
import { NextResponse } from "next/server";
import { hashPassword } from "@/src/lib/passwords";
import { isSuperAdmin, requireAdmin } from "@/src/lib/auth";
import type { Agent } from "@/src/lib/types";
import {
  addAuditEvent,
  getAiUsageSummary,
  getAgent,
  getTenant,
  getTenantSettings,
  getTenantTheme,
  listAiUsage,
  listJobs,
  listMailboxStates,
  listRoutingRules,
  listTenants,
  readAgents,
  readAudit,
  readTemplates,
  upsertAgent,
  upsertRoutingRules,
  upsertTemplate,
  upsertTenantSettings,
  upsertTenantTheme,
  updateTenant,
  deleteAgent,
  deleteTemplate,
  createTenant
} from "@/src/lib/store";
import { getContainerStatus } from "@/src/lib/azure";
import { listMailboxesForTenant } from "@/src/lib/gmail";
import { renderEmail } from "@/src/lib/emailBuilder";

type Message = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string };

const passwordRules = (value: string) =>
  value.length >= 10 &&
  /[a-z]/.test(value) &&
  /[A-Z]/.test(value) &&
  /[0-9]/.test(value) &&
  /[^A-Za-z0-9]/.test(value);

const baseTools = [
  {
    type: "function",
    function: {
      name: "listAgents",
      description: "List agents for the current tenant.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "createAgent",
      description: "Create an agent with mailbox access and password.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          role: { type: "string", enum: ["agent", "admin"] },
          mailboxAccess: { type: "array", items: { type: "string" } },
          password: { type: "string" },
          availability: { type: "string", enum: ["available", "away", "offline"] }
        },
        required: ["name", "email", "password"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "updateAgent",
      description: "Update an agent in the current tenant.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          role: { type: "string", enum: ["agent", "admin"] },
          mailboxAccess: { type: "array", items: { type: "string" } },
          active: { type: "boolean" },
          availability: { type: "string", enum: ["available", "away", "offline"] },
          password: { type: "string" }
        },
        required: ["id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "deleteAgent",
      description: "Delete an agent from the current tenant.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }
    }
  },
  {
    type: "function",
    function: {
      name: "listTemplates",
      description: "List templates for the current tenant.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "createTemplate",
      description: "Create a template for the current tenant.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          mailbox: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          signature: { type: "string" },
          blocks: { type: "array" },
          isBuilder: { type: "boolean" }
        },
        required: ["name", "subject"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "updateTemplate",
      description: "Update a template for the current tenant.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          mailbox: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          signature: { type: "string" },
          blocks: { type: "array" },
          isBuilder: { type: "boolean" }
        },
        required: ["id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "deleteTemplate",
      description: "Delete a template by id.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }
    }
  },
  {
    type: "function",
    function: {
      name: "updateTenant",
      description: "Update the current tenant's name or primary mailbox.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          primaryMailbox: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "listRoutingRules",
      description: "List routing rules for the current tenant.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "updateRoutingRules",
      description: "Update routing rules for the current tenant.",
      parameters: {
        type: "object",
        properties: {
          rules: { type: "array", items: { type: "object" } }
        },
        required: ["rules"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "updateSettings",
      description: "Update AI settings and retention days for the current tenant.",
      parameters: {
        type: "object",
        properties: {
          aiTriageEnabled: { type: "boolean" },
          aiDraftEnabled: { type: "boolean" },
          aiReviewEnabled: { type: "boolean" },
          retentionDays: { type: "number" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "updateTheme",
      description: "Update brand theme for the current tenant.",
      parameters: {
        type: "object",
        properties: {
          brandName: { type: "string" },
          logoUrl: { type: "string" },
          primaryColor: { type: "string" },
          accentColor: { type: "string" },
          backgroundColor: { type: "string" },
          textColor: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "listJobs",
      description: "List recent jobs for the current tenant.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getAiUsage",
      description: "Get AI usage summary and recent events.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getStorageHealth",
      description: "Check Azure attachment storage health.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getMailboxStatus",
      description: "Get mailbox sync status for the current tenant.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "exportAudit",
      description: "Return recent audit events for the current tenant.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "renderPreview",
      description: "Render email preview HTML/text from blocks.",
      parameters: { type: "object", properties: { blocks: { type: "array" } }, required: ["blocks"] }
    }
  }
];

const superAdminTools = [
  {
    type: "function",
    function: {
      name: "listTenants",
      description: "List all tenants (super admin only).",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "createTenant",
      description: "Create a new tenant.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          primaryMailbox: { type: "string" }
        },
        required: ["id", "name"]
      }
    }
  }
];

async function runTool(admin: Agent, name: string, args: any) {
  const adminTenantId = admin.tenantId;
  const superAdmin = isSuperAdmin(admin);
  switch (name) {
    case "listAgents": {
      return readAgents(adminTenantId).map((agent) => ({
        id: agent.id,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        mailboxAccess: agent.mailboxAccess,
        active: agent.active,
        availability: agent.availability
      }));
    }
    case "createAgent": {
      const password = String(args.password ?? "");
      if (!passwordRules(password)) {
        throw new Error("Password must be 10+ chars with upper, lower, number, and symbol.");
      }
      const agent = {
        id: `agent-${Date.now()}`,
        tenantId: adminTenantId,
        name: String(args.name ?? "").trim(),
        email: String(args.email ?? "").trim(),
        role: args.role === "admin" ? "admin" : "agent",
        mailboxAccess: Array.isArray(args.mailboxAccess) ? args.mailboxAccess : [],
        active: true,
        password: hashPassword(password),
        availability: args.availability === "away" ? "away" : args.availability === "offline" ? "offline" : "available",
        mfaEnabled: false
      };
      upsertAgent(agent);
      addAuditEvent({
        id: `audit-${Date.now()}`,
        tenantId: adminTenantId,
        actorId: agent.id,
        action: "agent_created",
        targetType: "agent",
        targetId: agent.id,
        timestamp: new Date().toISOString()
      });
      return { id: agent.id, email: agent.email };
    }
    case "updateAgent": {
      const agent = getAgent(String(args.id));
      if (!agent || agent.tenantId !== adminTenantId) {
        throw new Error("Agent not found.");
      }
      if (typeof args.name === "string") agent.name = args.name;
      if (typeof args.email === "string") agent.email = args.email;
      if (typeof args.role === "string") agent.role = args.role === "admin" ? "admin" : "agent";
      if (Array.isArray(args.mailboxAccess)) agent.mailboxAccess = args.mailboxAccess;
      if (typeof args.active === "boolean") agent.active = args.active;
      if (typeof args.availability === "string") {
        agent.availability =
          args.availability === "away" ? "away" : args.availability === "offline" ? "offline" : "available";
      }
      if (typeof args.password === "string" && args.password) {
        if (!passwordRules(args.password)) {
          throw new Error("Password must be 10+ chars with upper, lower, number, and symbol.");
        }
        agent.password = hashPassword(args.password);
      }
      upsertAgent(agent);
      return { ok: true };
    }
    case "deleteAgent": {
      deleteAgent(String(args.id));
      return { ok: true };
    }
    case "listTemplates": {
      return readTemplates(adminTenantId);
    }
    case "createTemplate": {
      const template = {
        id: `tpl-${Date.now()}`,
        tenantId: adminTenantId,
        mailbox: typeof args.mailbox === "string" ? args.mailbox : "all",
        name: String(args.name ?? "New template"),
        subject: String(args.subject ?? ""),
        body: String(args.body ?? ""),
        signature: String(args.signature ?? ""),
        blocks: Array.isArray(args.blocks) ? args.blocks : undefined,
        isBuilder: Boolean(args.isBuilder)
      };
      upsertTemplate(template);
      return { id: template.id };
    }
    case "updateTemplate": {
      const templates = readTemplates(adminTenantId);
      const template = templates.find((tpl) => tpl.id === String(args.id));
      if (!template) throw new Error("Template not found.");
      if (typeof args.name === "string") template.name = args.name;
      if (typeof args.mailbox === "string") template.mailbox = args.mailbox;
      if (typeof args.subject === "string") template.subject = args.subject;
      if (typeof args.body === "string") template.body = args.body;
      if (typeof args.signature === "string") template.signature = args.signature;
      if (Array.isArray(args.blocks)) template.blocks = args.blocks;
      if (typeof args.isBuilder === "boolean") template.isBuilder = args.isBuilder;
      upsertTemplate(template);
      return { ok: true };
    }
    case "deleteTemplate": {
      deleteTemplate(String(args.id));
      return { ok: true };
    }
    case "listTenants": {
      if (!superAdmin) {
        throw new Error("Super admin access required.");
      }
      return listTenants();
    }
    case "createTenant": {
      if (!superAdmin) {
        throw new Error("Super admin access required.");
      }
      createTenant({
        id: String(args.id),
        name: String(args.name),
        primaryMailbox: typeof args.primaryMailbox === "string" ? args.primaryMailbox : "general"
      });
      return { ok: true };
    }
    case "updateTenant": {
      const tenant = getTenant(adminTenantId);
      if (!tenant) throw new Error("Tenant not found.");
      const next = {
        ...tenant,
        name: typeof args.name === "string" ? args.name : tenant.name,
        primaryMailbox: typeof args.primaryMailbox === "string" ? args.primaryMailbox : tenant.primaryMailbox
      };
      updateTenant(next);
      return { ok: true };
    }
    case "listRoutingRules": {
      return listRoutingRules(adminTenantId);
    }
    case "updateRoutingRules": {
      const rules = Array.isArray(args.rules) ? args.rules : [];
      upsertRoutingRules(adminTenantId, rules);
      return { ok: true };
    }
    case "updateSettings": {
      const current = getTenantSettings(adminTenantId);
      upsertTenantSettings({
        tenantId: adminTenantId,
        aiTriageEnabled: typeof args.aiTriageEnabled === "boolean" ? args.aiTriageEnabled : current.aiTriageEnabled,
        aiDraftEnabled: typeof args.aiDraftEnabled === "boolean" ? args.aiDraftEnabled : current.aiDraftEnabled,
        aiReviewEnabled: typeof args.aiReviewEnabled === "boolean" ? args.aiReviewEnabled : current.aiReviewEnabled,
        retentionDays: typeof args.retentionDays === "number" ? args.retentionDays : current.retentionDays
      });
      return { ok: true };
    }
    case "updateTheme": {
      const current = getTenantTheme(adminTenantId);
      upsertTenantTheme({
        tenantId: adminTenantId,
        brandName: typeof args.brandName === "string" ? args.brandName : current.brandName,
        logoUrl: typeof args.logoUrl === "string" ? args.logoUrl : current.logoUrl,
        primaryColor: typeof args.primaryColor === "string" ? args.primaryColor : current.primaryColor,
        accentColor: typeof args.accentColor === "string" ? args.accentColor : current.accentColor,
        backgroundColor: typeof args.backgroundColor === "string" ? args.backgroundColor : current.backgroundColor,
        textColor: typeof args.textColor === "string" ? args.textColor : current.textColor
      });
      return { ok: true };
    }
    case "listJobs": {
      return listJobs(adminTenantId).slice(0, 20);
    }
    case "getAiUsage": {
      return { summary: getAiUsageSummary(adminTenantId), events: listAiUsage(adminTenantId, 20) };
    }
    case "getStorageHealth": {
      return await getContainerStatus();
    }
    case "getMailboxStatus": {
      const mailboxes = listMailboxesForTenant(adminTenantId);
      const states = listMailboxStates(adminTenantId);
      return { mailboxes, states };
    }
    case "exportAudit": {
      return readAudit(adminTenantId).slice(0, 50);
    }
    case "renderPreview": {
      const theme = getTenantTheme(adminTenantId);
      return renderEmail(args.blocks ?? [], theme);
    }
    default:
      throw new Error("Unknown tool.");
  }
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const superAdmin = isSuperAdmin(admin);
  const body = await request.json().catch(() => ({}));
  const inputMessages = Array.isArray(body?.messages) ? body.messages : [];
  const page = body?.page === "builder" ? "builder" : "admin";
  const previewBlocks = Array.isArray(body?.previewBlocks) ? body.previewBlocks : null;
  if (previewBlocks) {
    const preview = await runTool(admin, "renderPreview", { blocks: previewBlocks });
    return NextResponse.json({
      reply: "Preview ready.",
      previewHtml: preview.html ?? "",
      previewText: preview.text ?? ""
    });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 400 });
  }

  const system = [
    "You are an admin assistant for a multi-tenant support console.",
    "Use tools when needed to complete admin actions; do not just describe what to do.",
    "Respect RBAC: do not attempt super admin-only actions unless Super admin is true.",
    "Operate only within the current tenant unless super admin access is explicitly available.",
    "When asked to build a long or complex email template from plain English, create a full template using blocks.",
    "Email blocks schema: header({title,subtitle?,style?}), paragraph({text,style?}), button({label,url,style?,buttonStyle?}), divider({style?}), spacer({size:'sm'|'md'|'lg',style?}), footer({text,style?}), image({src,alt?,width?,href?,style?}), columns({leftTitle?,leftText,rightTitle?,rightText,style?,stackOnMobile?}), hero({title,subtitle?,body,imageUrl,imageAlt?,imagePosition?,imageWidth?,style?,stackOnMobile?}), logoGrid({logos,columns?,maxLogoWidth?}), testimonial({quote,author,role?,company?,avatarUrl?}), kpis({items:[{label,value}],columns?}), pricing({plans:[{name,price,description?,ctaLabel?,ctaUrl?}],highlightIndex?,columns?}), timeline({steps:[{title,detail?}],accentColor?}), faq({items:[{question,answer}],compact?}), labeledDivider({label,lineColor?}), signature({signoff,name,title?,email?,phone?,avatarUrl?}), legal({text,fontSize?}).",
    "Style object: {textColor?,backgroundColor?,textAlign?,fontSize?,padding?,borderRadius?,borderColor?}. Button style: {variant:'primary'|'outline'|'ghost',backgroundColor?,textColor?,borderColor?,borderRadius?,padding?}.",
    "For full templates, include subject, body, signature, and a rich blocks array (header, 2-4 paragraphs, CTA button, divider, footer).",
    "Return a JSON object with a single key 'reply' containing a concise answer.",
    `Current page: ${page}.`
    + ` Super admin: ${superAdmin ? "true" : "false"}.`
  ].join(" ");

  const messages: Array<Message> = [
    { role: "system", content: system }
  ];

  inputMessages.forEach((msg: any) => {
    if (msg?.role === "user" || msg?.role === "assistant") {
      messages.push({ role: msg.role, content: String(msg.content ?? "") });
    }
  });

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tools = superAdmin ? [...baseTools, ...superAdminTools] : baseTools;
  let response = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
    tools
  });

  for (let i = 0; i < 3; i += 1) {
    const choice = response.choices[0];
    const toolCalls = choice?.message?.tool_calls ?? [];
    if (!toolCalls.length) break;
    for (const call of toolCalls) {
      const toolName = call.function.name;
      const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      try {
        const result = await runTool(admin, toolName, args);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result)
        });
      } catch (error) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: String(error) })
        });
      }
    }
    response = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools
    });
  }

  const content = response.choices[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(content);
    return NextResponse.json({ reply: parsed.reply ?? content });
  } catch {
    return NextResponse.json({ reply: content });
  }
}
