# Jurispedia: piloto de captación orgánica

## Inicialización y calibración

```bash
npm run db:seed-jurispedia
npx tsx scripts/draft-worker.mts --client jurispedia --limit 20
```

El cliente queda inicialmente con auto-aprobación y auto-publicación desactivadas. Revisar los borradores en el dashboard antes de habilitar un canal.

```bash
npm run agents:jurispedia:publish -- --channel reddit --enable
npm run agents:jurispedia:publish -- --channel reddit --disable
```

El interruptor por canal no omite la política: urgencias, violencia, asuntos penales activos, menores y datos personales se descartan siempre.

## Evento de búsqueda iniciada

La app de Jurispedia debe enviar un evento al iniciar una búsqueda procedente de un enlace con UTM. No enviar consulta, PDF, IP, email ni otro dato personal.

```http
POST https://<host-los-5-apostoles>/api/events
Content-Type: application/json

{
  "event_type": "jurispedia_search_started",
  "client_slug": "jurispedia",
  "slug": "jurispedia_organic_pilot",
  "referrer": "https://www.jurispedia.com.ar/",
  "meta": {
    "utm_source": "reddit",
    "utm_medium": "organic_reply",
    "utm_campaign": "jurispedia_organic_pilot",
    "utm_content": "<opportunity-id>",
    "utm_term": "laboral"
  }
}
```

Los enlaces generados por el agente solo incluyen UTM. No se precompleta la consulta hasta que Jurispedia exponga y documente un contrato para esa capacidad.
