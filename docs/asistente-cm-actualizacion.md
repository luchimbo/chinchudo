# Respuestas vigentes en el Asistente CM

El mantenimiento genera propuestas para las oportunidades activas de YouTube sin respuesta y actualiza las que quedaron viejas. Recorre toda la bandeja, independientemente del límite de 60 tarjetas del panel. Incluye NEW, NEEDS_REVIEW, DRAFTED y APPROVED; excluye oportunidades cerradas, descartadas, archivadas, de clientes inactivos y con una publicación registrada.

## Regla de vigencia

Cada respuesta generada guarda en `Response.evidence` una entrada `cm_generation` con versión, huella de la oportunidad, fecha y origen (IA o plantilla local). Este JSON vive en Postgres, no en un archivo de staging. Las respuestas anteriores al versionado se consideran pendientes de actualización.

La versión depende del prompt activo, reglas del generador, política del cliente, marcas, catálogo, personas, conocimiento, objeciones, aprendizaje y ejemplos aceptados. Cada cliente tiene su propia versión. Un cambio de precio/stock, una edición del prompt activo o una corrección aprendida invalidan los borradores del cliente; cambios visuales y fechas de sincronización sin cambios de contenido no los invalidan. El catálogo se versiona por cliente, de forma conservadora: un cambio de producto puede actualizar también otras propuestas de ese cliente.

Los archivos relevantes del generador se enumeran en `scripts/cm-rules-version.mjs`. En desarrollo se lee su contenido y en una app compilada se usa el manifiesto generado antes del build. Si se incorpora una nueva dependencia al generador, agregarla a esa lista. Generar el manifiesto también antes de un build que omita los scripts de npm.

Se vuelve a comprobar la versión al terminar la llamada a IA. Si cambió durante la generación, el resultado se descarta y la oportunidad sigue pendiente. Antes de guardar se comprueban también el estado y las respuestas actuales, para conservar modificaciones concurrentes del operador.

## Control humano e historial

El mantenimiento conserva todas las respuestas anteriores en Postgres. Un borrador sin intervención humana puede ser reemplazado como respuesta principal. Si tiene edición, aprobación, aceptación o chat, conserva su lugar y se agrega una propuesta actualizada para revisar debajo. Las respuestas publicadas nunca se regeneran. Este proceso no aprueba ni publica comentarios.

El panel muestra Sin respuesta, Por actualizar, Actualizadas, Para revisar y Con error. La cobertura cuenta las oportunidades que tienen una propuesta vigente, incluyendo las propuestas aún pendientes de revisión humana. El botón Actualizar estado refresca los indicadores; no recarga la pantalla automáticamente mientras el operador escribe.

## Operación

```powershell
npm run agents:cm-maintenance -- --dry-run
npm run agents:cm-maintenance -- --client pcmidi --limit 10
npm run agents:cm-maintenance:install
```

La tarea de Windows `Los5Apostoles-AsistenteCM` se ejecuta cada 15 minutos mientras la cuenta que la instaló está conectada y la PC está encendida. Evita ejecuciones superpuestas y usa bloqueos con vencimiento en Postgres para coordinarse con otros procesos. La app alojada no depende de visitar el panel para que avance la cola, pero sí de que el proceso local esté funcionando. Para operación permanente instalar el mismo comando en un servidor encendido; no activar dos instalaciones sin revisar sus límites.

Límites por cliente (configurables en `.env`):

```env
CM_DRAFT_BATCH_LIMIT=10
CM_DRAFT_DAILY_LIMIT=200
```

El límite diario cuenta intentos de mantenimiento, incluidos fallos; no incluye generaciones manuales ni la cuota diaria de otro proceso. Limita volumen, no un importe monetario exacto. El día cambia a medianoche argentina. Las oportunidades urgentes tienen prioridad; se alternan faltantes y desactualizadas, reservando un lugar para la más antigua cuando hay cola. Errores tienen espera progresiva de 15/30/45 minutos y hasta tres intentos por versión, oportunidad y día. Al cambiar las reglas se habilita una nueva serie de reintentos; al día siguiente vuelve a intentarse sin intervención.

Si la IA falla, no se reemplaza una respuesta por una plantilla. Jurispedia conserva su generador local auditado y las restricciones de seguridad existentes. Se guardan reportes auditables en `reports/*-cm-maintenance.json` y estado de errores/presupuesto en `AppSetting`.

Para pausar:

```powershell
Disable-ScheduledTask -TaskName Los5Apostoles-AsistenteCM
```

Para reactivar:

```powershell
Enable-ScheduledTask -TaskName Los5Apostoles-AsistenteCM
```
