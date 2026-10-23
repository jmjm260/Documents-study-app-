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
    expect(visibleReplies('Listo ☕\n[[CALENDARIO]]{"tipo":"exa')).toEqual(["Listo ☕"]);
    expect(visibleReplies("Listo ☕\n[[CALEN")).toEqual(["Listo ☕"]);
    expect(visibleReplies("Listo ☕\n[")).toEqual(["Listo ☕"]);
  });

  it("oculta bloques completos", () => {
    expect(visibleReplies('a [[CALENDARIO]]{"x":1}[[/CALENDARIO]] b')).toEqual(["a  b"]);
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
