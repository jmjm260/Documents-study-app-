import { describe, expect, it } from "vitest";
import { extractCoffee } from "./coffee";
import { visibleReplies } from "./stream-text";

describe("extractCoffee", () => {
  it("quita la marca [[CAFE]] y avisa de que toca animar", () => {
    expect(extractCoffee("[[CAFE]] Ya ni me sorprende.")).toEqual({ text: "Ya ni me sorprende.", sip: true });
  });

  it("quita acciones de café escritas a mano", () => {
    expect(extractCoffee("*suspiro largo* Ah, mañana. *sorbo largo y triste* Qué plan.")).toEqual({
      text: "*suspiro largo* Ah, mañana. Qué plan.",
      sip: true,
    });
  });

  it("quita frases de 'déjame darle un sorbo' y el emoji de café", () => {
    expect(extractCoffee("Tremendo, asere. Déjame darle un sorbo al café y vamos ☕\nLa célula es…")).toEqual({
      text: "Tremendo, asere.\nLa célula es…",
      sip: true,
    });
  });

  it("no toca el texto normal", () => {
    expect(extractCoffee("La fotosíntesis convierte luz en energía.")).toEqual({
      text: "La fotosíntesis convierte luz en energía.",
      sip: false,
    });
  });

  it("mientras llega en streaming tampoco se ve la marca", () => {
    expect(visibleReplies("[[CAFE]] Hola asere")).toEqual(["Hola asere"]);
    expect(visibleReplies("[[CA")).toEqual([]);
  });
});
