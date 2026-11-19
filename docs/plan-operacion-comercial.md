# Plan de implementación para la operación comercial

El piloto se hará con PC MIDI. Fede podrá retomar conversaciones, registrar resultados y proponer contenido desde el trabajo que ya hace en el Asistente CM. Lucio podrá detectar fallas de Blog y escucha desde Inicio. La operación diaria tiene como referencia el objetivo del proyecto de menos de 45 minutos.

| Entrega | Alcance | Depende de |
| --- | --- | --- |
| 1 | Seguimientos y resultados comerciales en el Asistente CM | Flujo y permisos actuales de oportunidades |
| 2 | Alertas de Blog y escucha en Inicio | Registros de ejecución existentes |
| 3 | Resultados semanales en Analytics | Eventos comerciales de la entrega 1 |
| 4 | Propuestas de conocimiento, Blog y Estudio a partir de consultas | Oportunidades y flujos de borradores existentes |

Las entregas 2 y 4 pueden avanzar mientras Fede prueba la primera. La entrega 3 puede construirse con datos de prueba y validarse con los eventos del piloto.

## 1. Seguimientos y resultados en el Asistente CM

1. Incorporar una próxima fecha de seguimiento por oportunidad y un historial de acciones comerciales con fecha, operador y nota breve. Incluir acciones para agendar, reprogramar, completar o cancelar un seguimiento, registrar una derivación y confirmar una venta. Permitir corregir un resultado con un registro de quién lo corrigió y cuándo.
2. Implementar las acciones en servidor con el alcance por cliente de oportunidades. Guardar cada evento y su efecto sobre el seguimiento en una transacción. Proteger contra dobles envíos y cambios concurrentes. La publicación de una respuesta y el resultado comercial se registran en sus respectivos flujos.
3. Agregar las acciones a la oportunidad en el Asistente CM. Mostrar seguimientos vencidos primero, los de hoy a continuación y la cola habitual después. Desde Inicio, enlazar a los seguimientos pendientes del cliente activo. Usar la fecha local de Buenos Aires para el piloto y guardar marcas de tiempo en UTC.
4. Incorporar los casos históricos en `FOLLOW_UP` o con `followUpNeeded` sin fecha a una vista de pendientes por agendar. Conservar los valores históricos de `converted` como resultado legado hasta que alguien confirme su significado. Registrar la derivación a WhatsApp manualmente durante el piloto.

**Aceptación.** Fede puede agendar hoy, retomar mañana, registrar una derivación y confirmar una venta desde el mismo caso. Completar o cancelar elimina el pendiente de la cola. El historial sigue disponible tras recargar. Verificar datos históricos, cambio de día, doble envío, acceso entre clientes y publicación de respuestas con aprobación humana.

## 2. Alertas operativas en Inicio

1. Inventariar los estados y las fuentes existentes de Blog y escucha. Para Blog, aprovechar las tareas, publicaciones y diagnósticos del catálogo. Para escucha, identificar en los reportes del orquestador el cliente, canal, inicio, fin y resultado. Persistir en Postgres un resumen por ejecución si los reportes locales son la única fuente accesible.
2. Definir alertas para errores con intentos agotados, trabajos que superan el tiempo esperado y corridas programadas que no se registraron. Ajustar los umbrales al calendario y horario de cada proceso. Una corrida exitosa con cero oportunidades cuenta como exitosa. Mostrar «Sin datos» cuando falte evidencia y dar un estado propio a los flujos deshabilitados o en espera de aprobación.
3. Mostrar última corrida exitosa, pendiente afectado, motivo y enlace a Calendario, tarea o Monitoreo. Consolidar avisos repetidos y resolver el aviso cuando el problema se recupere. Cuando exista un reintento autorizado, enlazar a ese control.

**Aceptación.** Simular un artículo con intentos agotados, una corrida de escucha omitida, una corrida exitosa sin resultados y una recuperación. Cada caso tiene el estado esperado y el enlace conduce al registro correcto para el cliente activo.

## 3. Reporte semanal en Analytics

1. Agregar un período semanal seleccionable, con lunes a domingo en la zona horaria del piloto. Contar oportunidades distintas por indicador y atribuir cada una a su red de origen y producto asociado. Incluir «Sin producto» cuando corresponda.
2. Definir **atendidas** como oportunidades con una publicación registrada en el período, **derivadas** y **ventas confirmadas** como oportunidades con el evento válido correspondiente en el período, y **seguimientos vencidos** como pendientes actuales con fecha anterior a hoy. Identificar la fecha de corte de los pendientes y mostrar los resultados históricos en su métrica existente.
3. Incorporar detalle filtrable desde cada total. Para evaluar las derivaciones del piloto, sumar una vista de cohorte por semana de derivación que muestre el estado conocido al momento de consultar. Una venta confirmada en una semana posterior actualiza el resultado de su cohorte original.

**Aceptación.** Conciliar los totales contra oportunidades de ejemplo con dos publicaciones, una derivación y una venta en semanas distintas, una corrección, un producto sin asignar y datos de dos clientes. El detalle de cada indicador coincide con el total mostrado.

## 4. Pasar consultas a conocimiento, Blog y Estudio

1. Agregar «Proponer contenido» al detalle de oportunidad. Permitir elegir una o varias consultas del mismo cliente como evidencia y seleccionar un destino. Empezar con agrupación manual por producto y tema.
2. Usar el contexto de marca, catálogo y conocimiento del cliente para sugerir un borrador. Para conocimiento, generar pregunta y respuesta verificable. Para Blog, generar un encargo editorial con tema, preguntas y productos pertinentes. Para Estudio, generar una idea o guion inicial con gancho y puntos a cubrir.
3. Mantener enlaces internos a las consultas de origen y detectar propuestas repetidas antes de crear otra. Omitir identificadores personales en el contenido y pedir verificación cuando falten datos técnicos o comerciales. Al guardar, dejar cada propuesta en revisión dentro del flujo de su módulo, con exclusión de publicación automática mientras espere revisión humana.

**Aceptación.** A partir de dos consultas sobre ruido de una batería electrónica, Fede puede guardar una propuesta en cada destino y volver a sus fuentes. Verificar que un doble envío genera una sola propuesta por destino, que un fallo deja disponible el contexto para reintentar y que el guardado solo crea el borrador interno.

## Piloto y despliegue

1. **Primer sprint.** Entregar seguimiento, derivación y confirmación de venta, con historial y vista de pendientes. Antes de habilitarlo para PC MIDI, probar la migración aditiva con datos de prueba que representen registros históricos y ejecutar lint, TypeScript, Vitest y una prueba del flujo de oportunidad a publicación y seguimiento.
2. **Cinco días operativos.** Fede registra los minutos que le lleva cerrar la cola, la cantidad de vencidos al cierre y cuántas derivaciones tienen resultado conocido. Tomar como referencia una sesión con el flujo actual. Revisar una muestra de casos con Fede al final del piloto y ajustar los pasos que agreguen fricción.
3. **Entregas siguientes.** Habilitar alertas de Blog y escucha cuando las fuentes estén verificadas. Conciliar el reporte semanal con los casos del piloto. Probar el flujo editorial con una pregunta real y validar la revisión en los tres destinos antes de habilitarlo para más clientes.
4. **Decisión después del piloto.** Si el registro manual de derivaciones consume tiempo o se pierden resultados, evaluar una integración de WhatsApp con la cuenta autorizada y una forma verificable de vincular la conversación al caso. Si la fricción viene de oportunidades irrelevantes, usar descartes y tiempos de atención para ajustar las fuentes y la prioridad.

Habilitar cada entrega por cliente usando la configuración existente donde aplique. Si aparece una regresión, desactivar la entrada al flujo afectado y conservar los registros para corregirla y retomar el piloto.
