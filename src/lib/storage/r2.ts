import "server-only";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const PREFIX = { documents: "documents/", drafts: "drafts/", shares: "shares/", fonts: "fonts/", assets: "assets/" } as const;

/** Duración de las URLs firmadas (segundos). */
export const UPLOAD_URL_TTL = 600;
export const DOWNLOAD_URL_TTL = 300;

let client: S3Client | undefined;

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name}`);
  return v;
}

function s3() {
  if (!client) {
    // R2_ENDPOINT solo para pruebas locales con un servidor compatible S3 (p. ej. MinIO).
    const endpoint = process.env.R2_ENDPOINT ?? `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
    client = new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: Boolean(process.env.R2_ENDPOINT),
      credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
      // R2 no admite las sumas de verificación CRC por defecto del SDK v3 en URLs firmadas.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

const bucket = () => env("R2_BUCKET");

/** URL de subida PUT: el tamaño y el Content-Type quedan firmados (R2 rechaza otros valores). */
import fs from "node:fs";
import path from "node:path";
import { STORAGE_DIR } from "@/lib/db/sqlite-local";

const isLocalDisk = () => !process.env.R2_BUCKET || !process.env.R2_ACCOUNT_ID;

function localPath(key: string) {
  return path.join(STORAGE_DIR, ...key.split("/"));
}

export function presignPut(key: string, contentType: string, contentLength: number) {
  if (isLocalDisk()) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    return Promise.resolve(`${siteUrl}/api/local-storage/${key}`);
  }
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn: UPLOAD_URL_TTL, signableHeaders: new Set(["content-type", "content-length"]) },
  );
}

export function presignGet(key: string, opts: { expiresIn?: number; downloadName?: string; contentType?: string } = {}) {
  if (isLocalDisk()) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    return Promise.resolve(`${siteUrl}/api/local-storage/${key}`);
  }
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: opts.downloadName
        ? `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}`
        : undefined,
      ResponseCacheControl: "private, max-age=60",
    }),
    { expiresIn: opts.expiresIn ?? DOWNLOAD_URL_TTL },
  );
}

export async function headObject(key: string) {
  if (isLocalDisk()) {
    const p = localPath(key);
    if (!fs.existsSync(p)) return null;
    const stat = fs.statSync(p);
    return { size: stat.size, contentType: null };
  }
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? null };
  } catch {
    return null;
  }
}

/** Lee los primeros bytes de un objeto (para validar el tipo real). */
export async function readHead(key: string, bytes = 1024) {
  if (isLocalDisk()) {
    const p = localPath(key);
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buf, 0, bytes, 0);
    fs.closeSync(fd);
    return new Uint8Array(buf.subarray(0, read));
  }
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }));
  return new Uint8Array(await r.Body!.transformToByteArray());
}

export async function getText(key: string) {
  if (isLocalDisk()) {
    const p = localPath(key);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf-8");
  }
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return await r.Body!.transformToString("utf-8");
  } catch {
    return null;
  }
}

export async function putObject(key: string, body: string | Uint8Array, contentType: string) {
  if (isLocalDisk()) {
    const p = localPath(key);
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, typeof body === "string" ? body : Buffer.from(body));
    return;
  }
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function copyObject(from: string, to: string) {
  if (isLocalDisk()) {
    const pFrom = localPath(from);
    const pTo = localPath(to);
    const dir = path.dirname(pTo);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(pFrom, pTo);
    return;
  }
  await s3().send(new CopyObjectCommand({ Bucket: bucket(), Key: to, CopySource: `${bucket()}/${encodeURI(from)}` }));
}

export async function deleteObject(key: string) {
  if (isLocalDisk()) {
    const p = localPath(key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return;
  }
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function deleteObjects(keys: string[]) {
  if (isLocalDisk()) {
    for (const key of keys) {
      const p = localPath(key);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    return;
  }
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    if (chunk.length === 0) continue;
    await s3().send(
      new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }),
    );
  }
}
