import "server-only";
import { kindOfMime, sniffMime } from "@/lib/files";
import { deleteObject, headObject, readHead } from "./r2";
import { verifyUploadToken, type UploadClaim } from "./upload-token";

export class UploadError extends Error {}

/**
 * Confirma una subida: valida el token, que el objeto exista con el tamaño firmado
 * y que su tipo REAL (magic bytes) corresponda. Si algo falla, borra el objeto.
 */
export async function confirmUpload(token: string, expected: UploadClaim["kind"]): Promise<UploadClaim & { realMime: string }> {
  const claim = await verifyUploadToken(token);
  if (!claim || claim.kind !== expected) throw new UploadError("Token de subida no válido o vencido");

  const head = await headObject(claim.key);
  if (!head) throw new UploadError("El archivo no llegó al almacenamiento. Intenta subirlo de nuevo.");
  if (head.size !== claim.size) {
    await deleteObject(claim.key).catch(() => {});
    throw new UploadError("El tamaño del archivo no coincide");
  }

  const realMime = sniffMime(await readHead(claim.key));
  const realKind = kindOfMime(realMime);
  const ok =
    expected === "asset" ? realMime === "image/png" || realMime === "image/jpeg" : realKind === expected;
  if (!ok || !realMime) {
    await deleteObject(claim.key).catch(() => {});
    throw new UploadError("El contenido del archivo no corresponde a un tipo permitido");
  }
  return { ...claim, realMime };
}
