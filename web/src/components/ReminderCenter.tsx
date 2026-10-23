"use client";

// Vigila los recordatorios mientras la app está abierta y los muestra:
// notificación del sistema (si hay permiso) + aviso dentro de la app con Tocorito.
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ENTRIES_CHANGED, loadEntries } from "@/lib/entries";
import { dueReminders, loadFired, nextReminderAt, reminderText, saveFired, showSystemNotification } from "@/lib/reminders";

type Banner = { key: string; title: string; body: string };

const MAX_WAIT_MS = 60 * 60_000; // revisamos al menos cada hora

export default function ReminderCenter() {
  const [banners, setBanners] = useState<Banner[]>([]);

  const check = useCallback(() => {
    const entries = loadEntries();
    const fired = loadFired();
    const due = dueReminders(entries, new Date(), fired);
    if (due.length) {
      for (const d of due) {
        fired.add(d.key);
        const text = reminderText(d.entry);
        showSystemNotification(text.title, text.body);
        setBanners((b) => [...b, { key: d.key, ...text }]);
      }
      saveFired(fired);
    }
    const next = nextReminderAt(entries, new Date());
    return next ? Math.min(Math.max(next.getTime() - Date.now(), 0) + 250, MAX_WAIT_MS) : MAX_WAIT_MS;
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(schedule, check());
    };
    schedule();
    // Reprogramar si cambian las anotaciones (aquí o en otra pestaña) o al volver a la app.
    const onVisible = () => document.visibilityState === "visible" && schedule();
    window.addEventListener(ENTRIES_CHANGED, schedule);
    window.addEventListener("storage", schedule);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(ENTRIES_CHANGED, schedule);
      window.removeEventListener("storage", schedule);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  if (banners.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {banners.map((b) => (
        <div
          key={b.key}
          role="alert"
          className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur"
        >
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white">
            <Image src="/tocoro.webp" alt="" fill sizes="40px" className="object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#0b1840]">{b.title}</p>
            <p className="text-xs text-slate-500">{b.body}</p>
          </div>
          <button
            onClick={() => setBanners((list) => list.filter((x) => x.key !== b.key))}
            className="min-h-9 rounded-full bg-[#1450d8] px-3 text-xs font-bold text-white"
          >
            Entendido
          </button>
        </div>
      ))}
    </div>
  );
}
