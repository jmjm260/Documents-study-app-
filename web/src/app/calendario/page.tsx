"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CanvasConnect from "@/components/calendar/CanvasConnect";
import DayAgenda from "@/components/calendar/DayAgenda";
import EntryForm from "@/components/calendar/EntryForm";
import MonthGrid from "@/components/calendar/MonthGrid";
import Sheet from "@/components/Sheet";
import { dayKey, monthGrid } from "@/lib/calendar";
import {
  ENTRIES_CHANGED,
  hideCanvas,
  itemsByDay,
  KIND_INFO,
  loadCanvasCache,
  loadEntries,
  loadHiddenCanvas,
  newEntryId,
  saveCanvasCache,
  saveEntries,
  toCalendarItems,
  unhideCanvas,
  type CalendarItem,
  type Entry,
  type EntryDraft,
} from "@/lib/entries";
import { parseIcs } from "@/lib/ics";
import { requestNotificationPermission } from "@/lib/reminders";
import { eventsToTasks, type Task } from "@/lib/tasks";

// La URL del feed se guarda solo en este dispositivo. En la app móvil irá al almacenamiento
// seguro del sistema (Keychain / Keystore) en vez de localStorage.
const FEED_KEY = "tocorito.feedUrl";

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
    // Sin almacenamiento (modo privado): funciona igual, solo no se recuerda.
  }
}

type SheetState = { type: "new" } | { type: "edit"; entry: Entry } | { type: "canvas" } | null;

export default function Calendario() {
  const today = new Date();
  const todayKey = dayKey(today);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState(todayKey);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  // Cosas de Canvas que el estudiante (o Tocorito) ocultó del calendario.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<"url" | "file" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);

  const days = useMemo(() => monthGrid(view.year, view.month), [view]);
  const byDay = useMemo(() => itemsByDay(toCalendarItems(tasks, entries, hidden)), [tasks, entries, hidden]);

  const loadFromUrl = useCallback(async (url: string) => {
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
      saveCanvasCache(data.tasks);
      setSource("url");
      writeFeedUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el calendario.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Al abrir: recuperamos lo guardado en este dispositivo (y lo último de Canvas, al instante).
  useEffect(() => {
    setEntries(loadEntries());
    setHidden(loadHiddenCanvas());
    // "Ver en calendario" desde el chat abre /calendario?dia=AAAA-MM-DD
    const dia = new URLSearchParams(window.location.search).get("dia");
    if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) {
      const d = new Date(`${dia}T00:00:00`);
      setSelected(dia);
      setView({ year: d.getFullYear(), month: d.getMonth() });
    }
    const cached = loadCanvasCache();
    if (cached.length) setTasks(cached);
    const saved = readFeedUrl();
    if (saved) loadFromUrl(saved);
    // Si Tocorito pone o quita algo desde el chat, el calendario se entera.
    const refresh = () => {
      setEntries(loadEntries());
      setHidden(loadHiddenCanvas());
    };
    window.addEventListener(ENTRIES_CHANGED, refresh);
    return () => window.removeEventListener(ENTRIES_CHANGED, refresh);
  }, [loadFromUrl]);

  // El archivo se lee en el dispositivo: no sale de él.
  async function loadFromFile(file: File) {
    const events = parseIcs(await file.text());
    if (events.length === 0) return setError("Ese archivo no tiene eventos de calendario.");
    setError(null);
    const fileTasks = eventsToTasks(events);
    setTasks(fileTasks);
    saveCanvasCache(fileTasks);
    setSource("file");
  }

  function disconnect() {
    writeFeedUrl(null);
    saveCanvasCache(null);
    setTasks([]);
    setSource(null);
  }

  function updateEntries(next: Entry[]) {
    setEntries(next);
    saveEntries(next);
  }

  function saveDraft(draft: EntryDraft) {
    if (draft.reminderSec !== null) requestNotificationPermission();
    if (sheet?.type === "edit") {
      updateEntries(entries.map((e) => (e.id === sheet.entry.id ? { ...draft, id: e.id } : e)));
    } else {
      updateEntries([...entries, { ...draft, id: newEntryId() }]);
    }
    setSelected(draft.date);
    const d = new Date(`${draft.date}T00:00:00`);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setSheet(null);
  }

  function deleteEntry(id: string) {
    updateEntries(entries.filter((e) => e.id !== id));
    setSheet(null);
  }

  /** Papelera de la agenda: lo propio se borra; lo de Canvas se oculta de este calendario. */
  function removeItem(item: CalendarItem) {
    if (item.entry) deleteEntry(item.entry.id);
    else if (item.source === "canvas") hideCanvas(item.id.replace(/^canvas:/, ""));
  }

  function moveMonth(delta: number) {
    setView(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function select(key: string) {
    setSelected(key);
    const d = new Date(`${key}T00:00:00`);
    if (d.getMonth() !== view.month) setView({ year: d.getFullYear(), month: d.getMonth() });
  }

  const monthName = new Date(view.year, view.month, 1).toLocaleDateString("es", { month: "long" });
  const selectedTitle = new Date(`${selected}T00:00:00`).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  const closeSheet = useCallback(() => setSheet(null), []);

  return (
    <div className="relative flex h-full flex-col bg-black font-sans text-white [color-scheme:dark]">
      <div className="flex h-1 shrink-0">
        <div className="flex-1 bg-[#1450d8]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#e5262b]" />
      </div>

      <header className="shrink-0 border-b border-white/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.14em] text-[#6ea0ff]">
              Calendario <span className="sm:hidden">· {view.year}</span>
            </p>
            <h1 className="truncate text-xl font-extrabold capitalize tracking-tight sm:text-2xl">
              {monthName} <span className="hidden font-semibold text-slate-500 sm:inline">{view.year}</span>
            </h1>
          </div>
          <button
            onClick={() => setSheet({ type: "canvas" })}
            className="flex min-h-10 items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs font-semibold text-slate-200 active:bg-white/10"
          >
            <span className={`h-2 w-2 rounded-full ${source ? "bg-emerald-400" : "bg-slate-600"}`} />
            Canvas
          </button>
          <button
            onClick={() => {
              setView({ year: today.getFullYear(), month: today.getMonth() });
              setSelected(todayKey);
            }}
            className="min-h-10 rounded-full border border-white/15 px-3 text-xs font-semibold text-slate-200 active:bg-white/10"
          >
            Hoy
          </button>
          <div className="flex">
            <ArrowButton label="Mes anterior" d="M15 18l-6-6 6-6" onClick={() => moveMonth(-1)} />
            <ArrowButton label="Mes siguiente" d="M9 6l6 6-6 6" onClick={() => moveMonth(1)} />
          </div>
          <button
            onClick={() => setSheet({ type: "new" })}
            className="ml-1 hidden min-h-10 items-center gap-1 rounded-full bg-[#e5262b] px-4 text-sm font-bold text-white active:bg-[#c81f24] sm:flex"
          >
            <span className="text-lg leading-none">+</span> Añadir
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto lg:flex lg:overflow-hidden">
        <section className="lg:min-w-0 lg:flex-1 lg:overflow-y-auto">
          <MonthGrid days={days} month={view.month} todayKey={todayKey} selected={selected} byDay={byDay} onSelect={select} />
          <Legend />
        </section>
        <aside className="bg-[#0b0b0d] pb-24 sm:pb-6 lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-white/10">
          {loading && <p className="px-6 pt-4 text-xs font-medium text-slate-500">Actualizando Canvas…</p>}
          {error && !sheet && (
            <button
              onClick={() => setSheet({ type: "canvas" })}
              className="mx-4 mt-4 block rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-left text-sm text-red-300 sm:mx-6"
            >
              {error}
            </button>
          )}
          <DayAgenda
            title={selectedTitle}
            items={byDay.get(selected) ?? []}
            onAdd={() => setSheet({ type: "new" })}
            onEdit={(item: CalendarItem) => item.entry && setSheet({ type: "edit", entry: item.entry })}
            onDelete={removeItem}
          />
        </aside>
      </div>

      {/* Botón flotante en móvil */}
      <button
        onClick={() => setSheet({ type: "new" })}
        aria-label="Añadir tarea, examen o nota"
        className="absolute bottom-4 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#e5262b] text-white shadow-lg shadow-[#e5262b]/30 active:scale-95 sm:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {sheet?.type === "new" && (
        <Sheet title="Nueva anotación" onClose={closeSheet} dark>
          <EntryForm
            initial={{ kind: "tarea", title: "", date: selected, time: null, course: null, notes: "", reminderSec: null }}
            onSave={saveDraft}
          />
        </Sheet>
      )}
      {sheet?.type === "edit" && (
        <Sheet title="Editar anotación" onClose={closeSheet} dark>
          <EntryForm initial={sheet.entry} onSave={saveDraft} onDelete={() => deleteEntry(sheet.entry.id)} />
        </Sheet>
      )}
      {sheet?.type === "canvas" && (
        <Sheet title="Calendario de Canvas" onClose={closeSheet} dark>
          <CanvasConnect
            connected={source}
            count={tasks.length}
            hiddenCount={tasks.filter((t) => hidden.has(t.id)).length}
            loading={loading}
            error={error}
            onConnect={loadFromUrl}
            onFile={loadFromFile}
            onRefresh={() => {
              const url = readFeedUrl();
              if (url) loadFromUrl(url);
            }}
            onShowHidden={() => unhideCanvas()}
            onDisconnect={disconnect}
          />
        </Sheet>
      )}
    </div>
  );
}

function ArrowButton({ label, d, onClick }: { label: string; d: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-300 active:bg-white/10">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    </button>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-b border-white/10 py-2.5 text-[11px] font-medium text-slate-400 lg:border-b-0">
      {(Object.keys(KIND_INFO) as (keyof typeof KIND_INFO)[]).map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: KIND_INFO[k].ink }} />
          {KIND_INFO[k].label}
        </span>
      ))}
    </div>
  );
}
