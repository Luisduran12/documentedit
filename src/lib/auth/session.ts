// Firma/verificación de la cookie de sesión (JWT HS256). Sin acceso a BD: se usa también en el proxy.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "dp_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días
/** Si a la sesión le quedan menos de 15 días, se renueva. */
export const SESSION_RENEW_BELOW = 60 * 60 * 24 * 15;

export type SessionPayload = { sv: number; exp: number };

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET falta o es demasiado corto (mínimo 32 caracteres)");
  return new TextEncoder().encode(secret);
}

export async function signSession(sessionVersion: number) {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"], subject: "admin" });
    if (typeof payload.sv !== "number" || typeof payload.exp !== "number") return null;
    return { sv: payload.sv, exp: payload.exp };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
