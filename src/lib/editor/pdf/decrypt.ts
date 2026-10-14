// Descifrado de PDFs con el manejador de seguridad estándar (RC4, AES-128, AES-256) cuando se pueden abrir
// sin contraseña de usuario (caso típico: documentos con restricciones de edición/impresión generados por
// plataformas). Sin esto, pdf-lib no puede leer los content streams y no se podría editar el texto.
// Si el PDF exige contraseña para abrirse, se informa y no se intenta nada más.

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFString,
  PDFObjectStreamParser,
  PDFBool,
  PDFParser,
  type PDFContext,
} from "pdf-lib";

export class PasswordRequiredError extends Error {
  constructor() {
    super("Este PDF está protegido con contraseña de apertura");
  }
}

const PAD = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c,
  0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

// ── Primitivas ─────────────────────────────────────────────

/** MD5 (RFC 1321). */
export function md5(data: Uint8Array): Uint8Array {
  const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const len = data.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bits >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(bits / 2 ** 32), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < padded.length; off += 64) {
    const M = Array.from({ length: 16 }, (_, i) => dv.getUint32(off + i * 4, true));
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << s[i]) | (F >>> (32 - s[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true));
  return out;
}

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
    out[k] = data[k] ^ S[(S[i] + S[j]) & 0xff];
  }
  return out;
}

const subtle = () => globalThis.crypto.subtle;
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const buf = (u: Uint8Array) => u.slice().buffer as ArrayBuffer;

async function aesCbcDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array, padded = true): Promise<Uint8Array> {
  if (data.length === 0 || data.length % 16 !== 0) return new Uint8Array();
  const k = await subtle().importKey("raw", buf(key), "AES-CBC", false, ["decrypt", "encrypt"]);
  if (!padded) {
    // WebCrypto exige relleno PKCS#7: se añade un bloque que descifra a 16 bytes de relleno válido.
    const last = data.subarray(data.length - 16);
    const fake = new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv: buf(last) }, k, buf(new Uint8Array(16).fill(16)))).subarray(0, 16);
    return new Uint8Array(await subtle().decrypt({ name: "AES-CBC", iv: buf(iv) }, k, buf(concat(data, fake))));
  }
  try {
    return new Uint8Array(await subtle().decrypt({ name: "AES-CBC", iv: buf(iv) }, k, buf(data)));
  } catch {
    // Algunos generadores dejan relleno incorrecto: se descifra sin validar y se recorta lo razonable.
    const raw = await aesCbcDecrypt(key, iv, data, false);
    const p = raw[raw.length - 1];
    return p > 0 && p <= 16 ? raw.subarray(0, raw.length - p) : raw;
  }
}

async function aesCbcEncryptNoPad(key: Uint8Array, iv: Uint8Array, data: Uint8Array) {
  const k = await subtle().importKey("raw", buf(key), "AES-CBC", false, ["encrypt"]);
  return new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv: buf(iv) }, k, buf(data))).subarray(0, data.length);
}

const sha = async (alg: "SHA-256" | "SHA-384" | "SHA-512", data: Uint8Array) => new Uint8Array(await subtle().digest(alg, buf(data)));

/** Algoritmo 2.B (ISO 32000-2) para R6. */
async function hash2B(pw: Uint8Array, salt: Uint8Array, udata: Uint8Array) {
  let K = await sha("SHA-256", concat(pw, salt, udata));
  for (let i = 0; ; i++) {
    const k1 = concat(pw, K, udata);
    const K1 = new Uint8Array(k1.length * 64);
    for (let r = 0; r < 64; r++) K1.set(k1, r * k1.length);
    const E = await aesCbcEncryptNoPad(K.subarray(0, 16), K.subarray(16, 32), K1);
    let mod = 0;
    for (let b = 0; b < 16; b++) mod += E[b];
    mod %= 3;
    K = await sha(mod === 0 ? "SHA-256" : mod === 1 ? "SHA-384" : "SHA-512", E);
    if (i >= 63 && E[E.length - 1] <= i - 31) break;
  }
  return K.subarray(0, 32);
}

// ── Manejador estándar ─────────────────────────────────────

type Handler = { decryptBytes(num: number, gen: number, data: Uint8Array, isString: boolean): Promise<Uint8Array> };

const bytesOf = (o: PDFObject | undefined): Uint8Array => {
  if (o instanceof PDFString || o instanceof PDFHexString) return o.asBytes();
  return new Uint8Array();
};

async function standardHandler(ctx: PDFContext, enc: PDFDict, password: Uint8Array): Promise<Handler> {
  const get = (k: string) => {
    const v = enc.get(PDFName.of(k));
    return v instanceof PDFRef ? ctx.lookup(v) : v;
  };
  const filter = (get("Filter") as PDFName | undefined)?.decodeText();
  if (filter !== "Standard") throw new Error(`Manejador de seguridad no soportado: ${filter}`);
  const V = (get("V") as PDFNumber | undefined)?.asNumber() ?? 0;
  const R = (get("R") as PDFNumber | undefined)?.asNumber() ?? 2;
  const O = bytesOf(get("O"));
  const U = bytesOf(get("U"));
  const P = (get("P") as PDFNumber | undefined)?.asNumber() ?? 0;
  const encMeta = (get("EncryptMetadata") as PDFBool | undefined)?.asBoolean() ?? true;
  const idArr = ctx.trailerInfo.ID instanceof PDFArray ? ctx.trailerInfo.ID : (ctx.lookup(ctx.trailerInfo.ID as PDFRef) as PDFArray | undefined);
  const id0 = bytesOf(idArr?.get(0));

  // Método por defecto de streams y cadenas
  let stmMethod = V >= 4 ? "Identity" : "V2";
  let strMethod = stmMethod;
  if (V >= 4) {
    const cf = get("CF") as PDFDict | undefined;
    const methodOf = (name: string | undefined) => {
      if (!name || name === "Identity") return "Identity";
      const f = cf?.get(PDFName.of(name));
      const fd = f instanceof PDFRef ? ctx.lookup(f) : f;
      const cfm = fd instanceof PDFDict ? (fd.get(PDFName.of("CFM")) as PDFName | undefined)?.decodeText() : undefined;
      return cfm ?? "None";
    };
    stmMethod = methodOf((get("StmF") as PDFName | undefined)?.decodeText());
    strMethod = methodOf((get("StrF") as PDFName | undefined)?.decodeText());
  }

  let fileKey: Uint8Array;
  if (R >= 5) {
    const UE = bytesOf(get("UE"));
    const valSalt = U.subarray(32, 40);
    const keySalt = U.subarray(40, 48);
    const check = R === 5 ? await sha("SHA-256", concat(password, valSalt)) : await hash2B(password, valSalt, new Uint8Array());
    if (!check.subarray(0, 32).every((b, i) => b === U[i])) throw new PasswordRequiredError();
    const inter = R === 5 ? await sha("SHA-256", concat(password, keySalt)) : await hash2B(password, keySalt, new Uint8Array());
    fileKey = await aesCbcDecrypt(inter, new Uint8Array(16), UE, false);
  } else {
    const n = R === 2 ? 5 : ((get("Length") as PDFNumber | undefined)?.asNumber() ?? 40) / 8;
    const pw = concat(password, PAD).subarray(0, 32);
    const p = new Uint8Array(4);
    new DataView(p.buffer).setInt32(0, P, true);
    let h = md5(concat(pw, O.subarray(0, 32), p, id0, R >= 4 && !encMeta ? Uint8Array.of(255, 255, 255, 255) : new Uint8Array()));
    if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n));
    fileKey = h.subarray(0, n);
    // Verificación de la contraseña de usuario (algoritmos 4/5)
    let ok: boolean;
    if (R === 2) ok = rc4(fileKey, PAD).every((b, i) => b === U[i]);
    else {
      let x = rc4(fileKey, md5(concat(PAD, id0)));
      for (let i = 1; i <= 19; i++) x = rc4(fileKey.map((b) => b ^ i), x);
      ok = x.every((b, i) => b === U[i]);
    }
    if (!ok) throw new PasswordRequiredError();
  }

  const objKey = (num: number, gen: number, aes: boolean) => {
    if (R >= 5) return fileKey;
    const extra = Uint8Array.of(num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, gen & 0xff, (gen >> 8) & 0xff);
    return md5(concat(fileKey, extra, aes ? Uint8Array.of(0x73, 0x41, 0x6c, 0x54) : new Uint8Array())).subarray(0, Math.min(fileKey.length + 5, 16));
  };

  return {
    async decryptBytes(num, gen, data, isString) {
      const method = isString ? strMethod : stmMethod;
      if (method === "Identity" || method === "None") return data;
      if (method === "V2") return rc4(objKey(num, gen, false), data);
      // AESV2 / AESV3: los 16 primeros bytes son el vector de inicialización
      if (data.length < 32) return new Uint8Array();
      return aesCbcDecrypt(objKey(num, gen, true), data.subarray(0, 16), data.subarray(16));
    },
  };
}

/**
 * Carga un PDF para editarlo: si está cifrado y se abre sin contraseña, lo descifra en memoria
 * (el PDF exportado queda sin cifrar ni restricciones).
 */
export async function loadPdfForEditing(bytes: Uint8Array, password = ""): Promise<PDFDocument> {
  // Caso normal (sin cifrar): carga estándar de pdf-lib.
  const plain = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  if (!plain.isEncrypted) return plain;

  // Cifrado: se parsea sin procesar los object streams (están cifrados), se descifra y luego se procesan.
  const original = PDFObjectStreamParser.forStream;
  const pending: PDFRawStream[] = [];
  (PDFObjectStreamParser as unknown as { forStream: unknown }).forStream = (stream: PDFRawStream) => {
    pending.push(stream);
    return { parseIntoContext: async () => {} } as unknown as PDFObjectStreamParser;
  };
  let ctx: PDFContext;
  try {
    ctx = await PDFParser.forBytesWithOptions(bytes).parseDocument();
  } finally {
    (PDFObjectStreamParser as unknown as { forStream: unknown }).forStream = original;
  }
  const pendingRefs = pending.map((s) => [...ctx.enumerateIndirectObjects()].find(([, o]) => o === s)?.[0]).filter((r): r is PDFRef => Boolean(r));
  const encRef = ctx.trailerInfo.Encrypt;
  const enc = encRef instanceof PDFRef ? ctx.lookup(encRef) : encRef;
  if (enc instanceof PDFDict) await decryptContext(ctx, enc, encRef instanceof PDFRef ? encRef : null, new TextEncoder().encode(password));
  // Objetos de los object streams (ya descifrados): no se cifran individualmente.
  for (const ref of pendingRefs) await PDFObjectStreamParser.forStream(ctx.lookup(ref) as PDFRawStream).parseIntoContext();
  // Constructor interno de pdf-lib (contexto ya poblado).
  const Doc = PDFDocument as unknown as new (context: PDFContext, ignoreEncryption: boolean, updateMetadata: boolean) => PDFDocument;
  return new Doc(ctx, true, false);
}

async function decryptContext(ctx: PDFContext, enc: PDFDict, encryptRef: PDFRef | null, password: Uint8Array) {
  const handler = await standardHandler(ctx, enc, password);
  const decryptValue = async (o: PDFObject, num: number, gen: number): Promise<PDFObject> => {
    if (o instanceof PDFString || o instanceof PDFHexString) {
      const plainBytes = await handler.decryptBytes(num, gen, o.asBytes(), true);
      return PDFHexString.of(Array.from(plainBytes, (b) => b.toString(16).padStart(2, "0")).join(""));
    }
    if (o instanceof PDFArray) {
      for (let i = 0; i < o.size(); i++) o.set(i, await decryptValue(o.get(i), num, gen));
      return o;
    }
    if (o instanceof PDFDict) {
      for (const [k, v] of o.entries()) o.set(k, await decryptValue(v, num, gen));
      return o;
    }
    return o;
  };
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (encryptRef && ref === encryptRef) continue;
    if (obj instanceof PDFRawStream) {
      if (obj.dict.get(PDFName.of("Type")) === PDFName.of("XRef")) continue;
      await decryptValue(obj.dict, ref.objectNumber, ref.generationNumber);
      const plainBytes = await handler.decryptBytes(ref.objectNumber, ref.generationNumber, obj.contents, false);
      ctx.assign(ref, PDFRawStream.of(obj.dict, plainBytes));
    } else {
      await decryptValue(obj, ref.objectNumber, ref.generationNumber);
    }
  }
  delete (ctx.trailerInfo as { Encrypt?: unknown }).Encrypt;
  if (encryptRef) ctx.delete(encryptRef);
}
