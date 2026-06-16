// Sliding window rate limiter en memoria.
// Suficiente para un sistema de un solo operador — sin infra extra.

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  // Descartar timestamps fuera de la ventana
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const resetInMs = windowMs - (now - oldest);
    store.set(key, entry);
    return { allowed: false, remaining: 0, resetInMs };
  }

  entry.timestamps.push(now);
  store.set(key, entry);
  return { allowed: true, remaining: maxRequests - entry.timestamps.length, resetInMs: 0 };
}

// Limpiar entradas viejas cada 10 minutos para no acumular memoria
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.timestamps.every((t) => now - t > 60 * 60 * 1000)) {
      store.delete(key);
    }
  }
}, 10 * 60 * 1000);
