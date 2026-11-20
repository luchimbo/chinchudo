# AGENTS.md

## Proyecto

**Los 5 Apostoles** es una plataforma interna de inteligencia comercial, social listening y asistencia de respuestas para PC MIDI Center.

El sistema ayuda a detectar oportunidades en redes, clasificar consultas, generar borradores con IA segun marca/persona y mantener un historial operativo para que el equipo responda con consistencia.

## Objetivo Principal

Crear un software maestro que permita a PC MIDI Center operar presencia organica en redes con:

- Monitoreo de oportunidades comerciales.
- Respuestas tecnicas y comerciales asistidas por IA.
- Historial por marca, producto, red y tipo de consulta.
- Control humano antes de publicar.
- Analitica de objeciones, marcas y conversiones.

## Estado Actual (Noviembre 2026)

En noviembre 2026 se hizo una limpieza grande. La suite hace cuatro cosas y nada más:

1. **Asistente CM** (`/asistente-cm`): una propuesta por comentario, chat de ajuste, aprendizaje y publicación.
2. **Encontrar oportunidades**: escucha **solo de YouTube** (monitor programado, cuota diaria y búsqueda manual).
3. **Buenas respuestas**: un único generador (`refreshCMOpportunity` en `src/lib/cm-maintenance.ts`).
4. **Blog** (`/blog`): calendario editorial, artículos, traducciones y publicación en Vercel.

Además se conservan el onboarding de clientes nuevos y la lógica de cada cliente.

- **Clientes activos**: `pcmidi`, `prestige-running`, `jurispedia`, `kressmer`, `programa-vidia`.
- **Base de datos**: Supabase Postgres (fuente de verdad). `prisma migrate deploy` funciona sobre la baseline `0_init`.
- **IA**: OpenRouter (key/modelo por cliente con fallback global) o el LLM local (qwen) en horario. Si la IA falla, no se inventa una plantilla: se conserva la propuesta anterior y se reintenta.
- **Se borró** (queda en git): Estudio de Reels, videos/avatares, tendencias, analítica, presencia en IAs (GEO), bitácora, leads/contactos y nurture por email, la vista clásica de 3 variantes, `draft-worker`, `publisher.py` y los agentes Python viejos (`agente_*`, `swarm.py`).

## Principios Del Proyecto

1. **Utilidad antes que volumen**
   Cada respuesta debe ayudar a resolver una duda real, no solo empujar una venta.

2. **Consistencia de marca**
   MidiPlus y Kressmer deben sonar diferentes, aunque pertenezcan al mismo ecosistema comercial.

3. **Control operativo**
   La IA propone. El operador decide, edita y publica.

4. **Trazabilidad**
   Toda interaccion relevante debe quedar registrada: red, link, marca, producto, perfil usado, respuesta y resultado.

5. **No repeticion**
   El sistema debe evitar frases clonadas, respuestas demasiado parecidas y tono artificial.

6. **Escalabilidad simple**
   Pocas piezas, un solo camino por tarea. Antes de agregar un módulo, confirmar que se va a usar.

## Roles Humanos

### Lucio - Arquitectura Y Desarrollo

Responsabilidades:

- Disenar la arquitectura tecnica.
- Crear el backend, base de datos y panel operativo.
- Integrar el proveedor de IA.
- Implementar el sistema de prompts, personas y marcas.
- Preparar scraping/monitoreo donde sea tecnicamente estable.
- Crear el sistema de logs, estados y metricas.
- Documentar instalacion, operacion y mantenimiento.

Prioridad de Lucio:

1. MVP funcional.
2. Base de datos robusta.
3. Prompts versionados.
4. Dashboard usable por Fede.
5. Automatizaciones graduales.

### Fede - Operacion Y Control Diario

Responsabilidades:

- Revisar oportunidades detectadas.
- Cargar manualmente links importantes cuando el sistema no los detecte.
- Aprobar, editar o descartar respuestas generadas.
- Marcar respuestas como publicadas.
- Registrar resultados comerciales.
- Detectar nuevas objeciones frecuentes.
- Reportar bugs, oportunidades y mejoras.

Prioridad de Fede:

1. Responder rapido.
2. Mantener tono humano.
3. No duplicar respuestas.
4. Detectar oportunidades de venta.
5. Alimentar la base de conocimiento.

## Marcas

### MidiPlus

Posicionamiento:

- Confiabilidad.
- Trayectoria.
- Soporte tecnico local.
- Buena relacion precio-calidad.
- Opcion segura para home studio, educacion musical y usuarios practicos.

Tono:

- Tecnico pero claro.
- Seguro.
- Directo.
- Enfocado en resolver dudas.

Mensajes clave:

- "Tiene soporte local."
- "Es una opcion muy rendidora por el precio."
- "Para home studio va muy bien."
- "Lo importante es comprar con garantia y asesoramiento."

### Kressmer

Posicionamiento:

- Novedad.
- Diseno premium.
- Exclusividad.
- Producto emergente con respaldo comercial local.
- Opcion fresca para usuarios que quieren algo diferente.

Tono:

- Moderno.
- Curioso.
- Mas aspiracional que MidiPlus.
- Sin exagerar claims no comprobados.

Mensajes clave:

- "Es una linea nueva que estan trayendo."
- "Tiene una estetica mas premium."
- "Esta buena para quien busca algo distinto."
- "Conviene preguntar bien por modelo, stock y garantia."

## Los 5 Perfiles Operativos (Quinteto)

Estos perfiles son arquetipos de voz para generar respuestas. Pueden usarse en publicaciones oficiales, embajadores reales, soporte o contenido interno. Los nombres deben coincidir exactamente con `prisma/seed.ts` y `src/lib/persona-router.ts`.

### 1. Técnico

Uso:

- Garantia, compatibilidad, drivers, repuestos y comparativas tecnicas.
- Problemas post-compra.
- Controladores MIDI, interfaces, pads.
- Flujo de trabajo y produccion en home studio (DAW).
- Recomendaciones para principiantes e intermedios.

Estilo:

- Preciso, practico y explicativo.
- Enfocado en uso real, sin vender de mas.

### 2. Práctico

Uso:

- Baterias electronicas.
- Ruido, vecinos, practica diaria y espacio reducido.
- Auriculares, sensacion de pads/parches de malla, rebote.

Estilo:

- Cercano, cotidiano.
- Orientado a problemas reales de convivencia y espacio.

### 3. Innovación

Uso:

- Novedades y lanzamientos de Kressmer.
- Primeras impresiones, comparacion de diseno, producto premium.
- Kressmer como opcion que "la rompe" frente a alternativas conocidas.

Estilo:

- Moderno, curioso, aspiracional.
- Sin exagerar claims no comprobados.

### 4. Educativo

Uso:

- Recomendaciones para alumnos e hijos.
- Durabilidad, simplicidad, compra segura y garantia oficial.
- Equipos para ensenar y practicar.

Estilo:

- Didactico, criterioso.
- Sello de confianza; evita tecnicismos innecesarios.

### 5. Comercial

Uso:

- Precio, cuotas y financiacion.
- Disponibilidad y stock en el local.
- Conveniencia y facilidad de compra.

Estilo:

- Directo, entusiasta y practico.
- Destaca conveniencia sin claims falsos.

## Stack Tecnico Recomendado

### Stack Actual (implementado)

- Node.js + TypeScript estricto.
- Next.js 14 (App Router) + Tailwind CSS.
- Prisma ORM 5 sobre Supabase Postgres.
- Vitest para unit tests; pytest para la capa Python.
- OpenRouter como proveedor LLM (key por cliente o global).
- NSTBrowser / Dolphin Anty + CDP para navegador real.

### Escalamiento

- Supabase Auth (hoy auth propia con JWT firmado y expiracion).
- Jobs programados (hoy: Task Scheduler de Windows).
- Cola de tareas con BullMQ o Supabase Queues.
- Almacenamiento de screenshots y evidencia.
- Reportes semanales.

## Arquitectura De Agentes Internos

Python maneja el navegador real (CDP). Node.js + Prisma persisten en Postgres. JSON/JSONL solo como buffer o reporte.

### Asistente CM

- **Escucha**: `agents/social-listen.py` (YouTube) → `data/social-listen-intake.jsonl` → `scripts/import-opportunities.mts`.
  - El importador deduplica por URL/comentario y clasifica con IA (`src/lib/ai-opportunity-classifier.ts`).
  - Si la IA falla, la fila vuelve al intake y se reintenta hasta 3 veces. Recién ahí entra con el fallback local como `NEEDS_REVIEW`.
  - Disparadores: `scripts/run-scheduled.ps1` (tarea `10Apostoles-Monitor`: `agents:daily-quota` + `agents:monitor`) y la búsqueda manual de `/oportunidades`, que va por el relay (`/api/opportunities/search/run`).
- **Generación**: un único camino, `refreshCMOpportunity` (`src/lib/cm-maintenance.ts`). Lo usan:
  - la cola manual del Asistente CM (`/api/cm/jobs` → `scripts/cm-manual-worker.mts`);
  - el mantenimiento cada 15 minutos (tarea `Los5Apostoles-AsistenteCM` → `scripts/cm-maintenance.mts`);
  - la cuota diaria de Kressmer.
- **Prompt**: `buildCopilotPrompt` en `src/lib/ai-draft-generator.ts` (Kressmer usa `buildKressmerReplyPrompt`). Validación en `src/lib/draft-output.ts`: sin preguntas salvo Prestige y Kressmer.
- **Frescura**: `src/lib/cm-version.ts`. Versión = manifiesto de reglas commiteado (`src/lib/cm-rules-version.json`, lo regenera `npm run dev`/`build`) + contenido del cliente. Memorias y ejemplos aprendidos no invalidan propuestas existentes.
- **Publicación**: solo `publishCopilotYouTubeResponse` (`src/app/(app)/opportunities/actions.ts`), por la API oficial de YouTube con la conexión OAuth del cliente (`YouTubeConnection`). Reclama la publicación antes de enviar para no publicar dos veces. Después descarta solo las oportunidades del mismo hilo o de la misma persona en ese video.

### Blog

- Motor: `scripts/blog-daily.mjs` (`createBlogDaily`) + `landing-build/build_landings.py`.
- **Corre en el servidor SSH `pcmidi`** (`~/services/pcmidi-suite`, `scripts/start-blog-runtime-ssh.sh` vía `@reboot`): `scripts/blog-runtime-service.mjs` maneja todos los calendarios, la cola de publicación, las vistas previas, la sincronización de catálogo y el análisis de negocio, y publica su túnel en `AppSetting blog_runtime_relay_url`.
- Desplegar el servidor: `bash scripts/server/deploy-blog-runtime.sh --apply` (desde una rama publicada; por defecto `main`). Estado: `npm run blog:status`.
- La app (`src/lib/relay-client.ts`, `src/lib/landing-html.ts`) habla con el blog solo por ese túnel.

### Relay local

`scripts/agent-relay.mjs` (tarea `PCMidi Relay`, puerto 3099) queda para la búsqueda de oportunidades, el estado de login de perfiles y el proxy al LLM local. No toca el blog.

### Reglas de agentes

- Todo comando debe registrar reporte con comando, fecha, canal, entradas leidas, oportunidades creadas, descartes y errores.
- Todo comando que escriba datos debe aceptar `--dry-run` cuando sea razonable.
- Las credenciales de cuentas deben vivir en `.env`, referenciadas desde `agents/accounts.json` por nombre de variable. Nunca hardcodear usuarios ni claves.
- Cada cuenta debe usar un perfil de navegador y puerto CDP propio para no mezclar sesiones.
- Si `browserProvider` es `nstbrowser` (default), `start-browser` llama a la Local API de NSTBrowser (`NSTBROWSER_API_BASE`, por defecto `http://localhost:8848/api/v2`) con header `x-api-key: NSTBROWSER_API_KEY`.
- Si `browserProvider` es `dolphin`, `start-browser` llama a la Local API de Dolphin (`DOLPHIN_API_BASE`, por defecto `http://localhost:3001/v1.0`); con `401`, configurar `DOLPHIN_API_TOKEN`.
- El login automatizado solo puede completar usuario y contraseña de cuentas propias/autorizadas. Si aparece 2FA, captcha o checkpoint, el agente debe frenar y dejar la ventana abierta para resolucion humana.
- La escucha no debe duplicar oportunidades con la misma URL.
- Los borradores no deben inventar stock, precio, garantia ni claims tecnicos.
- Ningún proceso automático publica: Fede aprueba y publica desde el Asistente CM.

## Modulos Del Sistema

### 1. Oportunidades

Registra cada potencial interaccion:

- Red social.
- URL.
- Autor visible.
- Texto original.
- Marca detectada.
- Producto detectado.
- Tipo de oportunidad.
- Prioridad.
- Estado.

Estados sugeridos:

- `new`
- `needs_review`
- `drafted`
- `approved`
- `published`
- `discarded`
- `follow_up`
- `converted`

### 2. Personas

Administra los 5 perfiles de voz:

- Nombre.
- Objetivo.
- Tono.
- Vocabulario permitido.
- Vocabulario a evitar.
- Longitud preferida.
- Ejemplos buenos.
- Ejemplos malos.

### 3. Marcas

Administra MidiPlus y Kressmer:

- Posicionamiento.
- Claims permitidos.
- Claims prohibidos.
- Productos asociados.
- Objeciones frecuentes.
- Respuestas base.

### 4. Base De Conocimiento

Debe contener:

- Productos.
- Fichas tecnicas.
- Garantia.
- Stock.
- Preguntas frecuentes.
- Comparativas.
- Objeciones.
- Casos de uso.

### 5. Generador IA

Entrada: comentario, cliente, marca, producto (detectado o elegido por el CM), persona, memorias aprendidas, ejemplos aprobados y correcciones del chat.

Salida: **una** propuesta breve (objetivo 280, máximo 400 caracteres) y notas internas de riesgo. El operador puede rehacerla o ajustarla por chat.

### 6. Asistente CM (panel de aprobación)

- Cola priorizada de oportunidades de YouTube.
- Generar o rehacer la propuesta (en segundo plano).
- Editar, ajustar por chat y marcar respuestas correctas como ejemplo.
- Publicar en YouTube con la cuenta conectada del cliente.
- Descartar.

## Flujo Operativo Diario

1. Fede abre el dashboard.
2. Revisa oportunidades nuevas.
3. Descarta basura, spam o temas irrelevantes.
4. Asigna marca/producto si el sistema no lo hizo.
5. Elige persona de respuesta.
6. Revisa la propuesta de la IA (o la rehace).
7. La edita o ajusta por chat.
8. Publica desde el Asistente CM.
9. Marca estado como `published`.
10. Si hay respuesta del usuario, marca `follow_up`.
11. Si deriva a WhatsApp o venta, marca `converted`.

## Reglas De Calidad De Respuesta

Cada respuesta debe:

- Sonar humana.
- Ser especifica al comentario original.
- Evitar promesas falsas.
- Evitar repetir exactamente el nombre de la marca demasiadas veces.
- Resolver una duda antes de vender.
- Incluir una pregunta final solo cuando ayude.
- Ser corta en TikTok/Instagram.
- Ser mas tecnica en YouTube o Facebook cuando el contexto lo permita.

Evitar:

- "Te recomiendo 100%..."
- "Es el mejor del mercado..."
- "No lo dudes..."
- Frases identicas en distintas redes.
- Links repetidos.
- Respuestas sin contexto.

## Comandos

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
python -m pytest agents/tests landing-build/tests
npx prisma migrate deploy
npm run agents:healthcheck
npm run agents:monitor -- --dry-run
npm run agents:daily-quota -- --dry-run
npm run agents:cm-maintenance -- --dry-run
npm run blog:status
bash scripts/server/deploy-blog-runtime.sh            # simulación
powershell -File scripts/run-cleanup.ps1               # simulación; -Apply borra
```

## Convenciones De Desarrollo

- TypeScript estricto.
- Variables de entorno en `.env`.
- Nunca hardcodear claves de API.
- Prompts versionados en archivos o tabla dedicada.
- Logs claros para cada generacion IA.
- Separar dominio, infraestructura y UI cuando sea razonable.
- Tests unitarios para clasificadores, prompts y transformaciones.
- Tests E2E para el flujo de oportunidad a publicacion.

## Variables De Entorno

Ver `.env.example`. Las principales: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `AGENT_RELAY_TOKEN`, `NSTBROWSER_API_KEY`, `VERCEL_TOKEN`, las credenciales OAuth de YouTube y `SOCIAL_TOKEN_ENCRYPTION_KEY`.

## Definicion De Exito

El sistema funciona si Fede puede operar en menos de 45 minutos diarios y producir respuestas mejores, mas rapidas y mas consistentes que haciendolo todo manualmente.
