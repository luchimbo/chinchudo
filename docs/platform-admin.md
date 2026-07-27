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
forma atómica y crea una cookie propia de 30 minutos, limitada a un solo cliente.
La creación, intercambio, finalización y revocación quedan auditados.
