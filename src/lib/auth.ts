import crypto from "crypto";
import { Agent } from "./types";
import { addAuditEvent, addSession, deleteSession, getAgent, getSession, getTenant, readAgents } from "./store";
import { verifyPassword } from "./passwords";
import { verifyTotp } from "./mfa";

export function isSuperAdmin(agent: Agent) {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "ethan@dream-x.app";
  const list = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length) return false;
  return list.includes(agent.email.toLowerCase());
}

export function getTokenFromRequest(request: Request, allowQuery = false) {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  if (allowQuery) {
    const url = new URL(request.url);
    return url.searchParams.get("token") ?? "";
  }
  return "";
}

export function requireAuth(request: Request) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  const session = getSession(token);
  if (!session) return null;
  const agent = getAgent(session.agentId);
  if (!agent || !agent.active) return null;
  return agent;
}

export function requireAuthWithSession(request: Request) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  const session = getSession(token);
  if (!session) return null;
  const agent = getAgent(session.agentId);
  if (!agent || !agent.active) return null;
  return { agent, session, token };
}

export function requireAuthQuery(request: Request) {
  const token = getTokenFromRequest(request, true);
  if (!token) return null;
  const session = getSession(token);
  if (!session) return null;
  const agent = getAgent(session.agentId);
  if (!agent || !agent.active) return null;
  return agent;
}

export function requireAdmin(request: Request) {
  const agent = requireAuth(request);
  if (!agent || agent.role !== "admin") return null;
  if (isSuperAdmin(agent)) {
    const override = request.headers.get("x-tenant-id") ?? "";
    if (override) {
      const tenant = getTenant(override);
      if (tenant) {
        return { ...agent, tenantId: tenant.id };
      }
    }
  }
  return agent;
}

export function createSession(agent: Agent) {
  const token = crypto.randomBytes(24).toString("hex");
  addSession({
    token,
    agentId: agent.id,
    tenantId: agent.tenantId,
    createdAt: new Date().toISOString()
  });
  return token;
}

export function rotateSession(oldToken: string, agent: Agent) {
  deleteSession(oldToken);
  return createSession(agent);
}

export function authenticate(email: string, password: string) {
  const agent = readAgents().find(
    (item) => item.email.toLowerCase() === email.toLowerCase() && item.active
  );
  if (!agent) return null;
  if (!verifyPassword(password, agent.password)) return null;
  if (agent.mfaEnabled) return agent;
  addAuditEvent({
    id: `audit-${Date.now()}`,
    tenantId: agent.tenantId,
    actorId: agent.id,
    action: "login",
    targetType: "session",
    timestamp: new Date().toISOString(),
    metadata: { email: agent.email }
  });
  return agent;
}

export function authenticateMfa(agent: Agent, code: string) {
  if (!agent.mfaEnabled) return true;
  if (!agent.mfaSecret) return false;
  return verifyTotp(agent.mfaSecret, code);
}
