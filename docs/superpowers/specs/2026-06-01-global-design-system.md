# Global Design System — BlockChain Micro-Créditos

## Objetivo

Replicar los patrones visuales de la página de Cuotas (summary cards, health indicators, row tinting, progress bars, dark gradient headers) como un **design system global** con componentes reutilizables en `src/components/ui/`.

## Filosofía

- **DRY**: Todo componente UI compartido vive en `src/components/ui/`
- **Consistente**: Mismos patrones visuales en admin y páginas de usuario
- **Declarativo**: Las páginas usan componentes en vez de repetir HTML/Tailwind
- **Sin deps externas**: SVG inline, solo Tailwind + dark mode

## Componentes UI

```
src/components/ui/
├── SummaryCard.tsx        # Tarjeta de métrica con icono, conteo y total
├── SummaryGrid.tsx        # Grid responsivo de SummaryCards
├── PageHeader.tsx         # h1 + subtítulo consistente
├── StatusBadge.tsx        # Badge tipo pill con color semántico
├── HealthIndicator.tsx    # Dot coloreado + label (al día / en curso / vencido)
├── ProgressBar.tsx        # Barra de progreso con current/total
├── CardSection.tsx        # Card con header gradient + contenido
├── DataTable.tsx          # Tabla con header dark gradient + body
├── Pagination.tsx         # Controles Anterior/Siguiente
├── LoadingSkeleton.tsx    # Skeleton animado configurable
├── ErrorAlert.tsx         # Alerta roja con mensaje + retry
└── EmptyState.tsx         # Estado vacío con icono SVG + mensaje
```

## Especificación de cada componente

### PageHeader

```tsx
<PageHeader title="Gestión de Cuotas" subtitle="156 cuotas registradas" />
```

Render:
```
┌─────────────────────────────────────────────┐
│  Gestión de Cuotas                          │  ← text-2xl font-bold
│  156 cuotas registradas                     │  ← text-sm text-gray-500
└─────────────────────────────────────────────┘
```

Clases: `mb-6`, título `text-2xl font-bold text-gray-900 dark:text-white`, subtítulo `mt-1 text-sm text-gray-500 dark:text-gray-400`

### SummaryCard

```tsx
<SummaryCard
  label="Pendientes"
  count={45}
  total="$12,450"
  variant="warning"   // warning | success | danger | info | default
  icon={<ClockIcon />}
/>
```

Variants → colores:

| Variant | Borde/Fondo | Texto |
|---------|-------------|-------|
| `warning` | `border-yellow-200 bg-yellow-50/50` | `text-yellow-600` |
| `success` | `border-emerald-200 bg-emerald-50/50` | `text-emerald-600` |
| `danger` | `border-red-200 bg-red-50/50` | `text-red-600` |
| `info` | `border-blue-200 bg-blue-50/50` | `text-blue-600` |
| `default` | `border-slate-200 bg-slate-50/50` | `text-slate-600` |

### SummaryGrid

```tsx
<SummaryGrid>
  <SummaryCard ... />
  <SummaryCard ... />
  <SummaryCard ... />
</SummaryGrid>
```

Grid classes: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8`

### StatusBadge

```tsx
<StatusBadge status="pagada" />
<StatusBadge status="vencida" />
<StatusBadge status="default" />
```

Mapeo de colores por estado (global):

| Estado | Color |
|--------|-------|
| `pagada`, `pagado`, `activo` | emerald |
| `pendiente` | yellow |
| `aprobado` | indigo |
| `avalado` | blue |
| `desembolsado` | emerald |
| `vencida`, `default`, `inactivo` | red |
| `prestatario` | blue |
| `aval` | purple |
| `prestamista` | indigo |
| `admin` | amber |

### HealthIndicator

```tsx
<HealthIndicator health="al-dia" />    // dot verde + "Al día"
<HealthIndicator health="mixto" />     // dot amarillo + "En curso"
<HealthIndicator health="vencido" />   // dot rojo + "Vencido" (con pulse)
```

### ProgressBar

```tsx
<ProgressBar current={3} total={12} />
```

Barra de 1.5px height con color dinámico:
- `current === total` → emerald (completo)
- `current/total > 50%` → blue
- Else → amber

### CardSection

```tsx
<CardSection title="Información Personal" subtitle="Tus datos registrados">
  {/* contenido */}
</CardSection>
```

Render:
```
┌─────────────────────────────────────────────────┐
│ ████████████████████████████████████████████████ │  ← gradient dark header
│ ████████████████████                             │
│  Información Personal                            │  ← text-white font-bold
│  Tus datos registrados                           │  ← text-slate-400
├─────────────────────────────────────────────────┤
│  Contenido aquí                                  │  ← white/gray-800 bg
└─────────────────────────────────────────────────┘
```

Bordes: `rounded-2xl border-slate-200/80 shadow-xl`
Header: `bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900`

### DataTable

```tsx
<DataTable
  columns={[
    { key: 'nombre', label: 'Nombre', align: 'left' },
    { key: 'monto', label: 'Monto', align: 'right' },
    { key: 'estado', label: 'Estado', align: 'center', render: (v) => <StatusBadge status={v} /> },
  ]}
  data={items}
  onRowClick={(item) => ...}
  rowClassName={(item) => item.estado === 'default' ? 'bg-red-50/40' : ''}
/>
```

### Pagination

```tsx
<Pagination page={1} totalPages={8} total={156} label="cuotas" onPageChange={setPage} />
```

Botones: Anterior / Siguiente con disabled states.
Texto: "Página 1 de 8 (156 cuotas)"

### LoadingSkeleton

```tsx
<LoadingSkeleton variant="table" rows={5} />
<LoadingSkeleton variant="cards" count={3} />
<LoadingSkeleton variant="text" />
```

Variants:
- `table`: Card gradient header + rows
- `cards`: Grid of card skeletons
- `text`: Simple text lines

### ErrorAlert

```tsx
<ErrorAlert message="Error al cargar datos" onRetry={fetchData} />
```

Red banner with message + "Reintentar" button.

### EmptyState

```tsx
<EmptyState icon={<UsersIcon />} title="Sin participantes" description="No hay participantes registrados" />
```

Centered card with large icon + title + description.

## Mapa de implementación

### Fase 1: Componentes base (11 archivos)
Crear todos los componentes UI en `src/components/ui/`.

### Fase 2: Migrar páginas admin (4 páginas)
- `participantes/page.tsx` → SummaryCards + HealthIndicator + DataTable + row tint
- `creditos/page.tsx` → SummaryCards + DataTable + row tint
- `desembolsos/page.tsx` → SummaryCards + DataTable + row tint
- `cuotas/page.tsx` → Refactor a componentes compartidos

### Fase 3: Migrar páginas de usuario (3 páginas)
- `notificaciones/page.tsx` → PageHeader + LoadingSkeleton + ErrorAlert + EmptyState + Pagination
- `mis-creditos/page.tsx` → PageHeader + SummaryCards en MisCreditosClient
- `perfil/page.tsx` → CardSection consistente

### Fase 4: Verificación
- `npx tsc --noEmit` — 0 errors
- `npm test` — 28 tests pasando
- `npm run build` — build exitoso

## No-cambios

- API routes: no se modifican
- Componentes existentes: MetricCard, MetricGrid, AuditLogTable, CeloScanLink se mantienen
- Páginas de formulario/flujo: pagos, solicitar, gacc, aprobacion, login, register, onboarding
- Tests: no se modifican (solo UI)
