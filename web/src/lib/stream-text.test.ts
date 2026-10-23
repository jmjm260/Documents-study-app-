import { describe, expect, it } from "vitest";
import { visibleReplies } from "./stream-text";
import { resolveLevel } from "./ai/reasoning";
import { openaiReasoningConfig, supportsReasoning } from "./ai/openai";
import { claudeReasoningConfig } from "./ai/claude-local";

describe("visibleReplies (texto mientras llega)", () => {
  it("parte en burbujas como la versión final", () => {
    expect(visibleReplies("Hola asere\n|||\nQué estudiamos")).toEqual(["Hola asere", "Qué estudiamos"]);
  });

  it("oculta un bloque de calendario a medio llegar", () => {
    expect(visibleReplies('Listo ☕\n[[CALENDARIO]]{"tipo":"exa')).toEqual(["Listo"]);
    expect(visibleReplies("Listo ☕\n[[CALEN")).toEqual(["Listo"]);
    expect(visibleReplies("Listo ☕\n[")).toEqual(["Listo"]);
  });

  it("oculta bloques completos", () => {
    expect(visibleReplies('a [[CALENDARIO]]{"x":1}[[/CALENDARIO]] b')).toEqual(["a b"]);
  });

  it("no enseña un separador a medio llegar", () => {
    expect(visibleReplies("Hola\n||")).toEqual(["Hola"]);
  });

  it("sin texto visible todavía → nada", () => {
    expect(visibleReplies("[[CALENDARIO]]{")).toEqual([]);
  });
});

describe("niveles de razonamiento", () => {
  it("valores raros caen al nivel por defecto", () => {
    expect(resolveLevel("high")).toBe("high");
    expect(resolveLevel("ultra")).toBe("medium");
    expect(resolveLevel(undefined)).toBe("medium");
  });

  it("OpenAI: solo los modelos de razonamiento reciben reasoning_effort", () => {
    expect(supportsReasoning("gpt-5-mini")).toBe(true);
    expect(supportsReasoning("gpt-4.1-mini")).toBe(false);
    expect(openaiReasoningConfig("gpt-5-mini", "instant")).toMatchObject({ reasoning_effort: "minimal" });
    expect(openaiReasoningConfig("gpt-5-mini", "high")).toMatchObject({ reasoning_effort: "high" });
    expect(openaiReasoningConfig("gpt-4.1-mini", "high")).not.toHaveProperty("reasoning_effort");
  });

  it("Claude local: el nivel cambia modelo y esfuerzo, no añade esperas", () => {
    expect(claudeReasoningConfig("instant")).toEqual({ model: "haiku", effort: "low" });
    expect(claudeReasoningConfig("high").effort).toBe("high");
  });
});

describe("fotos hacia los proveedores", async () => {
  const { toOpenAIMessage } = await import("./ai/openai");
  const { userContent } = await import("./ai/claude-local");
  const img = "data:image/png;base64,iVBORw0KGgo=";

  it("OpenAI: texto + image_url", () => {
    expect(toOpenAIMessage({ role: "user", content: "resuelve", images: [img] })).toEqual({
      role: "user",
      content: [{ type: "text", text: "resuelve" }, { type: "image_url", image_url: { url: img, detail: "high" } }],
    });
  });

  it("Claude local: bloque de texto + bloque de imagen base64", () => {
    const content = userContent([{ role: "user", content: "resuelve", images: [img] }], "");
    expect(Array.isArray(content) && content[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } });
  });

  it("sin fotos, todo sigue siendo texto", () => {
    expect(typeof userContent([{ role: "user", content: "hola" }], "")).toBe("string");
  });
});

describe("typingSafe (letra a letra)", async () => {
  const { typingSafe } = await import("./stream-text");
  it("no enseña una fórmula a medio escribir", () => {
    expect(typingSafe("La fracción es $\frac{1")).toBe("La fracción es");
  });
  it("las fórmulas completas se quedan", () => {
    expect(typingSafe("Es $x = 4$ y listo")).toBe("Es $x = 4$ y listo");
  });
  it("un $$ de bloque abierto también se esconde", () => {
    expect(typingSafe("Mira: $$F = m")).toBe("Mira:");
  });
});

describe("bloques de quitar mientras llegan", () => {
  it("no se ven en el globo", () => {
    expect(visibleReplies('Listo, quitado.\n[[QUITAR]]{"id":"ab')).toEqual(["Listo, quitado."]);
  });
});

describe("errores de Claude local con mensaje claro", async () => {
  const { friendlyClaudeError } = await import("./ai/claude-local");
  it("límite de uso de la cuenta", () => {
    expect(friendlyClaudeError("Claude AI usage limit reached|1761300000")).toMatch(/límite de uso/);
  });
  it("sesión cerrada", () => {
    expect(friendlyClaudeError("Not logged in · Please run /login")).toMatch(/sesión/);
  });
  it("saturado", () => {
    expect(friendlyClaudeError("API Error: 529 Overloaded")).toMatch(/saturado/);
  });
  it("otro error", () => {
    expect(friendlyClaudeError("algo raro")).toMatch(/no pudo responder/);
  });
});
