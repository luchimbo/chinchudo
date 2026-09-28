/**
 * Largo de las respuestas del Asistente CM. YouTube admite comentarios de hasta
 * 10.000 caracteres: este límite es editorial. El prompt apunta a TARGET (una o dos
 * oraciones) y se acepta hasta MAX sin cortar; por encima se condensa y, como último
 * recurso, se cierra en la última oración completa.
 *
 * Módulo sin dependencias para que también lo usen los componentes del navegador.
 */
export const COPILOT_TARGET_CHARACTERS = 280;
export const COPILOT_MAX_CHARACTERS = 400;
