import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_RENEW_BELOW,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/auth/session";

// Rutas accesibles sin sesión. Los recursos estáticos se excluyen en `matcher`.
const PUBLIC_PREFIXES = ["/login", "/s/", "/api/auth/login", "/api/cron/", "/manifest.webmanifest"];

/**
 * Verificación optimista (solo firma y caducidad del JWT). La verificación completa,
 * incluida la versión de sesión en BD, ocurre en cada route handler con requireSession().
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (session && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/documentos";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  // Renovación deslizante: reemite la cookie cuando quedan menos de 15 días.
  if (session && session.exp - Date.now() / 1000 < SESSION_RENEW_BELOW) {
    response.cookies.set(SESSION_COOKIE, await signSession(session.sv), sessionCookieOptions);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|apple-icon.png|icons/|fonts/|pdfjs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|otf|woff2?|mjs|wasm)$).*)",
  ],
};
