// Contrato común de los proveedores de IA. La API y la interfaz solo conocen esto.
import type { ChatMessage } from "../chat";
import type { ReasoningLevel } from "./reasoning";

/** Lo que la API manda al navegador mientras Tocorito responde. Nunca incluye el razonamiento interno. */
export type ChatStatus = "preparing" | "thinking" | "generating";

export type ProviderEvent =
  | { type: "status"; status: ChatStatus }
  | { type: "text"; delta: string }
  | { type: "usage"; inputTokens: number | null; outputTokens: number | null };

export type LevelSupport = {
  level: ReasoningLevel;
  /** true = el modelo cambia de verdad su profundidad de razonamiento con este nivel. */
  realReasoning: boolean;
  model: string;
};

export type ChatRequest = {
  /** Instrucciones fijas (personalidad + reglas). */
  system: string;
  /** Datos que cambian en cada mensaje (fecha, calendario). Pueden ir vacíos. */
  context: string;
  messages: ChatMessage[];
  level: ReasoningLevel;
  signal?: AbortSignal;
  /** Tarea suelta (p. ej. el título del chat): no usa ni gasta los procesos pre-calentados del chat. */
  oneOff?: boolean;
};

export interface ChatProvider {
  id: string;
  /** Qué hace cada nivel con este proveedor (para que la interfaz lo explique). */
  levels(): LevelSupport[];
  /** Responde en streaming. */
  stream(req: ChatRequest): AsyncGenerator<ProviderEvent>;
}

/** Error con un mensaje apto para enseñar al estudiante. */
export class ProviderError extends Error {
  constructor(public friendly: string, detail: string) {
    super(detail);
  }
}
