# Plataforma de Micro-Créditos Blockchain — Resumen Ejecutivo

**Fecha:** Mayo 2026
**Estado:** Funcional (testnet Celo Alfajores)
**Propósito:** Plataforma descentralizada de micro-créditos con trazabilidad blockchain, sistema de avales y panel de administración.

---

## 1. El Problema

Los micro-créditos tradicionales enfrentan tres problemas estructurales:

| Problema | Consecuencia |
|----------|-------------|
| **Falta de transparencia** — No hay manera de auditar de forma independiente si un desembolso o pago realmente ocurrió | Desconfianza entre las partes |
| **Procesos manuales** — Aprobación, desembolso y seguimiento dependen de planillas, correos y procesos offline | Lentitud y errores operativos |
| **Altos costos operativos** — Se necesita personal dedicado a validar pagos, conciliar cuentas y mantener registros | Inviable para préstamos de bajo monto |

---

## 2. La Solución

Una plataforma digital que **automatiza todo el ciclo de vida de un micro-crédito**: desde la solicitud hasta el pago, con un registro inmutable y verificable de cada transacción financiera.

### ¿Qué la hace diferente?

- **Sin intermediarios financieros tradicionales.** Los fondos se mueven directamente entre billeteras digitales. La plataforma solo orquesta y verifica.
- **Trazabilidad completa.** Cada acción (solicitar, aprobar, desembolsar, pagar, avalar) queda registrada con quién, cuándo y por qué. No se puede modificar ni borrar.
- **Verificación automática de pagos.** Cuando un prestatario dice que pagó, la plataforma lo verifica contra la blockchain en segundos. Sin conciliación manual.
- **Sistema de reputación.** Cada usuario acumula un puntaje basado en su comportamiento. Si es bajo, no puede recibir nuevos desembolsos.

---

## 3. ¿Quiénes Participan?

```
         ┌──────────────────────────────────────────────────┐
         │           ADMINISTRADOR                           │
         │  Aprueba créditos, desembolsa fondos,             │
         │  ve KPIs y auditoría de toda la plataforma        │
         └──────────────────────┬───────────────────────────┘
                                │
    ┌───────────────────────────┼───────────────────────────┐
    │                           │                           │
    ▼                           ▼                           ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   PRESTATARIO    │  │   AVAL (GARANTE) │  │   PRESTAMISTA    │
│                  │  │                  │  │                  │
│  Solicita        │  │  Respalda        │  │  Aprueba         │
│  créditos        │  │  créditos de     │  │  créditos        │
│  Recibe fondos   │  │  terceros        │  │  Gestiona avales │
│  Paga            │  │                  │  │  Desembolsa      │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 4. El Ciclo de Vida de un Crédito

```
  ┌──────────┐
  │ SOLICITUD │  El prestatario pide un crédito (monto + plazo)
  └─────┬────┘
        │
        ▼
  ┌──────────┐
  │ PENDIENTE │  Esperando aval o aprobación directa
  └─────┬────┘
        │
  ┌──────────┐
  │ AVALADO   │  Un garante respaldó el crédito (opcional)
  └─────┬────┘
        │
  ┌──────────┐
  │ APROBADO  │  El administrador aprueba y fija condiciones
  └─────┬────┘
        │
  ┌──────────────┐
  │ DESEMBOLSADO  │  Los fondos se transfieren al prestatario
  └─────┬────────┘
        │
  ┌──────────┐        ┌─────────┐
  │ PAGADO   │  ó     │ DEFAULT │  (futuro)
  └──────────┘        └─────────┘
```

### Paso a paso:

1. **Solicitud** — El prestatario ingresa monto y plazo. El crédito nace como "pendiente".

2. **Aval (opcional)** — Otros usuarios pueden respaldar el crédito como garantes. Si alguien avala, el crédito pasa a "avalado". Es una señal de confianza hacia el administrador.

3. **Aprobación** — El administrador revisa el crédito y lo aprueba. Se fija la fecha de vencimiento.

4. **Desembolso** — El administrador ejecuta la transferencia de fondos. La plataforma envía los cUSD desde la billetera institucional a la billetera del prestatario. **Condición**: el prestatario debe tener un score de reputación mayor a 80.

5. **Pago** — El prestatario devuelve los cUSD desde su billetera a la billetera de la plataforma. Luego registra el comprobante de pago en la plataforma, y el sistema **verifica automáticamente en la blockchain** que el pago sea legítimo.

6. **Cierre** — Una vez verificado, el crédito se marca como "pagado".

---

## 5. ¿Cómo se Registran los Pagos? (El Diferenciador Clave)

Este es el punto más importante del modelo.

Cuando un prestatario paga:
1. **Transfiere los fondos directamente** desde su billetera a la billetera de la plataforma (él mismo ejecuta la transacción en la blockchain).
2. **Vuelve a la plataforma** y pega el identificador único de esa transacción.
3. **El sistema consulta la blockchain automáticamente** y verifica:
   - Que la transacción existe ✅
   - Que fue exitosa ✅
   - Que el monto es correcto ✅
   - Que el destinatario es la plataforma ✅

**Sin intervención humana. Sin riesgo de error. Sin posibilidad de fraude.**

---

## 6. Panel de Administración

El administrador tiene visibilidad completa del estado de la plataforma a través de indicadores clave:

| Indicador | Qué mide |
|-----------|----------|
| **Total de participantes** | Cuántos usuarios activos tiene la plataforma |
| **Total desembolsado** | Suma de todos los créditos otorgados |
| **En circulación** | Créditos activos aún no pagados |
| **Tasa de default** | Porcentaje de créditos en mora |
| **Score de reputación promedio** | Salud general de la cartera |

Además, tiene acceso a un **registro de auditoría** completo donde puede ver cada acción realizada en la plataforma: quién la hizo, cuándo, sobre qué crédito, y qué datos estaban involucrados.

---

## 7. ¿Qué se Necesita para Operar?

| Componente | Estado |
|------------|--------|
| Plataforma web | ✅ Lista (desplegable en Vercel) |
| Base de datos | ✅ Lista (Supabase PostgreSQL) |
| Autenticación | ✅ Email/password + billetera Celo |
| Conexión blockchain | ✅ Lista (Celo Alfajores testnet) |
| Wallet institucional | ✅ Lista (fondos de testnet) |
| CI/CD (despliegue automático) | ✅ Listo (GitHub Actions) |

**Para pasar a una red real (mainnet)** solo se necesita:
- Una billetera institucional con fondos reales de cUSD
- Actualizar las variables de entorno con los contratos de mainnet

---

## 8. Próximos Pasos Recomendados

1. **Validación con usuarios reales** — Probar el flujo completo en testnet con un grupo reducido.
2. **Gestión de mora (default)** — El estado "default" ya está modelado pero no tiene lógica de ejecución. Implementar notificaciones automáticas y proceso de cobranza.
3. **Dashboard ampliado** — Agregar más pantallas administrativas: gestión de participantes, gestión de créditos individuales.
4. **Documentación para usuarios** — Guías simples para prestatarios y avales sobre cómo usar la plataforma.
5. **Evaluación de paso a mainnet** — Una vez validado el modelo, migrar a Celo mainnet con fondos reales.

---

## 9. Resumen en 3 Líneas

> Una plataforma digital que permite pedir, aprobar y pagar micro-créditos de forma transparente, automatizada y verificable. Cada transacción financiera queda registrada en la blockchain de Celo, eliminando la necesidad de conciliación manual y reduciendo drásticamente los costos operativos. El sistema incluye roles bien definidos (prestatario, aval, prestamista, admin), un sistema de reputación, y un panel de control con indicadores en tiempo real.
