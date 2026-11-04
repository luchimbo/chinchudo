# Recuperación de publicaciones — 4 de noviembre de 2026

Los artículos del 4 y 5 de noviembre quedaron detenidos con tres intentos
agotados. El primero conservaba identificadores temporales de productos; el
segundo no tenía cierre de marca. La configuración antigua de PC MIDI no tenía
`blog.calendar`: el relay tenía el calendario apagado y el trabajador compartido
omitía este cliente. Además, una sincronización del catálogo pendiente desde
octubre detenía indefinidamente las solicitudes al relay.

## Cambios

- El trabajador admite la configuración anterior de PC MIDI; los demás clientes
  siguen necesitando habilitación explícita. Se respeta el modo secundario.
- La recuperación vuelve a vincular productos solo por coincidencia exacta y
  única del nombre. Un enlace sin destino verificable pasa a texto sin inventar
  una URL o un modelo. Se completa un cierre faltante con referencias existentes.
- Si la revisión sigue rechazando el artículo, se conserva el borrador anterior
  archivado y se libera su slug para una nueva generación. Quedan registrados el
  ID anterior, el motivo y la siguiente oportunidad de reintento. Los contenidos
  que esperan aprobación humana no se aprueban mediante esta recuperación.
- Una sincronización abandonada no congela el Blog: la prioridad de catálogo
  caduca a los 15 minutos. Las mutaciones y publicaciones siguen protegidas por
  el lease compartido.
- Al actualizar el código, el trabajador termina el ciclo actual y deja de
  admitir ciclos nuevos hasta reiniciarse.

Los cambios se instalaron en el trabajador compartido por SSH y en la copia de
despliegue del relay. Se normalizó `blog.calendar=true` y se activó
`catchUpMissed=true` para PC MIDI: los errores temporales pueden retomarse en días
posteriores; las fechas omitidas previamente no se reactivan por esta opción.

## Resultado verificado

- 4 de noviembre: **PUBLISHED**. La URL pública devolvió HTTP 200 y la marca de
  revisión coincidió con la guardada en Postgres:
  <https://blog.pcmidicenter.com/guias/instrumentos-para-practicar/guia-completa-instrumentos-para-practicar/>.
- 5 de noviembre: **READY**, sin error y con cero intentos pendientes.
- Los dos candidatos pasaron la validación nativa de Python. Se guardó el
  contenido anterior en los reportes de reparación.
- 1.070 pruebas unitarias aprobadas; lint, TypeScript y sintaxis de los procesos
  Node correctos.

La herramienta `scripts/repair-blog-drafts.mts --client pcmidi --from 2026-11-04
--to 2026-11-05` verifica sin guardar. `--apply` aplica con control de versiones
esperadas y transacción: una edición concurrente impide sobrescribir el artículo.
Los reportes se guardan en `reports/blog-auto-repair-*.json`.

Una caída de la base, del proveedor o del servicio de despliegue puede demorar la
salida. La recuperación conserva los registros y vuelve a intentarlo con espera
creciente; no simula una publicación exitosa.
