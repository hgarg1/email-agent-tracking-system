export function extractEmails(headerValue: string): string[] {
  if (!headerValue) return [];
  const matches = headerValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return matches ? Array.from(new Set(matches.map((item) => item.toLowerCase()))) : [];
}

export function formatSubject(subject: string) {
  if (!subject) return "(no subject)";
  return subject.replace(/\s+/g, " ").trim();
}