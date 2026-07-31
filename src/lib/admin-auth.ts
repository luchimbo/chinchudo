// Stub para compartir exports con apps/admin mientras no esté activa.
export const ADMIN_COOKIE = "admin_access_token";

export function verifyPlatformToken(_token: string): Promise<{ id: string; email: string } | null> {
  return Promise.resolve(null);
}
