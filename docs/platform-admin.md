# Administración global aislada

La cuenta global ya no puede iniciar sesión en el frontend de clientes. `apps/admin`
es una aplicación Next.js independiente y debe desplegarse con otro subdominio,
cookies y variables.

## Puesta en marcha

1. Aplicar `prisma/migrations/20260723_platform_admin_isolation`.
2. Crear el usuario en Supabase Auth con email y contraseña.
3. Registrar su UUID: `npm run admin:register -- <auth-user-uuid> "Nombre"`.
4. Configurar las variables de `apps/admin/.env.example` en el proyecto admin y
   `SUPPORT_SESSION_SECRET`/`SUPPORT_EXCHANGE_PEPPER` en el proyecto cliente.
5. Usar el mismo `SUPPORT_EXCHANGE_PEPPER` en ambas apps, pero no compartir
   cookies ni `AUTH_SECRET`.
6. Desplegar `apps/admin` como proyecto separado y asociarle el subdominio admin.

El inicio de sesion ocurre exclusivamente en endpoints del servidor; la clave de
servicio nunca se entrega al navegador. El servidor solo acepta tokens verificados
por Supabase asociados a un `PlatformAdminProfile` activo.

## Acceso de soporte

El panel genera un código aleatorio de un solo uso que vence a los 60 segundos.
El navegador lo envía por POST al frontend cliente. Ese frontend lo consume de
forma atómica y crea una cookie propia de 8 horas, limitada a un solo cliente.
La creación, intercambio, finalización y revocación quedan auditados.

## Backoffice de la suite

El inicio de `apps/admin` muestra totales reales (consultas `count`, independientes
de los límites de las listas), filtros por cliente/estado/nombre y un resumen de
oportunidades, artículos, contactos, tendencias, guiones y presencia en IAs.
Las fechas y el corte de actividad diaria usan la hora de Argentina.

El detalle técnico muestra búsquedas que no pudieron completarse, generación de respuestas,
publicaciones y las últimas actualizaciones del catálogo y análisis del negocio.
Estos estados quedan dentro de Administración y detalles; no etiquetan a un cliente
como pendiente de revisión. La pantalla general muestra resultados registrados.
El estado técnico refleja registros persistidos; no comprueba en vivo los procesos
de Windows, navegadores ni servicios externos.

El botón Abrir cliente ingresa al inicio mediante el intercambio de soporte.
Abrir calendario mantiene su destino directo. La ruta se guarda en los metadatos
de la sesión y se valida en ambas apps; el slug
siempre se obtiene del cliente asociado al código. No se aceptan URLs externas.
Los códigos no usados se muestran como pendientes de ingreso, no como activos.

`/reportes` lista problemas abiertos/resueltos con paginación. Resolver o reabrir
un reporte requiere administrador global y registra el cambio en la misma
transacción que la auditoría. Los reportes son globales: el modelo actual no
guarda `clientId`, por lo que no se les atribuye un cliente.

`apps/admin/prisma/schema.prisma` es una **proyección parcial** del esquema raíz.
Solo se usa para generar el cliente Prisma del admin. Nunca ejecutar migraciones
ni `db push` desde esa aplicación; las migraciones se mantienen en la raíz.
No se necesita una migración nueva para esta actualización del backoffice.

Validación local:

```bash
npm --prefix apps/admin run test
npm run admin:build
npm run admin:dev
```

El admin abre en `http://localhost:3010`. Al desplegar, actualizar también la app
cliente para que el intercambio de soporte respete el módulo elegido.

## Resumen para dirección

La pantalla principal usa lenguaje simple y muestra cuatro totales globales:
clientes activos, oportunidades encontradas hoy (día de Argentina), oportunidades
encontradas en total y artículos registrados. Cada cliente muestra oportunidades
encontradas en total y hoy, artículos registrados y contactos registrados.
Estos totales incluyen todos los estados; no clasifican los resultados como tareas
pendientes ni muestran avisos de revisión. La revisión y aprobación pertenecen al
panel de cada cliente. Los contactos no se presentan como ventas confirmadas.

Los datos se consultan al abrir la pantalla. `Actualizar datos` vuelve a consultar
el servidor conservando los filtros. Los totales superiores siempre incluyen a
todos los clientes; las tarjetas y tareas respetan los filtros elegidos.

El estado de procesos, usuarios, accesos de soporte e historial de cambios queda
en `Administración y detalles`, cerrado al entrar. Las acciones del historial se
traducen a frases como `Ingresó al panel de un cliente` o `Marcó un problema como
resuelto`. Este historial registra cambios administrativos, no resultados comerciales.
La suspensión de un cliente queda dentro de su configuración desplegable.
Los objetivos diarios no se muestran en el backoffice; su configuración operativa
se mantiene en cada cliente. El contador de errores de búsqueda incluye únicamente
fuentes activas con `lastError` guardado. Una lectura correcta sin candidatos o
sin resultados no se considera un error solo por tener `blockedReason`.
