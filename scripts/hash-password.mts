// Uso: npm run hash-password
// Pide la contraseña sin mostrarla y escribe el valor para ADMIN_PASSWORD_HASH.
import bcrypt from "bcryptjs";
import { stdin, stdout } from "node:process";

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(question);
    let value = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        process.exit(1);
      } else if (ch === "\u007f" || ch === "\b") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const first = await ask("Nueva contraseña (mínimo 12 caracteres): ");
if (first.length < 12) {
  console.error("La contraseña debe tener al menos 12 caracteres.");
  process.exit(1);
}
const second = await ask("Repítela: ");
if (first !== second) {
  console.error("Las contraseñas no coinciden.");
  process.exit(1);
}
const hash = await bcrypt.hash(first, 12);
const encoded = `b64:${Buffer.from(hash, "utf8").toString("base64")}`;
console.log("\nCopia esta línea completa en .env.local y en Vercel (variable ADMIN_PASSWORD_HASH):\n");
console.log(`ADMIN_PASSWORD_HASH=${encoded}\n`);
