# Admin Pages — Design System & Refactor

## Goal

Replicar los patrones visuales de la página de Cuotas (agrupación, summary cards, indicadores de salud, row tinting) en todas las páginas admin: Participantes, Créditos, Desembolsos y Dashboard.

## Archivos afectados

| Página | Archivo |
|--------|---------|
| Cuotas | `src/app/(dashboard)/admin/cuotas/page.tsx` — ya refactorizada |
| Participantes | `src/app/(dashboard)/admin/participantes/page.tsx` |
| Créditos | `src/app/(dashboard)/admin/creditos/page.tsx` |
| Desembolsos | `src/app/(dashboard)/admin/desembolsos/page.tsx` |
| Dashboard | `src/app/(dashboard)/admin/dashboard/page.tsx` — ya usa MetricGrid |

## Patrones de diseño

### 1. Summary Cards

En todas las páginas de lista, mostrar 3 tarjetas arriba con agregaciones por estado, calculadas **client-side** sobre los datos visibles en la página actual.

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Pendientes   │  │  Pagadas     │  │  Vencidas    │
│      45       │  │      23      │  │       8      │
│   $12,450     │  │    $6,200    │  │    $3,100    │
├──────────────┤  ├──────────────┤  ├──────────────┤
│  bg-yellow    │  │  bg-emerald  │  │  bg-red      │
└──────────────┘  └──────────────┘  └──────────────┘
```

Estructura del componente `SummaryCard`:
- `label`: string — "Pendientes", "Pagadas", etc.
- `count`: number — cantidad de items
- `total`: string — suma formateada ($12,450)
- `bgColor`: string — clases Tailwind para el fondo/borde
- `textColor`: string — clases Tailwind para el texto/icono
- `icon`: ReactNode — SVG inline

Mapeo por página:

#### Cuotas (ya implementado)
- Pendientes (yellow) → cuotas con estado `pendiente`
- Pagadas (emerald) → cuotas con estado `pagada`
- Vencidas (red) → cuotas con estado `vencida`

#### Participantes
- Activos (emerald) → `participante.activo === true`
- Inactivos (slate) → `participante.activo === false`
- Score Promedio (blue) → promedio de `score_reputacion` en página actual

#### Créditos
- Pendientes/Avalados (yellow) → estados `pendiente` + `avalado`
- Aprobados (indigo) → estado `aprobado`
- Desembolsados (emerald) → estado `desembolsado`
- Pagados (teal) → estado `pagado`
- Default (red) → estado `default`

Nota: para créditos hay 5 estados, mostrar 4 cards combinando pendiente+avalado en una.

#### Desembolsos
- Desembolsados (emerald) → estado `desembolsado`
- Pagados (teal) → estado `pagado`
- Default (red) → estado `default`

#### Dashboard (ya implementado con MetricGrid)
- No tocar — ya tiene MetricGrid con 4 KPIs
- MetricGrid ya es funcionalmente equivalente a SummaryCard

### 2. Tablas

#### Header
**Cuotas usa cabecera sutil** dentro de los grupos de crédito:
```html
<thead>
  <tr className="bg-slate-50/50 dark:bg-gray-800/50">
```

**Participantes/Créditos/Desembolsos usan gradient oscuro actual**:
```html
<thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
```

→ **Decisión:** Mantener gradient oscuro en páginas planas. El header sutil solo tiene sentido dentro de los grupos de cuotas porque ya hay un header de crédito arriba. En páginas planas, el gradient da mejor jerarquía.

#### Row Tinting

Aplicar tintado de fondo en filas con estado negativo:

```tsx
className={`
  transition-colors duration-150
  ${item.estado === 'default' || item.estado === 'vencida' ? 'bg-red-50/40 dark:bg-red-950/20' : ''}
  hover:bg-slate-50/70 dark:hover:bg-gray-700/50
`}
```

Mapeo:
- Créditos/Desembolsos: filas con estado `default` → fondo rojizo
- Participantes: filas con `activo === false` → fondo grisáceo suave
- Cuotas: filas con estado `vencida` → (ya implementado)

#### Indicadores de Estado

Reemplazar badges planos por indicadores con dot + label cuando sea semantically relevante:

```tsx
// Para binarios (activo/inactivo)
<span className="inline-flex items-center gap-1.5 text-xs font-semibold">
  <span className="w-2 h-2 rounded-full bg-emerald-500" />
  Activo
</span>

// Para health scores
function scoreIndicator(score: number) {
  if (score >= 80) return { dot: 'bg-emerald-500', label: 'Bueno' };
  if (score >= 50) return { dot: 'bg-amber-500', label: 'Regular' };
  return { dot: 'bg-red-500', label: 'Bajo' };
}
```

### 3. Loading/Error/Empty States

Mantener el patrón ya existente que es consistente en todas las páginas:

- **Loading**: Skeleton con animate-pulse, mismo shape que las summary cards + tabla
- **Error**: Banner rojo con mensaje de error + botón Reintentar
- **Empty**: Card centrada con icono SVG + mensaje descriptivo

### 4. Dashboard

Sin cambios estructurales. Ya usa MetricGrid que es consistente con el concepto de summary cards. La diferencia es que el dashboard obtiene datos de `/api/admin/metrics` en vez de calcular client-side.

## Resumen de cambios por archivo

### src/app/(dashboard)/admin/participantes/page.tsx
1. Agregar `useMemo` para summary: activos, inactivos, scorePromedio
2. Renderizar 3 SummaryCards arriba con esos datos
3. Agregar `scoreIndicator()` para mostrar health dot junto al score numérico
4. Row tint en filas inactivas (fondo grisáceo)

### src/app/(dashboard)/admin/creditos/page.tsx
1. Agregar `useMemo` para summary por estado: pendientes+avalados, aprobados, desembolsados, pagados, default
2. Renderizar 4 SummaryCards (combinando pendiente+avalado)
3. Row tint en filas default (fondo rojizo)

### src/app/(dashboard)/admin/desembolsos/page.tsx
1. Agregar `useMemo` para summary por estado: desembolsados, pagados, default
2. Renderizar 3 SummaryCards
3. Row tint en filas default (fondo rojizo)

### src/app/(dashboard)/admin/dashboard/page.tsx
- No tocar. MetricGrid ya cubre el patrón de summary cards.
- MetricGrid se alimenta de `/api/admin/metrics`.

## No-cambios

- Cuotas: ya implementado, no tocar
- Dashboard: ya consistente, no tocar
- API routes: no se modifican — todo el cálculo de summaries es client-side
- Componentes compartidos: MetricCard, MetricGrid, CeloScanLink no se tocan

## Verificación

1. `npx tsc --noEmit` — sin errores de tipos
2. `npm test` — 28 tests pasando
3. Cada página debe mostrar summary cards al cargar datos
