# Radar Kressmer en YouTube

Meta: 20 comentarios nuevos y válidos por día argentino, con una propuesta breve por comentario en español, inglés o alemán. Revisión humana obligatoria; sin publicación automática.

## Configuración

```powershell
node node_modules/tsx/dist/cli.mjs scripts/setup-kressmer-radar.mts --dry-run
node node_modules/tsx/dist/cli.mjs scripts/setup-kressmer-radar.mts
```

La configuración es idempotente. Ajusta las dos metas a 20, crea una fuente de YouTube por consulta (54) con la cuenta existente `kressmer-early`, desactiva las fuentes de Kressmer que ya no estén en la lista y desactiva fuentes de otras redes del cliente. No crea modelos de producto ni modifica el catálogo de PC MIDI.

## Ejecución

```powershell
node node_modules/tsx/dist/cli.mjs scripts/daily-opportunity-quota.mts --client kressmer --dry-run --max-rounds 1
node node_modules/tsx/dist/cli.mjs scripts/daily-opportunity-quota.mts --client kressmer
```

El programador existente lanza esta cuota en segundo plano cada 30 minutos entre 07:30 y 22:30, sin demorar al monitor general. **No hay tope de 3 rondas:** cada corrida sigue buscando hasta llegar a 20 oportunidades del día. Corta sólo por tres motivos: llegó a 20 (`target_reached`); usó su presupuesto de 25 minutos (`time_budget`), y el disparo siguiente retoma desde el cursor guardado; o hubo tres rondas seguidas sin leer nada (`youtube_unreadable`), lo que indica un navegador o perfil roto. El motivo queda en `stopReason` del reporte. Cada ronda usa una de 54 consultas (18 por idioma, intercaladas ES/EN/DE, incluidas búsquedas de modelos populares: las respuestas igual nunca los nombran). Lee 6 videos y hasta 3 páginas de comentarios ordenados por más recientes, repartidos entre los videos. El filtro de búsqueda cambia en cada vuelta completa por las 54 consultas: primero los videos más vistos de cualquier fecha (reciben comentarios nuevos todos los días), después por relevancia y por último los subidos este mes. YouTube ya no combina "más vistos" con "este mes" (devuelve vacío), y "este mes" sólo trae videos casi sin comentarios. Tras las tres vueltas pasa al siguiente bloque de 6 videos (offsets 0, 6 y 12). Los resultados y los comentarios se leen de `ytInitialData` y de la API interna, así que funcionan aunque la ventana esté minimizada o tapada.

Cuenta cualquier comentario en ES/EN/DE, sin importar el idioma de la búsqueda. "Necesidad concreta" es una pregunta, un pedido de ayuda o una intención de compra o elección (para quién es, presupuesto, si vale la pena, cuál elegir). Los elogios y las opiniones no cuentan. Entre rondas hay una pausa de 8 s. Con 20 oportunidades se detiene la búsqueda, pero se reintentan las respuestas pendientes de la misma cohorte diaria. Variables de ajuste: `KRESSMER_QUOTA_BUDGET_MINUTES`, `KRESSMER_QUOTA_MAX_ROUNDS` (60), `KRESSMER_QUOTA_PAUSE_MS`, `KRESSMER_QUOTA_LISTEN_TIMEOUT_MS`. El generador del servidor también admite `--client kressmer`.

Se requiere NSTBrowser y un perfil válido con CDP. Los índices públicos que solo devuelven videos no completan esta cuota. Kressmer usa su propio bloqueo (`data/opportunity-pipeline-kressmer.lock`), así que corre aunque el monitor general (que puede tardar más de una hora) siga activo; dos corridas de Kressmer nunca se superponen. Lo compartido se protege aparte: cada perfil de navegador admite un solo proceso a la vez (`data/locks/browser-<cuenta>.lock`, `agents/_account_lock.py`; si `kressmer-early` está ocupada más de 20 s, esa lectura se reporta como bloqueada y se reintenta), y el import vuelve a verificar duplicados bajo un `pg_advisory_xact_lock` por URL justo antes de crear la oportunidad. Un bloqueo cuyo proceso murió se recupera solo.

La lectura de comentarios no depende de que la ventana se vea: si NSTBrowser está minimizado o tapado, YouTube no renderiza los comentarios y el extractor los pide por la API interna (orden "más recientes") a partir de `ytInitialData`.

## Qué cuenta

- Comentarios identificables por video e ID de comentario, con necesidad concreta sobre pianos digitales o teclados musicales; se conserva `lc` en la URL.
- Fecha verificable de hasta un año (365 días, `KRESSMER_MAX_AGE_DAYS`; antes 30), medida desde la captura original. Un mes relativo se trata conservadoramente como 31 días, así que "hace 12 meses" y "hace 1 año" (que puede ser hasta 23 meses) quedan afuera. Fechas ambiguas o desconocidas quedan fuera de cuota.
- Idioma reconocido como ES/EN/DE. Una detección ambigua o un fallo del clasificador no se reemplaza por español.
- La evidencia queda en `Opportunity.contextAssessment.kressmerRadar`, sin tablas nuevas. Las oportunidades anteriores sin esta evidencia no cuentan.
- Las respuestas listas se cuentan por oportunidad de hoy, con idioma coincidente; crear borradores para oportunidades antiguas no completa la meta.

El panel de Monitoreo muestra ambos contadores y el faltante. Las fuentes muestran errores de lectura; los reportes en `reports/*daily-opportunity-quota*.json` incluyen consultas, idiomas, descartes, fallos de importación/generación y déficit. Código de salida 2 significa cuota incompleta; 1 indica error o bloqueo. Ningún faltante se rellena con videos, elogios o promociones.

`--dry-run` hace una vista previa de lectura sin importar, generar respuestas ni actualizar clientes/fuentes. Puede escribir reportes locales. Las credenciales se mantienen en `.env` y `agents/accounts.json` por referencias existentes.

## Qué no puede afirmar una propuesta

Sin catálogo cargado, `kressmerDraftClaimErrors` rechaza, oración por oración, toda descripción o valoración del instrumento consultado aunque no se lo nombre: sujeto implícito o pronombre ("Es un teclado muy popular", "Tiene 61 teclas", "It's great for beginners", "Es ist ein gutes Keyboard"), causales ("al ser de 61 teclas", "since it has", "da es"), demostrativos y posesivos ("ese teclado trae", "its keys", "dieses Modell hat"). Las marcas de terceros (Yamaha, Casio, Roland…) se rechazan siempre, porque el catálogo de Kressmer no las respalda. Los `riskNotes` del modelo no cuentan como evidencia. Se acepta la orientación general ("para estudiar piano, compará tacto, cantidad de teclas y pedal"). Si tras el reintento la propuesta sigue fallando, queda pendiente para revisión.
