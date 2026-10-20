"use client";

import { useState } from "react";
import { parseIcs } from "@/lib/ics";
import { eventsToTasks, type ContextLevel, type Task } from "@/lib/tasks";

const LEVEL_STYLE: Record<ContextLevel, { label: string; className: string }> = {
  completo: { label: "Completo", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  parcial: { label: "Parcial", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  solo_titulo: { label: "Solo título", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

function formatDue(task: Task): string {
  if (!task.due) return "Sin fecha";
  const date = new Date(task.due.length === 10 ? `${task.due}T00:00:00` : task.due);
  return date.toLocaleString("es", task.allDay ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" });
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [fieldsSeen, setFieldsSeen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function show(result: { tasks: Task[]; fieldsSeen: string[] }) {
    setTasks(result.tasks);
    setFieldsSeen(result.fieldsSeen);
    setError(null);
  }

  async function loadFromUrl(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/calendar/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al leer el feed.");
      show(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al leer el feed.");
    } finally {
      setLoading(false);
    }
  }

  // El archivo se lee en el navegador: no sale de tu computadora.
  async function loadFromFile(file: File) {
    const events = parseIcs(await file.text());
    if (events.length === 0) return setError("Ese archivo no tiene eventos de calendario.");
    show({ tasks: eventsToTasks(events), fieldsSeen: [...new Set(events.flatMap((ev) => Object.keys(ev.raw)))].sort() });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 font-sans">
      <h1 className="text-2xl font-semibold">Inspector de calendario de Canvas</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        En Canvas ve a <b>Calendario → Feed de calendario</b> y copia la URL. No guardamos nada: solo
        mostramos qué información trae, y qué nivel de contexto tendría el tutor para cada tarea.
      </p>

      <form onSubmit={loadFromUrl} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://tu-escuela.instructure.com/feeds/calendars/user_….ics"
          autoComplete="off"
          className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        />
        <button
          disabled={loading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "Leyendo…" : "Ver tareas"}
        </button>
      </form>

      <label className="mt-3 block text-sm text-zinc-600 dark:text-zinc-400">
        …o sube un archivo <code>.ics</code>:{" "}
        <input
          type="file"
          accept=".ics,text/calendar"
          onChange={(e) => e.target.files?.[0] && loadFromFile(e.target.files[0])}
          className="text-sm"
        />
      </label>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      {tasks && (
        <section className="mt-8">
          <h2 className="font-medium">{tasks.length} elementos encontrados</h2>
          <p className="mt-1 text-xs text-zinc-500">Campos que trae el feed: {fieldsSeen.join(", ") || "ninguno"}</p>

          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {tasks.map((task) => (
              <li key={task.id || task.title + task.due} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{task.title}</span>
                  {task.course && <span className="text-xs text-zinc-500">{task.course}</span>}
                  <span className={`rounded px-1.5 py-0.5 text-xs ${LEVEL_STYLE[task.contextLevel].className}`}>
                    {LEVEL_STYLE[task.contextLevel].label}
                  </span>
                  <span className="text-xs text-zinc-500">{task.kind}</span>
                </div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{formatDue(task)}</div>
                {task.description && (
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-zinc-500">Descripción ({task.description.length} caracteres)</summary>
                    <p className="mt-1 whitespace-pre-wrap">{task.description}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
