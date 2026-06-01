# MANGLE v2 — Microfinanzas, Autonomía y Nodos de Garantía con Enfoque de Género

> **Versión corregida del proyecto.** Basada en PROYECTO.md original + decisiones técnicas tomadas durante implementación + recomendaciones del arquitecto de software.

**Ejecutor:** Fundación Libélulas Doradas (FLD)
**Área de Impacto Primaria:** Pacífico Colombiano
**Estado:** En desarrollo activo (Junio 2026)

---

## 0. Correcciones y Decisiones Técnicas

### Stack Tecnológico Real

| Componente | Elección | Nota |
|------------|----------|------|
| Framework | Next.js 16 (App Router, standalone) | |
| Lenguaje | TypeScript 5.x (strict, noUncheckedIndexedAccess) | |
| Estilos | Tailwind CSS v4 + PostCSS | |
| Base de Datos | Supabase (PostgreSQL 15) | |
| Autenticación | Supabase Auth + SSR (`@supabase/ssr`) + SIWE | Sesión vía cookies |
| Blockchain | Celo Alfajores (testnet) | Mock de 10k cUSD |
| Interacción Blockchain | Viem (NO ethers.js) | |
| Validación | Zod v4 (`import { z } from 'zod/v4'`) | |
| Testing | No configurado | Proyecto sin test runner |

### Patrones de Código Establecidos

- **Supabase queries**: `as never` para inserts/updates, `as unknown as Type | null` para selects (no hay tipos generados)
- **Errores de API**: Códigos en español (`NO_AUTENTICADO`, `CREDITO_NO_ENCONTRADO`, `SCORE_INSUFICIENTE`, etc.)
- **Respuestas GET**: Envueltas en objeto con key (`{ historial }`, `{ creditos }`, `{ participante }`) — CONSISTENCIA so pena de romper frontend
- **Auth guard admin**: `requireAdmin(request)` reusable en `src/lib/auth-guards.ts`
- **Side effects no-bloqueantes**: Score recalculation y audit logs usan `.catch()` para no bloquear el flujo principal
- **Conventional commits**: `feat:`, `fix:`, `feat(scope):` etc. Sin "Co-Authored-By"
- **Commits directo a main** (sin branches feature) — o branch + PR según el workflow

### Migraciones

- **No se usa Supabase CLI** (no hay `config.toml`, no hay Docker local)
- Las migrations son archivos SQL en `supabase/migrations/NNN_nombre.sql`
- Se aplican **manualmente** copy-pasteando en el SQL Editor del Dashboard de Supabase
- Orden estricto por número: 001 → 002 → ... → 011

### Lo que NO está en scope

- **Pilar E (Módulo Educativo Airtable+Zapier+WhatsApp)**: Ignorado explícitamente. Es un sistema externo a la plataforma.
- **NFTs de reputación**: Eliminados. No se desarrollarán NFTs. La recomendación del experto apunta a **Credenciales Verificables (VCs)** con tecnologías como **PrivadoID / DIDs**, no a NFTs.
- **Smart contracts propios**: No se han desplegado contratos propios. Solo se interactúa con el contrato mock de cUSD en testnet.

---

## 1. Declaración del Problema

> Sin cambios respecto al documento original.

El acceso al crédito formal en los estratos 1, 2 y 3 en el Pacífico Colombiano es estructuralmente inviable debido a requisitos burocráticos y la asimetría de información bancaria. Esta brecha de inclusión financiera ha sido capitalizada agresivamente por las redes transnacionales de préstamos informales conocidas como "gota a gota" (o paga diarios).

**Premisa Disruptiva:** El ser humano es inherentemente confiable. MANGLE traslada la garantía prendaria tradicional a una garantía social y sorora. No medimos el valor de una persona por lo que posee, sino por su palabra, su resiliencia y el respaldo de su red comunitaria.

---

## 2. Pilares Conceptuales y Operativos

### Pilar A: Motor de Microcrédito Automatizado en Escala (Infraestructura Celo) ✅ PARCIAL

**Estado:** Implementado parcialmente (SDD 01 - GACC).

**Implementado:**
- ✅ Sistema de autenticación (email + SIWE + wallet Celo)
- ✅ Onboarding de participante
- ✅ Creación y validación de GACC (Grupos de Ahorro y Crédito Comunitario) — hasta 5 miembros
- ✅ Solicitud de crédito con aval + aprobación escalonada
- ✅ Desembolso con verificación on-chain (contrato mock cUSD)
- ✅ Generación de cuotas con capital + interés
- ✅ Pago de cuotas con verificación blockchain
- ✅ Score de reputación como gating para desembolso (>80)

**Pendiente:**
- 🔲 Ampliación de créditos (segundo ciclo, montos mayores)
- 🔲 Integración real con Celo Mainnet (hoy en testnet con mock)
- 🔲 Contratos inteligentes propios

---

### Pilar B: Sistema Dinámico de Score y Reputación ✅ IMPLEMENTADO

**Estado:** Implementado (SDD 02 - Score Dinámico).

**Corrección respecto al documento original:**
El documento original menciona "microcredenciales ligadas a tokens no fungibles (NFT)". **Los NFTs fueron eliminados del alcance.** El scoring actual es 100% interno (base de datos + TypeScript). La recomendación del experto para una futura iteración on-chain apunta a **Credenciales Verificables (VCs)** con tecnologías como **PrivadoID / DIDs**, no a NFTs.

**Algoritmo implementado:**

```
score_efectivo = CLAMP(eventos.reputacion + antigüedad, 0, 100)
```

| Componente | Cómo se calcula |
|------------|----------------|
| **eventos.reputacion** | Se persiste en `participantes.score_reputacion`. Se actualiza con cada evento. |
| **antigüedad** | Se calcula **on-read**: `MIN(months_since(created_at), 10)`. NO se persiste como evento. |
| **score_efectivo** | Suma de ambos, clamped 0-100. Es lo que se muestra y se usa para decisiones. |

**Deltas por evento:**

| Evento | Delta | Condición |
|--------|-------|-----------|
| Pago puntual | +2 | Cuota pagada antes de la fecha de vencimiento |
| Pago atrasado regularizado | -1 | Cuota pagada después del vencimiento |
| Default (morosidad >7d) | -15 | Crédito marcado como default (cooldown 7 días) |

**Arquitectura:**
- `src/lib/score/calculator.ts` — Servicio central con 4 funciones exportadas
- `supabase/migrations/011_score_dinamico.sql` — Tabla `eventos_score`
- `src/lib/validations/score.ts` — Schemas Zod

**Recomendación del arquitecto:** La antigüedad se calcula on-read (NO se persiste) para evitar escrituras innecesarias en DB. El recalculo de score es no-bloqueante (`.catch()`) para no afectar el flujo de pago.

---

### Pilar C: Arquitectura de Fondeo Filantrópico y Sostenibilidad de FLD ❌ NO INICIADO

**Estado:** Pendiente para iteración futura.

La liquidez del ecosistema proviene de un modelo híbrido de donaciones gestionado de manera transparente por FLD:
- **Donación Específica:** Dirigida explícitamente a un proyecto o unidad productiva particular visible en la plataforma.
- **Donación Institucional:** Dirigida al fondo común de la FLD. Un algoritmo de distribución cubre un porcentaje fijo destinado a la operación técnica/logística y a la estrategia de acompañamiento en campo.

**Nota:** Originalmente este era el "Pilar C". Sin embargo, el orden de implementación se ha priorizado distinto. El sistema de Referidos y Redes de Apoyo (originalmente dentro de la sección 3) se ha movido a SDD 03 por su relevancia operativa.

---

### Pilar D: Mecanismo de Sostenibilidad y Condonación — Pase de Oro FLD ❌ NO INICIADO

**Estado:** Pendiente para iteración futura.

El ecosistema no opera bajo una lógica de subsidio asistencialista, sino de corresponsabilidad. El retorno del capital asegura la liquidez del fondo rotatorio.

**Activación:** El beneficiario desbloquea el Pase de Oro FLD cuando se cumplen:
1. Desempeño Financiero Impecable (historial 100% puntual)
2. Soporte Filantrópico Concreto (donación directa en la plataforma)

**Requisito técnico:** Para este pilar se necesita implementar primero el Pilar C (donaciones) y la capa de Credenciales Verificables (VCs) on-chain.

---

### Pilar E: Módulo Piloto "Autonomía Financiera, Digital y Entornos Seguros" 🚫 FUERA DE SCOPE

**Estado: Ignorado explícitamente.** No se implementa dentro de la plataforma.

Este componente educativo funciona mediante un puente de automatización de datos (Airtable + Zapier) hacia WhatsApp. Es un sistema externo, no forma parte de la plataforma web.

---

## 3. Innovación Funcional: Sistema de Referidos y Redes de Apoyo 🔜 SDD 03

**Estado:** Próxima iteración (SDD 03).

### Corrección terminológica
El documento original lo llamaba "Sistema de Referidos y Aval Social de Red" y "Redes de Apoyo". Se ha unificado bajo **"Referidos y Redes de Apoyo"** para la implementación.

### Componentes identificados (para descomposición en sub-SDDs)

#### SDD 03-A: Registro de Referidos
- Tabla `referidos` (quién refirió a quién, cuándo, estado)
- API para registrar un referido al momento del onboarding
- Visualización de mi red de referidos en el perfil

#### SDD 03-B: Redes de Apoyo
- Agrupación automática de referidos en redes
- Score de red (promedio de scores individuales + bonus por cumplimiento colectivo)
- Visualización de la red y su estado

#### SDD 03-C: Semáforo Comunitario (futuro)
- Monitoreo de atrasos de 48h
- Notificaciones a la red de apoyo
- Estados: verde (al día) → amarillo (alerta 48h) → rojo (>7 días)
- Congelamiento de créditos para el nodo en rojo

**Recomendación del arquitecto:** Arrancar solo por SDD 03-A (registro de referidos + asignación a red). El semáforo comunitario depende de tener notificaciones implementadas, que es un componente aparte.

---

## 4. SDDs Completados

| SDD | Feature | Estado | Branch/PR |
|-----|---------|--------|-----------|
| 01 | GACC — Grupos de Ahorro y Crédito Comunitario | ✅ | main |
| 02 | Score Dinámico de Reputación | ✅ | `feat/score-dinamico` → PR abierto |
| 03 | Referidos y Redes de Apoyo | 🔜 En diseño | — |
| 04 | Credenciales Verificables (VCs) on-chain con PrivadoID/DIDs | ⏳ Futuro | — |
| 05 | Pilar C — Donaciones Filantrópicas | ⏳ Futuro | — |
| 06 | Pilar D — Pase de Oro FLD | ⏳ Futuro | — |

---

## 5. Glosario Técnico

| Término | Significado |
|---------|-------------|
| **GACC** | Grupo de Ahorro y Crédito Comunitario. Hasta 5 participantes que se validan mutuamente como garantía social. |
| **Score de reputación** | Puntaje interno (0-100) que refleja comportamiento de pago + antigüedad. |
| **Score efectivo** | Score incluyendo bono por antigüedad. Se calcula on-read. |
| **cUSD / cCOP** | Stablecoins en Celo (USD y COP). |
| **SIWE** | Sign-In with Ethereum. Método de autenticación con wallet blockchain. |
| **VC** | Verifiable Credential. Microcredencial compatible con Web3 e identificadores descentralizados (DID). Tecnologías como PrivadoID. Postergado. |
| **Red de Apoyo** | Grupo de participantes conectadas por referidos. Comparten score colectivo. |
| **Semáforo Comunitario** | Sistema de alertas ante atrasos con enfoque de género (no punitivo). |

---

## 6. Decisiones de Arquitectura (Registro Histórico)

| Fecha | Decisión | Motivación |
|-------|----------|------------|
| 2026-05-22 | Next.js 16 App Router con Supabase SSR | Stack moderno, server components, RLS |
| 2026-05-22 | Viem en vez de ethers.js | Tipos nativos, mejor developer experience |
| 2026-05-23 | Zod v4 para validaciones | TypeScript-first, schemas reutilizables |
| 2026-05-23 | `as never` / `as unknown as Type` para Supabase | No hay @supabase gen-types disponibles |
| 2026-06-01 | Score efectivo = eventos + antigüedad on-read | Evita persistir datos calculados, simplifica el modelo |
| 2026-06-01 | Default cooldown 7 días | Evita aplicación múltiple del mismo evento |
| 2026-06-01 | recalcularScore no-bloqueante | No debe bloquear el flujo de pago |
| 2026-06-01 | Respuestas GET envueltas en key | Consistencia de API |
| 2026-06-01 | Migraciones manuales vía SQL Editor | No hay Supabase CLI configurado |
| 2026-06-01 | Ignorar Pilar E | Sistema externo (Airtable + Zapier + WhatsApp) |
