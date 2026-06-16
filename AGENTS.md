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
   Primero MVP local con SQLite. Luego Supabase, jobs programados, dashboard avanzado y reportes.

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

### 1. Técnico / Productor

Uso:

- Garantia, compatibilidad, drivers, repuestos y comparativas tecnicas.
- Problemas post-compra.
- Controladores MIDI, interfaces, pads.
- Flujo de trabajo y produccion en home studio (DAW).
- Recomendaciones para principiantes e intermedios.

Estilo:

- Preciso, practico y explicativo.
- Enfocado en uso real, sin vender de mas.

### 2. Baterista de Departamento

Uso:

- Baterias electronicas.
- Ruido, vecinos, practica diaria y espacio reducido.
- Auriculares, sensacion de pads/parches de malla, rebote.

Estilo:

- Cercano, cotidiano.
- Orientado a problemas reales de convivencia y espacio.

### 3. Trend-Setter Kressmer

Uso:

- Novedades y lanzamientos de Kressmer.
- Primeras impresiones, comparacion de diseno, producto premium.
- Kressmer como opcion que "la rompe" frente a alternativas conocidas.

Estilo:

- Moderno, curioso, aspiracional.
- Sin exagerar claims no comprobados.

### 4. Profe / Madre-Padre

Uso:

- Recomendaciones para alumnos e hijos.
- Durabilidad, simplicidad, compra segura y garantia oficial.
- Equipos para ensenar y practicar.

Estilo:

- Didactico, criterioso.
- Sello de confianza; evita tecnicismos innecesarios.

### 5. Cazador de Ofertas

Uso:

- Precio, cuotas y financiacion.
- Disponibilidad y stock en el local.
- Conveniencia y facilidad de compra.

Estilo:

- Directo, entusiasta y practico.
- Destaca conveniencia sin claims falsos.

## Stack Tecnico Recomendado

### MVP

- Node.js.
- TypeScript.
- SQLite.
- Prisma ORM.
- Next.js o Remix para dashboard.
- Tailwind CSS para interfaz rapida.
- Playwright solo para monitoreo controlado y QA.
- API LLM para generacion de respuestas.

### Escalamiento

- Supabase Postgres.
- Supabase Auth.
- Jobs programados.
- Cola de tareas con BullMQ o Supabase Queues.
- Almacenamiento de screenshots y evidencia.
- Exportacion CSV.
- Reportes semanales.

## Arquitectura De Agentes Internos

Antes de seguir puliendo la app visible, el proyecto prioriza una capa interna estable para que todo lo que pase por detras quede registrado, deduplicado y auditable.

Enfoque elegido:

- Python para navegador real y CDP, reutilizando la logica que ya funciono en otra app.
- Node.js + Prisma para persistir en SQLite, porque la base local es la fuente de verdad del MVP.
- JSON/JSONL solo como buffer, staging, evidencia o reporte tecnico. No debe ser la fuente principal.
- Publicacion automatica fuera del MVP. Los agentes pueden detectar, preparar y asistir, pero Fede publica manualmente.

Capas esperadas:

- `agents/browser-cdp.py`: abre perfiles con Dolphin o Chrome local, usa CDP, permite login asistido, extrae contenido visible y soporta `dry-run`.
- `agents/accounts.example.json`: plantilla de cuentas/perfiles. Copiar a `agents/accounts.json` para configurar cuentas reales.
- `agents/social-listen.py`: ejecuta busquedas por canal, normaliza oportunidades y deja evidencia de escucha.
- `scripts/import-opportunities.mjs`: importa oportunidades desde el buffer JSONL a SQLite con deduplicacion por URL.
- `scripts/draft-worker.mjs`: genera borradores locales seguros y los guarda en Prisma.
- `agents/orchestrator.py`: coordina pasos `listen`, `draft`, `export` y `daily`.
- `reports/`: reportes JSON auditables por corrida.
- `data/`: intake temporal JSONL para staging/debug.
- `exports/`: CSVs operativos para revision o backup.

Reglas de agentes:

- Todo comando debe registrar reporte con comando, fecha, canal, entradas leidas, oportunidades creadas, descartes y errores.
- Todo comando que escriba datos debe aceptar `--dry-run` cuando sea razonable.
- Las credenciales de cuentas deben vivir en `.env`, referenciadas desde `agents/accounts.json` por nombre de variable. Nunca hardcodear usuarios ni claves.
- Cada cuenta debe usar un perfil Chrome y puerto CDP propio para no mezclar sesiones.
- Si `browserProvider` es `dolphin`, `start-browser` debe llamar a la Local API de Dolphin (`DOLPHIN_API_BASE`, por defecto `http://localhost:3001/v1.0`) y guardar el `automation.port`/`wsEndpoint` en `data/browser-runtime.json`.
- Si Dolphin responde `401`, configurar `DOLPHIN_API_TOKEN` en `.env`; el agente lo envia como `Authorization: Bearer`.
- El login automatizado solo puede completar usuario y contraseña de cuentas propias/autorizadas. Si aparece 2FA, captcha o checkpoint, el agente debe frenar y dejar la ventana abierta para resolucion humana.
- La escucha no debe duplicar oportunidades con la misma URL.
- Los borradores no deben inventar stock, precio, garantia ni claims tecnicos.
- Ningun agente debe hacer clicks de publicacion ni enviar comentarios en redes durante el MVP.

Flujo de cuentas:

```bash
copy agents\accounts.example.json agents\accounts.json
REM Editar agents\accounts.json y reemplazar dolphinProfileId por el ID real del perfil Dolphin.
REM Si Dolphin pide autorizacion, cargar DOLPHIN_API_TOKEN en .env.
python agents/browser-cdp.py start-browser --account soporte-pc-midi
python agents/browser-cdp.py list-dolphin-profiles
python agents/browser-cdp.py login --account soporte-pc-midi --channel facebook
npm run agents:listen -- --account soporte-pc-midi --channel facebook --query "MidiPlus controlador MIDI" --dry-run
```

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

Entrada:

- Texto de la oportunidad.
- Marca.
- Producto.
- Persona.
- Objetivo de respuesta.
- Nivel tecnico.
- Red social.

Salida:

- Variante corta.
- Variante tecnica.
- Variante conversacional.
- Riesgos o alertas.
- Preguntas de seguimiento sugeridas.

### 6. Panel De Aprobacion

Debe permitir:

- Ver oportunidades pendientes.
- Generar respuestas.
- Editar respuestas.
- Aprobar.
- Copiar al portapapeles.
- Marcar como publicado.
- Agregar resultado.

### 7. Analytics

Metricas basicas:

- Oportunidades por red.
- Oportunidades por marca.
- Objeciones mas frecuentes.
- Productos mas mencionados.
- Respuestas publicadas.
- Conversiones asistidas.
- Tiempo medio de respuesta.

## Flujo Operativo Diario

1. Fede abre el dashboard.
2. Revisa oportunidades nuevas.
3. Descarta basura, spam o temas irrelevantes.
4. Asigna marca/producto si el sistema no lo hizo.
5. Elige persona de respuesta.
6. Genera 3 variantes con IA.
7. Edita la mejor.
8. Publica manualmente.
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

## Criterios De Aceptacion Del MVP

El MVP esta listo cuando:

- Se pueden crear oportunidades manualmente.
- Se pueden cargar productos y marcas.
- Existen las 5 personas operativas.
- La IA genera 3 variantes de respuesta.
- Fede puede aprobar, editar y marcar como publicado.
- Todo queda registrado en SQLite.
- Hay un listado filtrable por estado, marca y red.
- Se puede exportar un CSV basico.

## Comandos Esperados

Cuando exista implementacion:

```bash
npm install
npm run dev
npm run db:migrate
npm run db:sync
npm run db:seed
npm run lint
npm run test
npm run agents:listen -- --dry-run
npm run agents:draft -- --dry-run
npm run agents:export
npm run agents:daily -- --dry-run
python agents/browser-cdp.py start-browser --account soporte-pc-midi
python agents/browser-cdp.py login --account soporte-pc-midi --channel facebook --dry-run
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

## Variables De Entorno Sugeridas

```env
DATABASE_URL="file:./dev.db"
LLM_PROVIDER="openai"
LLM_API_KEY=""
APP_ENV="development"
```

## Definicion De Exito

El sistema funciona si Fede puede operar en menos de 45 minutos diarios y producir respuestas mejores, mas rapidas y mas consistentes que haciendolo todo manualmente.
