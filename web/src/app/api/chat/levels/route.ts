// GET /api/chat/levels → qué niveles de razonamiento hay y qué hace cada uno con el proveedor actual.
// La interfaz lo usa para avisar si un modelo no cambia de verdad su profundidad de razonamiento.
import { NextResponse } from "next/server";
import { prewarmAll } from "@/lib/ai/claude-local";
import { getProvider, providerId } from "@/lib/ai/providers";
import { allowedLevels, DEFAULT_REASONING_LEVEL } from "@/lib/ai/reasoning";
import { TOCORITO_SYSTEM } from "@/lib/ai/system";
import { ProviderError } from "@/lib/ai/types";

export const runtime = "nodejs";

export async function GET() {
  // Al abrir el chat, Claude local deja listos sus procesos: así el primer mensaje ya es rápido.
  if (providerId() === "claude-local" && process.env.NODE_ENV !== "production") prewarmAll(TOCORITO_SYSTEM);
  try {
    const allowed = allowedLevels();
    const levels = getProvider()
      .levels()
      .filter((l) => allowed.includes(l.level))
      .map(({ level, realReasoning }) => ({ level, realReasoning }));
    return NextResponse.json({ provider: providerId(), default: DEFAULT_REASONING_LEVEL, levels });
  } catch (err) {
    return NextResponse.json({ error: err instanceof ProviderError ? err.friendly : "Error" }, { status: 500 });
  }
}
