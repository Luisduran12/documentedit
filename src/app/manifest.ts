import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DocuPilot Studio",
    short_name: "DocuPilot",
    description: "Edición de PDF, imágenes temporales y QR.",
    lang: "es-CO",
    start_url: "/documentos",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b0f19",
    theme_color: "#0b0f19",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
