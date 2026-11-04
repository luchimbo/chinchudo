# Recuperación de generación ante fallos del proveedor

El 4 de noviembre, OpenRouter rechazó solicitudes con HTTP 402 por crédito
insuficiente. El generador seguía intentando distintos temas con la misma
condición del proveedor. El artículo del 8 de noviembre volvió a `READY` al
recuperarse una solicitud; no se reemplazó ese contenido válido por una plantilla.

## Corrección

- Cada corrida conserva el rechazo del proveedor y evita repetir solicitudes
  fallidas con otros temas. La siguiente corrida vuelve a probar normalmente:
  no se modifica el modelo configurado ni se desactiva permanentemente la IA.
- Los errores HTTP se registran por código; el cuerpo que puede contener datos
  de la cuenta del proveedor no se copia al mensaje de error.
- Para guías en español con catálogo disponible, una falla del proveedor o una
  salida JSON inválida utiliza un respaldo con nombres, referencias y criterios
  del catálogo. Pasa la misma revisión, validación estructural y renderizado.
  Se registra `generation_method=verified_catalog_fallback` y el motivo.
- El respaldo no inventa datos del rival ni comparativas. Los temas comparativos
  no verificables se descartan en favor de otra guía de decisión. Tampoco produce
  traducciones falsas: otros idiomas conservan los reintentos del proveedor.
- Un nuevo intento elimina `finishedAt` del intento anterior y conserva una
  identidad y un plazo nuevos.

## Verificación y despliegue

- 80 pruebas Python y 1.070 pruebas Node aprobadas; lint y TypeScript correctos.
- Simulación HTTP 402 con el catálogo real: un borrador válido en 19,5 segundos,
  sin guardado en Postgres ni publicación. La verificación usó una función de
  proveedor simulada; no consumió crédito.
- Código instalado en el trabajador remoto y en la copia de despliegue local.
  Los nuevos procesos Python cargan el cambio al empezar; no se interrumpen
  generaciones en curso. Hay copia anterior en
  `reports/backup-provider-recovery-20261104` de cada entorno.

El respaldo depende de contar con información suficiente en el catálogo. Una
caída de Postgres o la falta de datos verificables conserva el trabajo y sus
reintentos; no se presenta un artículo vacío como generado ni una publicación
sin confirmación como exitosa.
