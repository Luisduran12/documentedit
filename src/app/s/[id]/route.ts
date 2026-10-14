import { connection } from "next/server";
import { consumeView, findShare } from "@/lib/shares/repo";
import { imagePageHtml, PUBLIC_HEADERS, unavailablePageHtml } from "@/lib/shares/public-page";
import { resolvePublic, SHARE_ID_RE } from "@/lib/shares/ttl";

/**
 * Página pública del enlace temporal. La validez se comprueba en el servidor en cada visita:
 * si no existe, venció o fue revocado → 410 sin entregar la imagen.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const row = SHARE_ID_RE.test(id) ? await consumeView(id) : null;
  if (!row) return new Response(unavailablePageHtml(), { status: 410, headers: PUBLIC_HEADERS });
  return new Response(imagePageHtml(id), { status: 200, headers: PUBLIC_HEADERS });
}

/** HEAD (vistas previas de enlaces, verificadores) valida sin contar una vista. */
export async function HEAD(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const row = SHARE_ID_RE.test(id) ? await findShare(id) : null;
  const ok = resolvePublic(row, new Date()).ok;
  return new Response(null, { status: ok ? 200 : 410, headers: PUBLIC_HEADERS });
}
