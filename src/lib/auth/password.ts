import bcrypt from "bcryptjs";

/**
 * ADMIN_PASSWORD_HASH acepta el hash bcrypt tal cual ($2b$...) o codificado como "b64:..."
 * (formato que genera `npm run hash-password`, inmune a la expansión de "$" en archivos .env).
 */
export function decodeHash(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.startsWith("b64:")) return Buffer.from(v.slice(4), "base64").toString("utf8");
  return v;
}

export function encodeHash(hash: string) {
  return `b64:${Buffer.from(hash, "utf8").toString("base64")}`;
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string | null) {
  // Comparar siempre contra algo para no filtrar tiempos si no hay hash configurado.
  const target = hash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const ok = await bcrypt.compare(plain, target);
  return ok && hash !== null;
}
