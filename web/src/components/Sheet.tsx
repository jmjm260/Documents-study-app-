"use client";

// Hoja modal: sube desde abajo en móvil (como en iOS) y se centra en pantallas grandes.
import { useEffect } from "react";

export default function Sheet({
  title,
  onClose,
  children,
  dark = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Versión oscura, para pantallas con fondo negro (el chat). */
  dark?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-[#0b1840]/40 backdrop-blur-[2px]" />
      <div className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl sm:pb-4 ${
          dark ? "border border-white/10 bg-[#121214] text-white" : "bg-white"
        }`}>
        <div className={`sticky top-0 z-10 flex items-center border-b px-5 pb-3 pt-2 ${dark ? "border-white/10 bg-[#121214]" : "border-slate-100 bg-white"}`}>
          <div className={`absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full sm:hidden ${dark ? "bg-white/20" : "bg-slate-200"}`} />
          <h2 className={`flex-1 pt-3 text-base font-bold ${dark ? "text-white" : "text-[#0b1840]"}`}>{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className={`mt-2 flex h-11 w-11 items-center justify-center rounded-full ${dark ? "text-slate-400 active:bg-white/10" : "text-slate-500 active:bg-slate-100"}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="px-5 pt-4">{children}</div>
      </div>
    </div>
  );
}
