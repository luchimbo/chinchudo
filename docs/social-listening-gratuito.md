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
