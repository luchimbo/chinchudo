# Verificación de Blog y Asistente CM — 4 de noviembre de 2026

Los cambios están implementados y probados en el repositorio local. La migración
aditiva y el backfill están aplicados en la base conectada. No se ha verificado
un despliegue público de esta versión; los tiempos siguientes corresponden a
servidores Next.js de producción ejecutados localmente contra Supabase.

## Comprobaciones funcionales

- 117 archivos y **1.051 pruebas unitarias aprobadas**.
- Lint sin advertencias; TypeScript y `prisma validate` correctos.
- Compilación de producción de Next.js 14 correcta. El comando completo
  `npm run build` encontró un DLL de Prisma bloqueado por otro proceso de Windows;
  se verificó el esquema y se compiló con el cliente ya generado. La generación
  debe ejecutarse normalmente en el entorno de despliegue.
- **26 controles de navegador aprobados**, sin errores de ejecución: paginación,
  carga diferida, editor utilizable, estados de tarea, pausa en segundo plano,
  vistas móviles y rechazo de sesiones revocadas/otros clientes.
- **10 comprobaciones reales de admisión**, en una transacción revertida:
  autoridad vigente, idempotencia, exclusión y detección de cambios de entrada
  y contexto durante la espera.
- **157 artículos** verificados: ningún desacuerdo entre JSON y columnas ni
  originales pertenecientes a otros clientes. El plan de ejecución utilizó
  `Landing_clientId_translationOfId_idx`. Se comprobaron los triggers de
  escritores SQL, RLS y la restricción de una tarea activa por oportunidad.
- Publicación de YouTube verificada con simulaciones y `dry-run`. Las pruebas
  de esta entrega no publicaron comentarios reales ni invocaron modelos externos.

## Cola manual

30 solicitudes nuevas después de un calentamiento, en el worker y la aplicación
actualizados: mediana **923 ms**, p95 **1.440 ms**. Se rechazaron token revocado y
cliente ajeno; no se crearon borradores durante esta medición. El objetivo de
aceptación inferior a un segundo **todavía no se cumple en p95**.

Una tarea sintética con cola vacía comenzó en **4.387 ms** y terminó en `CONFLICT`,
sin borradores. Cumple el objetivo de inicio inferior a cinco segundos en esa
comprobación; una sola muestra no certifica un percentil de inicio.

## Comparación de pantallas

La comparación alterna peticiones antes/después, de una en una, con el mismo
cliente y datos. Mide documento HTTP completo, TTFB y tamaño sin comprimir; no
equivale al tiempo hasta que todos los controles del navegador están disponibles.
Se descarta un calentamiento por lado. Los recorridos de navegador anteriores
verifican por separado la disponibilidad de los controles.

Los resultados finales se incorporan al terminar la medición. Las muestras de
otros clientes con menos de 30 observaciones se identifican como preliminares.
Los datos crudos quedan en `reports/module-performance-comparison.json`.

## Operación y reversión

Consultar [instrucciones de activación, worker y reversión](module-performance.md).
La activación de la aplicación pública y su comprobación posterior siguen siendo
necesarias antes de considerar terminada la entrega en producción. Conservar las
columnas, las respuestas y las tablas al desactivar los flags.

## Resultados finales de la comparación (4 de noviembre de 2026)

PC MIDI, 30 muestras alternadas por lado, con la consulta compartida de usuario/cliente/onboarding. Mide HTML completo (p95), no el tiempo hasta controles disponibles.

| Pantalla | p95 antes | p95 después | Mejora | Respuesta inicial |
|---|---|---|---|---|
| Comentador | 10,1 s | 4,6 s | 54 % | 690 KB → 168 KB |
| Calendario | 13,9 s | 7,0 s | 50 % | 217 KB → 133 KB |
| Artículos | 5,1 s | 2,6 s | 50 % | 104 KB → 105 KB |

Otros clientes (5 muestras, preliminares): Comentador, Calendario y Artículos mejoran en jurispedia, kressmer y prestige-running, salvo Calendario de jurispedia (4,7 → 4,3 s, sin mejora relevante). Datos crudos en `reports/module-performance-comparison.json`.
Pendiente: p95 de admisión de cola (1,44 s vs objetivo 1 s) y verificación en producción.

## Admisión de la cola: dónde está el tiempo (4 de noviembre de 2026)

Medido desde esta PC contra la base de Supabase: un `SELECT 1` vacío tarda **~870 ms**; la consulta de admisión completa (autoridad, validación, huella de contexto e inserción) agrega solo ~100 ms. La admisión ya es **un único viaje a la base**, así que la mediana de 923 ms es casi todo latencia de red local-hacia-base y no código.

Consecuencia: no hay más optimización de código que mueva el p95 de 1,44 s hacia menos de 1 s en esta máquina. El objetivo de menos de un segundo solo puede comprobarse con la app desplegada en la misma región que la base. Queda como verificación pendiente en producción, no como defecto de código. La misma latencia de ~870 ms por consulta explica que las pantallas dependan sobre todo del número de viajes a la base.
