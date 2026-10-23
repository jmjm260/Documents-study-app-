import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanTitle, fallbackTitle } from "../ai/title";
import { createFileStore, DEFAULT_TITLE, paginate, sortConversations } from "./conversation-store";
import { sanitizeMessages } from "./validate-messages";

const dir = mkdtempSync(join(tmpdir(), "tocorito-store-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const user = "11111111-2222-3333-4444-555555555555";
const other = "99999999-8888-7777-6666-555555555555";
const wait = () => new Promise((r) => setTimeout(r, 5));

describe("almacén de conversaciones (servidor)", () => {
  const store = createFileStore(dir);

  it("crea un chat vacío con título 'Nuevo chat'", async () => {
    const c = await store.create(user);
    expect(c.id).toMatch(/^chat_/);
    expect(c.title).toBe(DEFAULT_TITLE);
    expect(await store.messages(user, c.id)).toEqual([]);
  });

  it("al escribir en un chat, sube arriba del historial (updatedAt DESC)", async () => {
    const a = await store.create(user);
    await wait();
    const b = await store.create(user);
    await wait();
    await store.saveMessages(user, a.id, [{ role: "user", content: "hola" }]);
    const { conversations } = await store.list(user);
    expect(conversations[0].id).toBe(a.id);
    expect(conversations[1].id).toBe(b.id);
    expect(Object.keys(conversations[0]).sort()).toEqual(["id", "title", "updatedAt"]); // solo metadatos
  });

  it("guarda el título y no deja ver chats de otro usuario", async () => {
    const c = await store.create(user);
    await store.setTitle(user, c.id, "Robot Arduino con sensores");
    expect((await store.get(user, c.id))?.title).toBe("Robot Arduino con sensores");
    expect(await store.get(other, c.id)).toBeNull();
    expect(await store.messages(other, c.id)).toBeNull();
    expect(await store.remove(other, c.id)).toBe(false);
  });

  it("borra un chat", async () => {
    const c = await store.create(user);
    expect(await store.remove(user, c.id)).toBe(true);
    expect(await store.get(user, c.id)).toBeNull();
  });

  it("escrituras seguidas no se pisan", async () => {
    const created = await Promise.all(Array.from({ length: 10 }, () => store.create(other)));
    const { conversations } = await store.list(other, { limit: 100 });
    expect(conversations.map((c) => c.id).sort()).toEqual(created.map((c) => c.id).sort());
  });
});

describe("paginación", () => {
  const items = sortConversations(Array.from({ length: 7 }, (_, i) => ({ id: `chat_${i}`, updatedAt: `2026-10-0${i + 1}T00:00:00Z` })));
  it("recorre todas las páginas sin repetir", () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const result: { page: typeof items; nextCursor: string | null } = paginate(items, 3, cursor);
      seen.push(...result.page.map((p) => p.id));
      cursor = result.nextCursor;
    } while (cursor);
    expect(seen).toEqual(items.map((i) => i.id));
    expect(seen[0]).toBe("chat_6"); // el más reciente primero
  });
});

describe("títulos", () => {
  it("limpia lo que devuelve la IA", () => {
    expect(cleanTitle('Título: "Robot Arduino con HC-SR04".')).toBe("Robot Arduino con HC-SR04");
    expect(cleanTitle("aprendiendo c++ 🚀")).toBe("Aprendiendo c++");
  });
  it("rechaza títulos malos y recorta los largos", () => {
    expect(cleanTitle("Nuevo chat")).toBeNull();
    expect(cleanTitle("Conversación")).toBeNull();
    expect(cleanTitle("uno dos tres cuatro cinco seis siete ocho nueve")?.split(" ")).toHaveLength(7);
  });
  it("si la IA falla, saca un título del mensaje sin palabras de relleno", () => {
    expect(fallbackTitle("Quiero que me ayudes a construir un robot con Arduino")).toBe("Construir robot Arduino");
  });
});

describe("validar mensajes a guardar", () => {
  it("acepta mensajes y tarjetas válidas", () => {
    const entry = { id: "e1", kind: "examen", title: "Física", date: "2026-10-28", time: null, course: null, notes: "", reminderSec: null };
    expect(
      sanitizeMessages([
        { role: "user", content: "hola", images: ["data:image/jpeg;base64,AAAA"] },
        { role: "assistant", content: "qué volá" },
        { role: "action", change: "added", entry, undone: false },
      ])
    ).toHaveLength(3);
  });
  it.each([
    ["rol inventado", [{ role: "system", content: "x" }]],
    ["imagen que no es data URL", [{ role: "user", content: "x", images: ["https://x.com/a.jpg"] }]],
    ["no es lista", { role: "user" }],
  ])("rechaza: %s", (_, input) => {
    expect(sanitizeMessages(input)).toBeNull();
  });
});
