"use client";

// Historial de chats en un panel que sale desde la IZQUIERDA (82% del ancho en móvil).
// Solo tiene: "Nuevo chat" fijo arriba + la lista de chats (abrir; mantener pulsado para borrar).
// Gestos: abrir deslizando desde el borde izquierdo, cerrar arrastrando a la izquierda o tocando fuera.
// El panel nunca se desmonta: así la animación de cierre siempre se ve.
import { useEffect, useRef, useState } from "react";
import type { ConversationSummary } from "@/lib/conversation-api";

const EDGE_PX = 20; // el gesto de abrir solo empieza a menos de 20 px del borde
const THRESHOLD = 0.35; // hay que arrastrar más del 35% del panel
const LONG_PRESS_MS = 550;

type Drag = { startX: number; startY: number; dx: number; decided: "h" | "v" | null; pointerId: number };

export default function ChatSidebar({
  open,
  onOpenChange,
  conversations,
  activeId,
  hasMore,
  onLoadMore,
  onNewChat,
  onSelect,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: ConversationSummary[];
  activeId: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // Cuánto se ha arrastrado (px): positivo = hacia la derecha. null = sin arrastre.
  const [dragX, setDragX] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) setConfirming(null);
  }, [open]);

  const width = () => panelRef.current?.offsetWidth ?? 320;

  // Posición del panel en px: 0 = abierto, -width = cerrado.
  let offset: number | null = null;
  if (dragX !== null) offset = open ? Math.min(0, dragX) : Math.min(0, -width() + dragX);
  const progress = offset === null ? (open ? 1 : 0) : 1 + offset / width();

  function start(e: React.PointerEvent) {
    drag.current = { startX: e.clientX, startY: e.clientY, dx: 0, decided: null, pointerId: e.pointerId };
  }

  // En el borde: el gesto es nuestro desde el primer toque (si no, el dedo "se sale" de la franja
  // antes de decidir y además se seleccionaría texto).
  function startEdge(e: React.PointerEvent) {
    start(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.decided && Math.hypot(dx, dy) > 8) {
      // Si el dedo va más en vertical, es scroll: no tocamos nada.
      d.decided = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (d.decided === "h") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (d.decided !== "h") return;
    cancelPress();
    d.dx = dx;
    setDragX(dx);
  }

  function end() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.decided !== "h") return setDragX(null);
    const moved = Math.abs(d.dx) / width();
    if (open) onOpenChange(!(d.dx < 0 && moved > THRESHOLD));
    else onOpenChange(d.dx > 0 && moved > THRESHOLD);
    setDragX(null);
  }

  function startPress(id: string) {
    cancelPress();
    pressTimer.current = setTimeout(() => setConfirming(id), LONG_PRESS_MS);
  }
  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  const animate = dragX === null ? "transition-transform duration-[250ms] ease-out" : "";

  return (
    <>
      {/* Franja invisible en el borde izquierdo para abrir deslizando (solo con el panel cerrado). */}
      {!open && (
        <div
          aria-hidden
          className="fixed bottom-0 left-0 top-0 z-[54] touch-pan-y select-none"
          style={{ width: EDGE_PX }}
          onPointerDown={startEdge}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      )}

      <div className={`fixed inset-0 z-[55] ${open || dragX !== null ? "" : "pointer-events-none"}`}>
        {/* Fondo oscuro sobre el chat: tocarlo cierra el panel */}
        <div
          className={`absolute inset-0 bg-black/55 ${dragX === null ? "transition-opacity duration-[250ms]" : ""}`}
          style={{ opacity: progress }}
          onClick={() => onOpenChange(false)}
          aria-hidden
        />

        <aside
          ref={panelRef}
          role="dialog"
          aria-modal={open}
          aria-label="Tus chats"
          aria-hidden={!open}
          inert={!open && dragX === null}
          className={`absolute bottom-0 left-0 top-0 flex w-[82vw] max-w-[340px] touch-pan-y flex-col border-r border-white/10 bg-[#111113] text-white ${animate}`}
          style={{ transform: offset === null ? (open ? "translateX(0)" : "translateX(-100%)") : `translateX(${offset}px)` }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {/* Fijo arriba */}
          <div className="shrink-0 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              onClick={onNewChat}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-white/[0.07] px-3 text-[15px] font-semibold active:bg-white/15"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.3} aria-hidden>
                <path strokeLinecap="round" d="M12 5v14M5 12h14" />
              </svg>
              Nuevo chat
            </button>
          </div>

          {/* Historial: se desplaza solo */}
          <nav
            aria-label="Historial de chats"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (hasMore && el.scrollTop + el.clientHeight > el.scrollHeight - 120) onLoadMore();
            }}
          >
            {conversations.length === 0 ? (
              <p className="px-3 py-6 text-sm text-slate-500">Aún no tienes chats.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {conversations.map((c) => (
                  <li key={c.id}>
                    {confirming === c.id ? (
                      <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-red-500/10 pl-3 pr-1">
                        <span className="truncate text-sm text-red-200">¿Borrar este chat?</span>
                        <span className="flex shrink-0 gap-1">
                          <button onClick={() => setConfirming(null)} className="min-h-9 rounded-full px-3 text-sm text-slate-300 active:bg-white/10">
                            No
                          </button>
                          <button
                            onClick={() => {
                              setConfirming(null);
                              onDelete(c.id);
                            }}
                            className="min-h-9 rounded-full bg-[#e5262b] px-3 text-sm font-bold"
                          >
                            Borrar
                          </button>
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => onSelect(c.id)}
                        onPointerDown={() => startPress(c.id)}
                        onPointerUp={cancelPress}
                        onPointerLeave={cancelPress}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setConfirming(c.id);
                        }}
                        aria-current={c.id === activeId ? "true" : undefined}
                        title="Mantén pulsado para borrar"
                        className={`block min-h-11 w-full truncate rounded-lg px-3 text-left text-[15px] leading-[2.75rem] ${
                          c.id === activeId ? "bg-white/10 font-semibold text-white" : "text-slate-300 active:bg-white/5"
                        }`}
                      >
                        {c.title}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </nav>
        </aside>
      </div>
    </>
  );
}
