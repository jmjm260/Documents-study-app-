import { describe, expect, it } from "vitest";
import { parseIcs, parseIcsDate } from "./ics";
import { contextLevelFor, eventsToTasks, splitCourse } from "./tasks";

// Ejemplo con la forma de un feed de Canvas (datos inventados).
const SAMPLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Instructure//Canvas//EN",
  "BEGIN:VEVENT",
  "UID:event-assignment-1001",
  "DTSTART:20261024T035900Z",
  "DTEND:20261024T035900Z",
  "SUMMARY:Ensayo argumentativo [ENG 101]",
  "DESCRIPTION:Escribe un ensayo de 800 palabras sobre el cambio climático\\, con t",
  " res fuentes.\\nUsa formato MLA.",
  "URL;VALUE=URI:https://escuela.instructure.com/courses/1/assignments/1001",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:event-calendar-event-77",
  "DTSTART;VALUE=DATE:20261021",
  "SUMMARY:Examen parcial [MAT 201]",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcsDate", () => {
  it("distingue día completo de fecha con hora", () => {
    expect(parseIcsDate("20261021")).toEqual({ iso: "2026-10-21", allDay: true });
    expect(parseIcsDate("20261024T035900Z")).toEqual({ iso: "2026-10-24T03:59:00Z", allDay: false });
    expect(parseIcsDate("basura")).toBeNull();
  });
});

describe("parseIcs", () => {
  it("lee eventos, une líneas dobladas y quita escapes", () => {
    const events = parseIcs(SAMPLE);
    expect(events).toHaveLength(2);
    expect(events[0].description).toBe(
      "Escribe un ensayo de 800 palabras sobre el cambio climático, con tres fuentes.\nUsa formato MLA."
    );
    expect(events[0].url).toBe("https://escuela.instructure.com/courses/1/assignments/1001");
    expect(events[1].allDay).toBe(true);
  });

  it("ignora texto que no es un calendario", () => {
    expect(parseIcs("<html>login</html>")).toEqual([]);
  });
});

describe("tareas", () => {
  it("separa curso, tipo y nivel de contexto, y ordena por fecha", () => {
    const tasks = eventsToTasks(parseIcs(SAMPLE));
    expect(tasks.map((t) => t.title)).toEqual(["Examen parcial", "Ensayo argumentativo"]);
    expect(tasks[0]).toMatchObject({ course: "MAT 201", kind: "evento", contextLevel: "solo_titulo" });
    expect(tasks[1]).toMatchObject({ course: "ENG 101", kind: "tarea", contextLevel: "parcial" });
  });

  it("nunca marca 'completo' desde el feed", () => {
    expect(contextLevelFor("x".repeat(5000))).toBe("parcial");
  });

  it("deja el título intacto si no hay curso", () => {
    expect(splitCourse("Reunión")).toEqual({ title: "Reunión", course: null });
  });
});
