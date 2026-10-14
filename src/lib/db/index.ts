import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { applyNeonLocal } from "./neon-local";
import * as schema from "./schema";

let instance: NeonHttpDatabase<typeof schema> | undefined;

/** Conexión perezosa: no falla en build si DATABASE_URL aún no existe. */
export function db() {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL");
    applyNeonLocal();
    instance = drizzle({ client: neon(url), schema });
  }
  return instance;
}

export { schema };
