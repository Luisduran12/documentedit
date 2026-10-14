// HTML mínimo y ligero para la página pública /s/[id] (sin JS, sin dependencias).

const BASE_CSS = `*{box-sizing:border-box}html,body{margin:0;height:100%}body{background:#0b0f19;color:#f9fafb;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100dvh;padding:16px}`;

const HEAD = (title: string, css: string) =>
  `<!doctype html><html lang="es-CO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>${title}</title><style>${BASE_CSS}${css}</style></head>`;

export function imagePageHtml(id: string) {
  // El id ya fue validado con SHARE_ID_RE (solo [A-Za-z0-9_-]), seguro para interpolar.
  return `${HEAD("Imagen compartida", "main{width:100%;height:100%;display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:calc(100dvh - 32px);object-fit:contain;border-radius:8px;box-shadow:0 12px 32px -8px rgba(0,0,0,.65)}")}<body><main><img src="/s/${id}/img" alt="Imagen compartida" decoding="async"></main></body></html>`;
}

export function unavailablePageHtml() {
  return `${HEAD("Enlace no disponible", "div{max-width:420px;text-align:center}h1{font-size:1.375rem;margin:16px 0 8px}p{color:#9ca3af;line-height:1.5;margin:0}svg{opacity:.9}")}<body><div><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><h1>Este enlace ya no está disponible</h1><p>La imagen venció o fue retirada por quien la compartió.</p></div></body></html>`;
}

export const PUBLIC_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;
