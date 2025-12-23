"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BlockStyle, ButtonStyle, EmailBlock, Template, TenantTheme } from "@/src/lib/types";
import AssistantWidget from "@/app/components/AssistantWidget";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const hexToRgb = (hex: string) => {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length !== 6) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((val) => Number.isNaN(val))) return null;
  return { r, g, b };
};

const rgbToHex = (rgb: { r: number; g: number; b: number }) =>
  `#${[rgb.r, rgb.g, rgb.b].map((val) => clamp(Math.round(val), 0, 255).toString(16).padStart(2, "0")).join("")}`;

const mix = (color: string, mixin: string, weight = 0.5) => {
  const base = hexToRgb(color);
  const other = hexToRgb(mixin);
  if (!base || !other) return color;
  return rgbToHex({
    r: base.r * (1 - weight) + other.r * weight,
    g: base.g * (1 - weight) + other.g * weight,
    b: base.b * (1 - weight) + other.b * weight
  });
};

const buildPalette = (theme: TenantTheme | null) => {
  if (!theme) {
    return {
      primary: ["#0ea5e9", "#38bdf8", "#7dd3fc", "#bae6fd", "#e0f2fe"],
      accent: ["#14b8a6", "#5eead4", "#99f6e4", "#ccfbf1", "#f0fdfa"],
      neutral: ["#0f172a", "#475569", "#94a3b8", "#e2e8f0", "#f8fafc"]
    };
  }
  return {
    primary: [
      mix(theme.primaryColor, "#000000", 0.2),
      theme.primaryColor,
      mix(theme.primaryColor, "#ffffff", 0.25),
      mix(theme.primaryColor, "#ffffff", 0.5),
      mix(theme.primaryColor, "#ffffff", 0.75)
    ],
    accent: [
      mix(theme.accentColor, "#000000", 0.2),
      theme.accentColor,
      mix(theme.accentColor, "#ffffff", 0.25),
      mix(theme.accentColor, "#ffffff", 0.5),
      mix(theme.accentColor, "#ffffff", 0.75)
    ],
    neutral: [
      theme.textColor,
      mix(theme.textColor, "#64748b", 0.4),
      mix(theme.textColor, "#94a3b8", 0.6),
      mix(theme.backgroundColor, "#e2e8f0", 0.2),
      theme.backgroundColor
    ]
  };
};

const relativeLuminance = (hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const channels = [rgb.r, rgb.g, rgb.b].map((val) => {
    const c = val / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (foreground: string, background: string) => {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const [bright, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (bright + 0.05) / (dark + 0.05);
};

const applyTokens = (value: string, enabled: boolean) => {
  if (!enabled) return value;
  const replacements: Record<string, string> = {
    "{{first_name}}": "Ava",
    "{{last_name}}": "Hart",
    "{{company}}": "Dream-X",
    "{{plan}}": "Founder",
    "{{ticket_id}}": "DX-2049"
  };
  return Object.entries(replacements).reduce((acc, [token, sample]) => {
    const pattern = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return acc.replace(pattern, sample);
  }, value);
};

export default function BuilderPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [status, setStatus] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState("");
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; tone: "success" | "error" }>>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [theme, setTheme] = useState<TenantTheme | null>(null);
  const [paletteTarget, setPaletteTarget] = useState<"text" | "background" | "button">("text");
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile" | "full">("desktop");
  const [tokenPreview, setTokenPreview] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyIndexRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTemplateKey = "builder:lastTemplateId";

  const authFetch = async (input: RequestInfo, init: RequestInit = {}) => {
    if (!token) throw new Error("Missing token");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  const loadTheme = async () => {
    const res = await authFetch("/api/admin/theme");
    const data = await res.json();
    setTheme(data.theme ?? null);
  };

  const resetHistory = (nextBlocks: EmailBlock[]) => {
    const snapshot = JSON.stringify(nextBlocks);
    historyIndexRef.current = 0;
    setHistory([snapshot]);
    setHistoryIndex(0);
  };

  const pushHistory = (nextBlocks: EmailBlock[]) => {
    const snapshot = JSON.stringify(nextBlocks);
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndexRef.current + 1);
      trimmed.push(snapshot);
      historyIndexRef.current = trimmed.length - 1;
      setHistoryIndex(historyIndexRef.current);
      return trimmed;
    });
  };

  const applyBlocks = (updater: (prev: EmailBlock[]) => EmailBlock[], record = true) => {
    setBlocks((prev) => {
      const next = updater(prev);
      if (record) {
        pushHistory(next);
      }
      return next;
    });
  };

  const undo = () => {
    if (historyIndexRef.current <= 0) return;
    const nextIndex = historyIndexRef.current - 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    const snapshot = history[nextIndex];
    if (snapshot) setBlocks(JSON.parse(snapshot));
  };

  const redo = () => {
    if (historyIndexRef.current >= history.length - 1) return;
    const nextIndex = historyIndexRef.current + 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    const snapshot = history[nextIndex];
    if (snapshot) setBlocks(JSON.parse(snapshot));
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/templates");
      const data = await res.json();
      setTemplates(data.templates ?? []);
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
    loadTemplates().catch(() => setTemplates([]));
    loadTheme().catch(() => setTheme(null));
  }, [token]);

  useEffect(() => {
    const template = templates.find((item) => item.id === activeTemplateId);
    if (template) {
      setName(template.name);
      setSubject(template.subject);
      const nextBlocks = template.blocks ?? [];
      setBlocks(nextBlocks);
      resetHistory(nextBlocks);
      setSelectedBlock(null);
    } else if (activeTemplateId === "") {
      resetHistory([]);
      setSelectedBlock(null);
    }
  }, [activeTemplateId, templates]);

  useEffect(() => {
    if (!activeTemplateId) return;
    if (typeof window === "undefined") return;
    localStorage.setItem(lastTemplateKey, activeTemplateId);
  }, [activeTemplateId]);

  useEffect(() => {
    if (activeTemplateId || templates.length === 0) return;
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(lastTemplateKey);
    if (stored && templates.some((tpl) => tpl.id === stored)) {
      setActiveTemplateId(stored);
    }
  }, [templates, activeTemplateId]);

  const addBlock = (type: EmailBlock["type"]) => {
    applyBlocks((prev) => {
      if (type === "header") return [...prev, { type, title: "Title", subtitle: "" }];
      if (type === "paragraph") return [...prev, { type, text: "Paragraph text" }];
      if (type === "button")
        return [...prev, { type, label: "Call to action", url: "https://example.com" }];
      if (type === "divider") return [...prev, { type }];
      if (type === "spacer") return [...prev, { type, size: "md" }];
      if (type === "footer") return [...prev, { type, text: "Footer text" }];
      if (type === "image")
        return [
          ...prev,
          { type, src: "https://placehold.co/640x320/png", alt: "Hero image", width: 560 }
        ];
      if (type === "columns")
        return [
          ...prev,
          {
            type,
            leftTitle: "Left heading",
            leftText: "Left column copy goes here.",
            rightTitle: "Right heading",
            rightText: "Right column copy goes here."
          }
        ];
      if (type === "hero")
        return [
          ...prev,
          {
            type,
            title: "Launch the next chapter",
            subtitle: "A bold subheading that sells the value",
            body: "Highlight the main benefit and add a short supporting message.",
            imageUrl: "https://placehold.co/360x360/png",
            imageAlt: "Product preview",
            imagePosition: "right",
            imageWidth: 220
          }
        ];
      if (type === "logoGrid")
        return [
          ...prev,
          {
            type,
            logos: [
              "https://placehold.co/160x60/png",
              "https://placehold.co/160x60/png",
              "https://placehold.co/160x60/png"
            ],
            columns: 3,
            maxLogoWidth: 120
          }
        ];
      if (type === "testimonial")
        return [
          ...prev,
          {
            type,
            quote: "This workflow saved us hours every week.",
            author: "Taylor Reed",
            role: "Operations Lead",
            company: "PlayerXchange"
          }
        ];
      if (type === "kpis")
        return [
          ...prev,
          {
            type,
            items: [
              { label: "Response time", value: "1.9h" },
              { label: "NPS", value: "62" },
              { label: "Automations", value: "38" }
            ],
            columns: 3
          }
        ];
      if (type === "pricing")
        return [
          ...prev,
          {
            type,
            plans: [
              { name: "Starter", price: "$49", description: "Core support suite", ctaLabel: "Choose", ctaUrl: "https://example.com" },
              { name: "Growth", price: "$149", description: "Automation + SLA tracking", ctaLabel: "Choose", ctaUrl: "https://example.com" }
            ],
            highlightIndex: 1,
            columns: 2
          }
        ];
      if (type === "timeline")
        return [
          ...prev,
          {
            type,
            steps: [
              { title: "Confirm access", detail: "Verify your mailbox permissions." },
              { title: "Sync mailboxes", detail: "Import the latest threads." }
            ],
            accentColor: theme?.accentColor ?? "#14b8a6"
          }
        ];
      if (type === "faq")
        return [
          ...prev,
          {
            type,
            items: [
              { question: "How long does setup take?", answer: "Most teams are live in under an hour." },
              { question: "Can I add more agents?", answer: "Yes, add them in the admin portal." }
            ],
            compact: false
          }
        ];
      if (type === "labeledDivider")
        return [
          ...prev,
          {
            type,
            label: "Next steps",
            lineColor: "#e2e8f0"
          }
        ];
      if (type === "signature")
        return [
          ...prev,
          {
            type,
            signoff: "Warm regards,",
            name: "Alex Morgan",
            title: "Customer Success",
            email: "support@example.com",
            phone: "+1 (555) 012-8890",
            avatarUrl: "https://placehold.co/80x80/png"
          }
        ];
      if (type === "legal")
        return [
          ...prev,
          {
            type,
            text: "You received this email because you are an active customer. Reply to opt out.",
            fontSize: 11
          }
        ];
      return prev;
    });
  };

  const updateBlock = (index: number, block: EmailBlock) => {
    applyBlocks((prev) => prev.map((item, idx) => (idx === index ? block : item)));
  };

  const removeBlock = (index: number) => {
    applyBlocks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    applyBlocks((prev) => {
      const next = [...prev];
      const target = next[index];
      const swapIndex = index + direction;
      if (!next[swapIndex]) return next;
      next[index] = next[swapIndex];
      next[swapIndex] = target;
      return next;
    });
  };

  const addPreset = (preset: "hero" | "cta" | "feature" | "footer") => {
    applyBlocks((prev) => {
      if (preset === "hero") {
        return [
          ...prev,
          { type: "header", title: "Big announcement", subtitle: "A crisp subheading goes here." },
          { type: "paragraph", text: "Use this space to introduce the announcement and next steps." }
        ];
      }
      if (preset === "cta") {
        return [
          ...prev,
          { type: "paragraph", text: "Ready to get started? Here is your next step." },
          { type: "button", label: "Open dashboard", url: "https://example.com" }
        ];
      }
      if (preset === "feature") {
        return [
          ...prev,
          {
            type: "columns",
            leftTitle: "What changed",
            leftText: "Summarize the key update in one to two sentences.",
            rightTitle: "Why it matters",
            rightText: "Describe the impact and how users benefit."
          }
        ];
      }
      return [...prev, { type: "footer", text: "Thanks for being part of our community." }];
    });
  };

  const updateBlockStyle = (index: number, style: Partial<BlockStyle>) => {
    const block = blocks[index];
    if (!block) return;
    updateBlock(index, { ...block, style: { ...(block.style ?? {}), ...style } });
  };

  const updateButtonStyle = (index: number, style: Partial<ButtonStyle>) => {
    const block = blocks[index];
    if (!block || block.type !== "button") return;
    updateBlock(index, {
      ...block,
      buttonStyle: { ...(block.buttonStyle ?? {}), ...style }
    });
  };

  const applyPaletteColor = (color: string) => {
    if (selectedBlock === null) return;
    const block = blocks[selectedBlock];
    if (!block) return;
    if (paletteTarget === "button" && block.type === "button") {
      updateButtonStyle(selectedBlock, { backgroundColor: color, textColor: "#ffffff" });
      return;
    }
    if (paletteTarget === "background") {
      updateBlockStyle(selectedBlock, { backgroundColor: color });
      return;
    }
    updateBlockStyle(selectedBlock, { textColor: color });
  };

  const applyStylePreset = (preset: "announcement" | "soft" | "dark") => {
    if (selectedBlock === null) return;
    if (preset === "announcement") {
      updateBlockStyle(selectedBlock, {
        backgroundColor: palette.primary[3],
        textColor: theme?.textColor ?? "#0f172a",
        padding: 18,
        borderRadius: 14
      });
      return;
    }
    if (preset === "soft") {
      updateBlockStyle(selectedBlock, {
        backgroundColor: palette.neutral[4],
        textColor: theme?.textColor ?? "#0f172a",
        padding: 16,
        borderRadius: 12
      });
      return;
    }
    updateBlockStyle(selectedBlock, {
      backgroundColor: palette.neutral[0],
      textColor: "#ffffff",
      padding: 18,
      borderRadius: 14
    });
  };

  const pushToast = (message: string, tone: "success" | "error") => {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    toastTimerRef.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      delete toastTimerRef.current[id];
    }, 2200);
  };

  const saveTemplate = async (silent = false) => {
    if (!silent) {
      setStatus("Saving...");
    } else {
      setAutosaveStatus("Autosaving...");
    }
    const payload = {
      name,
      subject,
      body: "",
      signature: "",
      mailbox: "all",
      blocks,
      isBuilder: true
    };
    if (activeTemplateId) {
      await authFetch(`/api/templates/${activeTemplateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      const res = await authFetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data?.template?.id) {
        setActiveTemplateId(data.template.id);
        if (typeof window !== "undefined") {
          localStorage.setItem(lastTemplateKey, data.template.id);
        }
      }
    }
    await loadTemplates();
    if (!silent) {
      setStatus("Saved");
      setTimeout(() => setStatus(""), 1200);
    } else {
      setAutosaveStatus("Autosaved");
      setTimeout(() => setAutosaveStatus(""), 1200);
      pushToast("Autosaved changes", "success");
    }
  };

  const isMobilePreview = previewMode === "mobile";
  const previewWidth =
    previewMode === "mobile" ? "360px" : previewMode === "full" ? "100%" : "600px";
  const previewBlocks = useMemo(
    () =>
      isMobilePreview
        ? blocks.map((block) => {
            if (block.type === "logoGrid") {
              return { ...block, columns: 1 };
            }
            if (block.type === "kpis") {
              return { ...block, columns: 1 };
            }
            if (block.type === "pricing") {
              return { ...block, highlightIndex: block.highlightIndex, columns: 1 };
            }
            if (block.type === "columns") {
              return { ...block, stackOnMobile: true };
            }
            if (block.type === "hero") {
              return { ...block, stackOnMobile: true };
            }
            return block;
          })
        : blocks,
    [blocks, isMobilePreview]
  );

  const preview = async () => {
    setPreviewLoading(true);
    try {
      const res = await authFetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: previewBlocks })
      });
      const data = await res.json();
      const html = applyTokens(data.html ?? "", tokenPreview);
      const text = applyTokens(data.text ?? "", tokenPreview);
      setPreviewHtml(html);
      setPreviewText(text);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (blocks.length) {
      preview().catch(() => null);
    } else {
      setPreviewHtml("");
      setPreviewText("");
    }
  }, [blocks, tokenPreview, previewBlocks]);

  useEffect(() => {
    if (!token || loading) return;
    if (!name && !subject && blocks.length === 0) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      saveTemplate(true).catch(() => {
        setAutosaveStatus("Autosave failed");
        pushToast("Autosave failed", "error");
      });
    }, 1200);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [name, subject, blocks, token, loading, activeTemplateId]);

  const palette = useMemo(() => buildPalette(theme), [theme]);

  const blockEditor = useMemo(
    () =>
      blocks.map((block, idx) => (
        <div key={`block-${idx}`} className="builder-row">
          <div
            className={`builder-drop ${dropIndex === idx ? "active" : ""}`}
            aria-hidden="true"
          />
          <div
            className="panel-card builder-block"
            style={{
              display: "grid",
              gap: 10,
              border: selectedBlock === idx ? "2px solid #0ea5e9" : undefined
            }}
            tabIndex={0}
            onDragOver={(event) => {
              event.preventDefault();
              setDropIndex(idx);
            }}
            onDragLeave={() => setDropIndex(null)}
            onDrop={() => {
              if (dragIndex === null || dragIndex === idx) return;
              applyBlocks((prev) => {
                const next = [...prev];
                const [moved] = next.splice(dragIndex, 1);
                next.splice(idx, 0, moved);
                return next;
              });
              setDragIndex(null);
              setDropIndex(null);
            }}
            onKeyDown={(event) => {
              if (event.altKey && event.key === "ArrowUp") {
                event.preventDefault();
                moveBlock(idx, -1);
              }
              if (event.altKey && event.key === "ArrowDown") {
                event.preventDefault();
                moveBlock(idx, 1);
              }
              if (event.key === "Delete") {
                event.preventDefault();
                removeBlock(idx);
              }
            }}
            onClick={() => setSelectedBlock(idx)}
          >
            <div className="builder-title">
              <span
                className="builder-handle"
                draggable
                aria-label="Drag to reorder"
                onDragStart={() => setDragIndex(idx)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                }}
              >
                ||
              </span>
              <strong>{block.type}</strong>
            </div>
            {block.type === "header" && (
              <>
                <input
                  className="filter-input"
                  value={block.title}
                  onChange={(event) => updateBlock(idx, { ...block, title: event.target.value })}
                />
                <input
                  className="filter-input"
                  value={block.subtitle ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, subtitle: event.target.value })}
                />
              </>
            )}
            {block.type === "paragraph" && (
              <textarea
                className="filter-input"
                value={block.text}
                onChange={(event) => updateBlock(idx, { ...block, text: event.target.value })}
              />
            )}
            {block.type === "button" && (
              <>
                <input
                  className="filter-input"
                  value={block.label}
                  onChange={(event) => updateBlock(idx, { ...block, label: event.target.value })}
                />
                <input
                  className="filter-input"
                  value={block.url}
                  onChange={(event) => updateBlock(idx, { ...block, url: event.target.value })}
                />
                {!/^https?:\/\//i.test(block.url) && (
                  <p style={{ color: "#b45309", fontSize: 12 }}>
                    Button URL should start with http:// or https://
                  </p>
                )}
                <select
                  className="filter-select"
                  value={block.buttonStyle?.variant ?? "primary"}
                  onChange={(event) =>
                    updateButtonStyle(idx, { variant: event.target.value as ButtonStyle["variant"] })
                  }
                >
                  <option value="primary">Primary</option>
                  <option value="outline">Outline</option>
                  <option value="ghost">Ghost</option>
                </select>
                <div className="filter-row">
                  <input
                    className="filter-input"
                    placeholder="Button background"
                    value={block.buttonStyle?.backgroundColor ?? ""}
                    onChange={(event) => updateButtonStyle(idx, { backgroundColor: event.target.value })}
                  />
                  <input
                    className="filter-input"
                    placeholder="Button text color"
                    value={block.buttonStyle?.textColor ?? ""}
                    onChange={(event) => updateButtonStyle(idx, { textColor: event.target.value })}
                  />
                  <input
                    className="filter-input"
                    placeholder="Button border color"
                    value={block.buttonStyle?.borderColor ?? ""}
                    onChange={(event) => updateButtonStyle(idx, { borderColor: event.target.value })}
                  />
                </div>
              </>
            )}
            {block.type === "spacer" && (
              <select
                className="filter-select"
                value={block.size}
                onChange={(event) =>
                  updateBlock(idx, { ...block, size: event.target.value as "sm" | "md" | "lg" })
                }
              >
                <option value="sm">Small</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
              </select>
            )}
            {block.type === "footer" && (
              <input
                className="filter-input"
                value={block.text}
                onChange={(event) => updateBlock(idx, { ...block, text: event.target.value })}
              />
            )}
            {block.type === "image" && (
              <>
                <input
                  className="filter-input"
                  placeholder="Image URL"
                  value={block.src}
                  onChange={(event) => updateBlock(idx, { ...block, src: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Alt text"
                  value={block.alt ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, alt: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Link URL (optional)"
                  value={block.href ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, href: event.target.value })}
                />
                <input
                  className="filter-input"
                  type="number"
                  min={120}
                  placeholder="Width (px)"
                  value={block.width ?? 560}
                  onChange={(event) =>
                    updateBlock(idx, { ...block, width: Number(event.target.value || 560) })
                  }
                />
              </>
            )}
            {block.type === "columns" && (
              <>
                <input
                  className="filter-input"
                  placeholder="Left title"
                  value={block.leftTitle ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, leftTitle: event.target.value })}
                />
                <textarea
                  className="filter-input"
                  placeholder="Left text"
                  value={block.leftText}
                  onChange={(event) => updateBlock(idx, { ...block, leftText: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Right title"
                  value={block.rightTitle ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, rightTitle: event.target.value })}
                />
                <textarea
                  className="filter-input"
                  placeholder="Right text"
                  value={block.rightText}
                  onChange={(event) => updateBlock(idx, { ...block, rightText: event.target.value })}
                />
              </>
            )}
            {block.type === "hero" && (
              <>
                <input
                  className="filter-input"
                  placeholder="Title"
                  value={block.title}
                  onChange={(event) => updateBlock(idx, { ...block, title: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Subtitle"
                  value={block.subtitle ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, subtitle: event.target.value })}
                />
                <textarea
                  className="filter-input"
                  placeholder="Body"
                  value={block.body}
                  onChange={(event) => updateBlock(idx, { ...block, body: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Image URL"
                  value={block.imageUrl}
                  onChange={(event) => updateBlock(idx, { ...block, imageUrl: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Image alt"
                  value={block.imageAlt ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, imageAlt: event.target.value })}
                />
                <select
                  className="filter-select"
                  value={block.imagePosition ?? "right"}
                  onChange={(event) =>
                    updateBlock(idx, { ...block, imagePosition: event.target.value as "left" | "right" })
                  }
                >
                  <option value="right">Image right</option>
                  <option value="left">Image left</option>
                </select>
                <input
                  className="filter-input"
                  type="number"
                  min={160}
                  max={360}
                  placeholder="Image width"
                  value={block.imageWidth ?? 220}
                  onChange={(event) =>
                    updateBlock(idx, { ...block, imageWidth: Number(event.target.value || 220) })
                  }
                />
              </>
            )}
            {block.type === "logoGrid" && (
              <>
                <textarea
                  className="filter-input"
                  placeholder="Logo URLs (one per line)"
                  value={block.logos.join("\n")}
                  onChange={(event) =>
                    updateBlock(idx, {
                      ...block,
                      logos: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean)
                    })
                  }
                />
                <div className="filter-row">
                  <input
                    className="filter-input"
                    type="number"
                    min={2}
                    max={4}
                    placeholder="Columns"
                    value={block.columns ?? 3}
                    onChange={(event) =>
                      updateBlock(idx, { ...block, columns: Number(event.target.value || 3) })
                    }
                  />
                  <input
                    className="filter-input"
                    type="number"
                    min={60}
                    max={180}
                    placeholder="Max logo width"
                    value={block.maxLogoWidth ?? 120}
                    onChange={(event) =>
                      updateBlock(idx, { ...block, maxLogoWidth: Number(event.target.value || 120) })
                    }
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="button secondary"
                    onClick={() =>
                      updateBlock(idx, {
                        ...block,
                        logos: [...block.logos, "https://placehold.co/160x60/png"]
                      })
                    }
                  >
                    Add logo
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      updateBlock(idx, { ...block, logos: block.logos.slice(0, -1) })
                    }
                    disabled={block.logos.length <= 1}
                  >
                    Remove last
                  </button>
                </div>
              </>
            )}
            {block.type === "testimonial" && (
              <>
                <textarea
                  className="filter-input"
                  placeholder="Quote"
                  value={block.quote}
                  onChange={(event) => updateBlock(idx, { ...block, quote: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Author"
                  value={block.author}
                  onChange={(event) => updateBlock(idx, { ...block, author: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Role"
                  value={block.role ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, role: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Company"
                  value={block.company ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, company: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Avatar URL"
                  value={block.avatarUrl ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, avatarUrl: event.target.value })}
                />
              </>
            )}
            {block.type === "kpis" && (
              <>
                <textarea
                  className="filter-input"
                  placeholder="KPI lines (Label|Value)"
                  value={block.items.map((item) => `${item.label}|${item.value}`).join("\n")}
                  onChange={(event) =>
                    updateBlock(idx, {
                      ...block,
                      items: event.target.value
                        .split("\n")
                        .map((line) => line.split("|").map((val) => val.trim()))
                        .filter((parts) => parts[0] && parts[1])
                        .map(([label, value]) => ({ label, value }))
                    })
                  }
                />
                <input
                  className="filter-input"
                  type="number"
                  min={2}
                  max={4}
                  placeholder="Columns"
                  value={block.columns ?? block.items.length}
                  onChange={(event) =>
                    updateBlock(idx, { ...block, columns: Number(event.target.value || 3) })
                  }
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="button secondary"
                    onClick={() =>
                      updateBlock(idx, {
                        ...block,
                        items: [...block.items, { label: "New metric", value: "0" }]
                      })
                    }
                  >
                    Add KPI
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      updateBlock(idx, { ...block, items: block.items.slice(0, -1) })
                    }
                    disabled={block.items.length <= 1}
                  >
                    Remove last
                  </button>
                </div>
              </>
            )}
            {block.type === "pricing" && (
              <>
                <textarea
                  className="filter-input"
                  placeholder="Plans (Name|Price|Description|CTA label|CTA url)"
                  value={block.plans
                    .map((plan) => `${plan.name}|${plan.price}|${plan.description ?? ""}|${plan.ctaLabel ?? ""}|${plan.ctaUrl ?? ""}`)
                    .join("\n")}
                  onChange={(event) =>
                    updateBlock(idx, {
                      ...block,
                      plans: event.target.value
                        .split("\n")
                        .map((line) => line.split("|").map((val) => val.trim()))
                        .filter((parts) => parts[0] && parts[1])
                        .map(([name, price, description, ctaLabel, ctaUrl]) => ({
                          name,
                          price,
                          description,
                          ctaLabel,
                          ctaUrl
                        }))
                    })
                  }
                />
                <input
                  className="filter-input"
                  type="number"
                  min={1}
                  max={3}
                  placeholder="Columns"
                  value={block.columns ?? 3}
                  onChange={(event) =>
                    updateBlock(idx, { ...block, columns: Number(event.target.value || 3) })
                  }
                />
                <input
                  className="filter-input"
                  type="number"
                  min={0}
                  placeholder="Highlight plan index"
                  value={block.highlightIndex ?? 0}
                  onChange={(event) =>
                    updateBlock(idx, { ...block, highlightIndex: Number(event.target.value || 0) })
                  }
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="button secondary"
                    onClick={() =>
                      updateBlock(idx, {
                        ...block,
                        plans: [
                          ...block.plans,
                          { name: "New plan", price: "$0", description: "Plan details" }
                        ]
                      })
                    }
                  >
                    Add plan
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      updateBlock(idx, { ...block, plans: block.plans.slice(0, -1) })
                    }
                    disabled={block.plans.length <= 1}
                  >
                    Remove last
                  </button>
                </div>
              </>
            )}
            {block.type === "timeline" && (
              <>
                <textarea
                  className="filter-input"
                  placeholder="Timeline steps (Title|Detail)"
                  value={block.steps
                    .map((step) => `${step.title}|${step.detail ?? ""}`)
                    .join("\n")}
                  onChange={(event) =>
                    updateBlock(idx, {
                      ...block,
                      steps: event.target.value
                        .split("\n")
                        .map((line) => line.split("|").map((val) => val.trim()))
                        .filter((parts) => parts[0])
                        .map(([title, detail]) => ({ title, detail }))
                    })
                  }
                />
                <input
                  className="filter-input"
                  placeholder="Accent color"
                  value={block.accentColor ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, accentColor: event.target.value })}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="button secondary"
                    onClick={() =>
                      updateBlock(idx, {
                        ...block,
                        steps: [...block.steps, { title: "New step", detail: "" }]
                      })
                    }
                  >
                    Add step
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      updateBlock(idx, { ...block, steps: block.steps.slice(0, -1) })
                    }
                    disabled={block.steps.length <= 1}
                  >
                    Remove last
                  </button>
                </div>
              </>
            )}
            {block.type === "faq" && (
              <>
                <textarea
                  className="filter-input"
                  placeholder="FAQ (Question|Answer)"
                  value={block.items
                    .map((item) => `${item.question}|${item.answer}`)
                    .join("\n")}
                  onChange={(event) =>
                    updateBlock(idx, {
                      ...block,
                      items: event.target.value
                        .split("\n")
                        .map((line) => line.split("|").map((val) => val.trim()))
                        .filter((parts) => parts[0] && parts[1])
                        .map(([question, answer]) => ({ question, answer }))
                    })
                  }
                />
                <select
                  className="filter-select"
                  value={block.compact ? "compact" : "cozy"}
                  onChange={(event) => updateBlock(idx, { ...block, compact: event.target.value === "compact" })}
                >
                  <option value="cozy">Cozy spacing</option>
                  <option value="compact">Compact spacing</option>
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="button secondary"
                    onClick={() =>
                      updateBlock(idx, {
                        ...block,
                        items: [...block.items, { question: "New question", answer: "New answer" }]
                      })
                    }
                  >
                    Add FAQ
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      updateBlock(idx, { ...block, items: block.items.slice(0, -1) })
                    }
                    disabled={block.items.length <= 1}
                  >
                    Remove last
                  </button>
                </div>
              </>
            )}
            {block.type === "labeledDivider" && (
              <>
                <input
                  className="filter-input"
                  placeholder="Divider label"
                  value={block.label}
                  onChange={(event) => updateBlock(idx, { ...block, label: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Line color"
                  value={block.lineColor ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, lineColor: event.target.value })}
                />
              </>
            )}
            {block.type === "signature" && (
              <>
                <input
                  className="filter-input"
                  placeholder="Signoff"
                  value={block.signoff}
                  onChange={(event) => updateBlock(idx, { ...block, signoff: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Name"
                  value={block.name}
                  onChange={(event) => updateBlock(idx, { ...block, name: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Title"
                  value={block.title ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, title: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Email"
                  value={block.email ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, email: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Phone"
                  value={block.phone ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, phone: event.target.value })}
                />
                <input
                  className="filter-input"
                  placeholder="Avatar URL"
                  value={block.avatarUrl ?? ""}
                  onChange={(event) => updateBlock(idx, { ...block, avatarUrl: event.target.value })}
                />
              </>
            )}
            {block.type === "legal" && (
              <>
                <textarea
                  className="filter-input"
                  placeholder="Legal disclaimer"
                  value={block.text}
                  onChange={(event) => updateBlock(idx, { ...block, text: event.target.value })}
                />
                <input
                  className="filter-input"
                  type="number"
                  min={9}
                  max={14}
                  placeholder="Font size"
                  value={block.fontSize ?? 11}
                  onChange={(event) =>
                    updateBlock(idx, { ...block, fontSize: Number(event.target.value || 11) })
                  }
                />
              </>
            )}
            <div className="filter-row">
              <select
                className="filter-select"
                value={block.style?.textAlign ?? "left"}
                onChange={(event) =>
                  updateBlockStyle(idx, { textAlign: event.target.value as BlockStyle["textAlign"] })
                }
              >
                <option value="left">Align left</option>
                <option value="center">Align center</option>
                <option value="right">Align right</option>
              </select>
              <input
                className="filter-input"
                type="number"
                min={10}
                max={28}
                placeholder="Font size"
                value={block.style?.fontSize ?? ""}
                onChange={(event) =>
                  updateBlockStyle(idx, { fontSize: Number(event.target.value || 0) })
                }
              />
              <input
                className="filter-input"
                type="number"
                min={0}
                max={60}
                placeholder="Padding"
                value={block.style?.padding ?? ""}
                onChange={(event) =>
                  updateBlockStyle(idx, { padding: Number(event.target.value || 0) })
                }
              />
            </div>
            <div className="filter-row">
              <input
                className="filter-input"
                placeholder="Text color"
                value={block.style?.textColor ?? ""}
                onChange={(event) => updateBlockStyle(idx, { textColor: event.target.value })}
              />
              <input
                className="filter-input"
                placeholder="Background color"
                value={block.style?.backgroundColor ?? ""}
                onChange={(event) => updateBlockStyle(idx, { backgroundColor: event.target.value })}
              />
              <input
                className="filter-input"
                type="number"
                min={0}
                max={32}
                placeholder="Radius"
                value={block.style?.borderRadius ?? ""}
                onChange={(event) =>
                  updateBlockStyle(idx, { borderRadius: Number(event.target.value || 0) })
                }
              />
            </div>
            {block.style?.textColor && block.style?.backgroundColor && (
              <p style={{ color: "#b45309", fontSize: 12 }}>
                Contrast ratio: {contrastRatio(block.style.textColor, block.style.backgroundColor).toFixed(2)}
                {contrastRatio(block.style.textColor, block.style.backgroundColor) < 4.5
                  ? " (low contrast)"
                  : ""}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="button secondary" onClick={() => moveBlock(idx, -1)}>Up</button>
              <button className="button secondary" onClick={() => moveBlock(idx, 1)}>Down</button>
              <button className="button secondary" onClick={() => removeBlock(idx)}>Remove</button>
            </div>
            <p style={{ color: "#94a3b8", fontSize: 12 }}>Shortcut: Alt + Up/Down, Delete</p>
          </div>
        </div>
      )),
    [blocks, dropIndex, dragIndex, selectedBlock]
  );

  return (
    <main style={{ padding: "48px 6vw 120px", display: "grid", gap: 24, position: "relative" }}>
      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
        </div>
      )}
      {toasts.length > 0 && (
        <div style={{ position: "fixed", right: 28, bottom: 28, display: "grid", gap: 10, zIndex: 60 }}>
          {toasts.map((toast) => (
            <div
              key={toast.id}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                color: toast.tone === "error" ? "#7f1d1d" : "#0f172a",
                background: toast.tone === "error" ? "#fee2e2" : "#ecfeff",
                border: `1px solid ${toast.tone === "error" ? "#fecaca" : "#a5f3fc"}`,
                boxShadow: "0 12px 24px rgba(15, 23, 42, 0.12)",
                fontSize: 13
              }}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
      <section className="hero-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Email Builder</strong>
          <button className="button secondary" onClick={() => router.push("/admin")}>
            Back to admin
          </button>
        </div>
        <div className="filter-row" style={{ marginTop: 16 }}>
          <select
            className="filter-select"
            value={activeTemplateId}
            onChange={(event) => setActiveTemplateId(event.target.value)}
          >
            <option value="">New template</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
            ))}
          </select>
          <input
            className="filter-input"
            placeholder="Template name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="filter-input"
            placeholder="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
          <button className="button primary" onClick={() => saveTemplate(false)}>Save</button>
          <button className="button secondary" onClick={preview}>Preview</button>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>{status || autosaveStatus}</span>
        </div>
      </section>

      <section className="builder-grid">
        <div className="hero-card">
          <strong>Blocks</strong>
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <details open>
              <summary style={{ fontWeight: 600, cursor: "pointer" }}>Core</summary>
              <div className="filter-row" style={{ marginTop: 10 }}>
                <button className="button secondary" onClick={() => addBlock("header")}>Header</button>
                <button className="button secondary" onClick={() => addBlock("paragraph")}>Paragraph</button>
                <button className="button secondary" onClick={() => addBlock("button")}>Button</button>
                <button className="button secondary" onClick={() => addBlock("divider")}>Divider</button>
                <button className="button secondary" onClick={() => addBlock("spacer")}>Spacer</button>
                <button className="button secondary" onClick={() => addBlock("footer")}>Footer</button>
              </div>
            </details>
            <details>
              <summary style={{ fontWeight: 600, cursor: "pointer" }}>Layout</summary>
              <div className="filter-row" style={{ marginTop: 10 }}>
                <button className="button secondary" onClick={() => addBlock("columns")}>Columns</button>
                <button className="button secondary" onClick={() => addBlock("hero")}>Hero</button>
                <button className="button secondary" onClick={() => addBlock("labeledDivider")}>Labeled divider</button>
              </div>
            </details>
            <details>
              <summary style={{ fontWeight: 600, cursor: "pointer" }}>Media</summary>
              <div className="filter-row" style={{ marginTop: 10 }}>
                <button className="button secondary" onClick={() => addBlock("image")}>Image</button>
                <button className="button secondary" onClick={() => addBlock("logoGrid")}>Logo grid</button>
              </div>
            </details>
            <details>
              <summary style={{ fontWeight: 600, cursor: "pointer" }}>Engagement</summary>
              <div className="filter-row" style={{ marginTop: 10 }}>
                <button className="button secondary" onClick={() => addBlock("testimonial")}>Testimonial</button>
                <button className="button secondary" onClick={() => addBlock("faq")}>FAQ</button>
              </div>
            </details>
            <details>
              <summary style={{ fontWeight: 600, cursor: "pointer" }}>Data</summary>
              <div className="filter-row" style={{ marginTop: 10 }}>
                <button className="button secondary" onClick={() => addBlock("kpis")}>KPIs</button>
                <button className="button secondary" onClick={() => addBlock("pricing")}>Pricing</button>
                <button className="button secondary" onClick={() => addBlock("timeline")}>Timeline</button>
              </div>
            </details>
            <details>
              <summary style={{ fontWeight: 600, cursor: "pointer" }}>Legal & Signature</summary>
              <div className="filter-row" style={{ marginTop: 10 }}>
                <button className="button secondary" onClick={() => addBlock("signature")}>Signature</button>
                <button className="button secondary" onClick={() => addBlock("legal")}>Legal</button>
              </div>
            </details>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button className="button secondary" onClick={() => addPreset("hero")}>Hero preset</button>
            <button className="button secondary" onClick={() => addPreset("cta")}>CTA preset</button>
            <button className="button secondary" onClick={() => addPreset("feature")}>Feature split</button>
            <button className="button secondary" onClick={() => addPreset("footer")}>Footer preset</button>
          </div>
          <p style={{ marginTop: 10, color: "#94a3b8", fontSize: 12 }}>
            Drag blocks to reorder.
          </p>
          <div className="panel-card" style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <strong>Brand palette</strong>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {(["text", "background", "button"] as const).map((target) => (
                <button
                  key={target}
                  className={paletteTarget === target ? "button primary" : "button secondary"}
                  onClick={() => setPaletteTarget(target)}
                >
                  Apply to {target}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {palette.primary.map((color) => (
                  <button
                    key={color}
                    aria-label={`Apply ${color}`}
                    onClick={() => applyPaletteColor(color)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      border: "1px solid #e2e8f0",
                      background: color,
                      cursor: "pointer"
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {palette.accent.map((color) => (
                  <button
                    key={color}
                    aria-label={`Apply ${color}`}
                    onClick={() => applyPaletteColor(color)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      border: "1px solid #e2e8f0",
                      background: color,
                      cursor: "pointer"
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {palette.neutral.map((color) => (
                  <button
                    key={color}
                    aria-label={`Apply ${color}`}
                    onClick={() => applyPaletteColor(color)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      border: "1px solid #e2e8f0",
                      background: color,
                      cursor: "pointer"
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="button secondary" onClick={() => applyStylePreset("announcement")}>
                Announcement style
              </button>
              <button className="button secondary" onClick={() => applyStylePreset("soft")}>
                Soft card
              </button>
              <button className="button secondary" onClick={() => applyStylePreset("dark")}>
                Dark block
              </button>
            </div>
            {!theme && (
              <p style={{ color: "#94a3b8", fontSize: 12 }}>
                Theme not loaded yet. Using default palette.
              </p>
            )}
            {selectedBlock === null && (
              <p style={{ color: "#94a3b8", fontSize: 12 }}>
                Select a block to apply colors.
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="button secondary" onClick={undo} disabled={historyIndex <= 0}>
              Undo
            </button>
            <button
              className="button secondary"
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
            >
              Redo
            </button>
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {blockEditor}
            <div
              className="builder-drop-zone"
              onDragOver={(event) => {
                event.preventDefault();
                setDropIndex(blocks.length);
              }}
              onDragLeave={() => setDropIndex(null)}
              onDrop={() => {
                if (dragIndex === null || dragIndex === blocks.length) return;
                applyBlocks((prev) => {
                  const next = [...prev];
                  const [moved] = next.splice(dragIndex, 1);
                  next.push(moved);
                  return next;
                });
                setDragIndex(null);
                setDropIndex(null);
              }}
            >
              <div
                className={`builder-drop ${dropIndex === blocks.length ? "active" : ""}`}
                aria-hidden="true"
              />
              <span>Drop to move to end</span>
            </div>
          </div>
        </div>

        <div className="hero-card">
          <strong>Preview</strong>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button
              className={previewMode === "desktop" ? "button primary" : "button secondary"}
              onClick={() => setPreviewMode("desktop")}
            >
              Desktop
            </button>
            <button
              className={previewMode === "mobile" ? "button primary" : "button secondary"}
              onClick={() => setPreviewMode("mobile")}
            >
              Mobile
            </button>
            <button
              className={previewMode === "full" ? "button primary" : "button secondary"}
              onClick={() => setPreviewMode("full")}
            >
              Full width
            </button>
            <label style={{ fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={tokenPreview}
                onChange={(event) => setTokenPreview(event.target.checked)}
              />
              Preview tokens
            </label>
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            <div style={{ position: "relative", minHeight: 420, display: "grid", placeItems: "center" }}>
              {previewLoading && (
                <div className="loading-overlay">
                  <div className="spinner" />
                </div>
              )}
              <iframe
                title="email-preview"
                sandbox=""
                srcDoc={previewHtml}
                style={{
                  width: previewWidth,
                  height: "100%",
                  minHeight: 420,
                  display: "block",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12
                }}
              />
            </div>
            <textarea className="filter-input" value={previewText} readOnly />
          </div>
        </div>
      </section>
      <AssistantWidget page="builder" previewBlocks={previewBlocks} />
    </main>
  );
}
