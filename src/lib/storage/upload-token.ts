import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { type FileKind } from "@/lib/files";

/** Token que acompaña a una URL de subida: el servidor solo acepta confirmar claves que él mismo emitió. */
export type UploadClaim = { key: string; size: number; mime: string; kind: FileKind | "asset"; name: string };

function key() {
  return new TextEncoder().encode(`${process.env.SESSION_SECRET}:upload`);
}

export function signUpload(claim: UploadClaim) {
  return new SignJWT({ ...claim }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("20m").sign(key());
}

export async function verifyUploadToken(token: string): Promise<UploadClaim | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload as unknown as UploadClaim;
  } catch {
    return null;
  }
}
