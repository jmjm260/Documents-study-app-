// Valores configurables del entrenamiento SAT de Tocorito. Son DECISIONES DE IMPLEMENTACIÓN
// (propuestas del documento de producto), no reglas de College Board. Cambiarlos aquí basta.

/** Tamaño y dificultad de cada nivel. Después del último, los niveles siguen siendo de 50 a la última dificultad. */
export const LEVEL_TABLE: { size: number; difficulty: number }[] = [
  { size: 21, difficulty: 1 },
  { size: 26, difficulty: 2 },
  { size: 31, difficulty: 2 },
  { size: 36, difficulty: 3 },
  { size: 41, difficulty: 3 },
  { size: 46, difficulty: 4 },
  { size: 50, difficulty: 4 },
  { size: 50, difficulty: 5 },
  { size: 50, difficulty: 6 },
  { size: 50, difficulty: 7 },
];

/** Máximo absoluto de preguntas por ronda. */
export const MAX_ROUND = 50;
/** Microobjetivos nuevos que se enseñan en cada nivel (el 1.º presenta las 11 familias). El resto, al final. */
export const INTROS_PER_LEVEL = [11, 10, 10, 10, 10, 10, 10];
/** Desde esta dificultad es "desafío avanzado" (igual o por encima del SAT exigente según la rúbrica). */
export const ADVANCED_MIN_DIFFICULTY = 6;

/** Tiempo por pregunta en rondas de menos de 50 (solo responder; sin explicación ni feedback). */
export const QUESTION_MS = 60_000;
/** Margen por la red al comprobar el tiempo en el servidor. */
export const GRACE_MS = 2_500;
/** Escalones del cronómetro GLOBAL en rondas de 50 (minutos). El mínimo es 1 minuto TOTAL. */
export const EXTREME_MINUTES = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 1];
export const MIN_GLOBAL_MS = 60_000;

/** Preguntas preparadas por adelantado en la ronda actual, y para un reinicio. */
export const LOOKAHEAD = 6;
export const RESET_RESERVE = 4;
/** Límites de coste: generación por usuario y día, y trabajos a la vez. */
export const MAX_ITEMS_PER_DAY = 400;
export const MAX_CONCURRENT_JOBS = 2;
/** Preguntas por llamada de generación. */
export const BATCH_SIZE = 3;

export function levelInfo(level: number): { size: number; difficulty: number } {
  return LEVEL_TABLE[Math.min(level, LEVEL_TABLE.length) - 1];
}

/** Presupuesto global (ms) de una ronda de 50 en el escalón `step`; nunca por debajo de 60 s en total. */
export function globalBudgetMs(step: number): number {
  const minutes = EXTREME_MINUTES[Math.min(Math.max(step, 0), EXTREME_MINUTES.length - 1)];
  return Math.max(MIN_GLOBAL_MS, minutes * 60_000);
}
