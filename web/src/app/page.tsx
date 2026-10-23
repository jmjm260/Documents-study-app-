"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import RichText from "@/components/RichText";
import { MAX_CHARS, type ChatMessage } from "@/lib/chat";

const SUGGESTIONS = [
  { title: "Explícame un tema", text: "Explícame las fracciones paso a paso" },
  { title: "Hazme un quiz", text: "Hazme un quiz rápido de 3 preguntas de biología" },
  { title: "Organiza mi semana", text: "Ayúdame a organizar mi semana de estudio" },
  { title: "Mejora mi resumen", text: "¿Cómo hago un buen resumen?" },
];

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking, error]);

  // El cuadro de texto crece con el contenido (hasta ~5 líneas).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setError(null);
    setThinking(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tocorito no pudo responder.");
      // Tocorito puede mandar varios mensajes cortos: los mostramos uno a uno, como en un chat.
      const replies: string[] = data.replies ?? [];
      let shown = next;
      for (const [i, reply] of replies.entries()) {
        if (i > 0) await new Promise((r) => setTimeout(r, 900));
        shown = [...shown, { role: "assistant", content: reply }];
        setMessages(shown);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tocorito no pudo responder.");
    } finally {
      setThinking(false);
    }
  }

  function newChat() {
    if (thinking) return;
    setMessages([]);
    setError(null);
    setInput("");
  }

  const empty = messages.length === 0 && !thinking;

  return (
    <div className="flex h-full flex-col bg-white font-sans text-[#0b1840]">
      <div className="flex h-1 shrink-0">
        <div className="flex-1 bg-[#1450d8]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#e5262b]" />
      </div>

      <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Avatar size={44} ring />
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-extrabold leading-tight tracking-tight">Tocorito</h1>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${thinking ? "animate-pulse bg-[#f59e0b]" : "bg-emerald-500"}`} />
              {thinking ? "Escribiendo…" : "Tu tutor de estudio"}
            </p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={newChat}
              disabled={thinking}
              aria-label="Nueva conversación"
              className="flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
              Nueva
            </button>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto bg-[#fbfaf6]">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col px-4 py-5 sm:px-6">
          {empty ? (
            <Welcome onPick={send} />
          ) : (
            <div className="flex flex-col">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const nextMsg = messages[i + 1];
                const firstOfGroup = prev?.role !== m.role;
                const lastOfGroup = nextMsg?.role !== m.role && !(m.role === "assistant" && thinking && i === messages.length - 1);
                return <Bubble key={i} message={m} firstOfGroup={firstOfGroup} lastOfGroup={lastOfGroup} />;
              })}
              {thinking && <Typing grouped={messages.at(-1)?.role === "assistant"} />}
              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-[#b81d21]">
                  <span aria-hidden>⚠️</span>
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pb-2 pt-3 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-slate-300 bg-white py-1.5 pl-4 pr-1.5 shadow-sm focus-within:border-[#1450d8] focus-within:ring-2 focus-within:ring-[#1450d8]/15"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={MAX_CHARS}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter hace salto de línea (en móvil el teclado pone su propio botón).
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Pregúntale algo a Tocorito…"
            aria-label="Mensaje para Tocorito"
            className="max-h-[140px] min-h-[2.25rem] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 outline-none placeholder:text-slate-400"
          />
          <button
            disabled={thinking || !input.trim()}
            aria-label="Enviar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e5262b] text-white transition active:scale-95 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
        <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-slate-400">
          Tocorito puede equivocarse. No compartas contraseñas ni datos personales.
        </p>
      </footer>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="m-auto flex w-full flex-col items-center py-6 text-center">
      <Avatar size={96} ring />
      <h2 className="mt-4 text-2xl font-extrabold tracking-tight">¡Qué volá! Soy Tocorito</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Tu tutor de estudio, con café en mano ☕ Pregúntame lo que estés estudiando y vamos paso a paso.
      </p>
      <div className="mt-6 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.text)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#1450d8]/40 active:bg-slate-50"
          >
            <span className="block text-sm font-bold text-[#0b1840]">{s.title}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Avatar({ size, ring = false }: { size: number; ring?: boolean }) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-white ${ring ? "ring-2 ring-[#1450d8]/20" : "border border-slate-200"}`}
      style={{ width: size, height: size }}
    >
      <Image src="/tocoro.webp" alt="" fill sizes={`${size}px`} className="object-contain" priority={size > 40} />
    </div>
  );
}

function Bubble({ message, firstOfGroup, lastOfGroup }: { message: ChatMessage; firstOfGroup: boolean; lastOfGroup: boolean }) {
  const spacing = firstOfGroup ? "mt-4 first:mt-0" : "mt-1";
  if (message.role === "user") {
    return (
      <div className={`flex justify-end ${spacing}`}>
        <div
          className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] bg-[#1450d8] px-4 py-2.5 text-[15px] leading-relaxed text-white sm:max-w-[75%] ${
            lastOfGroup ? "rounded-br-md" : ""
          }`}
        >
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className={`flex items-end gap-2 ${spacing}`}>
      <div className="w-7 shrink-0">{lastOfGroup && <Avatar size={28} />}</div>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] border border-slate-200 bg-white px-4 py-2.5 text-[15px] leading-relaxed text-[#0b1840] shadow-[0_1px_2px_rgba(11,24,64,0.05)] sm:max-w-[75%] ${
          lastOfGroup ? "rounded-bl-md" : ""
        }`}
      >
        <RichText text={message.content} />
      </div>
    </div>
  );
}

function Typing({ grouped }: { grouped: boolean }) {
  return (
    <div className={`flex items-end gap-2 ${grouped ? "mt-1" : "mt-4"}`} aria-label="Tocorito está escribiendo">
      <div className="w-7 shrink-0">
        <Avatar size={28} />
      </div>
      <div className="flex gap-1 rounded-[20px] rounded-bl-md border border-slate-200 bg-white px-4 py-3.5">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#1450d8]/60" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  );
}
