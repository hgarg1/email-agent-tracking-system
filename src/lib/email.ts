import { gmail_v1 } from "googleapis";
import sanitizeHtml from "sanitize-html";
import { Attachment } from "./types";

export function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  return Buffer.from(padded, "base64").toString("utf8");
}

export function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string) {
  const header = headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? "";
}

export function extractBody(part?: gmail_v1.Schema$MessagePart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts) {
    for (const child of part.parts) {
      const text = extractBody(child);
      if (text) return text;
    }
  }
  if (part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  return "";
}

export function extractHtml(part?: gmail_v1.Schema$MessagePart): string {
  if (!part) return "";
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts) {
    for (const child of part.parts) {
      const html = extractHtml(child);
      if (html) return html;
    }
  }
  return "";
}

export function sanitizeInboundHtml(html: string) {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: [
      "a",
      "p",
      "br",
      "b",
      "strong",
      "i",
      "em",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6"
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" })
    }
  });
}

export function collectAttachments(
  part: gmail_v1.Schema$MessagePart | undefined,
  messageId: string,
  acc: Attachment[] = []
) {
  if (!part) return acc;
  if (part.filename && part.body?.attachmentId) {
    acc.push({
      id: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body?.size ?? 0,
      messageId
    });
  }
  if (part.parts) {
    part.parts.forEach((child) => collectAttachments(child, messageId, acc));
  }
  return acc;
}

export function buildReplyMime(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}) {
  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8"
  ];

  if (params.inReplyTo) {
    headers.push(`In-Reply-To: ${params.inReplyTo}`);
  }

  if (params.references) {
    headers.push(`References: ${params.references}`);
  }

  const mime = `${headers.join("\r\n")}\r\n\r\n${params.body}`;
  return Buffer.from(mime).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildReplyMimeWithHtml(params: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string;
  references?: string;
}) {
  const boundary = `boundary_${Date.now()}`;
  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ];

  if (params.inReplyTo) {
    headers.push(`In-Reply-To: ${params.inReplyTo}`);
  }

  if (params.references) {
    headers.push(`References: ${params.references}`);
  }

  const mime = `${headers.join("\r\n")}\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${params.text}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${params.html}\r\n--${boundary}--`;
  return Buffer.from(mime).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
