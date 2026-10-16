// Las 26 fórmulas de hook de ig-reel/hooks.json, adaptadas a español rioplatense.
// Origen: jakeschincariol/instagram-agent-skill (MIT).
import type { ContentIntent } from "@prisma/client";
import { ure } from "./text";

export type HookFormula = {
  id: number;
  name: string;
  template: string;
  example: string;
  onScreen: string;
  bestFor: string;
  trap: string;
  /** Necesita un número o dato real del cliente. Sin dato, el guion deja {{dato}}. */
  needsRealData?: boolean;
  match: RegExp;
};

export const HOOK_FORMULAS: HookFormula[] = [
  { id: 1, name: "Confesión de costo", template: "{Monto concreto} me costó {un error}.", example: "Comprar el controlador equivocado me costó dos meses sin grabar.", onScreen: "2 MESES SIN GRABAR", bestFor: "Generar confianza rápido.", trap: "Un costo vago, sin número real.", needsRealData: true, match: ure("\\bme cost[óo]\\b|\\bperd[íi]\\b[^.!?]{0,25}\\$\\s?\\d|\\$\\s?\\d[\\d.,]*\\s+(?:es|fue) lo que\\b|\\btir[ée] (?:la )?plata\\b") },
  { id: 2, name: "Orden negativa", template: "No {acción común}. Hacé {alternativa}.", example: "No compres pads por la cantidad. Fijate la sensibilidad.", onScreen: "NO MIRES LA CANTIDAD", bestFor: "Guardados y debate.", trap: "Prohibir algo que nadie hace.", match: ure("^\\s*(?:no (?:compres|uses|hagas|pongas|elijas|pagues|grabes|toques|conectes|enchufes)|nunca|dej[áa] de|par[áa] de)\\b") },
  { id: 3, name: "Nadie te dice", template: "Nadie te dice que {verdad incómoda}.", example: "Nadie te dice que el ruido de una batería electrónica viaja por el piso.", onScreen: "NADIE TE LO DICE", bestFor: "Llegar a público nuevo con voz franca.", trap: "Una verdad que ya dice todo el mundo.", match: ure("\\bnadie (?:te |les )?(?:dice|dijo|cuenta|contó|explica|habla|menciona|avisa)\\b|\\blo que nadie\\b") },
  { id: 4, name: "El reemplazo", template: "{Esto} reemplazó a {algo más caro}.", example: "Este controlador reemplazó al teclado grande que no entraba en el escritorio.", onScreen: "ADIÓS TECLADO GIGANTE", bestFor: "Demos de producto donde la diferencia hace el trabajo.", trap: "Exagerar lo que reemplaza.", match: ure("\\breemplaz[óoa]\\w*\\b|\\ben vez de (?:pagar|comprar|contratar)\\b") },
  { id: 5, name: "Colapso de tiempo", template: "Antes me llevaba {mucho}. Ahora {poco}.", example: "Armar un beat me llevaba una tarde. Ahora, veinte minutos.", onScreen: "1 TARDE → 20 MIN", bestFor: "Procesos con resultado visible en pantalla.", trap: "Una proporción tan extrema que nadie la cree.", match: ure("\\bantes me llevaba\\b|\\bahora (?:me )?(?:lleva|tarda|tardo)\\b|\\b(?:me )?(?:lleva|tarda|tardo)\\s+\\d+\\s*(?:seg|min|hora|h)") },
  { id: 6, name: "El recibo", template: "Lo usé {N días}. Estos son los números reales.", example: "Practiqué 30 días con auriculares. Esto es lo que cambió.", onScreen: "30 DÍAS DESPUÉS", bestFor: "Pruebas reales con evidencia en cámara.", trap: "Prometer números sin mostrarlos.", needsRealData: true, match: ure("\\bdurante\\s+\\d+\\s+(?:d[ií]as|semanas|meses|a[ñn]os)\\b|\\b(?:ac[aá] (?:est[aá]n|van)|estos son) los n[uú]meros\\b|\\b(?:us[ée]|prob[ée]|practiqu[ée])\\b[^.!?]{0,20}\\d+\\s+(?:d[ií]as|semanas|meses)") },
  { id: 7, name: "Mal y bien", template: "Lo estás haciendo mal, y no es tu culpa. {El arreglo}.", example: "Estás configurando mal la latencia, y no es tu culpa.", onScreen: "NO ES TU CULPA", bestFor: "Enseñar sin sonar soberbio.", trap: "Marcar el error sin tranquilizar.", match: ure("\\b(?:el )?error (?:m[aá]s )?(?:com[uú]n|t[ií]pico)\\b|\\best[aá]s (?:haciendo|usando|eligiendo|configurando|conectando)\\b[^.!?]*\\bmal\\b|\\blo est[aá]s haciendo mal\\b") },
  { id: 8, name: "Info de adentro", template: "Pasé {N años} {adentro de algo}. Esto nunca lo decimos.", example: "Diez años detrás del mostrador. Esto es lo que más se devuelve.", onScreen: "DESDE EL MOSTRADOR", bestFor: "Autoridad sin mostrar credenciales.", trap: "Prometer un secreto y dar un consejo genérico.", needsRealData: true, match: ure("\\b(?:hace|llevo|trabaj[ée]|pas[ée])\\b[^.!?]*\\b\\d+\\s*a[ñn]os\\b|\\bnunca (?:lo )?(?:decimos|contamos|mostramos)\\b|\\b(?:detr[áa]s del|desde el) mostrador\\b") },
  { id: 9, name: "Robate esto", template: "Robate este {recurso}. Me llevó {tiempo} dejarlo bien.", example: "Robate esta configuración de pads. Me llevó un mes ajustarla.", onScreen: "ROBATE ESTO", bestFor: "Guardados y envíos.", trap: "Que el recurso no se vea en pantalla.", match: ure("^\\s*rob[áa]te\\b|\\b(?:copi[áa]|guard[áa]te|rob[áa]te) (?:esta|este|estos|estas|mi)\\b") },
  { id: 10, name: "Si te pasa, mirá", template: "Si {situación concreta}, esto lo resuelve en {poco tiempo}.", example: "Si tu vecino golpea la pared cuando practicás, mirá esto.", onScreen: "¿TU VECINO SE QUEJA?", bestFor: "Filtrar al espectador correcto.", trap: "Una situación tan amplia que no filtra a nadie.", match: ure("^\\s*¿?si\\b") },
  { id: 11, name: "Lista con favorito", template: "{N} {cosas} que {resultado}. La {k} no la usa nadie.", example: "3 ajustes del controlador que te ahorran tiempo. El tercero no lo usa nadie.", onScreen: "3 AJUSTES", bestFor: "Sostener la atención en el medio.", trap: "Listar más de siete.", match: ure("^\\s*\\d+\\s+\\p{L}+|\\bel n[uú]mero \\d+\\b|^\\s*(?:tres|cuatro|cinco|siete|diez)\\s+\\p{L}+") },
  { id: 12, name: "La objeción", template: "\"{Objeción real}.\" Dale. Esta es la versión que igual funciona.", example: "\"No tengo lugar para una batería.\" Dale, mirá esto.", onScreen: "NO TENGO LUGAR", bestFor: "Vender a quien ya dijo que no.", trap: "Inventar la objeción en vez de citar una real.", match: ure("^\\s*[\"“'«][^\"”'»]{5,120}[\"”'»][,.]?\\s*(?:bueno|ok|dale|claro|perfecto|ac[áa]|mir[áa])") },
  { id: 13, name: "Antes y después", template: "{Antes}. {Después}. {Una frase sobre la palanca}.", example: "Antes: cables por todos lados. Después: un solo USB.", onScreen: "ANTES / DESPUÉS", bestFor: "Transformaciones visuales donde el corte es el hook.", trap: "Mostrar varios cambios y perder credibilidad.", match: ure("\\bantes\\b[^.!?]*\\bdespu[ée]s\\b|\\b(?:esto|as[ií]) era\\b[^.!?]*[.!?]\\s*(?:esto|as[ií]) es\\b") },
  { id: 14, name: "El llamado", template: "{Grupo específico}, esto es lo que vienen ignorando.", example: "Bateristas de departamento, esto es para ustedes.", onScreen: "BATERISTAS DE DEPTO", bestFor: "Apuntar al público que convierte; invita a etiquetar.", trap: "Un grupo tan amplio que no se siente llamado.", match: ure("^\\s*(?:todos los|todas las|cualquier)\\s+\\p{L}+|^\\s*(?:bateristas|productor[ea]s|profes|profesor[ea]s|docentes|padres|madres|tecladistas|guitarristas|m[úu]sicos|djs?)\\b[^.!?,:]{0,30}[,:]|^\\s*para (?:los|las|quienes|todos)\\b") },
  { id: 15, name: "Récord de fracasos", template: "Mis primeros {N} {intentos} no sirvieron. Esto cambió en el {N+1}.", example: "Mis primeras 10 grabaciones sonaban mal. En la 11 cambié una sola cosa.", onScreen: "10 GRABACIONES MALAS", bestFor: "Principiantes; muchos comentarios.", trap: "Que el cambio parezca suerte.", match: ure("\\bmis prim[ea]r[oa]s?\\s+\\d+\\b|\\bl[oa]s prim[ea]r[oa]s\\s+\\d+\\s+(?:veces|grabaciones|clases|intentos|videos)\\b") },
  { id: 16, name: "Pregunta literal", template: "\"{Pregunta tal cual la hacen}\", me la hacen todas las semanas.", example: "¿Sirve un controlador de 25 teclas para producir? Me lo preguntan siempre.", onScreen: "¿25 TECLAS ALCANZAN?", bestFor: "Coincidir con lo que la gente busca.", trap: "Prolijar la pregunta y perder la frase real.", match: ure("^\\s*[\"“]?\\s*¿?(?:c[oó]mo|qu[ée]|por qu[ée]|cu[aá]ndo|d[oó]nde|qui[ée]n|cu[aá]l|sirve|conviene|se puede|vale la pena|anda|funciona)\\b[^?]{3,110}\\?") },
  { id: 17, name: "Cara a cara", template: "{A} contra {B}. Usé los dos {tiempo} y no hubo comparación.", example: "Pads de goma contra parches de malla. En casa no hay comparación.", onScreen: "GOMA VS MALLA", bestFor: "Comentarios de gente con opinión.", trap: "No elegir un ganador.", match: ure("\\b(?:vs\\.?|versus|contra)\\b|\\bdiferencias? entre\\b") },
  { id: 18, name: "Demo en frío", template: "{Arrancar en plena acción.} Mirá lo que hace esto.", example: "Mirá lo que pasa cuando bajo la sensibilidad del pad.", onScreen: "MIRÁ ESTO", bestFor: "Pantallas o manos con resultado visible.", trap: "Un resultado que tarda demasiado en llegar.", match: ure("^\\s*mir[áa] (?:lo que|esto|c[oó]mo)\\b|^\\s*(?:dej[áa]me|te) (?:muestro|mostrar)\\b|^\\s*fijate (?:esto|lo que)\\b") },
  { id: 19, name: "Fecha límite", template: "{Algo} cambia el {fecha}. Hacé {acción} antes.", example: "Si el curso empieza en marzo, el equipo se elige en febrero.", onScreen: "ANTES DE MARZO", bestFor: "Urgencia real, de temporada o de plataforma.", trap: "Plazos falsos que rompen la confianza.", match: ure("\\bantes (?:de que|del)\\b[^.!?]*\\b(?:cambie|termine|cierre|venza|empiece|arranque)\\b|\\bhasta el \\d|\\bcambia el \\d") },
  { id: 20, name: "Permiso", template: "No necesitás {lo que todos dicen que necesitás}.", example: "No necesitás un estudio para grabar voces que suenen bien.", onScreen: "NO NECESITÁS UN ESTUDIO", bestFor: "Sacar una barrera; muchos guardados.", trap: "Sacar la barrera sin dar un reemplazo.", match: ure("\\bno necesit[áa]s\\b|\\bno hace falta\\b|\\bdej[áa] de (?:preocuparte|intentar)\\b") },
  { id: 21, name: "Arranque a mitad", template: "...y ahí fue cuando {el giro}.", example: "...y ahí me di cuenta de que el problema era el cable.", onScreen: "EL PROBLEMA ERA OTRO", bestFor: "Historias que hacen sentir que llegaste tarde.", trap: "Nunca completar el contexto.", match: ure("^\\s*(?:\\.\\.\\.|…)|^\\s*y (?:ah[ií]|ese) (?:fue|es) (?:cuando|el momento)\\b|^\\s*y entonces\\b") },
  { id: 22, name: "Giro contrario", template: "{Dicho conocido, dado vuelta.}", example: "Más teclas no te hacen mejor productor.", onScreen: "MÁS TECLAS ≠ MEJOR", bestFor: "Hacer que el espectador frene y lo piense.", trap: "Dar vuelta un dicho que nadie usa.", match: ure("^\\s*\\p{L}[\\p{L}' ]{2,34}\\b(?:est[aá]|es|son|est[aá]n)\\s+(?:sobrevalorad[oa]s?|subestimad[oa]s?|muert[oa]s?|de m[áa]s)\\b|\\bno te hace(?:n)? mejor\\b") },
  { id: 23, name: "La estadística", template: "{N}% de {grupo} {dato sorprendente}.", example: "{{dato}}% de los que compran su primera batería la usan con auriculares.", onScreen: "{{dato}}% USA AURICULARES", bestFor: "Números que la gente reenvía.", trap: "Una estadística sin fuente.", needsRealData: true, match: ure("^\\s*\\d[\\d.,]*\\s?%|\\b\\d[\\d.,]*\\s?%\\s+de\\b") },
  { id: 24, name: "La revelación", template: "Este es el nuevo {objeto}.", example: "Este es el nuevo controlador que entra en la mochila.", onScreen: "EL NUEVO", bestFor: "Productos físicos como hook visual.", trap: "Mostrar el objeto sin decir qué cambia.", match: ure("^\\s*(?:este|esta|estos|estas) (?:es|son) (?:el|la|los|las) nuev[oa]s?\\b|^\\s*(?:lleg[óo]|llegaron)\\b|^\\s*(?:este|esta) (?:nuev[oa]|peque[ñn][oa]|chiquit[oa])\\b") },
  { id: 25, name: "Resultado de otro", template: "Un {cliente/alumno} {logró algo} en {tiempo}.", example: "Un alumno grabó su primer tema en una semana con este setup.", onScreen: "1 SEMANA, 1 TEMA", bestFor: "Prueba social cuando no tenés números propios.", trap: "Sin nombre ni contexto, suena a rumor.", needsRealData: true, match: ure("\\b(?:un|una) (?:alumn[oa]|cliente|baterista|productor[a]?|profe|chic[oa]|pibe|piba)\\b[^.!?]{0,30}\\b(?:logr[óo]|arm[óo]|grab[óo]|pas[óo]|consigui[óo]|aprendi[óo])\\b|\\bhab[íi]a (?:un|una)\\b") },
  { id: 26, name: "El superlativo", template: "La forma más {rápida/simple} de {algo} es {respuesta}.", example: "La forma más simple de practicar de noche es esta.", onScreen: "LA MÁS SIMPLE", bestFor: "Videos de una sola afirmación.", trap: "Respuesta floja después de un superlativo fuerte. Nunca \"el mejor del mercado\".", match: ure("^\\s*(?:el|la|lo)\\s+(?:m[áa]s (?:r[áa]pid[oa]|f[áa]cil|simple|barat[oa]|silencios[oa])|[úu]nic[oa])\\b|\\b(?:la|una) (?:forma|manera) m[áa]s\\b") },
];

/** Orden de clasificación del original: las fórmulas más específicas primero. */
const CLASSIFY_ORDER = [1, 23, 5, 4, 3, 15, 20, 7, 9, 26, 25, 24, 18, 17, 8, 6, 16, 12, 10, 2, 13, 19, 21, 22, 11, 14];

const BY_ID = new Map(HOOK_FORMULAS.map((formula) => [formula.id, formula]));

export function getFormula(id: number | null | undefined): HookFormula | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function classifyHook(text: string): HookFormula | null {
  const line = text.trim();
  if (!line) return null;
  for (const id of CLASSIFY_ORDER) {
    const formula = BY_ID.get(id)!;
    if (formula.match.test(line)) return formula;
  }
  return null;
}

export const SCRIPT_FOCUS_INTENT: Record<string, ContentIntent> = {
  Vender: "SALE",
  "Mostrar uso": "USE_CASE",
  "Resolver una duda": "EDUCATION",
  Inspirar: "ENTERTAINMENT",
};

const INTENT_FORMULAS: Record<ContentIntent, number[]> = {
  SALE: [4, 12, 17, 10, 26, 5],
  EDUCATION: [7, 3, 20, 16, 11, 2],
  USE_CASE: [13, 18, 10, 14, 5, 24],
  ENTERTAINMENT: [21, 22, 14, 13, 18, 3],
};

/**
 * Tres fórmulas distintas para un intent. Si una referencia ya trae fórmula,
 * va primera. Las que piden datos reales quedan fuera salvo que vengan forzadas.
 */
export function candidateFormulas(intent: ContentIntent, preferredId?: number | null, count = 3): HookFormula[] {
  const ids = [...(preferredId ? [preferredId] : []), ...INTENT_FORMULAS[intent]];
  const unique = Array.from(new Set(ids));
  return unique.map((id) => BY_ID.get(id)).filter((formula): formula is HookFormula => Boolean(formula)).slice(0, count);
}

export function formulaPromptBlock(formulas: HookFormula[]): string {
  return formulas
    .map((formula) => `- #${formula.id} ${formula.name}: "${formula.template}" Ej: "${formula.example}" (en pantalla: ${formula.onScreen}). Sirve para: ${formula.bestFor} Trampa: ${formula.trap}${formula.needsRealData ? " Requiere dato real: si no lo tenés, usá {{dato}}." : ""}`)
    .join("\n");
}
