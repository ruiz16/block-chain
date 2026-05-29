# Deploy — Plataforma de Micro-Créditos

## Prerrequisitos

- **Node.js** 20.x o superior
- **Docker** y **Docker Compose** (para deploy con Docker)
- **Cuenta de Vercel** con proyecto creado (para deploy en la nube)
- **Proyecto Supabase** en producción
- **Wallet con fondos de testnet cUSD** en Celo Alfajores

---

## 1. Variables de Entorno

Copia y completa los archivos de entorno según el entorno:

### Producción

```bash
cp .env.production.example .env.production
```

Completa cada valor en `.env.production`:

| Variable | Descripción | Público/Secreto |
|---|---|---|
| `NODE_ENV` | Siempre `production` | — |
| `NEXT_PUBLIC_APP_URL` | URL canónica de la app en Vercel | Público |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | Público |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima de Supabase | Público (respeta RLS) |
| `SUPABASE_SERVICE_KEY` | Clave de servicio Supabase (admin) | **Secreto** |
| `CELO_RPC_URL` | URL del RPC de Celo Alfajores | Público |
| `CELO_PRIVATE_KEY` | Clave privada del wallet de desembolsos | **Secreto** |
| `CELO_CUSD_CONTRACT` | Dirección del contrato cUSD | Público |
| `NEXT_PUBLIC_CELOSCAN_BASE_URL` | URL del explorador de bloques | Público |
| `NEXT_PUBLIC_SITE_URL` | URL del sitio para redirects de Auth | Público |

### Desarrollo Local

```bash
cp .env.local.example .env.local
```

---

## 2. Deploy con Docker

### Construir la imagen

```bash
docker build -t block-chain .
```

### Ejecutar el contenedor

```bash
docker run -p 3000:3000 --env-file .env.production block-chain
```

La app estará disponible en `http://localhost:3000`.

### Usando Docker Compose (recomendado)

> **Nota**: Si necesitas Docker Compose, crea un `docker-compose.yml` que exponga el puerto 3000
> y pase el archivo `.env.production` como `env_file`.

---

## 3. Deploy en Vercel

### Opción 1: Importar desde Git (recomendado)

1. Ve a [vercel.com/new](https://vercel.com/new)
2. Importa el repositorio de GitHub
3. El `vercel.json` existente configura el framework automáticamente
4. En **Environment Variables**, agrega todas las variables de `.env.production.example`
5. Haz clic en **Deploy**

### Opción 2: CLI de Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy a producción
vercel --prod
```

### Variables de Entorno en Vercel

Agrega estas variables en el dashboard de Vercel (Project → Settings → Environment Variables):

| Nombre | Ámbito |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Production |
| `NEXT_PUBLIC_SUPABASE_URL` | Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production |
| `SUPABASE_SERVICE_KEY` | Production |
| `CELO_RPC_URL` | Production |
| `CELO_PRIVATE_KEY` | Production |
| `CELO_CUSD_CONTRACT` | Production |
| `NEXT_PUBLIC_CELOSCAN_BASE_URL` | Production |
| `NEXT_PUBLIC_SITE_URL` | Production |

Marca las variables **secretas** (`SUPABASE_SERVICE_KEY`, `CELO_PRIVATE_KEY`) como encriptadas.

---

## 4. GitHub Actions (CI/CD)

### Secrets requeridos

En tu repositorio de GitHub, ve a **Settings → Secrets and variables → Actions** y agrega:

| Secret | Descripción |
|---|---|
| `VERCEL_TOKEN` | Token de API de Vercel (generado en Account → Settings → Tokens) |
| `VERCEL_ORG_ID` | ID de tu organización en Vercel (dashboard → Settings → General) |
| `VERCEL_PROJECT_ID` | ID del proyecto en Vercel (dashboard → Settings → General) |

### Flujo CI

- **Trigger**: Pull Request a `main`
- **Jobs**: `npm ci` → `npm run typecheck` → `npm run lint`
- Si falla, bloquea el merge.

### Flujo CD

- **Trigger**: Push a `main`
- **Jobs**: Deploy automático a Vercel (producción)
- Usa el token y los IDs de los secrets de GitHub.

---

## 5. Verificación Post-Deploy

1. Abre la URL de Vercel
2. Confirma que la app carga sin errores 404 (App Router)
3. Prueba la autenticación con Supabase
4. Prueba la conexión al contrato cUSD (Celo Alfajores)
5. Revisa los logs de Vercel (Dashboard → Deployments → Latest → Functions)

---

## Referencia

| Recurso | URL |
|---|---|
| Vercel Dashboard | https://vercel.com |
| Vercel CLI Docs | https://vercel.com/docs/cli |
| Supabase Dashboard | https://supabase.com |
| Celo Alfajores Faucet | https://faucet.celo.org/alfajores |
| CeloScan (Alfajores) | https://alfajores.celoscan.io |
