# SDD 03 — Referidos y Redes de Apoyo

> Sistema de referidos, redes de apoyo, score colectivo y semáforo comunitario con enfoque de género. Basado en el documento MANGLE (Sección 3: Innovación Funcional).

**Autor:** Arquitecto de Software
**Fecha:** 2026-06-01
**Estado:** Aprobado

---

## 1. Descripción General

Sistema que permite a las participantes referir a otras emprendedoras de su comunidad para ingresar a MANGLE. Las referidas se agrupan automáticamente en **Redes de Apoyo** con un score colectivo. Ante atrasos, el **Semáforo Comunitario** activa alertas no punitivas a la red, reemplazando la coerción por la solidaridad comunitaria.

### Relación con otros pilares

- **Pilar A (Microcrédito)**: El semáforo en rojo congela nuevos créditos para el nodo afectado.
- **Pilar B (Score Dinámico)**: El score colectivo de red complementa el score individual existente.
- **SDD 02**: El evento `verificarAtrasosRed` se dispara desde el mismo hook que `recalcularScore`.

---

## 2. Modelo de Datos

### Tablas nuevas (Migration 012)

#### 2.1 `referidos`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| referidor_id | UUID FK → participantes | Quién refirió |
| referido_id | UUID FK → participantes | Quién fue referido |
| codigo_usado | TEXT | Código que se usó para referir |
| created_at | TIMESTAMPTZ | |
| activo | BOOLEAN | Default true |

**Constraints:**
- UNIQUE(referido_id): una persona solo puede ser referida una vez.
- FK a participantes con ON DELETE RESTRICT.

#### 2.2 `redes_apoyo`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| nombre | TEXT | Nombre legible de la red |
| score_red | INTEGER | Promedio de scores efectivos de los miembros. Default 50. |
| estado | TEXT | `verde` / `amarillo` / `rojo`. Default `verde`. |
| created_at | TIMESTAMPTZ | |

#### 2.3 `red_miembros`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| red_id | UUID FK → redes_apoyo | |
| participante_id | UUID FK → participantes | |
| es_referidora | BOOLEAN | True para quien inició la red. Default false. |
| created_at | TIMESTAMPTZ | |

**Constraints:**
- UNIQUE(participante_id): cada persona pertenece a UNA red.

#### 2.4 `notificaciones`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| participante_id | UUID FK → participantes | |
| tipo | TEXT | Enum: `bienvenida_red`, `score_red_mejoro`, `score_red_empeoro`, `alerta_48h`, `alerta_7d`, `referido_nuevo` |
| titulo | TEXT | Título corto de la notificación |
| cuerpo | TEXT | Cuerpo del mensaje |
| leida | BOOLEAN | Default false |
| created_at | TIMESTAMPTZ | |

#### 2.5 `cola_email`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| para | TEXT | Email destino |
| asunto | TEXT | |
| cuerpo_html | TEXT | Cuerpo en HTML |
| estado | TEXT | `pendiente` / `enviado` / `fallido`. Default `pendiente`. |
| error | TEXT | Mensaje de error si falló |
| created_at | TIMESTAMPTZ | |
| enviado_at | TIMESTAMPTZ | Null hasta que se envíe |

### Modificaciones a tablas existentes

- `participantes`: agregar columna `codigo_referido TEXT UNIQUE` — código único que la participante puede compartir para que otras la refieran.

---

## 3. APIs

### 3.1 Registro de referido (en onboarding)

**Punto de extensión:** `POST /api/participantes` (existente).

Se agrega campo opcional `codigo_referido` al body de creación. Si está presente:
1. Buscar el `participante` dueño de ese código.
2. Insertar en `referidos` (referidor = dueño del código, referido = nuevo participante).
3. Asignar nuevo participante a la misma red que el referidor.
4. Notificar a la red con `bienvenida_red`.
5. Si es el primer referido de la red, marcar al referidor como `es_referidora = true`.

### 3.2 GET /api/referidos/mi-red

**Auth:** Sesión requerida.

Devuelve la red de apoyo del usuario autenticado:

```json
{
  "red": {
    "id": "uuid",
    "nombre": "Red de Maria",
    "score_red": 72,
    "estado": "verde"
  },
  "miembros": [
    {
      "id": "uuid",
      "nombre": "Maria",
      "score_efectivo": 85,
      "es_referidora": true
    }
  ],
  "total_miembros": 5
}
```

### 3.3 GET /api/notificaciones

**Auth:** Sesión requerida.

**Query params:** `limit` (default 20, max 50), `offset` (default 0).

```json
{
  "notificaciones": [
    {
      "id": "uuid",
      "tipo": "bienvenida_red",
      "titulo": "¡Nueva compañera!",
      "cuerpo": "Ana se ha unido a tu red de apoyo.",
      "leida": false,
      "created_at": "2026-06-01T..."
    }
  ],
  "total": 1
}
```

### 3.4 PATCH /api/notificaciones/[id]/leer

**Auth:** Sesión requerida. Solo el dueño de la notificación puede marcarla como leída.

**Response:** `{ status: "ok" }`

### 3.5 GET /api/admin/redes (futuro, opcional)

**Auth:** Admin.

Listar todas las redes con sus estados para monitoreo.

### 3.6 POST /api/admin/procesar-emails

**Auth:** Admin.

Procesa la cola de emails pendientes. Por ahora solo hace console.log y marca como `enviado`. Stub para futura integración con SendGrid/Resend/Mailgun.

**Response:** `{ status: "ok", procesados: 5, fallidos: 0 }`

---

## 4. Flujo de Semáforo Comunitario

### Evaluación

Se ejecuta después de cada pago (`POST /api/pago`), como un side-effect no-bloqueante más (junto a `recalcularScore`).

```typescript
// En POST /api/pago, después del update de cuota:
recalcularScore({...}).catch(console.warn);
// Recalcular score de red + verificar semáforo
recalcularScoreRed(redId).catch(console.warn);
verificarAtrasosRed(participanteId).catch(console.warn);
```

### Lógica de `verificarAtrasosRed`

```
Entrada: participanteId

1. Obtener red del participante (red_miembros → redes_apoyo)
2. Para cada miembro de la red:
   a. Buscar cuotas vencidas no pagadas
   b. Si hay cuotas con vencimiento entre 48h y 7d → estado 'amarillo'
   c. Si hay cuotas con vencimiento >7d → estado 'rojo'
3. Si ningún miembro tiene atrasos:
   - Si estado actual != 'verde' → cambiar a 'verde', notificar "score_red_mejoro"
4. Si transicionó a amarillo:
   - Notificar "alerta_48h" a todos los miembros
   - Encolar email a la referidora
5. Si transicionó a rojo:
   - Notificar "alerta_7d" a todos los miembros
   - Marcar red como restringida (congela nuevos créditos)
```

### Score de Red

Se recalcula en dos puntos:
- **En el flujo de pago**: después de `recalcularScore()`, se llama a `recalcularScoreRed(redId)` para actualizar el promedio.
- **En el registro de referido**: después de agregar un nuevo miembro, se recalcula el score de la red.

**Fórmula:**
```typescript
score_red = Math.round(
  miembros.reduce(sum, m => scoreEfectivo(m.score_reputacion, m.created_at)) / miembros.length
)
```

---

## 5. Lógica de Referidos

### Registro de participante con referido

```typescript
async function registrarReferido(params: {
  referidoId: string;      // nuevo participante
  codigoReferido: string;  // código que usó
}): Promise<{ redId: string }>
```

1. Buscar participante dueño del código (`WHERE codigo_referido = codigoReferido`)
2. Validar que no sea autorreferencia (el código no es del propio nuevo participante)
3. Validar que el referidor existe y está activo
4. Insertar en `referidos` (referidor = dueño, referido = nuevo)
5. Obtener red del referidor (`red_miembros`)
6. Si no tiene red → crear una nueva con el referidor como `es_referidora`
7. Insertar nuevo miembro en esa red
8. Notificar `bienvenida_red` a todos los miembros
9. Recalcular score de red
10. Retornar `{ redId }`

### Código de referido

Cada participante obtiene un `codigo_referido` único al crearse. Formato: `MANGLE-{nombre}-{4 digitos aleatorios}` (ej: `MANGLE-Maria-A3F2`). Se muestra en el perfil para que la usuaria lo comparta con sus contactos.

---

## 6. Servicio de Notificaciones

### `src/lib/notificaciones/service.ts`

```typescript
export async function crearNotificacion(params: {
  participanteId: string;
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
}): Promise<void>
```

- Insert directo en tabla `notificaciones`.
- No-bloqueante desde el caller (se llama con `.catch()`).

### `src/lib/notificaciones/queries.ts`

```typescript
export async function listarNotificaciones(
  participanteId: string, limit: number, offset: number
): Promise<{ notificaciones: Notificacion[]; total: number }>

export async function marcarLeida(
  notificacionId: string, participanteId: string
): Promise<void>
```

---

## 7. Servicio de Email

### `src/lib/email/cola.ts`

```typescript
export async function encolarEmail(params: {
  para: string;
  asunto: string;
  cuerpoHtml: string;
}): Promise<void>
```

- Inserta en `cola_email` con estado `pendiente`.
- No valida formato de email (se hace en API layer si es necesario).

### `src/lib/email/sender.ts`

```typescript
export async function procesarCola(): Promise<{ procesados: number; fallidos: number }>
```

- Busca todos los emails con estado `pendiente`.
- Los marca como `enviado` y loguea el contenido a consola.
- **Stub:** cuando tengan un provider, solo cambian esta función para llamar a la API de SendGrid/Resend/etc.

---

## 8. Sidebar y Navegación

### Icono de Notificaciones

- En el sidebar/layout principal, agregar un icono de campana (`🔔`).
- Mostrar badge con el conteo de notificaciones no leídas.
- Link a `/notificaciones` (página de bandeja).

### Página de Notificaciones

`/notificaciones` — lista paginada de notificaciones, más recientes primero. Cada notificación tiene botón "Marcar como leída". Las no leídas se destacan visualmente (fondo sutil, bold en el título).

### Sección "Mi Red" en Perfil

En el perfil (`/perfil`), agregar una nueva sección/card que muestre:
- Nombre de la red
- Score de red
- Estado del semáforo (con indicador visual verde/amarillo/rojo)
- Cantidad de miembros
- Lista de miembros con sus scores individuales
- Código de referido personal (para copiar y compartir)

---

## 9. Arquitectura de Carpetas

```
src/
  lib/
    referidos/
      registry.ts       # registrarReferido()
      semaforo.ts       # verificarAtrasosRed()
      score-red.ts      # recalcularScoreRed()
    notificaciones/
      service.ts        # crearNotificacion()
      queries.ts        # listarNotificaciones(), marcarLeida()
    email/
      cola.ts           # encolarEmail()
      sender.ts         # procesarCola()
  app/
    api/
      referidos/
        mi-red/
          route.ts      # GET
      notificaciones/
        route.ts        # GET
        [id]/
          leer/
            route.ts    # PATCH
      admin/
        redes/
          route.ts      # GET (opcional, futuro)
        procesar-emails/
          route.ts      # POST
    notificaciones/
      page.tsx          # Bandeja de notificaciones
  components/
    notificaciones/
      NotificacionItem.tsx
    redes/
      RedCard.tsx       # Widget de red para perfil
```

---

## 10. Patrones y Convenciones

- **Side-effects no-bloqueantes**: `verificarAtrasosRed()` y notificaciones se llaman con `.catch()`.
- **Respuestas GET envueltas**: `{ notificaciones }`, `{ red }`, `{ miembros }`.
- **Casteos Supabase**: `as unknown as Type | null`.
- **Errores en español**: `NOTIFICACION_NO_ENCONTRADA`, `CODIGO_REFERIDO_INVALIDO`, etc.
- **Separación de concerns**: cada servicio en su propia carpeta (`referidos/`, `notificaciones/`, `email/`).

---

## 11. Tareas de Implementación (Tasks)

1. **Migration 012**: SQL con las 5 tablas nuevas + columna `codigo_referido` en participantes.
2. **Código de referido**: Generar `codigo_referido` único al crear participante (modificar `POST /api/participantes`).
3. **Registro de referido**: `src/lib/referidos/registry.ts` — lógica de registrar referido + asignar a red.
4. **Modificar onboarding**: Integrar `registrarReferido()` en `POST /api/participantes` cuando `codigo_referido` está presente.
5. **Servicio de notificaciones**: `src/lib/notificaciones/service.ts` + `queries.ts`.
6. **Servicio de email**: `src/lib/email/cola.ts` + `sender.ts`.
7. **Semáforo comunitario**: `src/lib/referidos/semaforo.ts` — `verificarAtrasosRed()`.
8. **Score de red**: `src/lib/referidos/score-red.ts` — `recalcularScoreRed()`.
9. **Integrar semáforo en pago**: Agregar `verificarAtrasosRed()` en `POST /api/pago`.
10. **API mi-red**: `GET /api/referidos/mi-red`.
11. **API notificaciones**: `GET /api/notificaciones` + `PATCH /api/notificaciones/[id]/leer`.
12. **API admin procesar-emails**: `POST /api/admin/procesar-emails`.
13. **Sidebar badge**: Contador de notificaciones no leídas en el layout.
14. **Página de notificaciones**: `/notificaciones/page.tsx` + `NotificacionItem.tsx`.
15. **Widget de red en perfil**: `RedCard.tsx` + sección en perfil.
16. **Verificación final**: typecheck + lint.

---

## 12. Exclusiones

- **Notificaciones push externas** (WhatsApp, Telegram, push nativas): postergado.
- **Email real**: solo cola + stub. Integración con provider queda para después.
- **VCs/DIDs**: fuera del alcance de este SDD (es SDD 04+).
- **NFTs**: eliminados del proyecto.
