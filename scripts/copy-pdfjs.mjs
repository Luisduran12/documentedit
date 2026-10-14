// Copia los recursos de pdf.js (worker, wasm, fuentes estándar, cmaps) a public/pdfjs.
import { cpSync, mkdirSync, rmSync } from "node:fs";

const src = "node_modules/pdfjs-dist";
const dst = "public/pdfjs";
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(`${src}/build/pdf.worker.min.mjs`, `${dst}/pdf.worker.min.mjs`);
for (const dir of ["wasm", "standard_fonts", "cmaps", "iccs"]) cpSync(`${src}/${dir}`, `${dst}/${dir}`, { recursive: true });
console.log("pdf.js copiado a public/pdfjs");
