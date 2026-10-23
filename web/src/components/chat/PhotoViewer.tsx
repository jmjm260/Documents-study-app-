"use client";

// Ver una foto a pantalla completa (tocar fuera o Escape para cerrar).
import { useEffect } from "react";

export default function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Foto" onClick={onClose} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- es una foto local (data URL), no hace falta optimizarla */}
      <img src={src} alt="Foto enviada" className="max-h-full max-w-full rounded-lg object-contain" />
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
