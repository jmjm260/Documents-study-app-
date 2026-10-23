"use client";

// Tarjeta que aparece en el chat cuando Tocorito anota algo en el calendario.
import Link from "next/link";
import { useState } from "react";
import { BellIcon } from "@/components/calendar/EntryForm";
import { describeReminder, KIND_INFO, type Entry } from "@/lib/entries";
import { requestNotificationPermission } from "@/lib/reminders";

export default function ActionCard({ entry, undone, onUndo }: { entry: Entry; undone: boolean; onUndo: () => void }) {
  const info = KIND_INFO[entry.kind];
  const date = new Date(`${entry.date}T00:00:00`).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  const [askPermission, setAskPermission] = useState(
    () => entry.reminderSec !== null && typeof Notification !== "undefined" && Notification.permission === "default"
  );

  return (
    <div className="ml-9 mt-2 max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(11,24,64,0.05)]">
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <CalendarIcon />
        {undone ? "Quitado del calendario" : "Añadido al calendario"}
      </div>
      <div className={`flex gap-3 px-3 py-3 ${undone ? "opacity-40" : ""}`}>
        <div className="w-[3px] shrink-0 rounded-full" style={{ background: info.color }} />
        <div className="min-w-0 flex-1">
          <p className={`font-semibold leading-snug text-[#0b1840] ${undone ? "line-through" : ""}`}>{entry.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className="font-semibold" style={{ color: info.color }}>{info.label}</span>
            {" · "}
            <span className="first-letter:uppercase">{date}</span>
            {" · "}
            {entry.time ?? "Todo el día"}
            {entry.course && ` · ${entry.course}`}
          </p>
          {entry.reminderSec !== null && (
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#1450d8]">
              <BellIcon className="h-3 w-3" /> Aviso {describeReminder(entry.reminderSec).toLowerCase()}
            </p>
          )}
        </div>
      </div>
      {!undone && (
        <div className="flex border-t border-slate-100 text-sm font-semibold">
          <Link href={`/calendario?dia=${entry.date}`} className="flex min-h-11 flex-1 items-center justify-center text-[#1450d8] active:bg-slate-50">
            Ver en calendario
          </Link>
          <button onClick={onUndo} className="flex min-h-11 flex-1 items-center justify-center border-l border-slate-100 text-slate-500 active:bg-slate-50">
            Deshacer
          </button>
        </div>
      )}
      {!undone && askPermission && (
        <button
          onClick={() => {
            requestNotificationPermission();
            setAskPermission(false);
          }}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-slate-100 bg-[#1450d8]/5 text-sm font-semibold text-[#1450d8]"
        >
          <BellIcon /> Activar notificaciones para los avisos
        </button>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path strokeLinecap="round" d="M8 3v4M16 3v4M3.5 10h17" />
    </svg>
  );
}
