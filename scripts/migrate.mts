// Uso: npm run db:migrate  (aplica las migraciones de ./drizzle a la base de DATABASE_URL)
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (ponla en .env.local).");
  process.exit(1);
}
// Solo desarrollo con dev/docker-compose.yml.
if (process.env.NEON_LOCAL === "1") neonConfig.fetchEndpoint = () => "http://127.0.0.1:4444/sql";

await migrate(drizzle({ client: neon(url) }), { migrationsFolder: "./drizzle" });
console.log("Migraciones aplicadas.");
