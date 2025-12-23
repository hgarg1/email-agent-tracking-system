"use client";

import { useMemo, useState } from "react";
import type { EmailBlock } from "@/src/lib/types";

type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
  previewHtml?: string;
  previewText?: string;
};

type AssistantWidgetProps = {
  page: "admin" | "builder";
  previewBlocks?: EmailBlock[];
};

export default function AssistantWidget({ page, previewBlocks }: AssistantWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: "assistant",
      content:
        page === "admin"
          ? "Hi! I can help manage agents, templates, routing, tenants, and settings."
          : "Hi! I can help with templates and preview rendering."
    }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const lastHint = useMemo(
    () =>
      page === "admin"
        ? "Try: create an agent, list tenants, update theme colors."
        : "Try: create a new template or reorder blocks.",
    [page]
  );

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setError("");
    setSending(true);
    const nextMessages = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, messages: nextMessages })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Assistant error");
        return;
      }
      const reply = typeof data.reply === "string" ? data.reply : "Done.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: reply,
          previewHtml: typeof data.previewHtml === "string" ? data.previewHtml : undefined,
          previewText: typeof data.previewText === "string" ? data.previewText : undefined
        }
      ]);
    } catch (err) {
      setError("Assistant unavailable.");
    } finally {
      setSending(false);
    }
  };

  const sendPreview = async () => {
    if (!previewBlocks?.length || sending) return;
    setError("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: "Render a preview of the current blocks." }
    ]);
    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, previewBlocks })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Assistant error");
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: typeof data.reply === "string" ? data.reply : "Preview ready.",
          previewHtml: typeof data.previewHtml === "string" ? data.previewHtml : undefined,
          previewText: typeof data.previewText === "string" ? data.previewText : undefined
        }
      ]);
    } catch {
      setError("Assistant unavailable.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        style={{
          position: "fixed",
          right: 26,
          bottom: 26,
          width: 54,
          height: 54,
          borderRadius: "50%",
          border: "none",
          background: "linear-gradient(135deg, #0ea5e9, #14b8a6)",
          color: "white",
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 12px 30px rgba(14, 165, 233, 0.35)",
          zIndex: 40
        }}
      >
        AI
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.35)",
            zIndex: 50
          }}
        >
          <div
            className="hero-card"
            style={{
              position: "fixed",
              right: 26,
              bottom: 96,
              width: "min(520px, 92vw)",
              height: "min(640px, 78vh)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: 20
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "grid", gap: 4 }}>
                <strong style={{ fontSize: 18 }}>Admin Assistant</strong>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>{lastHint}</span>
              </div>
              <button className="button secondary" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 12,
                borderRadius: 18,
                border: "1px solid #e2e8f0",
                background: "rgba(248, 250, 252, 0.8)"
              }}
            >
              {messages.map((message, idx) => (
                <div
                  key={`${message.role}-${idx}`}
                  style={{
                    alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "78%",
                    padding: "14px 16px",
                    borderRadius: 18,
                    background: message.role === "user" ? "linear-gradient(135deg, #0ea5e9, #14b8a6)" : "white",
                    color: message.role === "user" ? "white" : "#0f172a",
                    boxShadow: "0 8px 22px rgba(15, 23, 42, 0.08)"
                  }}
                >
                  <p style={{ whiteSpace: "pre-wrap" }}>{message.content}</p>
                  {message.previewHtml && (
                    <div style={{ marginTop: 12 }}>
                      <iframe
                        title={`preview-${idx}`}
                        sandbox=""
                        srcDoc={message.previewHtml}
                        style={{
                          width: "100%",
                          minHeight: 220,
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          background: "white"
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {error && <p style={{ color: "#b45309", fontSize: 12 }}>{error}</p>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
              <input
                className="filter-input"
                placeholder="Ask the assistant..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendMessage();
                }}
                style={{ height: 46 }}
              />
              <button className="button primary" onClick={sendMessage} disabled={sending}>
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
            {page === "builder" && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="button secondary"
                  onClick={sendPreview}
                  disabled={sending || !previewBlocks?.length}
                >
                  Preview in chat
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
