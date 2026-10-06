# Escucha social gratuita y autoalojada

Esta capa amplía la escucha existente sin publicar ni responder en redes. Las
oportunidades siguen pasando por los mismos filtros de relevancia, idioma,
antigüedad y deduplicación antes de entrar al tablero.

## Servicios locales

Con Docker Desktop iniciado:

```powershell
docker compose -f docker-compose.social-listening.yml up -d
npm run agents:listening-health
```

- **SearXNG** queda disponible en `http://localhost:8080`: descubre enlaces
  públicos indexados por buscadores para cada red.
- **RSSHub** queda disponible en `http://localhost:1200`: permite sumar feeds
  públicos concretos cuando una red tenga una ruta soportada.

No se requiere cuenta paga para ninguno de los dos servicios.

### Recuperación automática

Antes de cada escucha que use descubrimiento público, el agente verifica ambos
servicios. Si alguno no responde, ejecuta `docker compose ... up -d` solo para
el servicio afectado y espera hasta 20 segundos. El resultado queda en el
reporte de la corrida bajo `provider_recovery`; si Docker Desktop está apagado,
la escucha continúa con los conectores disponibles.

Un motor externo que responda con CAPTCHA o rate limit se informa como
`degraded`, no como SearXNG caído. Solo los timeouts reciben un reintento único;
se reintenta únicamente el motor que agotó el tiempo, conservando los resultados
de los demás. Los motores suspendidos y los bloqueos explícitos no se reintentan.
Las consultas al buscador se serializan entre procesos con un mínimo de 2
segundos entre solicitudes (`SEARXNG_REQUEST_INTERVAL_SEC`), también cuando la
cuota diaria utiliza varios workers. La espera de una cola ocupada se limita
a 35 segundos; un candado abandonado caduca al minuto.

En Windows, si el daemon está apagado, la recuperación intenta iniciar Docker
Desktop mediante su CLI y levantar los contenedores. El intento completo está
acotado a 40 segundos y deja `desktop_start` en el reporte. Esto evita depender
del inicio manual de Docker antes de las búsquedas programadas.

La instancia del radar usa Bing y Yandex, comprobados desde esta conexión, con
8 segundos de espera. La imagen instalada se actualizó el 6 de octubre a
`2026.10.4+d48c4b555`. Los demás motores predeterminados devolvían CAPTCHA, 429 o
errores en consultas `site:`. La búsqueda usa el dominio de cada red y valida
después que el enlace sea una publicación, video o comentario, no un perfil.

Para desactivarlo de forma explícita:

```env
LISTENING_AUTO_RECOVER=false
```

## Conectores opcionales por red

Instalar únicamente los que se vayan a usar:

```powershell
py -m pip install -r requirements-social-listening.txt
```

`instaloader`, `instagrapi`, `TikTokApi`, `praw` y `yt-dlp` se mantienen como
adaptadores opcionales. Las sesiones autorizadas y cualquier 2FA continúan
siendo manuales; ningún conector publica, comenta ni envía mensajes.

## Feeds RSSHub configurables

Las rutas públicas que RSSHub pueda servir se declaran en `.env`, sin
hardcodearlas. Por ejemplo:

```env
SEARXNG_URL=http://127.0.0.1:8080
RSSHUB_URL=http://127.0.0.1:1200
RSSHUB_FEED_YOUTUBE=/youtube/search/{query}
```

El placeholder `{query}` se codifica automáticamente. Si una ruta deja de
estar soportada, el reporte la marca como no disponible y la corrida continúa
con las otras fuentes.

## Operación

`npm run agents:daily-quota` ya invoca `social-listen.py`; al habilitar los
servicios, cada búsqueda usa CDP/perfiles autorizados y además las fuentes
públicas. Para diagnosticar proveedores sin crear oportunidades:

```powershell
npm run agents:listening-health
```

El estado se guarda en `data/listener-health.json` y cada corrida conserva los
proveedores, errores y resultados en su reporte dentro de `reports/`.

El monitor registra ahora el resultado de cada fuente en Postgres, incluso
cuando no encuentra oportunidades. Una respuesta correcta sin resultados no es
un error. Un error real se conserva hasta comprobar que la consulta funciona.

Para volver a comprobar las fuentes con errores sin importar oportunidades:

```powershell
node scripts/recheck-listening-errors.mjs --dry-run --limit 5
node scripts/recheck-listening-errors.mjs
```

Las comprobaciones se ejecutan una a una, con 3 segundos entre consultas.
El historial anterior y la evidencia quedan en `reports/*listener-error-recheck.json`
y `reports/*listener-recheck-evidence.jsonl`. Solo se actualiza el estado técnico;
no se cambian los contadores de oportunidades de la última corrida. Si otra
corrida o una edición cambió la fuente durante la comprobación, se omite la
actualización para no pisarla.

Validación del 6/10/2026: se volvieron a consultar las 185 fuentes activas que
tenían errores (PC MIDI 143, Prestige 34 y Jurispedia 8). Las 185 respondieron
correctamente; Postgres quedó con 0 errores de búsqueda activos. La comprobación
no importó oportunidades. Evidencia:
`reports/20261006201141178-listener-error-recheck.json`.
