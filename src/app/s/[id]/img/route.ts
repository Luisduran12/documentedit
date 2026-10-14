import { connection } from "next/server";
import { findShare } from "@/lib/shares/repo";
import { resolvePublic, SHARE_ID_RE } from "@/lib/shares/ttl";
import { presignGet } from "@/lib/storage/r2";

/**
 * Entrega la imagen: valida de nuevo la caducidad y redirige a una URL firmada de R2 que dura
 * como máximo 60 s (o lo que le quede al enlace). El bucket nunca es público. Se redirige en lugar
 * de transmitir los bytes porque Vercel limita las respuestas de funciones a 4.5 MB.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const row = SHARE_ID_RE.test(id) ? await findShare(id) : null;
  const now = new Date();
  if (!row || !resolvePublic(row, now).ok) {
    return new Response("Este enlace ya no está disponible", {
      status: 410,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }
  const secondsLeft = Math.floor((row.expiresAt.getTime() - now.getTime()) / 1000);
  const url = await presignGet(row.storageKey, { expiresIn: Math.max(1, Math.min(60, secondsLeft)), contentType: row.mime });
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" },
  });
}
