"use client";

// Lista de lo que hay en el día elegido: hora a la izquierda, barra de color y detalles.
// Lo propio se puede editar (tocar) o quitar (papelera); lo de Canvas solo se mira.
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
        <h2 className="text-base font-bold text-[#0b1840] first-letter:uppercase">{title}</h2>
        <span className="text-xs font-medium text-slate-400">
          {items.length === 0 ? "Sin pendientes" : `${items.length} ${items.length === 1 ? "elemento" : "elementos"}`}
        </span>
      </div>

      {items.length === 0 ? (
        <button
          onClick={onAdd}
          className="mt-3 w-full rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 active:bg-slate-50"
        >
          Nada por aquí. Hasta Tocorito se toma un descanso ☕
          <span className="mt-1 block font-semibold text-[#1450d8]">+ Añadir algo a este día</span>
        </button>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
      <div className="w-12 shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-slate-500">
        {item.time ?? <span className="text-[10px] uppercase tracking-wide">Todo el día</span>}
      </div>
      <div className="w-[3px] shrink-0 rounded-full" style={{ background: info.color }} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-[#0b1840]">{item.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
          <span className="font-semibold" style={{ color: info.color }}>{info.label}</span>
          {item.course && <><span>·</span><span>{item.course}</span></>}
          <span>·</span>
          <span>{item.source === "canvas" ? "Canvas" : "Personal"}</span>
          {item.contextLevel && <><span>·</span><span>{LEVEL_LABEL[item.contextLevel]}</span></>}
          {item.entry?.reminderSec != null && (
            <span className="flex items-center gap-0.5 font-semibold text-[#1450d8]">
              <span>·</span>
              <BellIcon className="h-3 w-3" />
              {describeReminder(item.entry.reminderSec)}
            </span>
          )}
        </p>
        {item.source === "usuario" && item.description && (
          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{item.description}</p>
        )}
      </div>
    </div>
  );

  if (item.source === "usuario") {
    return (
      <div className="flex items-stretch">
        <button onClick={() => onEdit(item)} className="block min-w-0 flex-1 active:bg-slate-50" aria-label={`Editar ${item.title}`}>
          {body}
        </button>
        {confirming ? (
          <div className="flex shrink-0 items-center gap-1 pr-2">
            <button onClick={() => setConfirming(false)} className="min-h-10 rounded-full px-2.5 text-xs font-semibold text-slate-500 active:bg-slate-100">
              No
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                onDelete(item);
              }}
              className="min-h-10 rounded-full bg-[#e5262b] px-3 text-xs font-bold text-white"
            >
              Quitar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            aria-label={`Quitar ${item.title} del calendario`}
            className="flex w-11 shrink-0 items-start justify-center pt-3 text-slate-300 hover:text-[#e5262b] active:bg-slate-50"
          >
            <TrashIcon className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
    );
  }
  return (
    <details className="group">
      <summary className="cursor-pointer list-none active:bg-slate-50 [&::-webkit-details-marker]:hidden">{body}</summary>
      <div className="pb-3 pl-[4.5rem] pr-4 text-sm">
        {item.description ? (
          <p className="whitespace-pre-wrap text-slate-600">{item.description}</p>
        ) : (
          <p className="text-slate-400">Canvas no trae descripción para esto.</p>
        )}
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-[#1450d8]">
            Abrir en Canvas →
          </a>
        )}
      </div>
    </details>
  );
}
