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

Las señales de atención incluyen configuración inicial incompleta, fuentes con
errores o bloqueos, borradores fallidos/con plazo vencido, publicaciones fallidas
y la última sincronización o análisis que requiere revisión. Un cliente anterior
al alta autoservicio no se considera incompleto solo por no tener onboarding.
El estado operativo refleja registros persistidos; no comprueba en vivo los
procesos de Windows, navegadores ni servicios externos.

El selector de módulos abre el destino mediante el intercambio de soporte. La
ruta se guarda en los metadatos de la sesión y se valida en ambas apps; el slug
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
