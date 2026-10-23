// Cuadrícula del mes. En móvil: puntos de color. En pantallas grandes: etiquetas con el título.
import { dayKey, WEEKDAYS } from "@/lib/calendar";
import { KIND_INFO, type CalendarItem } from "@/lib/entries";

export default function MonthGrid({
  days,
  month,
  todayKey,
  selected,
  byDay,
  onSelect,
}: {
  days: Date[];
  month: number;
  todayKey: string;
  selected: string;
  byDay: Map<string, CalendarItem[]>;
  onSelect: (key: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-slate-200 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date, i) => {
          const key = dayKey(date);
          const items = byDay.get(key) ?? [];
          const inMonth = date.getMonth() === month;
          const isToday = key === todayKey;
          const isSelected = key === selected;
          const weekend = i % 7 >= 5;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              aria-pressed={isSelected}
              aria-label={`${date.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}${items.length ? `, ${items.length} ${items.length === 1 ? "elemento" : "elementos"}` : ""}`}
              className={`relative flex min-h-[3.25rem] flex-col items-center gap-1 border-b border-r border-slate-100 px-0.5 pb-1 pt-1.5 text-left transition-colors sm:min-h-[6.5rem] sm:items-stretch sm:px-1.5 ${
                i % 7 === 6 ? "border-r-0" : ""
              } ${isSelected ? "bg-[#1450d8]/[0.07]" : weekend ? "bg-slate-50/70" : "bg-white"} hover:bg-[#1450d8]/[0.05]`}
            >
              {isSelected && <span className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-[#1450d8]" />}
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] tabular-nums sm:self-start ${
                  isToday
                    ? "bg-[#e5262b] font-bold text-white"
                    : inMonth
                      ? "font-medium text-[#0b1840]"
                      : "text-slate-300"
                }`}
              >
                {date.getDate()}
              </span>

              {/* Móvil: puntos */}
              <span className="flex h-1.5 gap-0.5 sm:hidden">
                {items.slice(0, 3).map((item) => (
                  <span key={item.id} className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_INFO[item.kind].color }} />
                ))}
              </span>

              {/* Escritorio: etiquetas */}
              <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {items.slice(0, 3).map((item) => (
                  <span
                    key={item.id}
                    className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight ${inMonth ? "" : "opacity-50"}`}
                    style={{ background: `${KIND_INFO[item.kind].color}14`, color: KIND_INFO[item.kind].color, borderLeft: `3px solid ${KIND_INFO[item.kind].color}` }}
                  >
                    {item.time && <span className="mr-1 tabular-nums opacity-70">{item.time}</span>}
                    {item.title}
                  </span>
                ))}
                {items.length > 3 && <span className="px-1.5 text-[11px] font-medium text-slate-500">+{items.length - 3} más</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
