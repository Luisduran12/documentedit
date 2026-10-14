# Entorno local de pruebas (opcional)

Sirve para probar la app sin cuentas reales de Neon ni Cloudflare.

1. `docker compose -f dev/docker-compose.yml up -d`
2. Crea el bucket `docupilot` en MinIO (consola: http://localhost:9101, usuario/clave `minioadmin`).
3. `.env.local` con `NEON_LOCAL=1`, `DATABASE_URL=postgres://postgres:postgres@db.localtest.me:5432/main`,
   `R2_ENDPOINT=http://localhost:9100` y credenciales `minioadmin`.
4. `npm run db:migrate` y `npm run dev`.

Genera el hash de una contraseña de prueba con `npm run hash-password` y ponlo en `.env.local`.
