# Catálogo del blog y Tiendanube

PC MIDI utiliza una lectura pública de `Client.storeUrl`. No requiere token de Tiendanube. El catálogo comercial de respuestas sociales no se modifica.

## Operación

En **Blog → Configuración → Catálogo de Tiendanube** se puede activar el recorrido diario, sincronizar ahora, reintentar y resolver vinculaciones ambiguas. El relay local debe estar encendido. La primera pasada comienza al activar; las siguientes, a las 06:00 de Buenos Aires o al volver a encender el equipo después de esa hora.

```powershell
npm.cmd run blog:sync-catalog -- --client pcmidi --dry-run
npm.cmd run blog:sync-catalog -- --client pcmidi
```

En versiones de PowerShell/npm que consuman los argumentos, usar:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/sync-blog-catalog.mts --client pcmidi --dry-run
```

La simulación solamente lee la tienda y la base y genera un reporte. No modifica catálogo, trabajos ni configuración y no publica.

## Datos y recuperación

`LandingProduct` y `LandingCategory` conservan sus referencias originales. El ID numérico de Tiendanube identifica la ficha aunque cambie su URL. Los snapshots guardan datos públicos fechados; los precios y la disponibilidad no se insertan automáticamente en los artículos. Los campos curados tienen prioridad y las fuentes externas mantienen su atribución.

`CatalogSyncRun` conserva el checkpoint, cambios, errores y verificación del despliegue. Los reportes JSON están en `reports/catalog-sync-*.json`. Una interrupción retoma las páginas pendientes. Una pasada incompleta no confirma bajas. Para retirar un enlace se necesitan dos pasadas completas en días distintos, ausencia del mismo ID y 404/410 de la ficha anterior. La reaparición restaura el enlace.

Los cambios se reconstruyen como un único sitio, sin aprobar `pending_revision` ni publicar borradores. La reserva `blog_execution_lock:<clientId>` evita cruces con generación y publicación. No se usan locks de sesión incompatibles con el pooler. La reserva expira a los 90 segundos y se renueva cada 20 segundos; al perderla se cancelan los procesos hijos.

Un despliegue no se considera exitoso hasta comprobar la versión y los enlaces de las páginas modificadas. Después de tres intentos automáticos queda pendiente de revisión; **Reintentar actualización** habilita otra serie. Una repetición sin cambios de HTML no despliega nuevamente.

## Instalación

1. Ejecutar las pruebas y la simulación real.
2. Aplicar `prisma migrate deploy` y generar el cliente Prisma. La migración es aditiva y la nueva tabla tiene RLS sin acceso directo de roles públicos.
3. Reiniciar el relay para cargar el trabajador nuevo. Verificar `Client.storeUrl` y `Client.blogBaseUrl`.
4. Ejecutar la primera sincronización, comprobar el reporte y activar el ciclo diario.

Las fichas privadas no se pueden descubrir mediante lectura pública. Los bloqueos, timeouts o cambios de estructura generan alertas y conservan los enlaces hasta que haya evidencia suficiente.
