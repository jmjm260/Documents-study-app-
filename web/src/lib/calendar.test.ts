import { describe, expect, it } from "vitest";
import { dayKey, groupByDay, monthGrid, taskDayKey } from "./calendar";
import type { Task } from "./tasks";

const task = (over: Partial<Task>): Task => ({
  id: "x",
  title: "Tarea",
  course: null,
  kind: "tarea",
  due: null,
  allDay: false,
  description: "",
  url: "",
  contextLevel: "solo_titulo",
  ...over,
});

describe("monthGrid", () => {
  it("octubre 2026 empieza el lunes 28 de septiembre y tiene 42 días", () => {
    const grid = monthGrid(2026, 9);
    expect(grid).toHaveLength(42);
    expect(dayKey(grid[0])).toBe("2026-09-28");
    expect(grid[0].getDay()).toBe(1); // lunes
    expect(grid.filter((d) => d.getMonth() === 9)).toHaveLength(31);
  });

  it("un mes que empieza en lunes no añade días del mes anterior", () => {
    expect(dayKey(monthGrid(2026, 5)[0])).toBe("2026-06-01");
  });
});

describe("taskDayKey", () => {
  it("las de día completo usan su fecha tal cual", () => {
    expect(taskDayKey(task({ due: "2026-10-21", allDay: true }))).toBe("2026-10-21");
  });

  it("las que tienen hora usan el día local", () => {
    const due = "2026-10-24T15:00:00";
    expect(taskDayKey(task({ due }))).toBe(dayKey(new Date(due)));
  });

  it("sin fecha no tiene día", () => {
    expect(taskDayKey(task({ due: null }))).toBeNull();
  });
});

describe("groupByDay", () => {
  it("agrupa tareas por día e ignora las que no tienen fecha", () => {
    const groups = groupByDay([
      task({ id: "a", due: "2026-10-21", allDay: true }),
      task({ id: "b", due: "2026-10-21", allDay: true }),
      task({ id: "c", due: null }),
    ]);
    expect(groups.get("2026-10-21")?.map((t) => t.id)).toEqual(["a", "b"]);
    expect(groups.size).toBe(1);
  });
});
