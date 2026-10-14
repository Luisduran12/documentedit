# Despliegue (Cloudflare R2 + Neon + Vercel)

Guía corta, paso a paso. Nunca pegues claves en chats ni en archivos que se suban a Git: solo en `.env.local`
(tu computador) y en las variables de entorno de Vercel.

## 1. Cloudflare R2 (archivos)

1. <https://dash.cloudflare.com> → **R2 Object Storage** → **Create bucket** → nombre `docupilot` → crear.
   Deja el acceso público **desactivado** (el bucket debe ser privado).
2. En la portada de R2 copia el **Account ID** → será `R2_ACCOUNT_ID`.
3. **Manage R2 API Tokens** → **Create API token** → permiso **Object Read & Write** → *Specify bucket*: `docupilot`
   → crear. Copia **Access Key ID** (`R2_ACCESS_KEY_ID`) y **Secret Access Key** (`R2_SECRET_ACCESS_KEY`).
   El secreto solo se muestra una vez.
4. Bucket `docupilot` → **Settings** → **CORS Policy** → **Add CORS policy** → pega el contenido de
   [`r2-cors.json`](r2-cors.json) cambiando `https://TU-APP.vercel.app` por la dirección real de tu app
   (la tendrás en el paso 3.4; puedes volver después). Guarda.

## 2. Neon (base de datos) con dos ramas

1. <https://console.neon.tech> → **New Project** → nombre `docupilot` → región **AWS US East (N. Virginia)**
   (la misma región donde Vercel ejecuta las funciones por defecto).
2. La rama principal se llama **`production`**: es la que usará Vercel.
3. **Branches** → **Create branch** → nombre **`dev`**, a partir de `production`. Es la que usarás en tu computador.
4. En cada rama pulsa **Connect** y copia su *connection string* (empieza por `postgresql://`):
   - la de **`dev`** va en tu `.env.local` como `DATABASE_URL`;
   - la de **`production`** va en Vercel como `DATABASE_URL` (paso 3).
5. Crear las tablas en las dos ramas, desde la carpeta del proyecto:
   - `dev`: `npm run db:migrate` (usa la `DATABASE_URL` de `.env.local`).
   - `production`: `DATABASE_URL='PEGA-AQUÍ-LA-DE-PRODUCTION' npx tsx scripts/migrate.mts`
     (escríbelo tú en tu terminal; no la pegues en ningún chat).

   Debe decir «Migraciones aplicadas.» en ambas. El desarrollo local nunca debe apuntar a `production`.

## 3. Vercel

1. Sube el repositorio a GitHub como **privado** (te lo preparo yo cuando lo apruebes).
2. <https://vercel.com/new> → importa ese repositorio (Vercel detecta Next.js).
3. Antes de **Deploy**, en **Environment Variables** añade estas 9 (entorno *Production*; para *Preview* usa la rama
   `dev` de Neon):

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | connection string de la rama **production** de Neon |
   | `R2_ACCOUNT_ID` | paso 1.2 |
   | `R2_ACCESS_KEY_ID` | paso 1.3 |
   | `R2_SECRET_ACCESS_KEY` | paso 1.3 |
   | `R2_BUCKET` | `docupilot` |
   | `ADMIN_PASSWORD_HASH` | lo que imprime `npm run hash-password` (empieza por `b64:`) |
   | `SESSION_SECRET` | cadena aleatoria: `openssl rand -hex 32` |
   | `CRON_SECRET` | otra cadena aleatoria: `openssl rand -hex 32` |
   | `NEXT_PUBLIC_SITE_URL` | `https://TU-APP.vercel.app` (sin barra final) |

   Opcional: `NEXT_PUBLIC_OWNER_NAME` (tu nombre, para las iniciales del avatar).
4. **Deploy**. Copia la dirección final, corrige `NEXT_PUBLIC_SITE_URL` si cambió y vuelve a desplegar
   (Deployments → ⋯ → Redeploy). Actualiza el CORS de R2 (paso 1.4) con esa dirección.

## 4. Cron de purga

- Ya está configurado en `vercel.json`: `/api/cron/purge` todos los días a las 08:00 UTC (3:00 a. m. en Colombia).
  Vercel envía automáticamente `Authorization: Bearer $CRON_SECRET`.
- Compruébalo en Vercel → tu proyecto → **Settings → Cron Jobs** (puedes pulsar **Run** para probarlo).
- En el plan gratuito los crons son diarios y con hasta una hora de margen. No afecta a la seguridad: la caducidad
  también se valida en cada visita, así que una imagen vencida nunca se muestra; el cron solo borra los archivos
  vencidos de R2 y vacía la papelera de más de 30 días.

## 5. Lista de verificación final

- [ ] Iniciar sesión desde el computador y desde el celular con tu contraseña (y ver los mismos documentos).
- [ ] Subir un PDF real (no se guarda en Git), abrirlo en el editor, cambiar un texto, borrar el QR/una imagen,
      pegar un logo, moverlo; **Guardar** y **Exportar** en PDF y en PNG (comprobar que el nombre es el original).
- [ ] Imágenes y QR: subir una imagen con «1 semana», escanear el QR con el celular y ver la imagen.
- [ ] Vencimiento: crear un enlace, **Revocar ahora** y comprobar que el QR muestra «Este enlace ya no está
      disponible». (La caducidad de 5 minutos para probar solo existe en desarrollo local.)
- [ ] Celular: menú del navegador → **Agregar a la pantalla de inicio** y abrir la app instalada.
- [ ] Vercel → Settings → Cron Jobs: aparece `/api/cron/purge`.

## Notas

- No hay despliegues automáticos de base de datos: las migraciones se aplican a mano con los comandos del paso 2.5.
- Las claves de producción solo viven en Vercel; si alguna se filtra, regenérala en su servicio y actualízala allí.
