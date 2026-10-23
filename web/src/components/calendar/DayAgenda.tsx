// Lista de lo que hay en el día elegido: hora a la izquierda, barra de color y detalles.
import { BellIcon } from "@/components/calendar/EntryForm";
import { describeReminder, KIND_INFO, type CalendarItem } from "@/lib/entries";

const LEVEL_LABEL = { completo: "Contexto completo", parcial: "Contexto parcial", solo_titulo: "Solo título" } as const;

export default function DayAgenda({
  title,
  items,
  onAdd,
  onEdit,
}: {
  title: string;
  items: CalendarItem[];
  onAdd: () => void;
  onEdit: (item: CalendarItem) => void;
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
              <AgendaRow item={item} onEdit={onEdit} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AgendaRow({ item, onEdit }: { item: CalendarItem; onEdit: (item: CalendarItem) => void }) {
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
          {item.entry?.reminder != null && (
            <span className="flex items-center gap-0.5 font-semibold text-[#1450d8]">
              <span>·</span>
              <BellIcon className="h-3 w-3" />
              {describeReminder(item.entry.reminder)}
            </span>
          )}
        </p>
        {item.source === "usuario" && item.description && (
          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{item.description}</p>
        )}
      </div>
      {item.source === "usuario" && (
        <svg viewBox="0 0 24 24" className="mt-1 h-4 w-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
      )}
    </div>
  );

  if (item.source === "usuario") {
    return (
      <button onClick={() => onEdit(item)} className="block w-full active:bg-slate-50" aria-label={`Editar ${item.title}`}>
        {body}
      </button>
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
