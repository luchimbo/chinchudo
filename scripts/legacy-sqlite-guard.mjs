export function requireSqliteSandbox(component) {
  const production = process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
  if (production) {
    throw new Error(`${component}: SQLite heredado está bloqueado en producción; usá Supabase/Postgres.`);
  }
  if (!/^(1|true|yes)$/i.test(process.env.ALLOW_SQLITE_SANDBOX || "")) {
    throw new Error(`${component}: SQLite heredado requiere ALLOW_SQLITE_SANDBOX=1 en desarrollo.`);
  }
}
