"use client";

// Tocorito "habla": cada mensaje se va escribiendo en un globo junto a él (efecto máquina de escribir)
// y, cuando termina, pasa al chat como una burbuja normal. Luego empieza el siguiente.
// Funciona con streaming: si el texto todavía está llegando, el globo espera y sigue escribiendo.
import { useCallback, useEffect, useRef, useState } from "react";

const TICK_MS = 30;
/** Pausa con el mensaje completo en el globo antes de pasarlo al chat. */
const HOLD_MS = 500;

export function useSpeech({ onCommit, onFinish }: { onCommit: (text: string) => void; onFinish: () => void }) {
  const parts = useRef<string[]>([]);
  const streamDone = useRef(false);
  const index = useRef(0);
  const typed = useRef(0);
  const holdUntil = useRef(0);
  const callbacks = useRef({ onCommit, onFinish });
  const [active, setActive] = useState(false);
  const [shown, setShown] = useState("");

  useEffect(() => {
    callbacks.current = { onCommit, onFinish };
  }, [onCommit, onFinish]);

  /** Empieza a hablar (antes de que llegue texto: el globo enseña "…"). */
  const start = useCallback(() => {
    parts.current = [];
    streamDone.current = false;
    index.current = 0;
    typed.current = 0;
    setShown("");
    setActive(true);
  }, []);

  /** Lo que hay para decir hasta ahora (partes por burbuja) y si ya no llegará más. */
  const update = useCallback((next: string[], done: boolean) => {
    parts.current = next;
    streamDone.current = done;
  }, []);

  /** Tocar el globo: termina de escribir el mensaje actual al instante. */
  const skip = useCallback(() => {
    const target = parts.current[index.current];
    if (target) {
      typed.current = target.length;
      holdUntil.current = 0;
      setShown(target);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(() => {
      const target = parts.current[index.current];
      if (target === undefined) {
        if (streamDone.current) {
          setActive(false);
          setShown("");
          callbacks.current.onFinish();
        }
        return;
      }
      if (typed.current < target.length) {
        // Rápido pero legible: los mensajes largos tardan como mucho ~2,5 s en escribirse.
        const step = reduceMotion ? target.length : Math.max(2, Math.ceil(target.length / 80));
        typed.current = Math.min(target.length, typed.current + step);
        setShown(target.slice(0, typed.current));
        if (typed.current >= target.length) holdUntil.current = Date.now() + HOLD_MS;
        return;
      }
      // Mensaje escrito entero. Si es el último y aún llega texto, esperamos.
      const complete = index.current < parts.current.length - 1 || streamDone.current;
      if (complete && Date.now() >= holdUntil.current) {
        callbacks.current.onCommit(target);
        index.current += 1;
        typed.current = 0;
        setShown("");
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [active]);

  return { active, shown, start, update, skip };
}
