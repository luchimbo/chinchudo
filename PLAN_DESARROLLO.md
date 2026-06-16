# Plan De Desarrollo Completo

## Proyecto: Los 5 Apostoles

### Version

Documento inicial para desarrollo y operacion.

### Proposito

Disenar y construir una plataforma interna para PC MIDI Center que permita detectar oportunidades comerciales en redes, generar respuestas asistidas por IA y operar una estrategia organica para MidiPlus y Kressmer con control humano, trazabilidad y mejora continua.

---

## 1. Vision General

El proyecto no debe pensarse como un bot que publica por volumen, sino como un **sistema operativo comercial para redes**.

La plataforma debe ayudar a responder tres preguntas:

1. Donde esta hablando la gente de productos que PC MIDI puede vender?
2. Que duda, objecion o necesidad tiene esa persona?
3. Cual es la mejor respuesta posible segun marca, producto, red y tono?

El valor principal esta en combinar:

- Social listening.
- Base de conocimiento tecnica.
- IA generativa.
- Control humano.
- Historial y analitica.

---

## 2. Alcance Del Proyecto

### Incluido

- Dashboard interno.
- Gestion de oportunidades.
- Gestion de marcas.
- Gestion de productos.
- Gestion de personas/arquetipos.
- Generacion de respuestas IA.
- Historial de respuestas.
- Estados operativos.
- Exportacion de datos.
- Reportes basicos.
- Monitoreo semi-automatico por URLs y palabras clave.

### Fuera Del MVP

- Publicacion automatica directa en redes.
- Automatizacion masiva de comentarios.
- Rotacion de IPs.
- Creacion automatizada de cuentas.
- Gestion avanzada de usuarios y permisos.
- Integracion completa con CRM.
- Attribution tracking avanzado.

Estos puntos pueden evaluarse mas adelante solo si hay una necesidad comercial clara y una forma tecnicamente estable de implementarlos.

---

## 3. Usuarios Del Sistema

### Lucio

Usuario tecnico administrador.

Necesita:

- Configurar marcas.
- Crear y ajustar prompts.
- Revisar logs.
- Auditar errores.
- Cambiar parametros de IA.
- Mantener base de datos.
- Agregar integraciones.

### Fede

Usuario operador.

Necesita:

- Ver oportunidades nuevas.
- Entender rapidamente si vale la pena responder.
- Generar respuestas.
- Editar el texto.
- Copiarlo y publicarlo manualmente.
- Marcar resultados.
- Reportar problemas.

### Jefe / Direccion

Usuario de lectura y decision.

Necesita:

- Ver metricas.
- Saber que marcas traccionan.
- Saber que objeciones aparecen.
- Evaluar resultados.
- Decidir prioridades de stock, contenido y pauta.

---

## 4. Los 5 Perfiles De Voz

Los perfiles no son solo nombres: son **modos de razonamiento y escritura**.

### 4.1 Soporte Tecnico PC MIDI

Objetivo:

- Resolver dudas tecnicas.
- Dar seguridad.
- Derivar a consulta cuando falten datos.

Ideal para:

- "Sirve para Windows 11?"
- "Tiene garantia?"
- "Hay repuestos?"
- "Que diferencia hay con tal modelo?"

Reglas:

- No exagerar.
- Explicar con claridad.
- Pedir modelo exacto si falta contexto.
- Priorizar soporte local y compra asesorada.

Ejemplo de tono:

> Para ese uso te conviene mirar compatibilidad, garantia y soporte local. Si me decis que modelo estas comparando, te puedo orientar mejor.

### 4.2 Productor / Home Studio

Objetivo:

- Hablar desde el uso practico en produccion musical.
- Traducir specs a beneficios reales.

Ideal para:

- Controladores MIDI.
- Pads.
- Interfaces.
- Setup chico.
- Home studio inicial.

Reglas:

- Enfocarse en flujo de trabajo.
- Evitar jerga excesiva.
- Mencionar casos concretos.

Ejemplo de tono:

> Para home studio va bien si buscas algo simple y directo. Lo importante es que no te complique el flujo: conectar, mapear y grabar rapido.

### 4.3 Baterista De Departamento

Objetivo:

- Resolver preocupaciones de practica diaria.
- Hablar de ruido, espacio y comodidad.

Ideal para:

- Baterias electronicas.
- Pads.
- Parches.
- Practica con auriculares.
- Vecinos.

Reglas:

- Tono cotidiano.
- Hablar de problemas concretos.
- Evitar tecnicismos innecesarios.

Ejemplo de tono:

> Si vivis en depto, fijate mucho el rebote de los pads y el ruido mecanico. Con auriculares solucionas el audio, pero el golpe igual importa.

### 4.4 Profe De Musica

Objetivo:

- Recomendar desde durabilidad y aprendizaje.
- Ayudar a elegir equipos para alumnos.

Ideal para:

- Principiantes.
- Escuelas.
- Padres comprando.
- Equipamiento para clases.

Reglas:

- Priorizar facilidad de uso.
- Hablar de garantia y durabilidad.
- Ser didactico.

Ejemplo de tono:

> Para un alumno, yo priorizaria algo facil de usar y con garantia. A veces conviene resignar una funcion avanzada y ganar en durabilidad.

### 4.5 Embajador Kressmer / Early User

Objetivo:

- Posicionar Kressmer como novedad interesante.
- Marcar diferencia frente a marcas mas conocidas.

Ideal para:

- Lanzamientos.
- Consultas sobre marca nueva.
- Comparaciones esteticas.
- Busqueda de algo premium o distinto.

Reglas:

- No decir que es "lo mejor" sin pruebas.
- Hablar de propuesta, diseno y respaldo.
- Mantener curiosidad y confianza.

Ejemplo de tono:

> Kressmer esta interesante si buscas algo menos comun y con una estetica mas cuidada. Yo preguntaria por el modelo puntual y la garantia antes de decidir.

---

## 5. Arquitectura Recomendada

### 5.1 Arquitectura MVP

```text
Agentes Internos
      |
      +--> Chrome real via CDP
      +--> Intake JSONL temporal
      +--> Importador Prisma
      |
      v
SQLite / Prisma
      ^
      |
Usuario Operador
      |
      v
Dashboard Web
      |
      v
API Backend
      |
      +--> SQLite
      |
      +--> Servicio IA
      |
      +--> Modulo de Clasificacion
```

### 5.2 Backend Operativo De Agentes

La prioridad inmediata es que la capa detras del dashboard quede bien: escucha, normalizacion, logs, deduplicacion, borradores y exportaciones deben funcionar antes de seguir expandiendo la UI.

Decision tecnica:

- Python para navegador real/CDP.
- Node.js + Prisma para escribir en SQLite.
- SQLite como fuente de verdad.
- JSON/JSONL solo como buffer temporal, evidencia o reporte.
- Publicacion automatica fuera del MVP.

Componentes:

- `agents/browser-cdp.py`: Dolphin o Chrome persistente, login asistido, extraccion visible, `dry-run`.
- `agents/accounts.example.json`: plantilla de cuentas, perfiles Chrome, puertos CDP y variables de entorno de credenciales.
- `agents/social-listen.py`: busquedas por canal y normalizacion de oportunidades.
- `scripts/import-opportunities.mjs`: deduplicacion por URL e importacion a SQLite.
- `scripts/draft-worker.mjs`: generacion de borradores seguros sin inventar datos actuales.
- `scripts/export-csv.mjs`: exportacion operativa.
- `agents/orchestrator.py`: comandos `listen`, `draft`, `export` y `daily`.
- `reports/`: reportes JSON por corrida.
- `data/`: staging JSONL.
- `exports/`: CSVs generados.

Comandos base:

```bash
npm run agents:listen -- --dry-run
npm run agents:draft -- --dry-run
npm run agents:export
npm run agents:daily -- --dry-run
python agents/browser-cdp.py start-browser --account soporte-pc-midi
python agents/browser-cdp.py login --account soporte-pc-midi --channel facebook --dry-run
```

Reglas para cuentas:

- Copiar `agents/accounts.example.json` a `agents/accounts.json`.
- Cada cuenta usa `browserProvider`. Preferido: `dolphin` con `dolphinProfileId` real.
- Dolphin se conecta por Local API (`DOLPHIN_API_BASE`, por defecto `http://localhost:3001/v1.0`) y devuelve `automation.port`/`wsEndpoint`.
- Si la Local API responde `401`, configurar `DOLPHIN_API_TOKEN` en `.env` para enviar `Authorization: Bearer`.
- El runtime de Dolphin se guarda en `data/browser-runtime.json` para que login y escucha usen el perfil iniciado.
- Si una cuenta usa Chrome local, debe tener `chromeProfile` y `cdpPort` propio.
- Usuario y contrasena viven en `.env` y se referencian por nombre de variable.
- El login automatizado solo completa credenciales de cuentas propias/autorizadas.
- Si la red solicita 2FA, captcha o checkpoint, el flujo queda en modo manual y no intenta evadirlo.

### 5.3 Arquitectura Escalable

```text
Dashboard Web
      |
      v
API Backend
      |
      +--> Supabase Postgres
      +--> Supabase Auth
      +--> Job Scheduler
      +--> Queue
      +--> LLM Provider
      +--> Exportaciones
      +--> Monitoreo por red
```

### 5.4 Stack Sugerido

Frontend:

- Next.js.
- React.
- Tailwind CSS.
- shadcn/ui opcional.

Backend:

- Node.js.
- TypeScript.
- API routes de Next.js para MVP.
- Luego backend separado si crece.

Base de datos:

- SQLite local para MVP.
- Prisma ORM.
- Supabase Postgres para produccion.

IA:

- Proveedor LLM configurable.
- Prompts versionados.
- Logs de request/response.

Automatizacion:

- Python + CDP para monitoreo con Chrome real persistente.
- Playwright para QA y capturas controladas cuando sea conveniente.
- Jobs programados para revisar fuentes.
- Node.js + Prisma para persistir resultados de agentes en SQLite.

---

## 6. Modelo De Datos

### 6.1 Tabla `brands`

Campos:

- `id`
- `name`
- `positioning`
- `tone`
- `allowed_claims`
- `forbidden_claims`
- `created_at`
- `updated_at`

Registros iniciales:

- MidiPlus.
- Kressmer.

### 6.2 Tabla `products`

Campos:

- `id`
- `brand_id`
- `name`
- `category`
- `description`
- `technical_specs`
- `use_cases`
- `warranty_notes`
- `stock_status`
- `price_range`
- `created_at`
- `updated_at`

Categorias sugeridas:

- Controlador MIDI.
- Bateria electronica.
- Pad.
- Interface.
- Accesorio.
- Otro.

### 6.3 Tabla `personas`

Campos:

- `id`
- `name`
- `role`
- `tone`
- `goals`
- `preferred_length`
- `allowed_phrases`
- `forbidden_phrases`
- `good_examples`
- `bad_examples`
- `created_at`
- `updated_at`

### 6.4 Tabla `channels`

Campos:

- `id`
- `name`
- `type`
- `base_url`
- `response_style_notes`

Canales:

- YouTube.
- TikTok.
- Instagram.
- Facebook.
- X.

### 6.5 Tabla `opportunities`

Campos:

- `id`
- `channel_id`
- `source_url`
- `source_author`
- `source_text`
- `detected_brand_id`
- `detected_product_id`
- `detected_intent`
- `priority`
- `status`
- `notes`
- `created_at`
- `updated_at`

`detected_intent`:

- `purchase_question`
- `technical_question`
- `price_question`
- `warranty_question`
- `comparison`
- `complaint`
- `competitor_mention`
- `general_discussion`

`priority`:

- `low`
- `medium`
- `high`
- `urgent`

`status`:

- `new`
- `needs_review`
- `drafted`
- `approved`
- `published`
- `discarded`
- `follow_up`
- `converted`

### 6.6 Tabla `responses`

Campos:

- `id`
- `opportunity_id`
- `persona_id`
- `brand_id`
- `variant_type`
- `draft_text`
- `edited_text`
- `risk_notes`
- `approved_by`
- `created_at`
- `updated_at`

`variant_type`:

- `short`
- `technical`
- `conversational`

### 6.7 Tabla `publishing_log`

Campos:

- `id`
- `opportunity_id`
- `response_id`
- `published_url`
- `published_at`
- `published_by`
- `result`
- `follow_up_needed`
- `created_at`

`result`:

- `no_reply`
- `positive_reply`
- `negative_reply`
- `whatsapp_inquiry`
- `sale_assisted`
- `needs_follow_up`

### 6.8 Tabla `knowledge_base`

Campos:

- `id`
- `brand_id`
- `product_id`
- `topic`
- `content`
- `source`
- `confidence`
- `created_at`
- `updated_at`

### 6.9 Tabla `objections`

Campos:

- `id`
- `brand_id`
- `product_id`
- `objection`
- `recommended_answer`
- `persona_notes`
- `created_at`
- `updated_at`

### 6.10 Tabla `prompt_versions`

Campos:

- `id`
- `name`
- `version`
- `system_prompt`
- `user_prompt_template`
- `active`
- `created_at`
- `updated_at`

---

## 7. Prompts Del Sistema

### 7.1 Prompt Base

Objetivo:

Generar respuestas comerciales utiles, naturales y especificas al contexto.

Reglas del prompt:

- Responder a la duda del usuario antes de mencionar marca.
- No inventar especificaciones.
- Si falta informacion, pedir el modelo exacto.
- Evitar claims absolutos.
- Evitar tono de publicidad.
- Adaptar longitud a la red social.
- Generar 3 variantes.

### 7.2 Template De Entrada

```text
Marca objetivo: {{brand_name}}
Posicionamiento de marca: {{brand_positioning}}
Producto: {{product_name}}
Ficha tecnica disponible: {{product_specs}}
Persona: {{persona_name}}
Tono de persona: {{persona_tone}}
Red social: {{channel_name}}
Comentario original: {{source_text}}
Objetivo de respuesta: {{response_goal}}

Genera:
1. Variante corta.
2. Variante tecnica.
3. Variante conversacional.
4. Alertas si hay riesgo de inventar datos.
5. Pregunta de seguimiento recomendada si aplica.
```

### 7.3 Formato De Salida

```json
{
  "short": "",
  "technical": "",
  "conversational": "",
  "risk_notes": [],
  "follow_up_question": ""
}
```

---

## 8. Funcionalidades Del MVP

### 8.1 Crear Oportunidad Manual

Fede debe poder cargar:

- Red.
- URL.
- Texto del comentario.
- Autor visible.
- Marca sugerida.
- Producto sugerido.
- Nota interna.

Resultado:

- Se crea oportunidad en estado `new`.

### 8.2 Clasificar Oportunidad

El sistema debe sugerir:

- Marca.
- Producto.
- Intencion.
- Prioridad.
- Persona recomendada.

La clasificacion puede ser:

- Manual en v1.
- Asistida por IA en v2.
- Semi-automatica con reglas en v3.

### 8.3 Generar Respuestas

Fede selecciona:

- Oportunidad.
- Marca.
- Producto.
- Persona.
- Objetivo.

El sistema devuelve:

- Respuesta corta.
- Respuesta tecnica.
- Respuesta conversacional.
- Alertas.

### 8.4 Editar Y Aprobar

Fede puede:

- Editar texto.
- Guardar version final.
- Aprobar.
- Copiar al portapapeles.
- Marcar como publicado.

### 8.5 Historial

Debe poder filtrarse por:

- Marca.
- Producto.
- Red.
- Estado.
- Persona.
- Fecha.
- Intencion.

### 8.6 Exportacion

CSV inicial:

- Fecha.
- Red.
- Marca.
- Producto.
- Oportunidad.
- Respuesta publicada.
- Estado.
- Resultado.

---

## 9. Dashboard

### 9.1 Pantalla Principal

Debe mostrar:

- Total de oportunidades nuevas.
- Oportunidades urgentes.
- Respuestas pendientes de publicar.
- Follow-ups pendientes.
- Conversiones asistidas.

### 9.2 Lista De Oportunidades

Columnas:

- Fecha.
- Red.
- Texto resumido.
- Marca.
- Producto.
- Intencion.
- Prioridad.
- Estado.
- Accion.

Acciones:

- Ver detalle.
- Generar respuesta.
- Descartar.
- Marcar follow-up.

### 9.3 Detalle De Oportunidad

Secciones:

- Comentario original.
- Contexto.
- Marca/producto.
- Persona elegida.
- Respuestas generadas.
- Editor.
- Historial.
- Resultado.

### 9.4 Base De Conocimiento

CRUD para:

- Productos.
- FAQs.
- Objeciones.
- Comparativas.
- Notas de garantia.

### 9.5 Analytics

Graficos:

- Oportunidades por red.
- Oportunidades por marca.
- Objeciones frecuentes.
- Estados del pipeline.
- Conversiones asistidas por semana.

---

## 10. Fases De Desarrollo

## Fase 0 - Preparacion

Duracion estimada:

- 1 a 2 dias.

Objetivos:

- Confirmar alcance.
- Crear repositorio.
- Definir stack.
- Crear estructura base.
- Configurar variables de entorno.

Entregables:

- Repo inicial.
- `README.md`.
- `AGENTS.md`.
- `PLAN_DESARROLLO.md`.
- `.env.example`.

Criterios de aceptacion:

- Cualquier desarrollador puede entender el objetivo y correr el proyecto base.

---

## Fase 0.5 - Backend Operativo De Agentes

Duracion estimada:

- 2 a 4 dias.

Objetivos:

- Dejar solida la capa interna antes de seguir con la app visible.
- Registrar toda escucha, importacion, generacion y exportacion.
- Asegurar deduplicacion basica y control humano obligatorio.

Tareas:

- Crear `agents/browser-cdp.py` con Chrome real persistente y login manual.
- Crear `agents/social-listen.py` para escuchar canales con `dry-run`.
- Crear importador Node/Prisma desde intake JSONL a SQLite.
- Crear worker de borradores seguros.
- Crear exportador CSV.
- Crear `agents/orchestrator.py` para `listen`, `draft`, `export` y `daily`.
- Crear reportes JSON por corrida.

Entregables:

- CDP estable.
- Logs y reportes auditables.
- Limites por canal documentados para futuras corridas.
- Importacion a SQLite.
- Deduplicacion basica por URL.
- Comandos documentados.
- CSV exportable.

Criterios de aceptacion:

- `npm run agents:listen -- --dry-run` no escribe en SQLite.
- `npm run agents:draft -- --dry-run` no crea respuestas.
- `npm run agents:export` genera CSV de oportunidades.
- La misma URL no crea oportunidades duplicadas.
- Ningun agente publica automaticamente en redes.

---

## Fase 1 - MVP De Datos

Duracion estimada:

- 3 a 5 dias.

Objetivos:

- Crear schema Prisma.
- Crear SQLite local.
- Crear seed inicial con marcas y personas.
- Crear CRUD basico.

Tareas:

- Instalar Next.js + TypeScript.
- Instalar Prisma.
- Crear modelos.
- Crear migraciones.
- Crear seeds.
- Crear endpoints basicos.

Entregables:

- Base local funcionando.
- Marcas MidiPlus/Kressmer cargadas.
- 5 personas cargadas.
- Productos de prueba.

Criterios de aceptacion:

- Se pueden listar, crear y editar oportunidades.
- Los datos persisten.
- El seed reconstruye entorno local.

---

## Fase 2 - Generador IA

Duracion estimada:

- 3 a 5 dias.

Objetivos:

- Integrar proveedor LLM.
- Crear servicio de generacion.
- Versionar prompts.
- Guardar outputs.

Tareas:

- Crear `llmClient`.
- Crear templates de prompts.
- Crear validacion JSON.
- Guardar respuesta en tabla `responses`.
- Mostrar errores de IA en UI.

Entregables:

- Boton "Generar respuestas".
- 3 variantes por oportunidad.
- Alertas de riesgo.

Criterios de aceptacion:

- Dada una oportunidad real, el sistema genera respuestas coherentes.
- No se pierde el historial.
- Los errores de IA quedan registrados.

---

## Fase 3 - Dashboard Operativo

Duracion estimada:

- 5 a 7 dias.

Objetivos:

- Darle a Fede una UI usable.
- Reducir friccion diaria.
- Implementar estados.

Tareas:

- Crear layout principal.
- Crear tabla de oportunidades.
- Crear filtros.
- Crear detalle.
- Crear editor.
- Crear accion "copiar respuesta".
- Crear estados.

Entregables:

- Dashboard usable de punta a punta.

Criterios de aceptacion:

- Fede puede operar una oportunidad completa sin tocar la base.
- El flujo `new -> drafted -> approved -> published` funciona.

---

## Fase 4 - Base De Conocimiento

Duracion estimada:

- 4 a 6 dias.

Objetivos:

- Mejorar calidad de respuestas.
- Evitar inventar datos.
- Centralizar informacion comercial.

Tareas:

- CRUD de productos.
- CRUD de FAQs.
- CRUD de objeciones.
- Asociar contenido a marca/producto.
- Inyectar contexto relevante al prompt.

Entregables:

- Panel de knowledge base.
- Prompts alimentados con informacion real.

Criterios de aceptacion:

- Las respuestas usan datos cargados.
- Si falta informacion, la IA lo advierte.

---

## Fase 5 - Clasificacion Asistida

Duracion estimada:

- 3 a 5 dias.

Objetivos:

- Reducir trabajo manual.
- Priorizar oportunidades.

Tareas:

- Crear clasificador por reglas.
- Crear clasificador IA opcional.
- Detectar marca/producto.
- Detectar intencion.
- Sugerir persona.
- Sugerir prioridad.

Entregables:

- Boton "Clasificar".
- Autocompletado de campos sugeridos.

Criterios de aceptacion:

- El sistema clasifica correctamente al menos 70% de casos de prueba.
- Fede puede corregir manualmente.

---

## Fase 6 - Monitoreo Semi-Automatico

Duracion estimada:

- 1 a 2 semanas.

Objetivos:

- Detectar oportunidades sin depender 100% de carga manual.

Fuentes iniciales:

- URLs especificas de YouTube.
- Posts especificos de Facebook o Instagram cargados manualmente.
- Busquedas por keywords cuando sea tecnicamente posible.

Keywords iniciales:

- "bateria electronica"
- "controlador midi"
- "MidiPlus"
- "Kressmer"
- "Alesis"
- "Donner"
- "Roland"
- "sirve para empezar"
- "vale la pena"
- "garantia argentina"
- "home studio"

Tareas:

- Crear tabla `monitored_sources`.
- Crear job scheduler.
- Crear scraper controlado por fuente.
- Evitar duplicados.
- Crear logs.
- Crear vista de nuevas detecciones.

Entregables:

- Oportunidades creadas automaticamente desde fuentes monitoreadas.

Criterios de aceptacion:

- No duplica comentarios.
- Guarda URL y texto.
- Permite auditoria del origen.

---

## Fase 7 - Analytics Y Reportes

Duracion estimada:

- 4 a 6 dias.

Objetivos:

- Convertir operacion diaria en informacion estrategica.

Reportes:

- Semanal por marca.
- Semanal por red.
- Objeciones frecuentes.
- Productos mas consultados.
- Respuestas con mejores resultados.
- Conversiones asistidas.

Tareas:

- Crear queries agregadas.
- Crear dashboard de metricas.
- Exportar CSV.
- Crear resumen semanal con IA.

Entregables:

- Panel de analytics.
- Exportacion.
- Resumen semanal.

Criterios de aceptacion:

- Direccion puede ver el estado en menos de 5 minutos.

---

## Fase 8 - Preparacion Para Produccion

Duracion estimada:

- 1 semana.

Objetivos:

- Pasar de herramienta local a operacion estable.

Tareas:

- Migrar a Supabase.
- Agregar autenticacion.
- Agregar backups.
- Agregar logs persistentes.
- Manejar errores de IA.
- Crear rate limits internos.
- Crear documentacion de operacion.

Entregables:

- Version estable desplegable.
- Backup y recuperacion documentados.

Criterios de aceptacion:

- El sistema puede usarse diariamente sin depender de Lucio.

---

## 11. Backlog Priorizado

### Prioridad Alta

- CRUD de oportunidades.
- CRUD de personas.
- CRUD de marcas.
- Generacion IA.
- Estados operativos.
- Historial.
- Editor de respuesta.
- Copiar al portapapeles.
- Exportacion CSV.

### Prioridad Media

- Clasificacion asistida.
- Base de conocimiento avanzada.
- Monitoreo por URLs.
- Reportes semanales.
- Busqueda global.
- Deteccion de duplicados.

### Prioridad Baja

- Multiusuario avanzado.
- Roles y permisos detallados.
- Integracion CRM.
- Integracion WhatsApp.
- Automatizacion de seguimiento.
- Scoring comercial avanzado.

---

## 12. Criterios De Calidad

### Calidad Tecnica

- TypeScript estricto.
- Validacion de inputs.
- Manejo de errores.
- Logs claros.
- Tests para servicios criticos.
- Migraciones reproducibles.
- Sin secretos en repositorio.

### Calidad De Producto

- Fede entiende la pantalla sin capacitacion larga.
- Cada accion critica tiene feedback.
- Los estados son claros.
- El historial es facil de leer.
- El texto generado se puede editar rapido.

### Calidad De Respuesta

- Especificidad.
- Naturalidad.
- Brevedad cuando corresponde.
- Precaucion tecnica.
- Cero datos inventados.
- Tono diferenciado por persona.

---

## 13. Testing

### Tests Unitarios

Cubrir:

- Clasificador de intencion.
- Deteccion de marca.
- Deteccion de producto.
- Normalizacion de URLs.
- Validacion de salida IA.
- Transformaciones CSV.

### Tests De Integracion

Cubrir:

- Crear oportunidad.
- Generar respuesta.
- Aprobar respuesta.
- Marcar publicada.
- Exportar reporte.

### Tests E2E

Flujo completo:

1. Fede carga comentario.
2. Sistema clasifica.
3. Sistema genera respuestas.
4. Fede edita.
5. Fede aprueba.
6. Fede marca como publicado.
7. Dashboard actualiza metricas.

---

## 14. Seguridad Y Configuracion

### Variables Sensibles

No commitear:

- API keys.
- Tokens.
- Credenciales de Supabase.
- Cookies.
- Sesiones.

### Archivos

Crear:

- `.env.example`
- `.gitignore`

Ignorar:

- `.env`
- `node_modules`
- `.next`
- `dev.db`
- logs locales.

### Backups

MVP:

- Copia manual de SQLite.

Produccion:

- Backups automaticos Supabase.
- Export semanal CSV.

---

## 15. Operacion Diaria De Fede

### Rutina Sugerida

Tiempo estimado:

- 30 a 45 minutos diarios.

Pasos:

1. Abrir dashboard.
2. Revisar oportunidades `new`.
3. Descartar irrelevantes.
4. Priorizar `high` y `urgent`.
5. Generar respuestas.
6. Editar las mejores.
7. Publicar manualmente.
8. Marcar estado.
9. Revisar follow-ups.
10. Cargar nuevas objeciones detectadas.

### Rutina Semanal

Tiempo estimado:

- 45 a 60 minutos.

Pasos:

1. Revisar analytics.
2. Identificar objeciones frecuentes.
3. Agregar FAQs.
4. Ajustar prompts.
5. Revisar productos con mas demanda.
6. Pasar resumen a direccion.

---

## 16. Indicadores De Exito

### Operativos

- Oportunidades detectadas por semana.
- Porcentaje respondido.
- Tiempo promedio de respuesta.
- Follow-ups generados.
- Respuestas descartadas por baja calidad.

### Comerciales

- Consultas a WhatsApp atribuidas.
- Ventas asistidas.
- Productos mas consultados.
- Marca con mayor interes.
- Objeciones que frenan compra.

### De Calidad

- Repeticion de frases.
- Edicion promedio requerida.
- Respuestas con datos incompletos.
- Feedback de Fede.

---

## 17. Roadmap Por Semanas

### Semana 1

- Setup proyecto.
- Base de datos.
- Marcas/personas.
- CRUD oportunidades.

### Semana 2

- Integracion IA.
- Generacion de respuestas.
- Editor y aprobacion.

### Semana 3

- Base de conocimiento.
- Productos.
- Objeciones.
- Mejoras de prompts.

### Semana 4

- Clasificacion asistida.
- Filtros.
- Exportacion.
- Primer uso operativo real.

### Semana 5

- Monitoreo semi-automatico.
- Deteccion de duplicados.
- Jobs.

### Semana 6

- Analytics.
- Reportes.
- Ajustes de UX.
- Preparacion para produccion.

---

## 18. Riesgos Tecnicos Y Mitigaciones

### Riesgo: Respuestas genericas

Mitigacion:

- Mejorar knowledge base.
- Agregar ejemplos buenos/malos.
- Usar prompts por persona.
- Medir edicion requerida.

### Riesgo: Datos inventados por IA

Mitigacion:

- Inyectar solo datos disponibles.
- Pedir alertas de incertidumbre.
- Bloquear claims prohibidos.
- Revision humana obligatoria.

### Riesgo: Operacion lenta para Fede

Mitigacion:

- Atajos de teclado.
- Boton copiar.
- Filtros utiles.
- Estados claros.
- Respuestas preseleccionadas.

### Riesgo: Base desactualizada

Mitigacion:

- Rutina semanal.
- Campo `updated_at`.
- Marcar productos sin confirmar.
- Alertas de informacion vieja.

### Riesgo: Monitoreo inestable

Mitigacion:

- Empezar con carga manual.
- Luego fuentes puntuales.
- Logs por fuente.
- Evitar depender de scraping fragil como nucleo del MVP.

---

## 19. Estructura Inicial Del Repositorio

```text
/
  AGENTS.md
  PLAN_DESARROLLO.md
  README.md
  .env.example
  package.json
  prisma/
    schema.prisma
    seed.ts
  src/
    app/
    components/
    lib/
      db/
      llm/
      prompts/
      classifiers/
    server/
      services/
      repositories/
    types/
  tests/
```

---

## 20. Definicion De MVP Terminado

El MVP esta terminado cuando se puede completar este flujo sin ayuda tecnica:

1. Fede carga un comentario real.
2. Elige red, marca y producto.
3. Elige una de las 5 personas.
4. La IA genera 3 respuestas.
5. Fede edita una respuesta.
6. Fede la copia y la publica manualmente.
7. Fede marca la oportunidad como publicada.
8. El sistema guarda todo.
9. El dashboard refleja el cambio.
10. Se puede exportar un CSV con la actividad.

---

## 21. Primera Lista De Tareas Para Lucio

1. Crear proyecto Next.js con TypeScript.
2. Configurar ESLint y Prettier.
3. Agregar Prisma y SQLite.
4. Crear schema inicial.
5. Crear seed con marcas y personas.
6. Crear pantalla de oportunidades.
7. Crear formulario de nueva oportunidad.
8. Crear detalle de oportunidad.
9. Integrar proveedor IA.
10. Crear prompts base.
11. Guardar respuestas generadas.
12. Crear editor/aprobacion.
13. Crear export CSV.
14. Probar flujo completo con 10 casos reales.

---

## 22. Primera Lista De Tareas Para Fede

1. Recolectar 30 comentarios reales de YouTube/TikTok/Facebook.
2. Separarlos por marca, producto y tipo de duda.
3. Anotar que respuesta daria hoy manualmente.
4. Identificar objeciones frecuentes.
5. Cargar preguntas frecuentes.
6. Probar respuestas generadas por IA.
7. Marcar cuales suenan humanas y cuales no.
8. Pasar feedback a Lucio.

---

## 23. Checklist De Lanzamiento Controlado

- [ ] Marcas cargadas.
- [ ] 5 personas cargadas.
- [ ] Productos principales cargados.
- [ ] FAQs cargadas.
- [ ] 30 casos reales probados.
- [ ] Prompts ajustados.
- [ ] Export CSV funcionando.
- [ ] Fede capacitado.
- [ ] Rutina diaria definida.
- [ ] Reporte semanal definido.

---

## 24. Siguiente Paso Recomendado

Construir primero el MVP documental y tecnico:

1. `README.md`.
2. `.env.example`.
3. Next.js + Prisma + SQLite.
4. Seed inicial.
5. CRUD de oportunidades.
6. Generador IA.

La prioridad no es automatizar todo desde el dia uno. La prioridad es que el sistema produzca buenas respuestas, registre historial y le ahorre tiempo real a Fede.
