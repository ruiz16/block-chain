# BlockChain — Plataforma de Micro-Créditos

Plataforma descentralizada de micro-créditos construida sobre **Celo blockchain**. Permite solicitar, aprobar, desembolsar y pagar préstamos en **cUSD (Celo Dollar stablecoin)** con trazabilidad completa, sistema de avales y panel de administración.

---

## Tabla de Contenidos

- [Arquitectura](#arquitectura)
- [Stack Tecnológico](#stack-tecnológico)
- [Primeros Pasos](#primeros-pasos)
- [Variables de Entorno](#variables-de-entorno)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Ciclo de Vida de un Crédito](#ciclo-de-vida-de-un-crédito)
- [Roles y Permisos](#roles-y-permisos)
- [API](#api)
- [Despliegue](#despliegue)
- [Desarrollo](#desarrollo)

---

## Arquitectura

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Next.js    │────▶│    Supabase      │     │  Celo Alfajores     │
│  (App Router)│     │  ┌────────────┐  │     │  ┌───────────────┐  │
│              │     │  │ PostgreSQL │  │     │  │ cUSD (ERC-20) │  │
│  Server-side │     │  │ Auth (RLS) │  │     │  │               │  │
│  API Routes  │     │  │ Audit Log  │  │     │  │               │  │
│  Components  │     │  └────────────┘  │     │  └───────────────┘  │
└──────┬───────┘     └──────────────────┘     └─────────────────────┘
       │
       │  viem (RPC)
       └───────────────────────────────────────────────────────────▶
```

La aplicación usa **Next.js 16** con App Router para frontend y API. **Supabase** provee la base de datos PostgreSQL, autenticación y Row-Level Security. **viem** conecta con la blockchain de Celo (testnet Alfajores) para ejecutar y verificar transacciones del token cUSD.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript (strict) |
| Estilos | Tailwind CSS v4 |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth + SIWE (Sign-In With Ethereum) |
| Blockchain | Celo Alfajores (chain ID 44787) — cUSD |
| Interacción blockchain | viem v2 |
| Validación | Zod v4 |
| CI/CD | GitHub Actions + Vercel |
| Contenedores | Docker |

---

## Primeros Pasos

### Prerrequisitos

- Node.js 20+
- Docker (opcional, para deploy local)
- Una wallet con fondos de testnet cUSD en [Celo Alfajores](https://faucet.celo.org/alfajores)
- Un proyecto en [Supabase](https://supabase.com)

### Instalación

```bash
# Clonar el repositorio
git clone <repo-url>
cd block-chain

# Instalar dependencias
npm install

# Copiar variables de entorno y completarlas
cp .env.local.example .env.local

# Iniciar en desarrollo
npm run dev
```

### Migraciones de Base de Datos

Las migraciones de Supabase están en `supabase/migrations/`. Se ejecutan en orden:

```bash
# Usando Supabase CLI
supabase db push
```

O importá los archivos SQL manualmente desde el dashboard de Supabase.

---

## Variables de Entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima de Supabase | ✅ |
| `SUPABASE_SERVICE_KEY` | Clave de servicio (admin) de Supabase | ✅ |
| `CELO_RPC_URL` | RPC de Celo Alfajores | (default) |
| `CELO_PRIVATE_KEY` | Clave privada de la billetera institucional | ✅ |
| `CELO_CUSD_CONTRACT` | Dirección del contrato cUSD | (default) |
| `NEXT_PUBLIC_CELOSCAN_BASE_URL` | URL del explorador de bloques | (default) |
| `NEXT_PUBLIC_APP_URL` | URL canónica de la app | ✅ |
| `NEXT_PUBLIC_SITE_URL` | URL del sitio para redirects de Auth | ✅ |

> **Importante**: `SUPABASE_SERVICE_KEY` y `CELO_PRIVATE_KEY` son secretos. Nunca comitearlos.

---

## Estructura del Proyecto

```
block-chain/
├── src/
│   ├── app/
│   │   ├── (dashboard)/         # Rutas protegidas (requieren sesión)
│   │   │   ├── aprobacion/      # Panel de revisión y aprobación
│   │   │   ├── solicitar/       # Formulario de solicitud de crédito
│   │   │   ├── mis-creditos/    # Historial del prestatario
│   │   │   ├── pagos/           # Registro de pagos
│   │   │   └── admin/           # Dashboard admin + KPIs
│   │   ├── api/                 # API routes (REST)
│   │   ├── login/
│   │   ├── register/
│   │   └── onboarding/
│   ├── components/
│   │   ├── creditos/            # SolicitarCredito, PanelAprobacion
│   │   ├── avales/              # GestorAvales
│   │   ├── pagos/               # PanelPagos, MisCreditosClient
│   │   ├── admin/               # MetricGrid, MetricCard, AuditLogTable
│   │   ├── auth/                # SiweLogin, WalletConnectButton, AuthProvider
│   │   └── shared/              # CeloScanLink
│   ├── lib/
│   │   ├── supabase/            # Clientes de Supabase (server, browser, service)
│   │   ├── blockchain/          # Desembolso y verificación de pagos en Celo
│   │   ├── siwe/                # Generación y verificación de nonces SIWE
│   │   ├── audit/               # Logger de auditoría
│   │   └── validations/         # Esquemas Zod para cada endpoint
│   ├── config/
│   │   └── celo.ts              # Configuración de red Celo
│   ├── types/
│   │   └── database.ts          # Tipos de datos (Wei, TxHash, etc.)
│   └── middleware.ts            # Protección de rutas por sesión y rol
├── supabase/
│   └── migrations/              # Migraciones SQL (001 a 007)
├── openspec/                    # Documentación de especificaciones
├── .github/workflows/           # CI (typecheck + lint) y CD (Vercel)
├── Dockerfile                   # Build multi-stage
└── vercel.json                  # Configuración de deploy
```

---

## Ciclo de Vida de un Crédito

```
Solicitud → Pendiente → Avalado → Aprobado → Desembolsado → Pagado
                                                          ↘ Default
```

| Estado | Descripción |
|--------|-------------|
| **Pendiente** | El prestatario solicitó el crédito. Espera aval o aprobación directa. |
| **Avalado** | Al menos un garante respaldó el crédito. |
| **Aprobado** | Un administrador aprobó el crédito y fijó la fecha de vencimiento. |
| **Desembolsado** | Los cUSD se transfirieron desde la billetera institucional a la del prestatario en la blockchain. |
| **Pagado** | El prestatario devolvió los cUSD y la blockchain lo verificó. |
| **Default** | (Futuro) El crédito venció sin ser pagado. |

### Flujo Completo

1. **Solicitud** → El prestatario completa el formulario con monto y plazo.
2. **Aval** (opcional) → Un garante respalda el crédito como señal de confianza.
3. **Aprobación** → El administrador revisa y aprueba el crédito.
4. **Desembolso** → El administrador ejecuta la transferencia de cUSD en la blockchain (requiere score de reputación ≥ 80).
5. **Pago** → El prestatario transfiere los cUSD desde su wallet a la wallet institucional y registra el hash de la transacción. La plataforma verifica automáticamente en la blockchain que el pago sea válido.

---

## Roles y Permisos

| Rol | Acceso |
|-----|--------|
| **Prestatario** | Solicitar créditos, ver sus créditos, registrar pagos |
| **Aval** | Todo lo del prestatario + asignar/revocar avales, aprobar créditos, desembolsar |
| **Prestamista** | Mismo nivel que Aval |
| **Admin** | Todo lo anterior + dashboard con KPIs, gestión de participantes, log de auditoría completo |

La seguridad se implementa en tres capas:
- **Middleware**: redirige según ruta y rol (UX)
- **API guards**: `requireAdmin()`, `requireReviewer()`, `requireRoles()` (seguridad real)
- **Supabase RLS**: políticas a nivel de fila en la base de datos

---

## API

### Créditos

| Método | Ruta | Guard | Descripción |
|--------|------|-------|-------------|
| `POST` | `/api/creditos` | Sesión | Crear solicitud de crédito |
| `GET` | `/api/creditos` | Sesión | Listar créditos propios |
| `PATCH` | `/api/creditos/[id]/aprobar` | Admin | Aprobar crédito |
| `GET` | `/api/mis-creditos` | Sesión | Créditos del prestatario autenticado |

### Avales

| Método | Ruta | Guard | Descripción |
|--------|------|-------|-------------|
| `POST` | `/api/avales` | Reviewer | Asignar garante a un crédito |
| `GET` | `/api/avales` | Sesión | Listar avales |
| `PATCH` | `/api/avales/[id]/revocar` | Reviewer | Revocar garante |

### Transacciones Blockchain

| Método | Ruta | Guard | Descripción |
|--------|------|-------|-------------|
| `POST` | `/api/desembolso` | Reviewer | Ejecutar desembolso en Celo |
| `POST` | `/api/pago` | Dueño | Verificar y registrar pago |

### Administración

| Método | Ruta | Guard | Descripción |
|--------|------|-------|-------------|
| `GET` | `/api/admin/metrics` | Admin | KPIs globales de la plataforma |
| `GET` | `/api/admin/participantes` | Admin | Listado paginado de participantes |
| `GET` | `/api/admin/audit-log` | Admin | Registro de auditoría |

### Autenticación

| Método | Ruta | Guard | Descripción |
|--------|------|-------|-------------|
| `GET` | `/api/auth/nonce` | Rate-limited | Obtener nonce para SIWE |
| `POST` | `/api/auth/siwe` | Firma | Verificar firma SIWE e iniciar sesión |

---

## Despliegue

### Vercel (recomendado)

```bash
npm i -g vercel
vercel login
vercel --prod
```

Configurar variables de entorno en el dashboard de Vercel (Project → Settings → Environment Variables).

### Docker

```bash
docker build -t block-chain .
docker run -p 3000:3000 --env-file .env.production block-chain
```

### CI/CD

El repositorio incluye GitHub Actions para:
- **CI**: TypeScript typecheck + ESLint en PRs a `main`
- **CD**: Deploy automático a Vercel en push a `main`

Ver `.github/workflows/` para más detalles.

---

## Desarrollo

### Comandos

```bash
npm run dev        # Servidor de desarrollo (Turbopack)
npm run build      # Build de producción
npm run lint       # ESLint
npm run typecheck  # TypeScript type-checking
```

### Convenciones

- TypeScript strict mode
- ESLint + Prettier (configurar en el IDE)
- Commits convencionales
- Zod schemas en cada API route para validación de entrada
- Auditoría programática + trigger de base de datos para eventos financieros

### Base de datos

Las migraciones están en `supabase/migrations/`. Son acumulativas y deben ejecutarse en orden numérico.

```bash
001_schema.sql   # Tablas core, enums, triggers, RLS
002_avales.sql   # Auditoría de avales
003_auth.sql     # Integración con Supabase Auth
004_pago.sql     # Hash de pago
005_admin.sql    # Rol admin, restricción de auditoría
006_loan_terms.sql # Interés, plazo, vencimiento
007_siwe.sql     # Nonces SIWE, wallet auth
```

---

## Licencia

Privado — Uso interno.
