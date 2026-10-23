"use client";

// Lista de lo que hay en el día elegido: hora a la izquierda, barra de color y detalles.
// Lo propio se puede editar (tocar) o quitar (papelera); lo de Canvas se puede ocultar.
import { useState } from "react";
import { BellIcon } from "@/components/calendar/EntryForm";
import { TrashIcon } from "@/components/chat/ActionCard";
import { describeReminder, KIND_INFO, type CalendarItem } from "@/lib/entries";

const LEVEL_LABEL = { completo: "Contexto completo", parcial: "Contexto parcial", solo_titulo: "Solo título" } as const;

export default function DayAgenda({
  title,
  items,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  items: CalendarItem[];
  onAdd: () => void;
  onEdit: (item: CalendarItem) => void;
  onDelete: (item: CalendarItem) => void;
}) {
  return (
    <section className="px-4 py-5 sm:px-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-white first-letter:uppercase">{title}</h2>
        <span className="text-xs font-medium text-slate-500">
          {items.length === 0 ? "Sin pendientes" : `${items.length} ${items.length === 1 ? "elemento" : "elementos"}`}
        </span>
      </div>

      {items.length === 0 ? (
        <button
          onClick={onAdd}
          className="mt-3 w-full rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-slate-400 active:bg-white/5"
        >
          Nada por aquí. Hasta Tocorito se toma un descanso.
          <span className="mt-1 block font-semibold text-[#6ea0ff]">+ Añadir algo a este día</span>
        </button>
      ) : (
        <ul className="mt-3 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-[#141416]">
          {items.map((item) => (
            <li key={item.id}>
              <AgendaRow item={item} onEdit={onEdit} onDelete={onDelete} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AgendaRow({
  item,
  onEdit,
  onDelete,
}: {
  item: CalendarItem;
  onEdit: (item: CalendarItem) => void;
  onDelete: (item: CalendarItem) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const info = KIND_INFO[item.kind];
  const body = (
    <div className="flex gap-3 px-3 py-3 text-left">
      <div className="w-12 shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-slate-400">
        {item.time ?? <span className="text-[10px] uppercase tracking-wide">Todo el día</span>}
      </div>
      <div className="w-[3px] shrink-0 rounded-full" style={{ background: info.ink }} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-white">{item.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
          <span className="font-semibold" style={{ color: info.ink }}>{info.label}</span>
          {item.course && <><span>·</span><span>{item.course}</span></>}
          <span>·</span>
          <span>{item.source === "canvas" ? "Canvas" : "Personal"}</span>
          {item.contextLevel && <><span>·</span><span>{LEVEL_LABEL[item.contextLevel]}</span></>}
          {item.entry?.reminderSec != null && (
            <span className="flex items-center gap-0.5 font-semibold text-[#6ea0ff]">
              <span>·</span>
              <BellIcon className="h-3 w-3" />
              {describeReminder(item.entry.reminderSec)}
            </span>
          )}
        </p>
        {item.source === "usuario" && item.description && (
          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-slate-300">{item.description}</p>
        )}
      </div>
    </div>
  );

  // Papelera: lo propio se quita; lo de Canvas se oculta de este calendario (en Canvas sigue).
  const isCanvas = item.source === "canvas";
  const removeControl = confirming ? (
    <div className="flex shrink-0 items-center gap-1 pr-2 pt-2">
      <button onClick={() => setConfirming(false)} className="min-h-10 rounded-full px-2.5 text-xs font-semibold text-slate-400 active:bg-white/10">
        No
      </button>
      <button
        onClick={() => {
          setConfirming(false);
          onDelete(item);
        }}
        className="min-h-10 rounded-full bg-[#e5262b] px-3 text-xs font-bold text-white"
      >
        {isCanvas ? "Ocultar" : "Quitar"}
      </button>
    </div>
  ) : (
    <button
      onClick={() => setConfirming(true)}
      aria-label={isCanvas ? `Ocultar ${item.title} del calendario` : `Quitar ${item.title} del calendario`}
      className="flex w-11 shrink-0 items-start justify-center pt-3 text-slate-500 hover:text-[#ff6b6b] active:bg-white/5"
    >
      <TrashIcon className="h-[18px] w-[18px]" />
    </button>
  );

  if (!isCanvas) {
    return (
      <div className="flex items-stretch">
        <button onClick={() => onEdit(item)} className="block min-w-0 flex-1 active:bg-white/5" aria-label={`Editar ${item.title}`}>
          {body}
        </button>
        {removeControl}
      </div>
    );
  }
  return (
    <div className="flex items-start">
      <details className="group min-w-0 flex-1">
        <summary className="cursor-pointer list-none active:bg-white/5 [&::-webkit-details-marker]:hidden">{body}</summary>
        <div className="pb-3 pl-[4.5rem] pr-4 text-sm">
          {item.description ? (
            <p className="whitespace-pre-wrap text-slate-300">{item.description}</p>
          ) : (
            <p className="text-slate-500">Canvas no trae descripción para esto.</p>
          )}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-[#6ea0ff]">
              Abrir en Canvas →
            </a>
          )}
        </div>
      </details>
      {removeControl}
    </div>
  );
}
