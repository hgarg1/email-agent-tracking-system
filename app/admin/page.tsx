"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Template } from "@/src/lib/types";
import AssistantWidget from "../components/AssistantWidget";

type AgentInfo = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
  mailboxAccess: string[];
  active: boolean;
  mfaEnabled: boolean;
  availability: "available" | "away" | "offline";
};

type AuditEvent = {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  timestamp: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [agent, setAgent] = useState<{ role: string; tenantId?: string; isSuperAdmin?: boolean } | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [settings, setSettings] = useState({
    aiTriageEnabled: false,
    aiDraftEnabled: false,
    aiReviewEnabled: false,
    retentionDays: 90
  });
  const [aiUsage, setAiUsage] = useState({
    count: 0,
    totalCost: 0,
    promptTokens: 0,
    completionTokens: 0
  });
  const [aiEvents, setAiEvents] = useState<{ id: string; action: string; costUsd: number; createdAt: string }[]>([]);
  const [storageHealth, setStorageHealth] = useState<{ ok: boolean; lastModified?: string } | null>(null);
  const [resetLink, setResetLink] = useState("");
  const [inviteModal, setInviteModal] = useState<{
    open: boolean;
    agentId?: string;
    name: string;
    email: string;
    link: string;
    expiresAt?: string;
    status?: "idle" | "sending" | "sent" | "mock" | "failed";
    messageId?: string | null;
  }>({ open: false, name: "", email: "", link: "" });
  const [mfaModal, setMfaModal] = useState<{
    open: boolean;
    name: string;
    email: string;
    qr: string;
  }>({ open: false, name: "", email: "", qr: "" });
  const [jobs, setJobs] = useState<Array<{ id: string; status: string; type: string }>>([]);
  const [tenants, setTenants] = useState<Array<{ id: string; name: string; primaryMailbox: string }>>([]);
  const [tenantProfile, setTenantProfile] = useState<{
    id: string;
    name: string;
    primaryMailbox: string;
  } | null>(null);
  const [tenantForm, setTenantForm] = useState({
    id: "",
    name: "",
    primaryMailbox: "general"
  });
  const [routingRules, setRoutingRules] = useState<Array<{ category: string; queue: string }>>([]);
  const [queueBuckets, setQueueBuckets] = useState<
    Array<{
      name: string;
      slaHours: number;
      fallback: boolean;
      keywords: string[];
      notifyEmails: string[];
      slackWebhook?: string;
      quietHoursStart?: string;
      quietHoursEnd?: string;
      maxOpenPerAgent?: number;
      allowedAvailability: Array<"available" | "away" | "offline">;
    }>
  >([]);
  const [newQueue, setNewQueue] = useState("");
  const [agentStats, setAgentStats] = useState<Record<string, number>>({});
  const [mailboxStates, setMailboxStates] = useState<
    Array<{ mailbox: string; historyId?: string; updatedAt?: string }>
  >([]);
  const [config, setConfig] = useState<
    { gmailConfigured: boolean; mailboxes: Array<{ id: string; email: string }>; aiKeyPresent: boolean } | null
  >(null);
  const [theme, setTheme] = useState({
    brandName: "",
    logoUrl: "",
    primaryColor: "#0ea5e9",
    accentColor: "#14b8a6",
    backgroundColor: "#ffffff",
    textColor: "#0f172a"
  });
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "agent",
    mailboxAccess: ["general"],
    password: ""
  });
  const [templateForm, setTemplateForm] = useState({
    name: "",
    mailbox: "all",
    subject: "",
    body: "",
    signature: ""
  });
  const [templatePreviews, setTemplatePreviews] = useState<Record<string, string>>({});
  const [tenantOverride, setTenantOverride] = useState("");
  const [loading, setLoading] = useState(true);
  const agentsRef = useRef<HTMLDivElement | null>(null);
  const [mfaAnchorTop, setMfaAnchorTop] = useState<number | null>(null);
  const routingCategories = [
    "billing",
    "bug",
    "account",
    "feature",
    "legal",
    "partnership",
    "other"
  ];
  const mailboxOptions = ["board", "general", "lsi", "cytos"];
  const agentMailboxOptions = config?.mailboxes?.length
    ? config.mailboxes.map((mailbox) => mailbox.id)
    : mailboxOptions;

  const authFetch = async (input: RequestInfo, init: RequestInit = {}) => {
    if (!token) throw new Error("Missing token");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (agent?.isSuperAdmin && tenantOverride) {
      headers.set("x-tenant-id", tenantOverride);
    }
    return fetch(input, { ...init, headers });
  };

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const me = await authFetch("/api/auth/me");
      const meData = await me.json();
      if (meData.token) {
        localStorage.setItem("authToken", meData.token);
        setToken(meData.token);
      }
      setAgent(meData.agent ?? null);
      if (meData.agent?.tenantId && !tenantOverride) {
        setTenantOverride(meData.agent.tenantId);
      }
      const [
        resAgents,
        resTemplates,
        resAudit,
        resSettings,
        resUsage,
        resStorage,
        resJobs,
        resTenants,
        resTenant,
        resRouting,
        resAgentStats,
        resMailboxes,
        resTheme,
        resConfig
      ] = await Promise.all([
        authFetch("/api/admin/agents"),
        authFetch("/api/templates"),
        authFetch("/api/audit"),
        authFetch("/api/admin/settings"),
        authFetch("/api/admin/ai-usage"),
        authFetch("/api/admin/storage-health"),
        authFetch("/api/admin/jobs"),
        authFetch("/api/admin/tenants"),
        authFetch("/api/admin/tenant"),
        authFetch("/api/admin/routing"),
        authFetch("/api/admin/agent-stats"),
        authFetch("/api/admin/mailboxes"),
        authFetch("/api/admin/theme"),
        authFetch("/api/config")
      ]);

      const [
        dataAgents,
        dataTemplates,
        dataAudit,
        dataSettings,
        dataUsage,
        dataStorage,
        dataJobs,
        dataTenants,
        dataTenant,
        dataRouting,
        dataAgentStats,
        dataMailboxes,
        dataTheme,
        dataConfig
      ] = await Promise.all([
        resAgents.json(),
        resTemplates.json(),
        resAudit.json(),
        resSettings.json(),
        resUsage.json(),
        resStorage.json(),
        resJobs.json(),
        resTenants.json(),
        resTenant.json(),
        resRouting.json(),
        resAgentStats.json(),
        resMailboxes.json(),
        resTheme.json(),
        resConfig.json()
      ]);

      setAgents(dataAgents.agents ?? []);
      setTemplates(dataTemplates.templates ?? []);
      setAudit(dataAudit.events ?? []);
      setSettings(dataSettings.settings ?? settings);
      setAiUsage(dataUsage.summary ?? aiUsage);
      setAiEvents(dataUsage.events ?? []);
      setStorageHealth(dataStorage.status ?? null);
      setJobs(dataJobs.jobs ?? []);
      setTenants(dataTenants.tenants ?? []);
      setTenantProfile(dataTenant.tenant ?? null);
      setRoutingRules(dataRouting.rules ?? []);
      const incomingBuckets = Array.isArray(dataRouting.buckets) ? dataRouting.buckets : [];
      if (incomingBuckets.length) {
        setQueueBuckets(incomingBuckets);
      } else {
        const uniqueQueues = new Set<string>(["General"]);
        (dataRouting.rules ?? []).forEach((rule: { queue?: string }) => {
          if (rule.queue) uniqueQueues.add(rule.queue);
        });
        setQueueBuckets(
          Array.from(uniqueQueues).map((name) => ({
            name,
            slaHours: 24,
            fallback: name === "General",
            keywords: [],
            notifyEmails: [],
            allowedAvailability: ["available"]
          }))
        );
      }
      setAgentStats(dataAgentStats.assignedCounts ?? {});
      setMailboxStates(dataMailboxes.states ?? []);
      setTheme(dataTheme.theme ?? theme);
      setConfig({
        gmailConfigured: dataConfig.gmailConfigured,
        mailboxes: Array.isArray(dataConfig.mailboxes) ? dataConfig.mailboxes : [],
        aiKeyPresent: Boolean(dataConfig.aiKeyPresent)
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedToken = typeof window !== "undefined" ? localStorage.getItem("authToken") : "";
    if (!savedToken) {
      router.replace("/login");
      return;
    }
    setToken(savedToken);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    loadAdminData().catch(() => {
      router.replace("/login");
    });
  }, [token, router]);

  useEffect(() => {
    if (!token || templates.length === 0) return;
    let cancelled = false;
    const buildClassicHtml = (tpl: Template) => `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #0f172a;">
        <h3 style="margin: 0 0 10px;">${tpl.subject || "Untitled"}</h3>
        <div style="font-size: 14px; line-height: 1.6;">${tpl.body || ""}</div>
        ${tpl.signature ? `<div style="margin-top: 16px; font-size: 13px; color: #64748b;">${tpl.signature}</div>` : ""}
      </div>
    `;
    const loadPreviews = async () => {
      const entries = await Promise.all(
        templates.map(async (tpl) => {
          if (tpl.blocks?.length) {
            const res = await authFetch("/api/templates/render", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ blocks: tpl.blocks })
            });
            const data = await res.json();
            return [tpl.id, data.html ?? ""] as const;
          }
          return [tpl.id, buildClassicHtml(tpl)] as const;
        })
      );
      if (cancelled) return;
      setTemplatePreviews(Object.fromEntries(entries));
    };
    loadPreviews().catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [templates, token]);

  useEffect(() => {
    if (!token || !agent?.isSuperAdmin || !tenantOverride) return;
    loadAdminData().catch(() => null);
  }, [tenantOverride, agent?.isSuperAdmin, token]);

  useEffect(() => {
    if (!mfaModal.open) return;
    const rect = agentsRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = Math.min(window.innerHeight - 160, Math.max(24, rect.top + 20));
    setMfaAnchorTop(top);
  }, [mfaModal.open]);

  if (!agent) {
    return (
      <main style={{ padding: "60px 8vw", display: "grid", placeItems: "center" }}>
        <div className="spinner" />
      </main>
    );
  }

  if (agent.role !== "admin") {
    return (
      <main style={{ padding: "60px 8vw" }}>
        <h2>Admin access required.</h2>
      </main>
    );
  }

  const createAgent = async () => {
    const res = await authFetch("/api/admin/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        mailboxAccess: form.mailboxAccess
      })
    });
    const data = await res.json();
    if (data?.agent?.id) {
      await sendInvite(data.agent.id, data.agent.name, data.agent.email);
    }
    setForm({ name: "", email: "", role: "agent", mailboxAccess: ["general"], password: "" });
    await loadAdminData();
  };

  const sendInvite = async (agentId: string, name: string, email: string) => {
    setInviteModal({ open: true, agentId, name, email, link: "", status: "sending" });
    const res = await authFetch(`/api/admin/agents/${agentId}/invite`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setInviteModal({
      open: true,
      agentId,
      name,
      email,
      link: data?.link ?? "",
      expiresAt: data?.expiresAt,
      status: data?.status ?? (res.ok ? "sent" : "failed"),
      messageId: data?.messageId ?? null
    });
  };

  const updateAgent = async (agentId: string, payload: Partial<AgentInfo>) => {
    await authFetch(`/api/admin/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    await loadAdminData();
  };

  const deleteAgent = async (agentId: string) => {
    await authFetch(`/api/admin/agents/${agentId}`, { method: "DELETE" });
    await loadAdminData();
  };

  const createTemplate = async () => {
    await authFetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(templateForm)
    });
    setTemplateForm({ name: "", mailbox: "all", subject: "", body: "", signature: "" });
    await loadAdminData();
  };

  const deleteTemplate = async (templateId: string) => {
    await authFetch(`/api/templates/${templateId}`, { method: "DELETE" });
    await loadAdminData();
  };

  const saveSettings = async () => {
    await authFetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    await loadAdminData();
  };

  const saveTenant = async () => {
    if (!tenantProfile) return;
    await authFetch("/api/admin/tenant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tenantProfile.name,
        primaryMailbox: tenantProfile.primaryMailbox
      })
    });
    await loadAdminData();
  };

  const createTenant = async () => {
    await authFetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tenantForm)
    });
    setTenantForm({ id: "", name: "", primaryMailbox: "general" });
    await loadAdminData();
  };

  const saveRouting = async () => {
    const rules = routingCategories.map((category) => {
      const existing = routingRules.find((rule) => rule.category === category);
      return {
        category,
        queue: (existing?.queue ?? "General").trim() || "General"
      };
    });
    await authFetch("/api/admin/routing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules, buckets: queueBuckets })
    });
    await loadAdminData();
  };

  const addQueueBucket = () => {
    const name = newQueue.trim();
    if (!name) return;
    setQueueBuckets((prev) =>
      prev.some((bucket) => bucket.name === name)
        ? prev
        : [
            ...prev,
            {
              name,
              slaHours: 24,
              fallback: false,
              keywords: [],
              notifyEmails: [],
              allowedAvailability: ["available"]
            }
          ]
    );
    setNewQueue("");
  };

  const removeQueueBucket = (name: string) => {
    if (name === "General") return;
    setQueueBuckets((prev) => prev.filter((bucket) => bucket.name !== name));
    setRoutingRules((prev) =>
      prev.map((rule) => (rule.queue === name ? { ...rule, queue: "General" } : rule))
    );
  };

  const updateBucket = (name: string, patch: Partial<(typeof queueBuckets)[number]>) => {
    setQueueBuckets((prev) =>
      prev.map((bucket) => {
        if (bucket.name !== name) return bucket;
        return { ...bucket, ...patch };
      })
    );
  };

  const renameBucket = (oldName: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed || oldName === trimmed) return;
    setQueueBuckets((prev) =>
      prev.map((bucket) => (bucket.name === oldName ? { ...bucket, name: trimmed } : bucket))
    );
    setRoutingRules((prev) =>
      prev.map((rule) => (rule.queue === oldName ? { ...rule, queue: trimmed } : rule))
    );
  };

  const exportAudit = async () => {
    const res = await authFetch("/api/admin/audit-export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-${agent?.tenantId ?? "tenant"}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const runJobs = async () => {
    await authFetch("/api/admin/jobs/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 3 })
    });
    await loadAdminData();
  };

  const saveTheme = async () => {
    await authFetch("/api/admin/theme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(theme)
    });
    await loadAdminData();
  };

  return (
    <main style={{ padding: "48px 8vw 120px", display: "grid", gap: 32, position: "relative" }}>
      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
        </div>
      )}
      <section className="hero-card" ref={agentsRef}>
        <strong>Admin Portal</strong>
        <p style={{ color: "#94a3b8" }}>
          Tenant scope: {agent?.isSuperAdmin ? tenantOverride || agent?.tenantId : agent?.tenantId ?? "unknown"}
        </p>
        {agent?.isSuperAdmin && (
          <div className="filter-row" style={{ marginTop: 12 }}>
            <select
              className="filter-select"
              value={tenantOverride}
              onChange={(event) => {
                setTenantOverride(event.target.value);
              }}
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.id})
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          className="button secondary"
          style={{ marginTop: 12 }}
          onClick={() => router.push("/admin/builder")}
        >
          Open Email Builder
        </button>
        <button
          className="button secondary"
          style={{ marginTop: 12, marginLeft: 10 }}
          onClick={() => router.push("/inbox")}
        >
          Go to inbox
        </button>
        <h2 style={{ marginTop: 10 }}>Agents</h2>
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {agents.map((item) => (
            <div key={item.id} className="panel-card" style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <strong>{item.name}</strong>
                  <p style={{ color: "#94a3b8" }}>{item.email}</p>
                  <p style={{ color: "#94a3b8" }}>
                    Assigned: {agentStats[item.id] ?? 0} open
                  </p>
                </div>
                <button className="button secondary" onClick={() => deleteAgent(item.id)}>
                  Remove
                </button>
              </div>
              <div className="filter-row">
                <select
                  className="filter-select"
                  value={item.role}
                  onChange={(event) => updateAgent(item.id, { role: event.target.value })}
                >
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
                <select
                  className="filter-select"
                  value={item.availability}
                  onChange={(event) =>
                    updateAgent(item.id, { availability: event.target.value as AgentInfo["availability"] })
                  }
                >
                  <option value="available">Available</option>
                  <option value="away">Away</option>
                  <option value="offline">Offline</option>
                </select>
                <select
                  className="filter-select"
                  value={item.active ? "active" : "inactive"}
                  onChange={(event) => updateAgent(item.id, { active: event.target.value === "active" })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <button
                  className="button secondary"
                  onClick={async () => {
                    if (item.mfaEnabled) {
                      await authFetch(`/api/admin/agents/${item.id}/mfa`, { method: "DELETE" });
                      await loadAdminData();
                      return;
                    }
                    const res = await authFetch(`/api/admin/agents/${item.id}/mfa`, { method: "POST" });
                    const data = await res.json();
                    if (data.qr) {
                      setMfaModal({
                        open: true,
                        name: item.name,
                        email: item.email,
                        qr: data.qr
                      });
                    }
                    await loadAdminData();
                  }}
                >
                  {item.mfaEnabled ? "Reset MFA" : "Enable MFA"}
                </button>
                <button
                  className="button secondary"
                  onClick={async () => {
                    const res = await authFetch(`/api/admin/agents/${item.id}/reset`, { method: "POST" });
                    const data = await res.json();
                    if (data.token) {
                      setResetLink(`${window.location.origin}/reset?token=${data.token}`);
                    }
                  }}
                >
                  Copy reset link
                </button>
              </div>
            </div>
          ))}
        </div>
        {resetLink && (
          <div className="panel-card" style={{ marginTop: 16 }}>
            <strong>Reset link</strong>
            <p style={{ wordBreak: "break-all" }}>{resetLink}</p>
          </div>
        )}

        <div style={{ marginTop: 24 }} className="filter-card">
          <strong>Create agent</strong>
          <div className="filter-row">
            <input
              className="filter-input"
              placeholder="Name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <input
              className="filter-input"
              placeholder="Email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <select
              className="filter-select"
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
            <input
              className="filter-input"
              placeholder="Temp password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              title="Password must be 10+ chars with upper, lower, number, and symbol."
            />
            <select
              className="filter-select"
              multiple
              value={form.mailboxAccess}
              onChange={(event) => {
                const values = Array.from(event.target.selectedOptions).map((opt) => opt.value);
                setForm((prev) => ({ ...prev, mailboxAccess: values }));
              }}
            >
              {agentMailboxOptions.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
            <button className="button primary" onClick={createAgent}>
              Add agent
            </button>
          </div>
          <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 10 }}>
            Password must be 10+ chars with upper, lower, number, and symbol.
          </p>
        </div>
      </section>

      <section className="hero-card">
        <strong>Tenants</strong>
        <p style={{ color: "#94a3b8", marginTop: 8 }}>
          Create new tenant workspaces and set the primary mailbox.
        </p>
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {tenants.map((tenant) => (
            <div key={tenant.id} className="panel-card" style={{ display: "grid", gap: 6 }}>
              <strong>{tenant.name}</strong>
              <p style={{ color: "#94a3b8" }}>ID: {tenant.id}</p>
              <p style={{ color: "#94a3b8" }}>Primary mailbox: {tenant.primaryMailbox}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 24 }} className="filter-card">
          <strong>Create tenant</strong>
          <div className="filter-row">
            <input
              className="filter-input"
              placeholder="Tenant name"
              value={tenantForm.name}
              onChange={(event) => setTenantForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <input
              className="filter-input"
              placeholder="Tenant id (optional)"
              value={tenantForm.id}
              onChange={(event) => setTenantForm((prev) => ({ ...prev, id: event.target.value }))}
            />
            <select
              className="filter-select"
              value={tenantForm.primaryMailbox}
              onChange={(event) =>
                setTenantForm((prev) => ({ ...prev, primaryMailbox: event.target.value }))
              }
            >
              {mailboxOptions.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
            <p style={{ color: "#94a3b8", fontSize: 12 }}>
              Primary mailbox controls the default address and access rules.
            </p>
            <button className="button primary" onClick={createTenant}>
              Add tenant
            </button>
          </div>
        </div>
      </section>

      <section className="hero-card">
        <strong>Tenant profile</strong>
        <p style={{ color: "#94a3b8", marginTop: 8 }}>
          Update the name and primary mailbox for this tenant.
        </p>
        <div className="filter-row" style={{ marginTop: 16 }}>
          <input
            className="filter-input"
            placeholder="Tenant name"
            value={tenantProfile?.name ?? ""}
            onChange={(event) =>
              setTenantProfile((prev) =>
                prev
                  ? { ...prev, name: event.target.value }
                  : { id: agent?.tenantId ?? "", name: event.target.value, primaryMailbox: "general" }
              )
            }
          />
          <select
            className="filter-select"
            value={tenantProfile?.primaryMailbox ?? "general"}
            onChange={(event) =>
              setTenantProfile((prev) =>
                prev
                  ? { ...prev, primaryMailbox: event.target.value }
                  : { id: agent?.tenantId ?? "", name: "", primaryMailbox: event.target.value }
              )
            }
          >
            {mailboxOptions.map((option) => (
              <option key={option} value={option}>
                {option.toUpperCase()}
              </option>
            ))}
          </select>
          <button className="button primary" onClick={saveTenant}>
            Save tenant
          </button>
        </div>
      </section>

      <section className="hero-card">
        <strong>AI policy</strong>
        <p style={{ color: "#94a3b8", marginTop: 8 }}>
          Controls GPT-4o usage for this tenant only.
        </p>
        {!config?.aiKeyPresent && (
          <div
            style={{
              marginTop: 12,
              border: "1px solid #fde68a",
              background: "#fef3c7",
              padding: 10,
              borderRadius: 12
            }}
          >
            <strong style={{ color: "#92400e" }}>Missing OpenAI API key</strong>
            <p style={{ fontSize: 12, marginTop: 6 }}>
              Set OPENAI_API_KEY to enable AI triage, draft, and review.
            </p>
          </div>
        )}
        <div className="filter-row" style={{ marginTop: 16 }}>
          <label className="filter-input" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={settings.aiTriageEnabled}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, aiTriageEnabled: event.target.checked }))
              }
            />
            Enable AI triage
          </label>
          <label className="filter-input" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={settings.aiDraftEnabled}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, aiDraftEnabled: event.target.checked }))
              }
            />
            Enable AI draft
          </label>
          <label className="filter-input" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={settings.aiReviewEnabled}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, aiReviewEnabled: event.target.checked }))
              }
            />
            Enable AI review
          </label>
          <button className="button primary" onClick={saveSettings}>
            Save AI policy
          </button>
        </div>
      </section>

      <section className="hero-card">
        <strong>Routing rules</strong>
        <p style={{ color: "#94a3b8", marginTop: 8 }}>
          Define the queue each AI category should land in.
        </p>
        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="pill">Triage categories</span>
            <span className="pill">Queue mapping</span>
            <span className="pill">Tenant scoped</span>
          </div>
          <div className="panel-card" style={{ display: "grid", gap: 10 }}>
            <strong>Queue buckets</strong>
            <div className="filter-row">
              <input
                className="filter-input"
                placeholder="New queue name"
                value={newQueue}
                onChange={(event) => setNewQueue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addQueueBucket();
                }}
              />
              <button className="button secondary" onClick={addQueueBucket}>
                Add bucket
              </button>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {queueBuckets.map((bucket) => (
                <div key={bucket.name} className="panel-card" style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      className="filter-input"
                      value={bucket.name}
                      onChange={(event) => renameBucket(bucket.name, event.target.value)}
                      placeholder="Queue name"
                    />
                    <input
                      className="filter-input"
                      type="number"
                      min={1}
                      placeholder="SLA hours"
                      value={bucket.slaHours}
                      onChange={(event) => updateBucket(bucket.name, { slaHours: Number(event.target.value || 24) })}
                    />
                    <label style={{ fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={bucket.fallback}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setQueueBuckets((prev) =>
                            prev.map((item) => ({
                              ...item,
                              fallback: checked && item.name === bucket.name
                            }))
                          );
                          if (!checked && bucket.name === "General") {
                            setQueueBuckets((prev) =>
                              prev.map((item) =>
                                item.name === "General" ? { ...item, fallback: true } : item
                              )
                            );
                          }
                        }}
                      />
                      Fallback queue
                    </label>
                    <button
                      className="button secondary"
                      onClick={() => removeQueueBucket(bucket.name)}
                      disabled={bucket.name === "General"}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="filter-row">
                    <input
                      className="filter-input"
                      placeholder="Keywords (comma separated)"
                      value={bucket.keywords.join(", ")}
                      onChange={(event) =>
                        updateBucket(bucket.name, {
                          keywords: event.target.value
                            .split(",")
                            .map((word) => word.trim())
                            .filter(Boolean)
                        })
                      }
                    />
                    <input
                      className="filter-input"
                      placeholder="Notify emails (comma separated)"
                      value={bucket.notifyEmails.join(", ")}
                      onChange={(event) =>
                        updateBucket(bucket.name, {
                          notifyEmails: event.target.value
                            .split(",")
                            .map((email) => email.trim())
                            .filter(Boolean)
                        })
                      }
                    />
                    <input
                      className="filter-input"
                      placeholder="Slack webhook"
                      value={bucket.slackWebhook ?? ""}
                      onChange={(event) => updateBucket(bucket.name, { slackWebhook: event.target.value })}
                    />
                  </div>
                  <div className="filter-row">
                    <input
                      className="filter-input"
                      type="time"
                      value={bucket.quietHoursStart ?? ""}
                      onChange={(event) => updateBucket(bucket.name, { quietHoursStart: event.target.value })}
                    />
                    <input
                      className="filter-input"
                      type="time"
                      value={bucket.quietHoursEnd ?? ""}
                      onChange={(event) => updateBucket(bucket.name, { quietHoursEnd: event.target.value })}
                    />
                    <input
                      className="filter-input"
                      type="number"
                      min={1}
                      placeholder="Max open per agent"
                      value={bucket.maxOpenPerAgent ?? ""}
                      onChange={(event) =>
                        updateBucket(bucket.name, {
                          maxOpenPerAgent: event.target.value ? Number(event.target.value) : undefined
                        })
                      }
                    />
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {(["available", "away", "offline"] as const).map((status) => (
                      <label
                        key={status}
                        style={{ fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <input
                          type="checkbox"
                          checked={bucket.allowedAvailability.includes(status)}
                          onChange={(event) => {
                            const allowed = new Set(bucket.allowedAvailability);
                            if (event.target.checked) {
                              allowed.add(status);
                            } else {
                              allowed.delete(status);
                            }
                            updateBucket(bucket.name, { allowedAvailability: Array.from(allowed) });
                          }}
                        />
                        {status}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8" }}>
              Buckets can define SLA targets, keywords, notifications, quiet hours, and assignment limits.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12
            }}
          >
            {routingCategories.map((category) => {
              const existing = routingRules.find((rule) => rule.category === category);
              return (
                <div key={category} className="panel-card" style={{ display: "grid", gap: 8 }}>
                  <strong style={{ textTransform: "capitalize" }}>{category}</strong>
                  <input
                    className="filter-input"
                    list="queue-bucket-list"
                    value={existing?.queue ?? ""}
                    placeholder="Queue name"
                    style={{ width: "100%" }}
                    onChange={(event) =>
                      setRoutingRules((prev) => {
                        const next = prev.filter((rule) => rule.category !== category);
                        next.push({ category, queue: event.target.value });
                        return next;
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
          <datalist id="queue-bucket-list">
            {queueBuckets.map((bucket) => (
              <option key={bucket.name} value={bucket.name} />
            ))}
          </datalist>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="button primary" onClick={saveRouting}>
              Save routing
            </button>
            <p style={{ color: "#94a3b8", fontSize: 12 }}>
              Used when AI triage is enabled.
            </p>
          </div>
        </div>
      </section>

      <section className="hero-card">
        <strong>Brand theme</strong>
        <p style={{ color: "#94a3b8", marginTop: 8 }}>
          Used by the email builder for this tenant.
        </p>
        <div className="filter-row" style={{ marginTop: 16 }}>
          <input
            className="filter-input"
            placeholder="Brand name"
            value={theme.brandName}
            onChange={(event) => setTheme((prev) => ({ ...prev, brandName: event.target.value }))}
          />
          <input
            className="filter-input"
            placeholder="Logo URL"
            value={theme.logoUrl}
            onChange={(event) => setTheme((prev) => ({ ...prev, logoUrl: event.target.value }))}
          />
          <input
            className="filter-input"
            placeholder="Primary color"
            value={theme.primaryColor}
            onChange={(event) => setTheme((prev) => ({ ...prev, primaryColor: event.target.value }))}
          />
          <input
            className="filter-input"
            placeholder="Accent color"
            value={theme.accentColor}
            onChange={(event) => setTheme((prev) => ({ ...prev, accentColor: event.target.value }))}
          />
          <input
            className="filter-input"
            placeholder="Background color"
            value={theme.backgroundColor}
            onChange={(event) => setTheme((prev) => ({ ...prev, backgroundColor: event.target.value }))}
          />
          <input
            className="filter-input"
            placeholder="Text color"
            value={theme.textColor}
            onChange={(event) => setTheme((prev) => ({ ...prev, textColor: event.target.value }))}
          />
          <button className="button primary" onClick={saveTheme}>
            Save theme
          </button>
        </div>
      </section>

      <section className="hero-card">
        <strong>AI usage</strong>
        <div className="metric-grid" style={{ marginTop: 16 }}>
          <div className="metric">
            <h4>Total calls</h4>
            <strong>{aiUsage.count}</strong>
          </div>
          <div className="metric">
            <h4>Prompt tokens</h4>
            <strong>{aiUsage.promptTokens}</strong>
          </div>
          <div className="metric">
            <h4>Completion tokens</h4>
            <strong>{aiUsage.completionTokens}</strong>
          </div>
          <div className="metric">
            <h4>Est. cost (USD)</h4>
            <strong>${aiUsage.totalCost.toFixed(4)}</strong>
          </div>
        </div>
        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          {aiEvents.map((event) => (
            <div key={event.id} className="panel-card">
              <strong>{event.action}</strong>
              <p style={{ color: "#94a3b8" }}>{event.createdAt}</p>
              <p>${event.costUsd.toFixed(4)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="hero-card">
        <strong>Attachment storage</strong>
        <p style={{ color: "#94a3b8", marginTop: 8 }}>
          Azure Blob container health check.
        </p>
        <div className="panel-card" style={{ marginTop: 12 }}>
          <p>Status: {storageHealth?.ok ? "Connected" : "Unavailable"}</p>
          {storageHealth?.lastModified && <p>Last modified: {storageHealth.lastModified}</p>}
        </div>
      </section>

      <section className="hero-card">
        <strong>Mailbox status</strong>
        <p style={{ color: "#94a3b8", marginTop: 8 }}>
          Gmail connection and last sync per mailbox.
        </p>
        <div className="panel-card" style={{ marginTop: 12 }}>
          <p>Gmail configured: {config?.gmailConfigured ? "Yes" : "No"}</p>
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {(config?.mailboxes ?? []).map((entry) => {
            const state = mailboxStates.find((item) => item.mailbox === entry.id);
            return (
              <div key={entry.id} className="panel-card">
                <strong>{entry.id}</strong>
                <p style={{ color: "#94a3b8" }}>{entry.email}</p>
                <p>Last sync: {state?.updatedAt ?? "Never"}</p>
                <p>History ID: {state?.historyId ?? "None"}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="hero-card">
        <strong>Job queue</strong>
        <p style={{ color: "#94a3b8", marginTop: 8 }}>
          Background sync/retry jobs for this tenant.
        </p>
        <button className="button secondary" onClick={runJobs} style={{ marginTop: 10 }}>
          Run pending jobs
        </button>
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {jobs.slice(0, 8).map((job) => (
            <div key={job.id} className="panel-card">
              <strong>{job.type}</strong>
              <p style={{ color: "#94a3b8" }}>Status: {job.status}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="hero-card">
        <strong>Templates</strong>
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {templates.map((tpl) => (
            <div key={tpl.id} className="panel-card" style={{ display: "grid", gap: 8 }}>
              <strong>{tpl.name}</strong>
              <p style={{ color: "#94a3b8" }}>{tpl.mailbox}</p>
              <p style={{ color: "#94a3b8" }}>{tpl.isBuilder ? "Builder" : "Classic"}</p>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                {templatePreviews[tpl.id] ? (
                  <iframe
                    title={`template-preview-${tpl.id}`}
                    sandbox=""
                    srcDoc={templatePreviews[tpl.id]}
                    style={{ width: "100%", minHeight: 220, border: "none", display: "block" }}
                  />
                ) : (
                  <div style={{ padding: 12 }}>
                    <div className="pulse-bar" />
                  </div>
                )}
              </div>
              <button className="button secondary" onClick={() => deleteTemplate(tpl.id)}>
                Delete template
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24 }} className="filter-card">
          <strong>Create template</strong>
          <div className="filter-row">
            <input
              className="filter-input"
              placeholder="Name"
              value={templateForm.name}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <select
              className="filter-select"
              value={templateForm.mailbox}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, mailbox: event.target.value }))}
            >
              <option value="all">All</option>
              <option value="board">Board</option>
              <option value="general">General</option>
            </select>
            <input
              className="filter-input"
              placeholder="Subject"
              value={templateForm.subject}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, subject: event.target.value }))}
            />
            <input
              className="filter-input"
              placeholder="Body"
              value={templateForm.body}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, body: event.target.value }))}
            />
            <input
              className="filter-input"
              placeholder="Signature"
              value={templateForm.signature}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, signature: event.target.value }))}
            />
            <button className="button primary" onClick={createTemplate}>
              Add template
            </button>
          </div>
        </div>
      </section>

      <section className="hero-card">
        <strong>Compliance</strong>
        <p style={{ color: "#94a3b8", marginTop: 8 }}>
          Set data retention and export audit events.
        </p>
        <div className="filter-row" style={{ marginTop: 16 }}>
          <input
            className="filter-input"
            type="number"
            min={1}
            placeholder="Retention days"
            value={settings.retentionDays}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                retentionDays: Number(event.target.value || 0)
              }))
            }
          />
          <button className="button primary" onClick={saveSettings}>
            Save compliance
          </button>
          <button className="button secondary" onClick={exportAudit}>
            Export audit log
          </button>
        </div>
      </section>

      <section className="hero-card">
        <strong>Audit log</strong>
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {audit.slice(0, 20).map((event) => (
            <div key={event.id} className="panel-card">
              <strong>{event.action}</strong>
              <p style={{ color: "#94a3b8" }}>
                {event.actorId} -> {event.targetType} {event.targetId ?? ""}
              </p>
              <p style={{ fontSize: 12 }}>{event.timestamp}</p>
            </div>
          ))}
        </div>
      </section>
      {inviteModal.open && (
        <div className="modal-overlay">
          <div className="modal-shell">
            <div className="modal-header">
              <div>
                <strong>Confirmation email ready</strong>
                <p className="modal-subtitle">
                  {inviteModal.status === "sending"
                    ? "Sending confirmation email now."
                    : "Share a polished invite and confirm this agent in seconds."}
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => setInviteModal((prev) => ({ ...prev, open: false }))}
              >
                Close
              </button>
            </div>
            <div className="modal-grid">
              <div className="panel-card email-preview">
                <div className="email-meta">
                  <span className="status-chip">
                    {inviteModal.status === "sending"
                      ? "Sending"
                      : inviteModal.status === "failed"
                        ? "Failed"
                        : inviteModal.status === "mock"
                          ? "Mock send"
                          : "Sent"}
                  </span>
                  <span>{tenantProfile?.name ?? "Dream-X Orchestrator"} Admin</span>
                </div>
                <p style={{ fontSize: 12, color: "#94a3b8" }}>To: {inviteModal.email}</p>
                <h3 style={{ marginTop: 12 }}>
                  You're invited to {tenantProfile?.name ?? "Dream-X Orchestrator"}
                </h3>
                <p style={{ marginTop: 8 }}>
                  Hi {inviteModal.name}, welcome aboard. Click below to confirm your account and set a
                  secure password.
                </p>
                <a
                  href={inviteModal.link}
                  className="button primary"
                  style={{ marginTop: 14, display: "inline-flex" }}
                >
                  Accept invite
                </a>
                {inviteModal.expiresAt && (
                  <p style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
                    Link expires at {new Date(inviteModal.expiresAt).toLocaleString()}
                  </p>
                )}
                {inviteModal.messageId && (
                  <p style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
                    Delivery id: {inviteModal.messageId}
                  </p>
                )}
              </div>
              <div className="panel-card" style={{ display: "grid", gap: 12 }}>
                <strong>Confirmation checklist</strong>
                <div className="modal-steps">
                  <div>
                    <span className="step-pill">1</span>
                    Verify name and access scope.
                  </div>
                  <div>
                    <span className="step-pill">2</span>
                    Send the confirmation email.
                  </div>
                  <div>
                    <span className="step-pill">3</span>
                    Agent completes password + MFA.
                  </div>
                </div>
                <div className="panel-card" style={{ background: "rgba(15, 23, 42, 0.02)" }}>
                  <strong style={{ fontSize: 12, color: "#94a3b8" }}>Status</strong>
                  <p style={{ marginTop: 6 }}>
                    {inviteModal.status === "sending" && "Sending confirmation email..."}
                    {inviteModal.status === "failed" && "Send failed. Try again or copy the link."}
                    {inviteModal.status === "mock" && "Email mock sent (Gmail not configured)."}
                    {inviteModal.status === "sent" && "Email delivered via Gmail."}
                    {!inviteModal.status && "Email confirmation prepared. Ready to send."}
                  </p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (!inviteModal.link) return;
                      navigator.clipboard?.writeText(inviteModal.link);
                    }}
                  >
                    Copy invite link
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (!inviteModal.agentId) return;
                      sendInvite(inviteModal.agentId, inviteModal.name, inviteModal.email);
                    }}
                  >
                    Resend invite
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (!inviteModal.link) return;
                      window.open(inviteModal.link, "_blank");
                    }}
                  >
                    Open link
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {mfaModal.open && (
        <div
          className="modal-overlay"
          style={{
            alignItems: "flex-start",
            paddingTop: mfaAnchorTop ?? 80
          }}
        >
          <div className="modal-shell">
            <div className="modal-header">
              <div>
                <strong>Premium MFA setup</strong>
                <p className="modal-subtitle">
                  Protect {mfaModal.name}'s account with two-factor authentication.
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => setMfaModal((prev) => ({ ...prev, open: false }))}
              >
                Close
              </button>
            </div>
            <div className="modal-grid">
              <div className="panel-card mfa-panel">
                <div className="status-chip" style={{ alignSelf: "flex-start" }}>
                  Scan to enroll
                </div>
                <div className="mfa-qr">
                  <img src={mfaModal.qr} alt="MFA QR" />
                </div>
                <a className="button secondary" href={mfaModal.qr} download="mfa-qr.png">
                  Download QR
                </a>
              </div>
              <div className="panel-card" style={{ display: "grid", gap: 12 }}>
                <strong>Setup flow</strong>
                <div className="modal-steps">
                  <div>
                    <span className="step-pill">1</span>
                    Scan the QR in your authenticator app.
                  </div>
                  <div>
                    <span className="step-pill">2</span>
                    Enter the 6-digit code on first login.
                  </div>
                  <div>
                    <span className="step-pill">3</span>
                    Save backup codes after activation.
                  </div>
                </div>
                <div className="panel-card" style={{ background: "rgba(15, 23, 42, 0.02)" }}>
                  <strong style={{ fontSize: 12, color: "#94a3b8" }}>Account</strong>
                  <p style={{ marginTop: 6 }}>{mfaModal.email}</p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <button
                    className="button secondary"
                    onClick={() => navigator.clipboard?.writeText(mfaModal.email)}
                  >
                    Copy account email
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => navigator.clipboard?.writeText("Use any TOTP app like 1Password or Google Authenticator.")}
                  >
                    Copy app tips
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <AssistantWidget page="admin" />
    </main>
  );
}
