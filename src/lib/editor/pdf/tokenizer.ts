// Tokenizador de content streams PDF (ISO 32000-1 §7.8.2). Conserva el rango de bytes de cada operación
// para poder reescribir el stream "por empalme": todo lo que no se toca queda byte a byte igual.

export type Operand =
  | { t: "num"; v: number }
  | { t: "name"; v: string }
  | { t: "str"; bytes: Uint8Array; hex: boolean }
  | { t: "arr"; items: Operand[] }
  | { t: "dict"; entries: [string, Operand][] }
  | { t: "bool"; v: boolean }
  | { t: "null" };

export type Op = { operator: string; operands: Operand[]; start: number; end: number };

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isWs = (c: number) => WS.has(c);
const isRegular = (c: number) => !WS.has(c) && !DELIM.has(c);

export class ContentSyntaxError extends Error {}

export function tokenize(b: Uint8Array): Op[] {
  const ops: Op[] = [];
  let i = 0;
  let operands: Operand[] = [];
  let opStart = -1;

  const skipWsAndComments = () => {
    for (;;) {
      while (i < b.length && isWs(b[i])) i++;
      if (b[i] === 0x25) {
        while (i < b.length && b[i] !== 0x0a && b[i] !== 0x0d) i++;
        continue;
      }
      return;
    }
  };

  const readLiteral = (): Uint8Array => {
    // i apunta a '('
    i++;
    const out: number[] = [];
    let depth = 1;
    while (i < b.length) {
      const c = b[i++];
      if (c === 0x5c) {
        const n = b[i++];
        switch (n) {
          case 0x6e: out.push(0x0a); break; // \n
          case 0x72: out.push(0x0d); break; // \r
          case 0x74: out.push(0x09); break; // \t
          case 0x62: out.push(0x08); break; // \b
          case 0x66: out.push(0x0c); break; // \f
          case 0x0d:
            if (b[i] === 0x0a) i++;
            break; // continuación de línea
          case 0x0a:
            break;
          default:
            if (n >= 0x30 && n <= 0x37) {
              let v = n - 0x30;
              for (let k = 0; k < 2 && b[i] >= 0x30 && b[i] <= 0x37; k++) v = v * 8 + (b[i++] - 0x30);
              out.push(v & 0xff);
            } else out.push(n);
        }
      } else if (c === 0x28) {
        depth++;
        out.push(c);
      } else if (c === 0x29) {
        if (--depth === 0) break;
        out.push(c);
      } else out.push(c);
    }
    return Uint8Array.from(out);
  };

  const readHex = (): Uint8Array => {
    i++; // '<'
    const digits: number[] = [];
    while (i < b.length && b[i] !== 0x3e) {
      const c = b[i++];
      const v = c >= 0x30 && c <= 0x39 ? c - 0x30 : c >= 0x41 && c <= 0x46 ? c - 55 : c >= 0x61 && c <= 0x66 ? c - 87 : -1;
      if (v >= 0) digits.push(v);
    }
    i++; // '>'
    if (digits.length % 2) digits.push(0);
    const out = new Uint8Array(digits.length / 2);
    for (let k = 0; k < out.length; k++) out[k] = digits[2 * k] * 16 + digits[2 * k + 1];
    return out;
  };

  const readName = (): string => {
    i++; // '/'
    let s = "";
    while (i < b.length && isRegular(b[i])) {
      if (b[i] === 0x23 && i + 2 < b.length) {
        s += String.fromCharCode(parseInt(String.fromCharCode(b[i + 1], b[i + 2]), 16));
        i += 3;
      } else s += String.fromCharCode(b[i++]);
    }
    return s;
  };

  const readWord = (): string => {
    let s = "";
    while (i < b.length && isRegular(b[i])) s += String.fromCharCode(b[i++]);
    return s;
  };

  const readObject = (): Operand | { op: string } => {
    const c = b[i];
    if (c === 0x28) return { t: "str", bytes: readLiteral(), hex: false };
    if (c === 0x3c) {
      if (b[i + 1] === 0x3c) {
        i += 2;
        const entries: [string, Operand][] = [];
        for (;;) {
          skipWsAndComments();
          if (b[i] === 0x3e && b[i + 1] === 0x3e) {
            i += 2;
            break;
          }
          if (i >= b.length) throw new ContentSyntaxError("Diccionario sin cerrar");
          if (b[i] !== 0x2f) throw new ContentSyntaxError("Clave de diccionario no válida");
          const key = readName();
          skipWsAndComments();
          const v = readObject();
          if ("op" in v) throw new ContentSyntaxError("Valor de diccionario no válido");
          entries.push([key, v]);
        }
        return { t: "dict", entries };
      }
      return { t: "str", bytes: readHex(), hex: true };
    }
    if (c === 0x5b) {
      i++;
      const items: Operand[] = [];
      for (;;) {
        skipWsAndComments();
        if (b[i] === 0x5d) {
          i++;
          break;
        }
        if (i >= b.length) throw new ContentSyntaxError("Arreglo sin cerrar");
        const v = readObject();
        if ("op" in v) throw new ContentSyntaxError(`Operador dentro de un arreglo: ${v.op}`);
        items.push(v);
      }
      return { t: "arr", items };
    }
    if (c === 0x2f) return { t: "name", v: readName() };
    const w = readWord();
    if (w === "") {
      i++; // delimitador suelto (p. ej. ')' o '}'): se ignora
      return { op: "" };
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) return { t: "num", v: parseFloat(w) };
    if (w === "true" || w === "false") return { t: "bool", v: w === "true" };
    if (w === "null") return { t: "null" };
    return { op: w };
  };

  while (true) {
    skipWsAndComments();
    if (i >= b.length) break;
    const tokStart = i;
    if (opStart < 0) opStart = tokStart;
    const v = readObject();
    if (!("op" in v)) {
      operands.push(v);
      continue;
    }
    if (v.op === "") continue;
    if (v.op === "BI") {
      // Imagen en línea: BI <dict> ID <datos binarios> EI
      const idAt = findInlineImageData(b, i);
      const eiEnd = findEI(b, idAt);
      ops.push({ operator: "BI", operands: [], start: opStart, end: eiEnd });
      i = eiEnd;
    } else {
      ops.push({ operator: v.op, operands, start: opStart, end: i });
    }
    operands = [];
    opStart = -1;
  }
  return ops;
}

function findInlineImageData(b: Uint8Array, from: number) {
  for (let k = from; k < b.length - 2; k++) {
    if (b[k] === 0x49 && b[k + 1] === 0x44 && isWs(b[k - 1]) && (isWs(b[k + 2]) || k + 2 === b.length)) return k + 3;
  }
  throw new ContentSyntaxError("Imagen en línea sin ID");
}

function findEI(b: Uint8Array, from: number) {
  for (let k = from; k < b.length - 1; k++) {
    if (b[k] === 0x45 && b[k + 1] === 0x49 && isWs(b[k - 1]) && (k + 2 >= b.length || isWs(b[k + 2]))) return k + 2;
  }
  throw new ContentSyntaxError("Imagen en línea sin EI");
}

// ── Serialización ─────────────────────────────────────────

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

export function fmtNum(n: number) {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 10000) / 10000;
  return Object.is(r, -0) ? "0" : String(r);
}

export function serializeOperand(o: Operand): string {
  switch (o.t) {
    case "num":
      return fmtNum(o.v);
    case "name":
      return `/${o.v.replace(/[^!-~]|[#()<>[\]{}/%]/g, (c) => `#${hex2(c.charCodeAt(0))}`)}`;
    case "str":
      return `<${Array.from(o.bytes, hex2).join("")}>`;
    case "arr":
      return `[${o.items.map(serializeOperand).join(" ")}]`;
    case "dict":
      return `<<${o.entries.map(([k, v]) => `${serializeOperand({ t: "name", v: k })} ${serializeOperand(v)}`).join(" ")}>>`;
    case "bool":
      return String(o.v);
    case "null":
      return "null";
  }
}

export function serializeOp(operator: string, operands: Operand[]) {
  return operands.length ? `${operands.map(serializeOperand).join(" ")} ${operator}` : operator;
}

/** Reemplaza rangos de bytes del stream original (ordenados y sin solaparse). */
export function splice(b: Uint8Array, replacements: { start: number; end: number; text: string }[]) {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  let pos = 0;
  for (const r of [...replacements].sort((x, y) => x.start - y.start)) {
    parts.push(b.subarray(pos, r.start));
    parts.push(enc.encode(r.text));
    pos = r.end;
  }
  parts.push(b.subarray(pos));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
