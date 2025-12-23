import { Agent, Template, Tenant, Thread } from "./types";

export const mockTenants: Tenant[] = [
  { id: "dream-x", name: "Dream-X", primaryMailbox: "board" },
  { id: "playerxchange", name: "PlayerXchange", primaryMailbox: "general" },
  { id: "lsi", name: "Living Systems Intelligence", primaryMailbox: "lsi" },
  { id: "cytos", name: "CytosAI", primaryMailbox: "cytos" }
];

export const mockAgents: Agent[] = [
  {
    id: "agent-ethan",
    tenantId: "dream-x",
    name: "Ethan Park",
    email: "ethan@dream-x.app",
    role: "admin",
    mailboxAccess: ["board", "general"],
    active: true,
    password: "changeme",
    availability: "available"
  },
  {
    id: "agent-nova",
    tenantId: "playerxchange",
    name: "Nova Hughes",
    email: "nova@playerxchange.org",
    role: "admin",
    mailboxAccess: ["general"],
    active: true,
    password: "changeme",
    availability: "available"
  },
  {
    id: "agent-kai",
    tenantId: "playerxchange",
    name: "Kai Moreno",
    email: "kai@playerxchange.org",
    role: "agent",
    mailboxAccess: ["general"],
    active: true,
    password: "changeme",
    availability: "away"
  },
  {
    id: "agent-lsi-admin",
    tenantId: "lsi",
    name: "Raya Singh",
    email: "raya@lsi.ai",
    role: "admin",
    mailboxAccess: ["lsi"],
    active: true,
    password: "changeme",
    availability: "available"
  },
  {
    id: "agent-cytos-admin",
    tenantId: "cytos",
    name: "Milo Chen",
    email: "milo@cytos.ai",
    role: "admin",
    mailboxAccess: ["cytos"],
    active: true,
    password: "changeme",
    availability: "available"
  }
];

export const mockTemplates: Template[] = [
  {
    id: "tpl-board-launch",
    tenantId: "dream-x",
    mailbox: "board",
    name: "Launch timeline update",
    subject: "Launch timeline confirmation",
    body: "Thanks for the update. We can confirm the staged release plan. We will share a final timeline by Friday.",
    signature: "Dream-X Board Office",
    isBuilder: true,
    blocks: [
      { type: "header", title: "Launch timeline confirmation", subtitle: "Dream-X Board Office" },
      { type: "paragraph", text: "Thanks for the update. We can confirm the staged release plan." },
      { type: "paragraph", text: "We will share a final timeline by Friday." },
      { type: "divider" },
      { type: "footer", text: "Dream-X Board Office" }
    ]
  },
  {
    id: "tpl-general-refund",
    tenantId: "playerxchange",
    mailbox: "general",
    name: "Refund intake",
    subject: "Refund request received",
    body: "Thanks for reaching out. We have received your refund request and are reviewing order details now.",
    signature: "PlayerXchange Support",
    isBuilder: true,
    blocks: [
      { type: "header", title: "Refund request received", subtitle: "PlayerXchange Support" },
      { type: "paragraph", text: "Thanks for reaching out. We have received your refund request." },
      { type: "paragraph", text: "We are reviewing order details now and will follow up shortly." },
      { type: "button", label: "View order details", url: "https://playerxchange.org/account" },
      { type: "footer", text: "PlayerXchange Support" }
    ]
  }
];

export const mockThreads: Thread[] = [
  {
    id: "thread-001",
    tenantId: "dream-x",
    mailbox: "board",
    subject: "Board follow-up: launch timeline",
    snippet: "Can we confirm the public announcement sequence for Q2?",
    updatedAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    participants: ["alexa.morgan@client.com", "board@dream-x.app"],
    status: "open",
    assignedTo: "agent-ethan",
    priority: "high",
    tags: ["launch", "board"],
    internalNotes: [
      {
        id: "note-001",
        authorId: "agent-ethan",
        body: "Board wants a staged release with internal preview first.",
        date: new Date(Date.now() - 1000 * 60 * 8).toISOString()
      }
    ],
    messages: [
      {
        id: "msg-001",
        threadId: "thread-001",
        from: "alexa.morgan@client.com",
        to: ["board@dream-x.app"],
        cc: [],
        subject: "Board follow-up: launch timeline",
        date: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        snippet: "Can we confirm the public announcement sequence for Q2?",
        bodyText:
          "We need final approval for the launch timeline. Can you confirm if the board prefers a staged release?",
        bodyHtml: "<p>We need final approval for the launch timeline.</p>",
        attachments: []
      }
    ]
  },
  {
    id: "thread-002",
    tenantId: "playerxchange",
    mailbox: "general",
    subject: "Partnership inquiry",
    snippet: "We want to list a new marketplace partner and need onboarding details.",
    updatedAt: new Date(Date.now() - 1000 * 60 * 52).toISOString(),
    participants: ["team@newpartner.io", "general@playerxchange.org"],
    status: "pending",
    assignedTo: "agent-nova",
    priority: "normal",
    tags: ["partner", "onboarding"],
    internalNotes: [],
    messages: [
      {
        id: "msg-010",
        threadId: "thread-002",
        from: "team@newpartner.io",
        to: ["general@playerxchange.org"],
        cc: [],
        subject: "Partnership inquiry",
        date: new Date(Date.now() - 1000 * 60 * 52).toISOString(),
        snippet: "We want to list a new marketplace partner and need onboarding details.",
        bodyText:
          "We are interested in integrating our inventory. Can you share the onboarding requirements and API docs?",
        bodyHtml: "",
        attachments: []
      }
    ]
  },
  {
    id: "thread-003",
    tenantId: "playerxchange",
    mailbox: "general",
    subject: "Refund request - order #8712",
    snippet: "Customer is requesting a refund due to an accidental purchase.",
    updatedAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    participants: ["william@example.com", "general@playerxchange.org"],
    status: "open",
    assignedTo: "agent-kai",
    priority: "urgent",
    tags: ["refund", "billing"],
    internalNotes: [],
    messages: [
      {
        id: "msg-020",
        threadId: "thread-003",
        from: "william@example.com",
        to: ["general@playerxchange.org"],
        cc: [],
        subject: "Refund request - order #8712",
        date: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
        snippet: "Customer is requesting a refund due to an accidental purchase.",
        bodyText:
          "I made a purchase by mistake and would like a refund. Can you help me reverse order #8712?",
        bodyHtml: "",
        attachments: []
      }
    ]
  }
];
