import { neonConfig } from "@neondatabase/serverless";

/** Solo desarrollo: apunta el driver HTTP de Neon al proxy local de dev/docker-compose.yml. */
export function applyNeonLocal() {
  if (process.env.NEON_LOCAL === "1") {
    neonConfig.fetchEndpoint = () => "http://127.0.0.1:4444/sql";
  }
}
