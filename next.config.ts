import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// R2_ENDPOINT solo existe en pruebas locales (MinIO).
const R2 = ["https://*.r2.cloudflarestorage.com", process.env.R2_ENDPOINT ? new URL(process.env.R2_ENDPOINT).origin : ""].join(" ").trim();

// CSP razonable: Next.js necesita 'unsafe-inline' para sus scripts de hidratación (sin nonces,
// que obligarían a renderizar todo dinámicamente). pdf.js usa WebAssembly y workers.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${R2}`,
  "font-src 'self' data: blob:",
  `connect-src 'self' blob: data: ${R2}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [{ source: "/", destination: "/documentos", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
