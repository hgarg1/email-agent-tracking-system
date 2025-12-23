import type { BlockStyle, ButtonStyle, EmailBlock, TenantTheme } from "./types";

type RenderedEmail = {
  html: string;
  text: string;
};

const buildStyle = (style: Record<string, string | number | undefined>) =>
  Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}:${value}`)
    .join("; ");

const resolvePadding = (style: BlockStyle | undefined, fallback: number) =>
  typeof style?.padding === "number" ? `${style.padding}px` : `${fallback}px`;

const resolveTextAlign = (style: BlockStyle | undefined) => style?.textAlign ?? "left";

const resolveFontSize = (style: BlockStyle | undefined, fallback: number) =>
  typeof style?.fontSize === "number" ? `${style.fontSize}px` : `${fallback}px`;

const resolveTextColor = (style: BlockStyle | undefined, theme: TenantTheme) =>
  style?.textColor ?? theme.textColor;

const resolveBackground = (style: BlockStyle | undefined) => style?.backgroundColor ?? "transparent";

const renderButton = (buttonStyle: ButtonStyle | undefined, theme: TenantTheme) => {
  const variant = buttonStyle?.variant ?? "primary";
  const background =
    buttonStyle?.backgroundColor ??
    (variant === "primary" ? theme.primaryColor : "transparent");
  const textColor =
    buttonStyle?.textColor ??
    (variant === "primary" ? "#ffffff" : theme.primaryColor);
  const borderColor = buttonStyle?.borderColor ?? theme.primaryColor;
  const radius = typeof buttonStyle?.borderRadius === "number" ? `${buttonStyle.borderRadius}px` : "999px";
  const padding = buttonStyle?.padding ?? "12px 18px";
  const border = variant === "outline" ? `1px solid ${borderColor}` : "1px solid transparent";
  const ghostStyles =
    variant === "ghost" ? "background:transparent; border:1px solid transparent;" : "";
  return {
    background,
    textColor,
    radius,
    padding,
    border,
    ghostStyles
  };
};

function blockToHtml(block: EmailBlock, theme: TenantTheme) {
  const containerStyle = buildStyle({
    padding: resolvePadding(block.style, block.type === "header" ? 24 : block.type === "footer" ? 12 : 8),
    color: resolveTextColor(block.style, theme),
    "text-align": resolveTextAlign(block.style),
    "background-color": resolveBackground(block.style),
    "border-radius": block.style?.borderRadius ? `${block.style.borderRadius}px` : undefined,
    "border-color": block.style?.borderColor,
    "border-style": block.style?.borderColor ? "solid" : undefined,
    "border-width": block.style?.borderColor ? "1px" : undefined
  });
  switch (block.type) {
    case "header":
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px; padding-bottom:8px;">
            <h1 style="margin:0; font-size:${resolveFontSize(block.style, 24)}; font-weight:700;">${block.title}</h1>
            ${
              block.subtitle
                ? `<p style="margin:6px 0 0; color:#64748b; font-size:${resolveFontSize(block.style, 14)};">${block.subtitle}</p>`
                : ""
            }
          </td>
        </tr>`;
    case "paragraph":
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px; font-size:${resolveFontSize(
            block.style,
            15
          )}; line-height:1.6;">
            ${block.text}
          </td>
        </tr>`;
    case "button":
      const buttonStyles = renderButton(block.buttonStyle, theme);
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            <a href="${block.url}"
              style="display:inline-block; background:${buttonStyles.background}; color:${buttonStyles.textColor}; padding:${buttonStyles.padding}; text-decoration:none; border-radius:${buttonStyles.radius}; font-weight:600; border:${buttonStyles.border}; ${buttonStyles.ghostStyles}">
              ${block.label}
            </a>
          </td>
        </tr>`;
    case "divider":
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            <hr style="border:none; border-top:1px solid #e2e8f0; margin:0;" />
          </td>
        </tr>`;
    case "spacer":
      return `
        <tr><td style="height:${block.size === "lg" ? 28 : block.size === "md" ? 18 : 10}px;"></td></tr>`;
    case "footer":
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px; padding-bottom:28px; font-size:${resolveFontSize(
            block.style,
            12
          )}; color:${block.style?.textColor ?? "#94a3b8"};">
            ${block.text}
          </td>
        </tr>`;
    case "image":
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            ${
              block.href
                ? `<a href="${block.href}" style="display:inline-block;">`
                : ""
            }
              <img src="${block.src}" alt="${block.alt ?? ""}" style="width:${block.width ? `${block.width}px` : "100%"}; max-width:100%; border-radius:${block.style?.borderRadius ? `${block.style.borderRadius}px` : "12px"};" />
            ${block.href ? "</a>" : ""}
          </td>
        </tr>`;
    case "columns":
      if (block.stackOnMobile) {
        return `
          <tr>
            <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
              <div style="font-size:${resolveFontSize(block.style, 14)}; line-height:1.5; margin-bottom:12px;">
                ${block.leftTitle ? `<strong>${block.leftTitle}</strong><br/>` : ""}
                ${block.leftText}
              </div>
              <div style="font-size:${resolveFontSize(block.style, 14)}; line-height:1.5;">
                ${block.rightTitle ? `<strong>${block.rightTitle}</strong><br/>` : ""}
                ${block.rightText}
              </div>
            </td>
          </tr>`;
      }
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse;">
              <tr>
                <td style="width:50%; vertical-align:top; padding-right:12px; font-size:${resolveFontSize(
                  block.style,
                  14
                )}; line-height:1.5;">
                  <div style="max-width:260px;">
                    ${block.leftTitle ? `<strong>${block.leftTitle}</strong><br/>` : ""}
                    ${block.leftText}
                  </div>
                </td>
                <td style="width:50%; vertical-align:top; padding-left:12px; font-size:${resolveFontSize(
                  block.style,
                  14
                )}; line-height:1.5;">
                  <div style="max-width:260px;">
                    ${block.rightTitle ? `<strong>${block.rightTitle}</strong><br/>` : ""}
                    ${block.rightText}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    case "hero": {
      const imageHtml = `<img src="${block.imageUrl}" alt="${block.imageAlt ?? ""}" style="width:100%; max-width:${block.imageWidth ? `${block.imageWidth}px` : "220px"}; border-radius:${block.style?.borderRadius ? `${block.style.borderRadius}px` : "14px"};" />`;
      const imageCell = `
        <td style="width:40%; vertical-align:top;">
          ${imageHtml}
        </td>`;
      const textCell = `
        <td style="width:60%; vertical-align:top; padding-${block.imagePosition === "left" ? "left" : "right"}:16px;">
          <h2 style="margin:0 0 6px; font-size:${resolveFontSize(block.style, 20)};">${block.title}</h2>
          ${block.subtitle ? `<p style="margin:0 0 10px; color:#64748b;">${block.subtitle}</p>` : ""}
          <p style="margin:0; font-size:${resolveFontSize(block.style, 14)}; line-height:1.5;">${block.body}</p>
        </td>`;
      if (block.stackOnMobile) {
        return `
          <tr>
            <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
              <div style="margin-bottom:12px;">${imageHtml}</div>
              <div>
                <h2 style="margin:0 0 6px; font-size:${resolveFontSize(block.style, 20)};">${block.title}</h2>
                ${block.subtitle ? `<p style="margin:0 0 10px; color:#64748b;">${block.subtitle}</p>` : ""}
                <p style="margin:0; font-size:${resolveFontSize(block.style, 14)}; line-height:1.5;">${block.body}</p>
              </div>
            </td>
          </tr>`;
      }
      const row = block.imagePosition === "left" ? `${imageCell}${textCell}` : `${textCell}${imageCell}`;
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse;">
              <tr>${row}</tr>
            </table>
          </td>
        </tr>`;
    }
    case "logoGrid": {
      const columns = Math.max(1, Math.min(block.columns ?? 3, 4));
      const maxWidth = block.maxLogoWidth ?? 120;
      const rows: string[] = [];
      const logos = block.logos.slice(0, 12);
      for (let i = 0; i < logos.length; i += columns) {
        const row = logos.slice(i, i + columns);
        rows.push(
          `<tr>${row
            .map(
              (logo) => `
                <td style="padding:8px; text-align:center;">
                  <img src="${logo}" alt="Logo" style="max-width:${maxWidth}px; max-height:48px; opacity:0.8;" />
                </td>`
            )
            .join("")}</tr>`
        );
      }
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse;">
              ${rows.join("")}
            </table>
          </td>
        </tr>`;
    }
    case "testimonial":
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px; border-left:3px solid ${theme.accentColor};">
            <p style="margin:0 0 10px; font-size:${resolveFontSize(block.style, 15)}; line-height:1.6;">"${block.quote}"</p>
            <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                ${
                  block.avatarUrl
                    ? `<td style="padding-right:10px; vertical-align:top;"><img src="${block.avatarUrl}" alt="" style="width:36px; height:36px; border-radius:999px;" /></td>`
                    : ""
                }
                <td>
                  <p style="margin:0; font-weight:600;">
                    ${block.author}${block.role ? `, ${block.role}` : ""}${block.company ? ` @ ${block.company}` : ""}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    case "kpis":
      const kpiColumns = Math.max(1, Math.min(block.columns ?? block.items.length, 4));
      const kpiRows: string[] = [];
      for (let i = 0; i < block.items.length; i += kpiColumns) {
        const rowItems = block.items.slice(i, i + kpiColumns);
        kpiRows.push(
          `<tr>${rowItems
            .map(
              (item) => `
              <td style="padding:8px; text-align:center; width:${(1 / kpiColumns) * 100}%;">
                <div style="font-size:20px; font-weight:700;">${item.value}</div>
                <div style="font-size:12px; color:#64748b;">${item.label}</div>
              </td>`
            )
            .join("")}</tr>`
        );
      }
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse;">
              ${kpiRows.join("")}
            </table>
          </td>
        </tr>`;
    case "pricing":
      const highlightIndex = typeof block.highlightIndex === "number" ? block.highlightIndex : -1;
      const planColumns = Math.max(1, Math.min(block.columns ?? 3, 3));
      const planRows: string[] = [];
      for (let i = 0; i < block.plans.length; i += planColumns) {
        const rowPlans = block.plans.slice(i, i + planColumns);
        planRows.push(
          `<tr>${rowPlans
            .map(
              (plan, index) => `
              <td style="padding:10px; border:1px solid ${i + index === highlightIndex ? theme.primaryColor : "#e2e8f0"}; border-radius:12px; text-align:left; background:${i + index === highlightIndex ? "rgba(14, 165, 233, 0.08)" : "transparent"};">
                <strong>${plan.name}</strong>
                <div style="font-size:20px; font-weight:700; margin:6px 0;">${plan.price}</div>
                ${plan.description ? `<div style="color:#64748b; font-size:12px;">${plan.description}</div>` : ""}
                ${plan.ctaLabel && plan.ctaUrl ? `<div style="margin-top:8px;"><a href="${plan.ctaUrl}" style="color:${theme.primaryColor}; font-weight:600; text-decoration:none;">${plan.ctaLabel}</a></div>` : ""}
              </td>`
            )
            .join("")}</tr>`
        );
      }
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse;">
              ${planRows.join("")}
            </table>
          </td>
        </tr>`;
    case "timeline":
      const timelineAccent = block.accentColor ?? theme.accentColor;
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            ${block.steps
              .map(
                (step, index) => `
              <div style="display:flex; gap:10px; margin-bottom:10px;">
                <div style="width:22px; height:22px; border-radius:999px; background:${timelineAccent}; color:#fff; text-align:center; font-size:12px; line-height:22px;">${index + 1}</div>
                <div>
                  <strong>${step.title}</strong>
                  ${step.detail ? `<div style="color:#64748b; font-size:12px;">${step.detail}</div>` : ""}
                </div>
              </div>`
              )
              .join("")}
          </td>
        </tr>`;
    case "faq":
      const faqSpacing = block.compact ? "6px" : "12px";
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            ${block.items
              .map(
                (item) => `
              <div style="margin-bottom:${faqSpacing};">
                <strong>${item.question}</strong>
                <div style="color:#64748b; font-size:12px;">${item.answer}</div>
              </div>`
              )
              .join("")}
          </td>
        </tr>`;
    case "labeledDivider":
      const lineColor = block.lineColor ?? "#e2e8f0";
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse;">
              <tr>
                <td style="border-top:1px solid ${lineColor};"></td>
                <td style="padding:0 10px; font-size:12px; color:#64748b; white-space:nowrap;">${block.label}</td>
                <td style="border-top:1px solid ${lineColor};"></td>
              </tr>
            </table>
          </td>
        </tr>`;
    case "signature":
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px;">
            <div style="font-weight:600;">${block.signoff}</div>
            <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin-top:6px;">
              <tr>
                ${
                  block.avatarUrl
                    ? `<td style="padding-right:10px; vertical-align:top;"><img src="${block.avatarUrl}" alt="" style="width:36px; height:36px; border-radius:999px;" /></td>`
                    : ""
                }
                <td>
                  <strong>${block.name}</strong>${block.title ? `, ${block.title}` : ""}
                  ${block.email ? `<div style="font-size:12px; color:#64748b;">${block.email}</div>` : ""}
                  ${block.phone ? `<div style="font-size:12px; color:#64748b;">${block.phone}</div>` : ""}
                </td>
              </tr>
            </table>
            ${block.email ? `<div style="font-size:12px; color:#64748b;">${block.email}</div>` : ""}
            ${block.phone ? `<div style="font-size:12px; color:#64748b;">${block.phone}</div>` : ""}
          </td>
        </tr>`;
    case "legal":
      return `
        <tr>
          <td style="${containerStyle}; padding-left:32px; padding-right:32px; font-size:${block.fontSize ?? 11}px; color:#94a3b8;">
            ${block.text}
          </td>
        </tr>`;
    default:
      return "";
  }
}

function blockToText(block: EmailBlock) {
  switch (block.type) {
    case "header":
      return `${block.title}${block.subtitle ? `\n${block.subtitle}` : ""}`;
    case "paragraph":
      return block.text;
    case "button":
      return `${block.label}: ${block.url}`;
    case "image":
      return block.alt ?? "Image";
    case "columns":
      return `${block.leftTitle ? `${block.leftTitle}\n` : ""}${block.leftText}\n\n${
        block.rightTitle ? `${block.rightTitle}\n` : ""
      }${block.rightText}`;
    case "hero":
      return `${block.title}${block.subtitle ? `\n${block.subtitle}` : ""}\n${block.body}`;
    case "logoGrid":
      return "Logos";
    case "testimonial":
      return `"${block.quote}" - ${block.author}`;
    case "kpis":
      return block.items.map((item) => `${item.label}: ${item.value}`).join("\n");
    case "pricing":
      return block.plans.map((plan) => `${plan.name}: ${plan.price}`).join("\n");
    case "timeline":
      return block.steps.map((step) => `${step.title}${step.detail ? ` - ${step.detail}` : ""}`).join("\n");
    case "faq":
      return block.items.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join("\n\n");
    case "labeledDivider":
      return `-- ${block.label} --`;
    case "signature":
      return `${block.signoff}\n${block.name}${block.title ? `, ${block.title}` : ""}`;
    case "legal":
      return block.text;
    case "divider":
      return "----";
    case "spacer":
      return "";
    case "footer":
      return block.text;
    default:
      return "";
  }
}

export function renderEmail(blocks: EmailBlock[], theme: TenantTheme): RenderedEmail {
  const body = blocks.map((block) => blockToHtml(block, theme)).join("");
  const html = `
    <div style="margin:0; padding:0; width:100%; background:${theme.backgroundColor};">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; background:${theme.backgroundColor}; font-family: Arial, sans-serif; border-collapse: collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px; width:100%; background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="padding: 18px 32px; background:${theme.accentColor}; color:#ffffff; font-weight:700;">
                ${theme.brandName}
              </td>
            </tr>
            ${body}
          </table>
        </td>
      </tr>
      </table>
    </div>
  `;

  const text = blocks.map(blockToText).filter(Boolean).join("\n\n");
  return { html, text };
}
