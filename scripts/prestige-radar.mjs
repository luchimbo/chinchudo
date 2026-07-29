export const PRESTIGE_RADAR_QUERIES = [
  // Términos deliberadamente cortos: cada fuente aporta una variante del radar.
  { channel: "instagram", label: "Inicio running", query: "running" },
  { channel: "instagram", label: "Ropa running", query: "ropa running" },
  { channel: "instagram", label: "Ampollas y roce", query: "medias running" },
  { channel: "instagram", label: "Gimnasio", query: "gimnasio" },
  { channel: "instagram", label: "Entrenamiento", query: "entrenamiento" },
  { channel: "instagram", label: "Deporte", query: "deporte" },
  { channel: "instagram", label: "Ropa gimnasio", query: "ropa gimnasio" },
  { channel: "instagram", label: "Ropa deportiva", query: "ropa deportiva" },
  { channel: "instagram", label: "Medias deportivas", query: "medias deportivas" },
  { channel: "instagram", label: "Calzado deportivo", query: "calzado deportivo" },
  { channel: "tiktok", label: "Tips para correr", query: "tips para empezar a correr argentina" },
  { channel: "tiktok", label: "Indumentaria", query: "indumentaria running que usar" },
  { channel: "tiktok", label: "Entrenamiento", query: "tips entrenamiento running principiantes" },
  { channel: "youtube", label: "Plan principiante", query: "plan para empezar a correr principiantes argentina" },
  { channel: "youtube", label: "Técnica y rendimiento", query: "tecnica para correr mejor entrenamiento running" },
  { channel: "youtube", label: "Equipamiento", query: "equipamiento esencial para running medias calzado" },
  { channel: "facebook", label: "Consultas runners", query: "running" },
  { channel: "facebook", label: "Ropa deportiva", query: "ropa running" },
  { channel: "facebook", label: "Trail y comodidad", query: "medias running" },
  { channel: "facebook", label: "Gimnasio", query: "gimnasio" },
  { channel: "facebook", label: "Entrenamiento", query: "entrenamiento" },
  { channel: "facebook", label: "Deporte", query: "deporte" },
  { channel: "facebook", label: "Ropa gimnasio", query: "ropa gimnasio" },
  { channel: "facebook", label: "Ropa deportiva general", query: "ropa deportiva" },
  { channel: "facebook", label: "Medias deportivas", query: "medias deportivas" },
  { channel: "facebook", label: "Calzado deportivo", query: "calzado deportivo" },
  { channel: "x", label: "Consejos running", query: "consejos running principiantes argentina" },
  { channel: "x", label: "Rendimiento", query: "como rendir mejor corriendo entrenamiento" },
  { channel: "x", label: "Medias técnicas", query: "medias running ampollas sudoracion" },
  { channel: "reddit", label: "Empezar a correr", query: "empezar a correr consejos" },
  { channel: "reddit", label: "Ropa y calzado", query: "ropa running medias calzado" },
  { channel: "reddit", label: "Recuperación", query: "running ampollas roce pies entrenamiento" },
];

const MEDICAL_PATTERNS = /\b(diagnostico|diagnóstico|recet[a-z]*|medicacion|medicación|lesi[oó]n|cura[r]?|trombosis|varices|várices|cirugia|cirugía)\b/i;
const SALES_PATTERNS = /\b(vendo|liquido|mayorista|distribuidor|env[ií]os? a todo|oferta imperdible|sorteo|giveaway)\b/i;
const RUNNING_PATTERNS = /\b(runn?ing|correr|corredor(?:a)?|trail|marat[oó]n|entrenamiento|zapatillas|calzado|medias?|soquetes?|ampollas?|roce|sudoraci[oó]n|indumentaria|calzas?|remera deportiva|rendimiento)\b/i;

export function isPrestigeUnsafeContent(text, context = "") {
  const value = `${text} ${context}`.replace(/\s+/g, " ").trim();
  return MEDICAL_PATTERNS.test(value) || SALES_PATTERNS.test(value);
}

export function isPrestigeRadarCandidate(text, context = "") {
  const value = `${text} ${context}`.replace(/\s+/g, " ").trim();
  if (value.length < 30 || isPrestigeUnsafeContent(value)) return false;
  return RUNNING_PATTERNS.test(value);
}

export function normalizedRadarText(value) {
  return String(value || "").toLocaleLowerCase("es-AR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
