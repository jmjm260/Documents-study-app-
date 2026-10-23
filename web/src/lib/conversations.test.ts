import { describe, expect, it } from "vitest";
import { MAX_CONVERSATIONS, newConversation, titleFor, toStored, upsert, whenLabel, type Conversation } from "./conversations";

const conv = (over: Partial<Conversation> = {}): Conversation => ({ ...newConversation(1000), ...over });

describe("titleFor", () => {
  it("usa el primer mensaje del estudiante, recortado", () => {
    expect(titleFor([{ role: "user", content: "  explícame   la fotosíntesis " }])).toBe("explícame la fotosíntesis");
    expect(titleFor([{ role: "user", content: "x".repeat(80) }])).toHaveLength(48);
  });
  it("si solo mandó una foto, se llama 'Foto'", () => {
    expect(titleFor([{ role: "user", content: "", images: ["data:image/jpeg;base64,AA=="] }])).toBe("Foto");
  });
  it("sin mensajes es 'Nuevo chat'", () => {
    expect(titleFor([])).toBe("Nuevo chat");
  });
});

describe("toStored", () => {
  it("guarda las fotos en miniatura", () => {
    const c = conv({ messages: [{ role: "user", content: "mira", images: ["GRANDE"], thumbs: ["mini"] }] });
    expect(toStored(c).messages[0]).toEqual({ role: "user", content: "mira", images: ["mini"] });
  });
});

describe("upsert", () => {
  it("pone la más reciente primero y no guarda chats vacíos", () => {
    const a = conv({ id: "a", updatedAt: 1, messages: [{ role: "user", content: "a" }] });
    const b = conv({ id: "b", updatedAt: 2, messages: [{ role: "user", content: "b" }] });
    expect(upsert(upsert([], a), b).map((c) => c.id)).toEqual(["b", "a"]);
    expect(upsert([a], conv({ id: "a", messages: [] }))).toEqual([]);
  });
  it(`guarda como mucho ${MAX_CONVERSATIONS}`, () => {
    let list: Conversation[] = [];
    for (let i = 0; i < MAX_CONVERSATIONS + 5; i++) list = upsert(list, conv({ id: `c${i}`, updatedAt: i, messages: [{ role: "user", content: "x" }] }));
    expect(list).toHaveLength(MAX_CONVERSATIONS);
    expect(list[0].id).toBe(`c${MAX_CONVERSATIONS + 4}`);
  });
});

describe("whenLabel", () => {
  const now = new Date("2026-10-23T15:00:00");
  it("hoy, ayer o fecha", () => {
    expect(whenLabel(new Date("2026-10-23T09:05:00").getTime(), now)).toMatch(/^Hoy /);
    expect(whenLabel(new Date("2026-10-22T09:05:00").getTime(), now)).toBe("Ayer");
    expect(whenLabel(new Date("2026-10-12T09:05:00").getTime(), now)).toMatch(/12/);
  });
});
