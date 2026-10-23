"use client";

import { useEffect, useMemo, useState } from "react";
import { dayKey, groupByDay, monthGrid, monthTitle, WEEKDAYS } from "@/lib/calendar";
import { parseIcs } from "@/lib/ics";
import { eventsToTasks, type ContextLevel, type Task } from "@/lib/tasks";

// La URL del feed se guarda solo en este dispositivo. En la app móvil irá al almacenamiento
// seguro del sistema (Keychain / Keystore) en vez de localStorage.
const FEED_KEY = "tocorito.feedUrl";

const LEVEL: Record<ContextLevel, { label: string; className: string }> = {
  completo: { label: "Contexto completo", className: "bg-emerald-100 text-emerald-800" },
  parcial: { label: "Contexto parcial", className: "bg-amber-100 text-amber-800" },
  solo_titulo: { label: "Solo título", className: "bg-slate-200 text-slate-700" },
};

const KIND_COLOR = { tarea: "#1450d8", evento: "#f59e0b" } as const;

function readFeedUrl(): string | null {
  try {
    return localStorage.getItem(FEED_KEY);
  } catch {
    return null;
  }
}

function writeFeedUrl(url: string | null) {
  try {
    if (url) localStorage.setItem(FEED_KEY, url);
    else localStorage.removeItem(FEED_KEY);
  } catch {
    // Sin almacenamiento (modo privado): el calendario funciona igual, solo no se recuerda.
  }
}

function timeLabel(task: Task): string {
  if (!task.due || task.allDay || task.due.length === 10) return "Todo el día";
  return new Date(task.due).toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" });
}

export default function Calendario() {
  const today = new Date();
  const todayKey = dayKey(today);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState(todayKey);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [source, setSource] = useState<"url" | "file" | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byDay = useMemo(() => groupByDay(tasks ?? []), [tasks]);
  const grid = useMemo(() => monthGrid(view.year, view.month), [view]);
  const dayTasks = byDay.get(selected) ?? [];

  async function loadFromUrl(url: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo leer el calendario.");
      setTasks(data.tasks);
      setSource("url");
      writeFeedUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el calendario.");
    } finally {
      setLoading(false);
    }
  }

  // El archivo se lee en el dispositivo: no sale de él.
  async function loadFromFile(file: File) {
    const events = parseIcs(await file.text());
    if (events.length === 0) return setError("Ese archivo no tiene eventos de calendario.");
    setError(null);
    setTasks(eventsToTasks(events));
    setSource("file");
  }

  function disconnect() {
    writeFeedUrl(null);
    setTasks(null);
    setSource(null);
    setUrlInput("");
  }

  useEffect(() => {
    const saved = readFeedUrl();
    // Al abrir la pestaña: si ya conectaste Canvas en este dispositivo, cargamos tu calendario.
    if (saved) loadFromUrl(saved);
  }, []);

  function moveMonth(delta: number) {
    setView(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function goToday() {
    setView({ year: today.getFullYear(), month: today.getMonth() });
    setSelected(todayKey);
  }

  const selectedDate = new Date(`${selected}T00:00:00`);
  const selectedTitle = selectedDate.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex h-full flex-col bg-[#fdf8ef] font-sans text-[#0b1840]">
      <div className="flex h-1.5 shrink-0">
        <div className="flex-1 bg-[#0b1840]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#e5262b]" />
      </div>

      <header className="shrink-0 bg-[#1450d8] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <h1 className="flex-1 text-xl font-extrabold tracking-tight">{monthTitle(view.year, view.month)}</h1>
          <button
            onClick={goToday}
            className="min-h-11 rounded-full border-2 border-white/70 px-4 text-sm font-semibold active:bg-white/15"
          >
            Hoy
          </button>
          <IconButton label="Mes anterior" onClick={() => moveMonth(-1)} d="M15 18l-6-6 6-6" />
          <IconButton label="Mes siguiente" onClick={() => moveMonth(1)} d="M9 6l6 6-6 6" />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          {/* Cuadrícula del mes */}
          <section className="border-b-[3px] border-[#0b1840] bg-white px-2 pb-2 sm:px-4">
            <div className="grid grid-cols-7 py-2 text-center text-xs font-bold text-slate-500">
              {WEEKDAYS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {grid.map((date) => {
                const key = dayKey(date);
                const inMonth = date.getMonth() === view.month;
                const isToday = key === todayKey;
                const isSelected = key === selected;
                const items = byDay.get(key) ?? [];
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    aria-label={`${date.toLocaleDateString("es", { day: "numeric", month: "long" })}, ${items.length} elementos`}
                    aria-pressed={isSelected}
                    className={`mx-0.5 flex min-h-12 flex-col items-center justify-start gap-1 rounded-xl pt-1.5 transition-colors sm:min-h-16 ${
                      isSelected ? "bg-[#1450d8]/10 ring-2 ring-[#1450d8]" : "active:bg-slate-100"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                        isToday
                          ? "bg-[#e5262b] font-bold text-white"
                          : inMonth
                            ? "font-semibold text-[#0b1840]"
                            : "text-slate-300"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    <span className="flex h-1.5 gap-0.5">
                      {items.slice(0, 3).map((t) => (
                        <span key={t.id} className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLOR[t.kind] }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-center gap-4 pt-2 text-xs text-slate-500">
              <Legend color={KIND_COLOR.tarea} label="Tarea" />
              <Legend color={KIND_COLOR.evento} label="Examen / evento" />
              <Legend color="#e5262b" label="Hoy" />
            </div>
          </section>

          {/* Agenda del día seleccionado */}
          <section className="px-4 py-5 sm:px-6">
            <h2 className="text-lg font-bold first-letter:uppercase">{selectedTitle}</h2>
            {loading && <p className="mt-3 text-sm text-slate-500">Cargando tu calendario… ☕</p>}
            {!loading && tasks && dayTasks.length === 0 && (
              <p className="mt-3 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                Nada para este día. Hasta Tocorito se toma un descanso ☕
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-3">
              {dayTasks.map((task) => (
                <li key={task.id} className="flex overflow-hidden rounded-2xl border-2 border-[#0b1840] bg-white shadow-sm">
                  <div className="w-1.5 shrink-0" style={{ background: KIND_COLOR[task.kind] }} />
                  <div className="flex-1 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-snug">{task.title}</p>
                      <span className="shrink-0 text-xs font-semibold text-slate-500">{timeLabel(task)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      {task.course && (
                        <span className="rounded-full bg-[#1450d8] px-2 py-0.5 font-semibold text-white">{task.course}</span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize text-slate-600">{task.kind}</span>
                      <span className={`rounded-full px-2 py-0.5 ${LEVEL[task.contextLevel].className}`}>
                        {LEVEL[task.contextLevel].label}
                      </span>
                    </div>
                    {task.description && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-[#1450d8]">Ver descripción</summary>
                        <p className="mt-1 whitespace-pre-wrap text-slate-700">{task.description}</p>
                      </details>
                    )}
                    {task.url && (
                      <a
                        href={task.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-sm font-semibold text-[#e5262b]"
                      >
                        Abrir en Canvas →
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Conexión con Canvas */}
          <section className="px-4 pb-8 sm:px-6">
            {tasks ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
                <span className="font-semibold text-emerald-700">
                  ✓ {source === "file" ? "Archivo cargado" : "Canvas conectado"} · {tasks.length} elementos
                </span>
                <span className="flex-1" />
                {source === "url" && (
                  <button onClick={() => { const u = readFeedUrl(); if (u) loadFromUrl(u); }} className="min-h-11 font-semibold text-[#1450d8]">
                    Actualizar
                  </button>
                )}
                <button onClick={disconnect} className="min-h-11 font-semibold text-[#e5262b]">
                  Desconectar
                </button>
              </div>
            ) : (
              !loading && (
                <div className="rounded-3xl border-[3px] border-[#0b1840] bg-white p-5">
                  <h3 className="text-lg font-bold">Conecta tu Canvas</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    En Canvas ve a <b>Calendario → Feed de calendario</b> y copia la URL. Solo se guarda en este
                    dispositivo.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      loadFromUrl(urlInput);
                    }}
                    className="mt-4 flex flex-col gap-2 sm:flex-row"
                  >
                    <input
                      type="url"
                      required
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://tu-escuela.instructure.com/feeds/calendars/…"
                      autoComplete="off"
                      className="min-h-11 flex-1 rounded-full border-[3px] border-[#0b1840] bg-white px-4 text-sm outline-none focus:border-[#f59e0b]"
                    />
                    <button className="min-h-11 rounded-full border-[3px] border-[#0b1840] bg-[#e5262b] px-5 text-sm font-bold text-white">
                      Conectar
                    </button>
                  </form>
                  <label className="mt-3 block text-sm text-slate-600">
                    …o sube un archivo <code>.ics</code>:{" "}
                    <input
                      type="file"
                      accept=".ics,text/calendar"
                      onChange={(e) => e.target.files?.[0] && loadFromFile(e.target.files[0])}
                      className="text-sm"
                    />
                  </label>
                </div>
              )
            )}
            {error && (
              <p className="mt-3 rounded-xl border-2 border-[#e5262b] bg-red-50 px-3 py-2 text-sm text-[#b81d21]">{error}</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function IconButton({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full active:bg-white/15"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
