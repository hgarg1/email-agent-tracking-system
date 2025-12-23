"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { InboxSummary, MailboxId, Thread, Template } from "@/src/lib/types";

type AgentInfo = {
  id: string;
  name: string;
  email: string;
  role: string;
  mailboxAccess: string[];
  tenantId: string;
  availability: "available" | "away" | "offline";
};

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

const slaLimits: Record<string, number> = {
  urgent: 2,
  high: 8,
  normal: 24,
  low: 72
};

const getSlaState = (priority: string, updatedAt: string) => {
  const limitHours = slaLimits[priority] ?? 24;
  const ageHours = (Date.now() - new Date(updatedAt).getTime()) / 36e5;
  if (ageHours >= limitHours) return "overdue";
  if (ageHours >= limitHours * 0.75) return "risk";
  return "ok";
};

export default function InboxClient() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [threads, setThreads] = useState<InboxSummary[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [reply, setReply] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [note, setNote] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [status, setStatus] = useState<string>("idle");
  const [draftStatus, setDraftStatus] = useState("");
  const [liveStatus, setLiveStatus] = useState<"live" | "retrying" | "offline">("offline");
  const [htmlOpen, setHtmlOpen] = useState<Record<string, boolean>>({});
  const [useAiReview, setUseAiReview] = useState(true);
  const [aiIssues, setAiIssues] = useState<string[]>([]);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiConfig, setAiConfig] = useState<{ triage: boolean; draft: boolean; review: boolean } | null>(null);
  const [aiKeyPresent, setAiKeyPresent] = useState(true);
  const [mailboxes, setMailboxes] = useState<Array<{ id: MailboxId; email: string }>>([]);
  const [aiNotice, setAiNotice] = useState("");
  const [useBuilder, setUseBuilder] = useState(false);
  const [routingRules, setRoutingRules] = useState<Array<{ category: string; queue: string }>>([]);
  const [activity, setActivity] = useState<
    Array<{ id: string; action: string; actorId: string; timestamp: string }>
  >([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    mailbox: "",
    assignedTo: "",
    tag: "",
    priority: ""
  });

  const authFetch = async (input: RequestInfo, init: RequestInit = {}) => {
    if (!token) throw new Error("Missing token");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  const loadMe = async (activeToken: string) => {
    setPageLoading(true);
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (!res.ok) throw new Error("Unauthorized");
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("authToken", data.token);
        setToken(data.token);
      }
      setAgent(data.agent ?? null);
    } finally {
      setPageLoading(false);
    }
  };

  const loadAgents = async () => {
    const res = await authFetch("/api/agents");
    const data = await res.json();
    setAgents(data.agents ?? []);
  };

  const loadTemplates = async () => {
    const res = await authFetch("/api/templates");
    const data = await res.json();
    setTemplates(data.templates ?? []);
  };

  const loadConfig = async () => {
    const res = await authFetch("/api/config");
    const data = await res.json();
    setAiConfig(data.ai ?? null);
    setMailboxes(Array.isArray(data.mailboxes) ? data.mailboxes : []);
    setAiKeyPresent(Boolean(data.aiKeyPresent));
  };

  const loadRoutingRules = async () => {
    const res = await authFetch("/api/routing");
    const data = await res.json();
    setRoutingRules(data.rules ?? []);
  };

  const loadThreads = async () => {
    setThreadsLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const res = await authFetch(`/api/threads?${params.toString()}`);
      const data = await res.json();
      setThreads(data.threads ?? []);
    } finally {
      setThreadsLoading(false);
    }
  };

  useEffect(() => {
    const savedToken = typeof window !== "undefined" ? localStorage.getItem("authToken") : "";
    if (!savedToken) {
      router.replace("/login");
      return;
    }
    setToken(savedToken);
    loadMe(savedToken).catch(() => {
      localStorage.removeItem("authToken");
      router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    if (!token) return;
    loadAgents().catch(() => setAgents([]));
    loadTemplates().catch(() => setTemplates([]));
    loadConfig().catch(() => setAiConfig(null));
    loadRoutingRules().catch(() => setRoutingRules([]));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let source: EventSource | null = null;

    const startPolling = () => {
      if (pollInterval) return;
      pollInterval = setInterval(() => {
        loadThreads().catch(() => null);
      }, 8000);
    };

    loadThreads().catch(() => setThreads([]));

    if (typeof window !== "undefined" && "EventSource" in window) {
      source = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
      source.onopen = () => setLiveStatus("live");
      source.onmessage = () => {
        loadThreads().catch(() => null);
        setLiveStatus("live");
      };
      source.onerror = () => {
        setLiveStatus("retrying");
        source?.close();
        startPolling();
      };
    } else {
      startPolling();
    }

    return () => {
      if (source) source.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [token, filters]);

  useEffect(() => {
    if (!threads.length) return;
    if (!activeThread) {
      loadThread(threads[0].id);
    }
  }, [threads, activeThread]);

  useEffect(() => {
    if (activeThread) {
      setTagsInput(activeThread.tags.join(", "));
    }
  }, [activeThread?.id]);

  useEffect(() => {
    if (!activeThread) return;
    authFetch(`/api/threads/${activeThread.id}/activity`)
      .then((res) => res.json())
      .then((data) => setActivity(data.events ?? []))
      .catch(() => setActivity([]));
  }, [activeThread?.id]);

  const activeSummary = useMemo(
    () => (activeThread ? threads.find((thread) => thread.id === activeThread.id) : threads[0]),
    [activeThread, threads]
  );
  const activeSlaState = useMemo(
    () => (activeThread ? getSlaState(activeThread.priority, activeThread.updatedAt) : "ok"),
    [activeThread?.id, activeThread?.priority, activeThread?.updatedAt]
  );

  const agentName = useMemo(() => {
    const lookup = new Map(agents.map((item) => [item.id, item.name]));
    return (id?: string) => (id ? lookup.get(id) ?? id : "Unassigned");
  }, [agents]);

  const agentAvailability = useMemo(() => {
    const lookup = new Map(agents.map((item) => [item.id, item.availability]));
    return (id?: string) => (id ? lookup.get(id) ?? "available" : "available");
  }, [agents]);

  const formatAssigned = (id?: string) => {
    if (!id) return "Unassigned";
    const name = agentName(id);
    const availability = agentAvailability(id);
    return availability === "available" ? name : `${name} (${availability})`;
  };

  const draftKey = (threadId: string) => {
    const tenant = agent?.tenantId ?? "tenant";
    return `draft:${tenant}:${threadId}`;
  };

  const relatedThreads = useMemo(() => {
    if (!activeThread) return [];
    const participants = new Set(activeThread.participants.map((item) => item.toLowerCase()));
    return threads
      .filter(
        (thread) =>
          thread.id !== activeThread.id &&
          thread.participants.some((participant) => participants.has(participant.toLowerCase()))
      )
      .slice(0, 5);
  }, [activeThread, threads]);

  const loadThread = (id: string) => {
    setThreadLoading(true);
    authFetch(`/api/threads/${id}`)
      .then((res) => res.json())
      .then((data) => setActiveThread(data.thread))
      .catch(() => setActiveThread(null))
      .finally(() => setThreadLoading(false));
  };

  const sendReply = async () => {
    if (!activeThread || !reply.trim()) return;
    setStatus("sending");
    try {
      const res = await authFetch(`/api/threads/${activeThread.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply, templateId, useAiReview, useBuilder })
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.error) {
          setAiNotice(data.error);
        }
        if (data.review?.issues) {
          setAiIssues(data.review.issues);
        }
        setStatus("error");
        return;
      }
      setReply("");
      setAiIssues([]);
      setAiNotice("");
      await loadThread(activeThread.id);
      setStatus("sent");
      setTimeout(() => setStatus("idle"), 1200);
    } catch (error) {
      setStatus("error");
    }
  };

  const syncMailbox = async (mailbox: MailboxId, mode: "incremental" | "full" = "incremental") => {
    setStatus("syncing");
    try {
      await authFetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailbox, mode })
      });
      await loadThreads();
      setStatus("idle");
    } catch (error) {
      setStatus("error");
    }
  };

  const updateTriage = async (payload: Record<string, unknown>) => {
    if (!activeThread) return;
    setStatus("saving");
    try {
      await authFetch(`/api/threads/${activeThread.id}/triage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setNote("");
      await loadThread(activeThread.id);
      await loadThreads();
      setStatus("idle");
    } catch (error) {
      setStatus("error");
    }
  };

  const applyTemplate = () => {
    const template = templates.find((tpl) => tpl.id === templateId);
    if (template) {
      setReply(template.body);
      setAiNotice(template.isBuilder ? "Builder template will send branded HTML." : "");
      setUseBuilder(Boolean(template.isBuilder));
    }
  };

  const suggestReply = async () => {
    if (!activeThread) return;
    setAiDrafting(true);
    try {
      const res = await authFetch(`/api/threads/${activeThread.id}/suggest-reply`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok && data.error) {
        setAiNotice(data.error);
        return;
      }
      if (data.draft?.body) {
        setReply(data.draft.body);
      }
    } finally {
      setAiDrafting(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
    }
    localStorage.removeItem("authToken");
    router.replace("/login");
  };

  const updateAvailability = async (availability: AgentInfo["availability"]) => {
    if (!agent) return;
    try {
      await authFetch("/api/agents/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability })
      });
      setAgent((prev) => (prev ? { ...prev, availability } : prev));
      setAgents((prev) =>
        prev.map((item) => (item.id === agent.id ? { ...item, availability } : item))
      );
    } catch {
      // no-op
    }
  };

  const toggleHtml = (messageId: string) => {
    setHtmlOpen((prev) => ({ ...prev, [messageId]: !prev[messageId] }));
  };

  const applyMyQueue = () => {
    if (!agent) return;
    setFilters((prev) => ({ ...prev, assignedTo: agent.id }));
  };

  const applyUnassigned = () => {
    setFilters((prev) => ({ ...prev, assignedTo: "unassigned" }));
  };

  const applyQueue = (category: string) => {
    setFilters((prev) => ({ ...prev, tag: category }));
  };

  const clearFilters = () => {
    setFilters({ q: "", status: "", mailbox: "", assignedTo: "", tag: "", priority: "" });
  };

  const mailboxEntries = useMemo(() => {
    const allowed = new Set(agent?.mailboxAccess ?? []);
    return mailboxes.filter((entry) => allowed.has(entry.id));
  }, [mailboxes, agent?.mailboxAccess]);

  const mailboxLabel = useMemo(() => {
    if (mailboxEntries.length === 0) return "your tenant mailbox";
    return mailboxEntries.map((entry) => entry.email).join(" or ");
  }, [mailboxEntries]);

  const visibleTemplates = useMemo(() => {
    if (!activeThread) return templates;
    const filtered = templates.filter(
      (tpl) => tpl.mailbox === "all" || tpl.mailbox === activeThread.mailbox
    );
    return filtered.length ? filtered : templates;
  }, [templates, activeThread]);

  useEffect(() => {
    if (!activeThread) return;
    const key = draftKey(activeThread.id);
    const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (!raw) {
      setDraftStatus("");
      return;
    }
    try {
      const data = JSON.parse(raw) as { body?: string; updatedAt?: string };
      if (data.body) {
        setReply(data.body);
        setDraftStatus("Draft restored");
      }
    } catch {
      // Ignore bad drafts
    }
  }, [activeThread?.id, agent?.tenantId]);

  useEffect(() => {
    if (!activeThread) return;
    const key = draftKey(activeThread.id);
    const timer = setTimeout(() => {
      if (!reply.trim()) {
        localStorage.removeItem(key);
        setDraftStatus("");
        return;
      }
      const payload = JSON.stringify({ body: reply, updatedAt: new Date().toISOString() });
      localStorage.setItem(key, payload);
      setDraftStatus("Draft saved");
      setTimeout(() => setDraftStatus(""), 1200);
    }, 600);
    return () => clearTimeout(timer);
  }, [reply, activeThread?.id, agent?.tenantId]);

  return (
    <div style={{ position: "relative" }}>
      {pageLoading && !agent && (
        <div className="loading-overlay">
          <div className="spinner" />
        </div>
      )}
      <div className="inbox-shell">
      <div>
        <div className="panel-card" style={{ marginBottom: 16 }}>
          <strong>Mission Control</strong>
          <h3>Shared inboxes</h3>
          <p>All traffic appears as {mailboxLabel}.</p>
          {!aiKeyPresent && aiConfig && (aiConfig.triage || aiConfig.draft || aiConfig.review) && (
            <div
              style={{
                marginTop: 10,
                border: "1px solid #fde68a",
                background: "#fef3c7",
                padding: 10,
                borderRadius: 12
              }}
            >
              <strong style={{ color: "#92400e" }}>AI disabled</strong>
              <p style={{ fontSize: 12, marginTop: 6 }}>
                OPENAI_API_KEY is missing. AI triage/draft/review will not run.
              </p>
            </div>
          )}
          <div className="hero-actions" style={{ marginTop: 12 }}>
            {mailboxEntries.map((entry, index) => (
              <div key={entry.id} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className={index === 0 ? "button primary" : "button secondary"}
                  onClick={() => syncMailbox(entry.id)}
                  aria-label={`Sync ${entry.id} mailbox`}
                >
                  Sync {entry.id}
                </button>
                <button
                  className="button secondary"
                  onClick={() => syncMailbox(entry.id, "full")}
                  aria-label={`Full sync ${entry.id} mailbox`}
                >
                  Full sync {entry.id}
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <p style={{ fontSize: 12, color: "#94a3b8" }}>
              Tenant: {agent?.tenantId ?? "unknown"} --- Live: {liveStatus}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              {agent?.role === "admin" && (
                <button className="button secondary" onClick={() => router.push("/admin")}>
                  Admin portal
                </button>
              )}
              <button className="button secondary" onClick={handleLogout}>Logout</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Availability</span>
            <select
              className="filter-select"
              value={agent?.availability ?? "available"}
              onChange={(event) => updateAvailability(event.target.value as AgentInfo["availability"])}
            >
              <option value="available">Available</option>
              <option value="away">Away</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>

        <div className="filter-card">
          <input
            className="filter-input"
            placeholder="Search subject, sender, or snippet"
            value={filters.q}
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="button secondary" onClick={applyMyQueue}>
              My queue
            </button>
            <button className="button secondary" onClick={applyUnassigned}>
              Unassigned
            </button>
            <button className="button secondary" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
          {routingRules.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {routingRules.map((rule) => (
                <button
                  key={rule.category}
                  className="button secondary"
                  onClick={() => applyQueue(rule.category)}
                >
                  {rule.queue}
                </button>
              ))}
            </div>
          )}
          <div className="filter-row">
            <select
              className="filter-select"
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="">All status</option>
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </select>
            <select
              className="filter-select"
              value={filters.mailbox}
              onChange={(event) => setFilters((prev) => ({ ...prev, mailbox: event.target.value }))}
            >
              <option value="">All mailboxes</option>
              {mailboxEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.id.toUpperCase()}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={filters.assignedTo}
              onChange={(event) => setFilters((prev) => ({ ...prev, assignedTo: event.target.value }))}
            >
              <option value="">All owners</option>
              <option value="unassigned">Unassigned</option>
              {agents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} {item.availability !== "available" ? `(${item.availability})` : ""}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={filters.priority}
              onChange={(event) => setFilters((prev) => ({ ...prev, priority: event.target.value }))}
            >
              <option value="">All priority</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <input
              className="filter-input"
              placeholder="Tag"
              value={filters.tag}
              onChange={(event) => setFilters((prev) => ({ ...prev, tag: event.target.value }))}
            />
          </div>
        </div>

        <div className="inbox-list">
          {threadsLoading && threads.length === 0 ? (
            <div className="panel-card" style={{ display: "grid", gap: 10 }}>
              <div className="pulse-bar" />
              <div className="pulse-bar" />
              <div className="pulse-bar" />
            </div>
          ) : (
            threads.map((thread) => {
              const slaState = getSlaState(thread.priority, thread.updatedAt);
              return (
                <div
                  key={thread.id}
                  className={`thread-card ${activeSummary?.id === thread.id ? "active" : ""}`}
                  onClick={() => loadThread(thread.id)}
                  role="button"
                >
                  <h4>{thread.subject}</h4>
                  <p>{thread.snippet}</p>
                  <p style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
                    {thread.mailbox.toUpperCase()} --- {formatTime(thread.updatedAt)}
                  </p>
                  <div className="thread-meta-row">
                    <span className="pill">{thread.priority}</span>
                    {slaState !== "ok" && (
                      <span className="pill">{slaState === "overdue" ? "SLA overdue" : "SLA risk"}</span>
                    )}
                    {thread.tags.slice(0, 2).map((tag) => (
                      <span className="pill" key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="thread-view" style={{ position: "relative" }}>
        {threadLoading && (
          <div className="loading-overlay">
            <div className="spinner" />
          </div>
        )}
        {pageLoading ? (
          <div style={{ display: "grid", placeItems: "center", minHeight: 320 }}>
            <div className="spinner" />
          </div>
        ) : activeThread ? (
          <>
            <div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 28 }}>{activeThread.subject}</h2>
            <div className="thread-meta">
              <span>Status: {activeThread.status}</span>
              <span>Assigned: {formatAssigned(activeThread.assignedTo)}</span>
              <span>Mailbox: {activeThread.mailbox}</span>
              <span>Priority: {activeThread.priority}</span>
              <span>
                  SLA: {activeSlaState === "overdue" ? "Overdue" : activeSlaState === "risk" ? "Risk" : "On track"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <button
                  className="button secondary"
                  onClick={() => updateTriage({ assignedTo: agent?.id ?? "" })}
                  disabled={!agent}
                >
                  Assign to me
                </button>
                <button
                  className="button secondary"
                  onClick={() => updateTriage({ assignedTo: "" })}
                >
                  Unassign
                </button>
              </div>
            </div>
            <div className="panel-card" style={{ display: "grid", gap: 8 }}>
              <strong>Customer context</strong>
              <p style={{ color: "#94a3b8", fontSize: 12 }}>
                Participants: {activeThread.participants.join(", ")}
              </p>
              {relatedThreads.length > 0 ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {relatedThreads.map((thread) => (
                    <button
                      key={thread.id}
                      className="button secondary"
                      onClick={() => loadThread(thread.id)}
                      style={{ justifyContent: "space-between", display: "flex" }}
                    >
                      <span>{thread.subject}</span>
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>
                        {thread.status} --- {formatTime(thread.updatedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#94a3b8", fontSize: 12 }}>No related threads yet.</p>
              )}
            </div>
            <div className="panel-card" style={{ display: "grid", gap: 8 }}>
              <strong>Activity</strong>
              {activity.length > 0 ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {activity.map((event) => (
                    <div key={event.id} className="note-item">
                      <strong>{event.action}</strong>
                      <span>{formatTime(event.timestamp)}</span>
                      <p>By: {agentName(event.actorId)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#94a3b8", fontSize: 12 }}>No activity yet.</p>
              )}
            </div>
            <div className="triage-grid">
              <select
                className="filter-select"
                value={activeThread.status}
                onChange={(event) => updateTriage({ status: event.target.value })}
              >
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
              </select>
              <select
                className="filter-select"
                value={activeThread.priority}
                onChange={(event) => updateTriage({ priority: event.target.value })}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <select
                className="filter-select"
                value={activeThread.assignedTo ?? ""}
                onChange={(event) => updateTriage({ assignedTo: event.target.value })}
              >
                <option value="">Unassigned</option>
                {agents.map((item) => (
                  <option key={item.id} value={item.id} disabled={item.availability === "offline"}>
                    {item.name} {item.availability !== "available" ? `(${item.availability})` : ""}
                  </option>
                ))}
              </select>
              <input
                className="filter-input"
                placeholder="Tags (comma separated)"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                onBlur={() => {
                  const tags = tagsInput
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean);
                  updateTriage({ tags });
                }}
              />
            </div>
            <div className="note-box">
              <textarea
                placeholder="Internal note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <button className="button secondary" onClick={() => updateTriage({ note })}>
                Add note
              </button>
              <div className="note-list">
                {activeThread.internalNotes.map((item) => (
                  <div className="note-item" key={item.id}>
                    <strong>{agentName(item.authorId)}</strong>
                    <span>{formatTime(item.date)}</span>
                    <p>{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              {activeThread.messages.map((message) => (
                <div className="message-bubble" key={message.id}>
                  <strong>{message.from}</strong>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>{formatTime(message.date)}</span>
                  <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{message.bodyText}</p>
                  {message.bodyHtml && (
                    <div style={{ marginTop: 10 }}>
                      <button className="button secondary" onClick={() => toggleHtml(message.id)}>
                        {htmlOpen[message.id] ? "Hide HTML" : "View HTML"}
                      </button>
                      {htmlOpen[message.id] && (
                        <iframe
                          title={`html-${message.id}`}
                          sandbox=""
                          srcDoc={message.bodyHtml}
                          style={{
                            width: "100%",
                            minHeight: 220,
                            border: "1px solid #e2e8f0",
                            borderRadius: 12,
                            marginTop: 10
                          }}
                        />
                      )}
                    </div>
                  )}
                  {message.attachments.length > 0 && (
                    <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 12, color: "#94a3b8" }}>Attachments</strong>
                      {message.attachments.map((attachment) => (
                        <a
                          key={attachment.id}
                          className="button secondary"
                          href={`/api/threads/${activeThread.id}/attachments/${attachment.id}?token=${encodeURIComponent(token)}`}
                          download
                        >
                          {attachment.filename} ({Math.round(attachment.size / 1024)}kb)
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="reply-box">
              <div className="template-row">
                <select
                  className="filter-select"
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                >
                  <option value="">Select template</option>
                  {visibleTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} {tpl.isBuilder ? "(builder)" : ""}
                      </option>
                    ))}
                </select>
                <button className="button secondary" onClick={applyTemplate}>
                  Apply template
                </button>
                <button
                  className="button secondary"
                  onClick={suggestReply}
                  disabled={aiDrafting || aiConfig?.draft === false}
                >
                  {aiDrafting ? "Drafting..." : "Suggest reply"}
                </button>
              </div>
              <textarea
                placeholder={`Draft reply as ${mailboxLabel}`}
                value={reply}
                onChange={(event) => setReply(event.target.value)}
              />
              {draftStatus && (
                <p style={{ color: "#94a3b8", fontSize: 12 }}>{draftStatus}</p>
              )}
              <label style={{ fontSize: 12, color: "#94a3b8" }}>
                <input
                  type="checkbox"
                  checked={useAiReview}
                  disabled={aiConfig?.review === false}
                  onChange={(event) => setUseAiReview(event.target.checked)}
                  style={{ marginRight: 8 }}
                />
                AI review before send
              </label>
              <label style={{ fontSize: 12, color: "#94a3b8" }}>
                <input
                  type="checkbox"
                  checked={useBuilder}
                  onChange={(event) => setUseBuilder(event.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Send branded HTML from builder template
              </label>
              {aiNotice && (
                <div style={{ border: "1px solid #fde68a", background: "#fef3c7", padding: 10, borderRadius: 12 }}>
                  <strong style={{ color: "#92400e" }}>AI notice</strong>
                  <p style={{ fontSize: 13, marginTop: 6 }}>{aiNotice}</p>
                </div>
              )}
              {aiIssues.length > 0 && (
                <div style={{ border: "1px solid #fecaca", background: "#fff1f2", padding: 10, borderRadius: 12 }}>
                  <strong style={{ color: "#be123c" }}>Review issues</strong>
                  <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                    {aiIssues.map((issue, idx) => (
                      <li key={`${issue}-${idx}`} style={{ fontSize: 13 }}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="reply-actions">
                <button className="button primary" onClick={sendReply}>
                  Send reply
                </button>
                <span style={{ color: "#94a3b8", fontSize: 13 }}>
                  {status === "sending" && "Sending..."}
                  {status === "sent" && "Sent"}
                  {status === "syncing" && "Syncing..."}
                  {status === "saving" && "Saving..."}
                  {status === "error" && "Action failed"}
                </span>
              </div>
            </div>
          </>
        ) : (
          <p>No thread selected.</p>
        )}
      </div>
      </div>
    </div>
  );
}

