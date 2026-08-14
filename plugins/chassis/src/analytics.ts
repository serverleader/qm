const SITE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function readOrigin(): string | undefined {
  const raw = process.env.ANALYTICS_ORIGIN?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function readSiteId(): string | undefined {
  const id = process.env.ANALYTICS_SITE_ID?.trim();
  if (!id || !SITE_ID_RE.test(id)) return undefined;
  return id;
}

/** HTTPS origin for the optional page tracker. Unset when analytics is off. */
export function analyticsOrigin(): string | undefined {
  return readOrigin() && readSiteId() ? readOrigin() : undefined;
}

export function analyticsScriptTag(): string {
  const origin = analyticsOrigin();
  const id = readSiteId();
  if (!origin || !id) return "";
  return `<script src="${origin}/api/script.js" data-site-id="${id}" defer></script>`;
}

export function injectAnalyticsHead(html: string): string {
  const tag = analyticsScriptTag();
  if (!tag || html.includes("/api/script.js")) return html;
  if (html.includes("</head>")) return html.replace("</head>", `    ${tag}\n  </head>`);
  return html;
}

/** Leading-space origin token for CSP script-src / connect-src, or empty. */
export function analyticsCspSource(): string {
  const origin = analyticsOrigin();
  return origin ? ` ${origin}` : "";
}
