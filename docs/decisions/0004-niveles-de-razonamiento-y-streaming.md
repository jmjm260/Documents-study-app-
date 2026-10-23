# 0004 — Niveles de razonamiento (Instantáneo / Medio / Alto) y streaming

**Estado:** aceptada

## Contexto

Tocorito tardaba ~10 s en responder. Medimos: el modelo tardaba ~1,5 s; el resto (~6,5 s) era
arrancar Claude Code en cada mensaje. Además el usuario quiere elegir, como en ChatGPT, cuánto
razona la IA antes de responder.

## Decisión

- **Tres niveles** (`web/src/lib/ai/reasoning.ts`): `instant`, `medium` (por defecto), `high`. En la interfaz: botón a la derecha de la barra de mensaje con un deslizador, sin emojis.
  El navegador solo manda el nivel; el servidor decide modelo y parámetros.
- **Capa de proveedores** (`web/src/lib/ai/`): cada proveedor implementa `ChatProvider`
  (`levels()` + `stream()`); `getReasoningConfig(provider, level)` traduce el nivel.
  - OpenAI: `reasoning_effort` minimal/medium/high solo en modelos que lo soportan (gpt-5*, o*).
    Modelo por nivel con `OPENAI_MODEL_INSTANT|MEDIUM|HIGH`. Si el modelo no razona, la interfaz
    avisa "Este modelo no permite cambiar la profundidad de razonamiento".
  - Claude local: instant = haiku + effort low; medium = sonnet + medium; high = sonnet + high.
    **Procesos pre-calentados**: uno esperando por nivel, así el arranque no se nota.
- **Streaming** NDJSON desde `/api/chat` con estados *Preparando… / Pensando… / Generando
  respuesta…*. Nunca se muestra el razonamiento interno. Sin esperas artificiales.
- **Preferencias**: `defaultReasoningLevel` (en el dispositivo; con cuentas irá al perfil) y nivel
  por conversación (se puede cambiar a mitad; no se regeneran respuestas anteriores).
- **Planes y costes**: `PLAN_POLICY` centraliza qué niveles tiene cada plan (hoy todos);
  `recordUsage` es el punto para medir tokens y tiempos por nivel.
- Longitud de respuesta ≠ razonamiento: Tocorito sigue respondiendo corto en todos los niveles.

## Resultados medidos (Claude local, con proceso pre-calentado)

| Nivel | Primer texto | Respuesta completa |
|---|---|---|
| Antes (sin pre-calentar) | ~8–10 s | ~10 s |
| Instantáneo | ~1–2 s | ~1,5–2,5 s |
| Medio | ~1–2,5 s | ~2,5–4 s |
| Alto | ~2,5–4 s | ~4–6 s |

## Consecuencias

- Futuro: "Auto" (elegir nivel según la pregunta), "Extra alto", límites por plan y estadísticas
  se añaden en `reasoning.ts` / `usage.ts` sin tocar la interfaz.
- Los procesos pre-calentados consumen memoria en desarrollo (3 procesos de Claude Code).
