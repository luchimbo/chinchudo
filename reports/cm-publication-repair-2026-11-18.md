# Reparación de propuestas CM — 18 de noviembre de 2026

## Estado final para commit y despliegue

Se conserva el commit `e4bc345`: la decisión explícita del operador permite publicar el texto revisado aunque la versión de generación sea anterior. Actualizar la propuesta es opcional. Esto reemplaza el bloqueo por vigencia descripto en el diagnóstico histórico de abajo. Se mantienen autorización del cliente, límites de publicación y protección contra envíos duplicados o ambiguos.

La verificación final incluye 83 pruebas aprobadas, lint y TypeScript. El comando de build de Vercel pasa a `npm run build` para ejecutar también el versionado de reglas de `prebuild` en cada despliegue.

## Evidencia

- Oportunidad de la captura: `cmr2gc4fi0002x8yjjwunft59` (PC MIDI).
- Propuesta seleccionada originalmente: `cmvffuag60021s6033c8mk5x9`, generada el 19 de octubre; su huella de entrada coincidía, su versión de reglas ya no.
- La carga compacta omitía verificar propuestas y mostraba “lista” con vigencia desconocida. El control del servidor rechazaba el envío correctamente, pero el mensaje ocultaba la causa.
- La regeneración real falló por un falso positivo de contaminación: `kressmer:piano`. “Piano” y Kressmer también forman parte del dominio y catálogo de PC MIDI.
- Una segunda ejecución alcanzó la persistencia, pero la transacción expiró alrededor de los cinco segundos predeterminados (P2028).

## Cambios

- Verificar al cargar el detalle de las tarjetas compactas y bloquear la publicación de una propuesta sin vigencia comprobada; explicar cómo actualizarla.
- Una regeneración manual abre la nueva propuesta como principal, conservando la anterior, sus ediciones, aprobación e historial. El mantenimiento automático sigue preservando la selección humana.
- Diferenciar propuesta desactualizada de consulta temporalmente no disponible; registrar causa, IDs y mensaje del error en datos serializables.
- Excluir del detector de mezcla los términos que también pertenecen al dominio del cliente actual. Mantener detección de marcas y temas ajenos.
- Transacción serializable con `maxWait: 10_000` y `timeout: 30_000`; reintentos acotados de P2028/P2034 en trabajos de borradores, sin publicación externa.

## Verificación

- 82 pruebas aprobadas en nueve archivos de Vitest, incluyendo regresiones de selección, dominio compartido, guardia de publicación y reintentos.
- `npm run lint`: sin advertencias ni errores.
- `npx tsc --noEmit`: correcto.
- Build de producción Next.js correcto.
- Despliegue final listo: `dpl_CstjBPe5n5tRrRvYwjAHbbFEL7Vj`, alias https://cafishia.vercel.app.
- Worker local reiniciado con los cambios.
- Trabajo real `cmwmhionv0001hyy37wr5lfiy`: `SUCCEEDED`.
- Nueva propuesta principal: `cmwmhjd34000abwnt5m89yq0x`. `cmIsFresh` devuelve true y `assertCurrentCMResponse` pasa usando la base real. Estado de oportunidad: `DRAFTED`; historial conservado; no se publicó ningún comentario.
- Comprobación visual del despliegue: propuestas sin vigencia aparecen pendientes y con publicación deshabilitada. La comprobación visual final de PC MIDI quedó limitada por el cambio de sesión del navegador a Kressmer (403 de pertenencia confirmado en logs); no se alteraron permisos ni membresías.

El despliegue se preparó desde HEAD en un worktree separado y sólo incorporó archivos de esta corrección; se conservaron los cambios locales ajenos.
