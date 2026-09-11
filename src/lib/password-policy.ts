const MIN_LENGTH = 10;
const MAX_LENGTH = 128;

// Contraseñas más filtradas/adivinadas primero: bloquear estas cubre la
// mayoría de los intentos triviales sin necesitar una librería de scoring.
const COMMON_PASSWORDS = new Set([
  "password", "12345678", "123456789", "qwerty123", "111111111",
  "contraseña", "contrasena", "abc12345", "password1", "administrador",
  "pcmidi123", "pcmidicenter",
]);

export type PasswordPolicyResult = { valid: true } | { valid: false; error: string };

/**
 * Sólo se aplica al ESTABLECER una contraseña (registro, cambio, reset,
 * invitación) — nunca al verificar un login: los usuarios existentes con
 * contraseñas más cortas no quedan bloqueados.
 */
export function validatePassword(password: string, email?: string): PasswordPolicyResult {
  if (password.length < MIN_LENGTH) {
    return { valid: false, error: `La contraseña debe tener al menos ${MIN_LENGTH} caracteres.` };
  }
  if (password.length > MAX_LENGTH) {
    return { valid: false, error: `La contraseña no puede superar los ${MAX_LENGTH} caracteres.` };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, error: "Esa contraseña es demasiado común. Elegí otra." };
  }
  if (email && password.toLowerCase() === email.toLowerCase()) {
    return { valid: false, error: "La contraseña no puede ser igual al email." };
  }
  return { valid: true };
}
