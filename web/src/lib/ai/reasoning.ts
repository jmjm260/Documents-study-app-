// Niveles de razonamiento que elige el usuario. Son independientes del proveedor:
// cada proveedor traduce el nivel a su propia configuración (ver getReasoningConfig en ./providers).
//
// Tres ideas separadas (no mezclarlas):
//   1. Profundidad de razonamiento → este nivel.
//   2. Longitud de la respuesta   → la decide el prompt de Tocorito (siempre corta).
//   3. Velocidad de generación     → consecuencia del modelo y el nivel. NUNCA se añaden esperas.

export const REASONING_LEVELS = ["instant", "medium", "high"] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export const DEFAULT_REASONING_LEVEL: ReasoningLevel = "medium";

export const LEVEL_INFO: Record<ReasoningLevel, { label: string; description: string }> = {
  instant: { label: "Instantáneo", description: "Respuestas rápidas para tareas sencillas." },
  medium: { label: "Medio", description: "Equilibrio entre velocidad y razonamiento." },
  high: { label: "Alto", description: "Más tiempo de razonamiento para problemas complejos." },
};

export const SLOWER_LEVELS_WARNING = "Los niveles superiores pueden tardar más en responder.";

export function isReasoningLevel(v: unknown): v is ReasoningLevel {
  return typeof v === "string" && (REASONING_LEVELS as readonly string[]).includes(v);
}

/**
 * Política por plan, en un solo sitio. Hoy todos los planes tienen todo: cuando haya
 * suscripciones (Free / Plus) basta con cambiar esta tabla, sin tocar la interfaz ni la API.
 */
export const PLAN_POLICY: Record<string, { levels: readonly ReasoningLevel[] }> = {
  default: { levels: REASONING_LEVELS },
};

export function allowedLevels(plan = "default"): readonly ReasoningLevel[] {
  return (PLAN_POLICY[plan] ?? PLAN_POLICY.default).levels;
}

/** Nivel final para una petición: el pedido si es válido y está permitido; si no, el más cercano permitido. */
export function resolveLevel(requested: unknown, plan = "default"): ReasoningLevel {
  const allowed = allowedLevels(plan);
  const wanted = isReasoningLevel(requested) ? requested : DEFAULT_REASONING_LEVEL;
  if (allowed.includes(wanted)) return wanted;
  const order = REASONING_LEVELS.indexOf(wanted);
  return [...allowed].sort((a, b) => Math.abs(REASONING_LEVELS.indexOf(a) - order) - Math.abs(REASONING_LEVELS.indexOf(b) - order))[0];
}
