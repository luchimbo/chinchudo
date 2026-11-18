# Consultas sobre cursos ajenos

Oportunidad `cmvfnaajx000p9dsm4hiuq15z` de Kressmer descartada por solicitud del operador. La pregunta “Hermano todavía hay cupo para el reto de 30 días?” estaba clasificada como compra urgente por el contexto musical del video. Se guardó el motivo del descarte en notas y SystemLog, sin borrar la respuesta histórica ni publicar comentarios.

Se agregó un filtro determinístico para consultas de cupos, inscripción, horarios o precios de cursos y retos ajenos. La regla inspecciona el comentario y utiliza el título sólo como contexto del curso. Preguntas reales sobre elección, compra y uso de instrumentos siguen siendo elegibles. Se aplica en la elegibilidad de Kressmer (importación y clasificación), el triage de PC MIDI y las dos rutas de generación de borradores. Se incluye en el versionado de reglas.

Verificación: 117 pruebas aprobadas, lint y TypeScript correctos. La revisión de 2.612 oportunidades activas de PC MIDI y Kressmer no encontró otros casos que cumplan la nueva regla. El descarte del caso original fue confirmado en la base real con estado `DISCARDED`.
