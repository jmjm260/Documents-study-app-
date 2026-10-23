// Punto de enganche para medir uso y coste por nivel. Hoy no guarda nada (no hay cuentas);
// cuando las haya, aquí se sumarán tokens por usuario/día/mes para límites y estadísticas.
// Nunca se registra el contenido de los mensajes: solo números.
import type { ReasoningLevel } from "./reasoning";

export type UsageRecord = {
  provider: string;
  level: ReasoningLevel;
  inputTokens: number | null;
  outputTokens: number | null;
  firstTokenMs: number | null;
  totalMs: number;
};

export function recordUsage(record: UsageRecord) {
  if (process.env.NODE_ENV !== "production") {
    console.info(
      `uso: ${record.provider} · ${record.level} · primer texto ${record.firstTokenMs ?? "-"} ms · total ${record.totalMs} ms · tokens ${record.inputTokens ?? "?"}/${record.outputTokens ?? "?"}`
    );
  }
}
