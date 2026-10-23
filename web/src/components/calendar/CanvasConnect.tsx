"use client";

// Contenido de la hoja "Canvas": conectar con la URL del feed, subir un .ics, actualizar o desconectar.
import { useState } from "react";

export default function CanvasConnect({
  connected,
  count,
  loading,
  error,
  onConnect,
  onFile,
  onRefresh,
  onDisconnect,
}: {
  connected: "url" | "file" | null;
  count: number;
  loading: boolean;
  error: string | null;
  onConnect: (url: string) => void;
  onFile: (file: File) => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  const [url, setUrl] = useState("");

  return (
    <div className="flex flex-col gap-4 pb-2 text-sm text-slate-600">
      {connected ? (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">✓</span>
            <div>
              <p className="font-semibold text-emerald-800">{connected === "url" ? "Canvas conectado" : "Archivo cargado"}</p>
              <p className="text-emerald-700">{count} elementos en tu calendario</p>
            </div>
          </div>
          <div className="flex gap-2">
            {connected === "url" && (
              <button onClick={onRefresh} disabled={loading} className="min-h-12 flex-1 rounded-xl bg-[#1450d8] font-bold text-white disabled:opacity-50">
                {loading ? "Actualizando…" : "Actualizar"}
              </button>
            )}
            <button onClick={onDisconnect} className="min-h-12 flex-1 rounded-xl border border-slate-300 font-semibold text-[#e5262b]">
              Desconectar
            </button>
          </div>
          <p className="text-xs text-slate-400">Tus anotaciones personales no se borran al desconectar.</p>
        </>
      ) : (
        <>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abre Canvas y ve a <b>Calendario</b>.</li>
            <li>Pulsa <b>Feed de calendario</b> y copia la URL.</li>
            <li>Pégala aquí. Solo se guarda en este dispositivo.</li>
          </ol>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConnect(url);
            }}
            className="flex flex-col gap-2"
          >
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://tu-escuela.instructure.com/feeds/calendars/…"
              autoComplete="off"
              className="min-h-11 rounded-xl border border-slate-300 px-3 text-[15px] text-[#0b1840] outline-none focus:border-[#1450d8] focus:ring-2 focus:ring-[#1450d8]/20"
            />
            <button disabled={loading} className="min-h-12 rounded-xl bg-[#1450d8] font-bold text-white disabled:opacity-50">
              {loading ? "Conectando…" : "Conectar"}
            </button>
          </form>
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 font-semibold text-slate-500">
            O sube un archivo .ics
            <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </>
      )}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 font-medium text-[#b81d21]">{error}</p>}
    </div>
  );
}
