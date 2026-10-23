"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ActionCard from "@/components/chat/ActionCard";
import ChatsSheet from "@/components/chat/ChatsSheet";
import LevelPicker from "@/components/chat/LevelPicker";
import PhotoViewer from "@/components/chat/PhotoViewer";
import SpeechBubble from "@/components/chat/SpeechBubble";
import TocoritoFigure from "@/components/chat/TocoritoFigure";
import { useSpeech } from "@/components/chat/useSpeech";
import RichText from "@/components/RichText";
import { DEFAULT_REASONING_LEVEL, REASONING_LEVELS, type ReasoningLevel } from "@/lib/ai/reasoning";
import type { ChatStatus } from "@/lib/ai/types";
import { dayKey } from "@/lib/calendar";
import { MAX_CHARS, MAX_IMAGES, type ChatMessage } from "@/lib/chat";
import { actionNote, MAX_CONTEXT_ITEMS, removalNote, type ChatContext } from "@/lib/chat-actions";
import { extractCoffee } from "@/lib/coffee";
import {
  loadConversations,
  loadCurrentId,
  newConversation,
  saveConversations,
  saveCurrentId,
  upsert,
  type Conversation,
  type UiMessage,
} from "@/lib/conversations";
import {
  addEntries,
  KIND_INFO,
  loadCanvasCache,
  loadEntries,
  removeEntry,
  restoreEntry,
  toCalendarItems,
  type Entry,
  type EntryDraft,
} from "@/lib/entries";
import { compressImage, THUMB_SIDE } from "@/lib/images";
import { loadPrefs, savePrefs } from "@/lib/prefs";
import { visibleReplies } from "@/lib/stream-text";

type Card = { change: "added" | "removed"; entry: Entry };

/** Resumen del calendario (próximos 60 días) que se manda a Tocorito con cada mensaje. */
function calendarContext(): ChatContext {
  const now = new Date();
  const today = dayKey(now);
  const limit = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60));
  const upcoming = toCalendarItems(loadCanvasCache(), loadEntries())
    .filter((i) => i.day >= today && i.day <= limit)
    .sort((a, b) => (a.day + (a.time ?? "")).localeCompare(b.day + (b.time ?? "")))
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((i) => ({
      // Solo lo propio lleva id: es lo que Tocorito puede quitar.
      ...(i.entry ? { id: i.entry.id } : {}),
      date: i.day,
      time: i.time,
      kind: KIND_INFO[i.kind].label.toLowerCase(),
      title: i.title,
      course: i.course,
    }));
  const pad = (n: number) => String(n).padStart(2, "0");
  // Con segundos, para que Tocorito pueda poner alarmas como "dentro de 15 segundos".
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return { now: `${today}T${clock}`, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, upcoming };
}

/** Lo que se manda a la IA: las tarjetas se convierten en una nota para que Tocorito las recuerde. */
function toHistory(messages: UiMessage[]): ChatMessage[] {
  const history = messages.flatMap((m): ChatMessage[] => {
    if (m.role === "action") {
      const happened = !m.undone;
      if (!happened) return [];
      return [{ role: "assistant", content: m.change === "added" ? actionNote(m.entry) : removalNote(m.entry) }];
    }
    return [{ role: m.role, content: m.content, ...(m.images?.length ? { images: m.images } : {}) }];
  });
  // Las fotos solo viajan con el último mensaje; en los anteriores dejamos una marca.
  return history.map((m, i) =>
    m.images?.length && i !== history.length - 1
      ? { role: m.role, content: `${m.content || ""} [envió ${m.images.length} foto(s)]`.trim() }
      : m
  );
}

const SUGGESTIONS = [
  { title: "Explícame un tema", text: "Explícame las fracciones paso a paso" },
  { title: "Hazme un quiz", text: "Hazme un quiz rápido de 3 preguntas de biología" },
  { title: "Anota un examen", text: "Anota que el viernes tengo examen de química a las 9:00 y recuérdame 1 hora antes" },
  { title: "¿Qué tengo pendiente?", text: "¿Qué tengo pendiente esta semana?" },
];

const STATUS_LABEL: Record<ChatStatus, string> = {
  preparing: "Preparando…",
  thinking: "Pensando…",
  generating: "Generando respuesta…",
};

/** Lee la respuesta en streaming de /api/chat (una línea JSON por evento). */
async function* readEvents(res: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line);
    }
  }
}

export default function Chat() {
  // Chat abierto (se guarda en el dispositivo; así no se pierde al cambiar de pestaña).
  const [conv, setConv] = useState<Pick<Conversation, "id" | "createdAt">>(() => newConversation());
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [chatList, setChatList] = useState<Conversation[] | null>(null);

  const [input, setInput] = useState("");
  // Fotos preparadas para el próximo mensaje: la grande para la IA y una miniatura para el historial.
  const [photos, setPhotos] = useState<{ full: string; thumb: string }[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Animación de Tocorito tomando café (sustituye a escribir "*sorbo largo*" en el texto).
  const [sipping, setSipping] = useState(false);
  const sipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function sip() {
    if (sipTimer.current) clearTimeout(sipTimer.current);
    setSipping(true);
    sipTimer.current = setTimeout(() => setSipping(false), 1900);
  }
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState<ChatStatus>("preparing");
  const [error, setError] = useState<string | null>(null);
  const [defaultLevel, setDefaultLevel] = useState<ReasoningLevel>(DEFAULT_REASONING_LEVEL);
  const [level, setLevel] = useState<ReasoningLevel>(DEFAULT_REASONING_LEVEL);
  const [levels, setLevels] = useState<{ level: ReasoningLevel; realReasoning: boolean }[]>(
    REASONING_LEVELS.map((l) => ({ level: l, realReasoning: true }))
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Tocorito "habla": cada mensaje se escribe en el globo y al terminar pasa al chat.
  const pendingCards = useRef<Card[]>([]);
  const speech = useSpeech({
    onCommit: useCallback((text: string) => setMessages((m) => [...m, { role: "assistant", content: text }]), []),
    onFinish: useCallback(() => {
      const cards = pendingCards.current;
      pendingCards.current = [];
      if (cards.length) setMessages((m) => [...m, ...cards.map((c) => ({ role: "action" as const, ...c, undone: false }))]);
    }, []),
  });
  const busy = thinking || speech.active;

  // Al abrir: el último chat que tenías abierto.
  useEffect(() => {
    const id = loadCurrentId();
    const found = id ? loadConversations().find((c) => c.id === id) : undefined;
    if (found) {
      setConv({ id: found.id, createdAt: found.createdAt });
      setMessages(found.messages);
    }
    setLoaded(true);
  }, []);

  // Guardar cada cambio del chat.
  useEffect(() => {
    if (!loaded) return;
    const list = upsert(loadConversations(), { ...conv, title: "", updatedAt: Date.now(), messages });
    saveConversations(list);
    saveCurrentId(messages.length ? conv.id : null);
  }, [messages, conv, loaded]);

  // El chat deja sitio debajo para el globo mientras Tocorito habla.
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const [bubbleHeight, setBubbleHeight] = useState(0);
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return setBubbleHeight(0);
    const ro = new ResizeObserver(() => setBubbleHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [speech.active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, error, bubbleHeight]);

  // Preferencia guardada + qué niveles ofrece el servidor (esto también "despierta" a Tocorito).
  useEffect(() => {
    const saved = loadPrefs().defaultReasoningLevel;
    setDefaultLevel(saved);
    setLevel(saved);
    fetch("/api/chat/levels")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.levels && setLevels(data.levels))
      .catch(() => {});
  }, []);

  // El cuadro de texto crece con el contenido (hasta ~5 líneas).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Vacía = una sola línea (el texto de ejemplo no debe hacerla crecer).
    if (input) el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  async function addPhotos(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    const room = MAX_IMAGES - photos.length;
    if (images.length > room) setError(`Puedes mandar hasta ${MAX_IMAGES} fotos a la vez.`);
    try {
      const ready = await Promise.all(
        images.slice(0, Math.max(room, 0)).map(async (f) => ({ full: await compressImage(f), thumb: await compressImage(f, THUMB_SIDE, 0.7) }))
      );
      setPhotos((p) => [...p, ...ready].slice(0, MAX_IMAGES));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude abrir esa foto.");
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if ((!content && photos.length === 0) || busy) return;
    const userMsg: UiMessage = photos.length
      ? { role: "user", content, images: photos.map((p) => p.full), thumbs: photos.map((p) => p.thumb) }
      : { role: "user", content };
    const next: UiMessage[] = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setPhotos([]);
    setError(null);
    setThinking(true);
    setStatus("preparing");
    speech.start();
    let raw = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toHistory(next), context: calendarContext(), reasoningLevel: level }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Tocorito no pudo responder.");
      }
      let sipped = false;
      for await (const ev of readEvents(res)) {
        if (ev.type === "status") setStatus(ev.status as ChatStatus);
        else if (ev.type === "text") {
          raw += ev.delta as string;
          speech.update(visibleReplies(raw), false);
          if (!sipped && extractCoffee(raw).sip) {
            sipped = true;
            sip();
          }
        } else if (ev.type === "error") {
          throw new Error((ev.error as string) ?? "Tocorito no pudo responder.");
        } else if (ev.type === "done") {
          // Lo que Tocorito puso o quitó del calendario: se aplica ya y la tarjeta sale al final.
          const actions = (ev.actions as EntryDraft[]) ?? [];
          const removals = (ev.removals as string[]) ?? [];
          const before = loadEntries();
          const removed = before.filter((e) => removals.includes(e.id));
          removed.forEach((e) => removeEntry(e.id));
          const added = actions.length ? addEntries(actions) : [];
          pendingCards.current = [
            ...removed.map((entry) => ({ change: "removed" as const, entry })),
            ...added.map((entry) => ({ change: "added" as const, entry })),
          ];
          if (ev.sip && !sipped) sip();
          speech.update(ev.replies as string[], true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tocorito no pudo responder.");
      // Lo que ya dijo se queda; el resto se descarta.
      speech.update(visibleReplies(raw), true);
    } finally {
      setThinking(false);
    }
  }

  // Como en ChatGPT: el nivel elegido se queda guardado para las próximas veces.
  function chooseLevel(next: ReasoningLevel) {
    setLevel(next);
    setDefaultLevel(next);
    savePrefs({ defaultReasoningLevel: next });
  }

  function undo(index: number) {
    const m = messages[index];
    if (m?.role !== "action") return;
    if (m.change === "added") removeEntry(m.entry.id);
    else restoreEntry(m.entry);
    setMessages((list) => list.map((x, i) => (i === index ? { ...m, undone: true } : x)));
  }

  function openChat(id: string) {
    const found = loadConversations().find((c) => c.id === id);
    if (!found) return;
    setConv({ id: found.id, createdAt: found.createdAt });
    setMessages(found.messages);
    setError(null);
    setChatList(null);
  }

  function newChat() {
    if (busy) return;
    setConv(newConversation());
    setMessages([]);
    setError(null);
    setInput("");
    setPhotos([]);
    setLevel(defaultLevel);
    setChatList(null);
  }

  function deleteChat(id: string) {
    const list = loadConversations().filter((c) => c.id !== id);
    saveConversations(list);
    setChatList(list);
    if (id === conv.id) {
      setConv(newConversation());
      setMessages([]);
    }
  }

  const empty = messages.length === 0 && !busy;

  return (
    <div className="flex h-full flex-col bg-black font-sans text-white">
      <div className="flex h-1 shrink-0">
        <div className="flex-1 bg-[#1450d8]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#e5262b]" />
      </div>

      <header className="shrink-0 border-b border-white/10 bg-black px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-extrabold leading-tight tracking-tight">Tocorito</h1>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${busy ? "animate-pulse bg-[#f59e0b]" : "bg-emerald-500"}`} />
              {thinking && !speech.shown ? STATUS_LABEL[status] : busy ? "Escribiendo…" : "Tu tutor de estudio"}
            </p>
          </div>
          <button
            onClick={() => setChatList(loadConversations())}
            disabled={busy}
            aria-label="Tus chats"
            className="flex min-h-10 items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs font-semibold text-slate-200 active:bg-white/10 disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
            </svg>
            Chats
          </button>
          <button
            onClick={newChat}
            disabled={busy || messages.length === 0}
            aria-label="Nuevo chat"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-slate-200 active:bg-white/10 disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <main className="h-full overflow-y-auto bg-black [color-scheme:dark]">
          <div
            className="mx-auto flex min-h-full max-w-3xl flex-col px-4 py-5 sm:px-6"
            style={empty ? undefined : { paddingBottom: (speech.active ? bubbleHeight + 24 : 0) + 112 }}
          >
            {empty ? (
              <Welcome onPick={send} sipping={sipping} />
            ) : (
              <div className="flex flex-col">
                {messages.map((m, i) => {
                  if (m.role === "action") {
                    return <ActionCard key={`${m.entry.id}-${i}`} entry={m.entry} change={m.change} undone={m.undone} onUndo={() => undo(i)} />;
                  }
                  const prev = messages[i - 1];
                  const nextMsg = messages[i + 1];
                  const firstOfGroup = prev?.role !== m.role;
                  const lastOfGroup = nextMsg?.role !== m.role;
                  return <Bubble key={i} message={m} firstOfGroup={firstOfGroup} lastOfGroup={lastOfGroup} onOpenPhoto={setViewing} />;
                })}
                {error && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
                    <span aria-hidden>⚠️</span>
                    <span>{error}</span>
                  </div>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>
        {!empty && speech.active && (
          <div className="pointer-events-none absolute bottom-[3.25rem] left-4 right-[3.75rem] flex justify-end sm:bottom-[4.5rem] sm:right-[6.5rem]">
            {/* Mientras no llega texto: "Pensando…" (nunca el razonamiento interno). */}
            <SpeechBubble
              ref={bubbleRef}
              text={speech.shown}
              waitingLabel={thinking && !speech.shown ? STATUS_LABEL[status] : null}
              onSkip={speech.skip}
            />
          </div>
        )}
        {/* Tocorito vive en la esquina; toma café cuando "habla" de café. */}
        {!empty && (
          <div className="pointer-events-none absolute bottom-1 right-1 sm:right-4">
            {/* Más pequeño en el móvil para que quepa al lado de las burbujas */}
            <TocoritoFigure height={70} sipping={sipping} className="sm:hidden" />
            <TocoritoFigure height={96} sipping={sipping} className="hidden sm:block" />
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-black px-3 pb-2 pt-2 sm:px-6">
        {photos.length > 0 && (
          <div className="mx-auto mb-2 flex max-w-3xl gap-2 overflow-x-auto px-1 pt-1.5">
            {photos.map((p, i) => (
              <div key={i} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto local (data URL) */}
                <img src={p.thumb} alt={`Foto ${i + 1}`} className="h-16 w-16 rounded-xl border border-white/15 object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((list) => list.filter((_, j) => j !== i))}
                  aria-label={`Quitar foto ${i + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="relative mx-auto flex max-w-3xl items-end gap-1 rounded-[22px] border border-white/15 bg-[#161618] py-1 pl-1 pr-1 focus-within:border-[#1450d8] focus-within:ring-2 focus-within:ring-[#1450d8]/30"
        >
          {/* Adjuntar fotos: en el móvil ofrece cámara o galería */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || photos.length >= MAX_IMAGES}
            aria-label="Añadir fotos"
            title="Añadir fotos"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addPhotos(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={MAX_CHARS}
            onChange={(e) => setInput(e.target.value)}
            // Pegar una captura (Ctrl+V) la añade como foto.
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (files.length) {
                e.preventDefault();
                addPhotos(files);
              }
            }}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter hace salto de línea (en móvil el teclado pone su propio botón).
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={photos.length ? "Añade una pregunta (opcional)…" : "Pregúntale algo a Tocorito…"}
            aria-label="Mensaje para Tocorito"
            className="max-h-[140px] min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 text-white outline-none placeholder:text-slate-500 placeholder-shown:overflow-hidden placeholder-shown:text-ellipsis placeholder-shown:whitespace-nowrap"
          />
          {/* Nivel de razonamiento, a la derecha de la barra (como en ChatGPT) */}
          <LevelPicker
            value={level}
            available={levels.map((l) => l.level)}
            noRealReasoning={levels.filter((l) => !l.realReasoning).map((l) => l.level)}
            disabled={busy}
            onChange={chooseLevel}
          />
          <button
            disabled={busy || (!input.trim() && photos.length === 0)}
            aria-label="Enviar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e5262b] text-white transition active:scale-95 disabled:bg-white/10 disabled:text-slate-500"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
        {/* En móvil este aviso va en la bienvenida, para que la barra ocupe poco alto. */}
        <p className="mx-auto mt-1 hidden max-w-3xl text-center text-[11px] text-slate-500 sm:block">
          Tocorito puede equivocarse. No compartas contraseñas ni datos personales.
        </p>
      </footer>

      {viewing && <PhotoViewer src={viewing} onClose={() => setViewing(null)} />}
      {chatList && (
        <ChatsSheet
          conversations={chatList}
          currentId={conv.id}
          onOpen={openChat}
          onNew={newChat}
          onDelete={deleteChat}
          onClose={() => setChatList(null)}
        />
      )}
    </div>
  );
}

function Welcome({ onPick, sipping }: { onPick: (text: string) => void; sipping: boolean }) {
  return (
    <div className="m-auto flex w-full flex-col items-center py-6 text-center">
      <TocoritoFigure height={150} sipping={sipping} priority />
      <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-white">¡Qué volá! Soy Tocorito</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-400">
        Tu tutor de estudio, con café en mano. Pregúntame lo que estés estudiando y vamos paso a paso.
      </p>
      <p className="mt-2 text-[11px] text-slate-500 sm:hidden">Tocorito puede equivocarse. No compartas contraseñas ni datos personales.</p>
      <div className="mt-6 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.text)}
            className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left transition hover:border-[#1450d8]/70 hover:bg-white/[0.09] active:bg-white/[0.12]"
          >
            <span className="block text-sm font-bold text-white">{s.title}</span>
            <span className="mt-0.5 block text-xs text-slate-400">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({
  message,
  firstOfGroup,
  lastOfGroup,
  onOpenPhoto,
}: {
  message: ChatMessage;
  firstOfGroup: boolean;
  lastOfGroup: boolean;
  onOpenPhoto: (src: string) => void;
}) {
  const spacing = firstOfGroup ? "mt-4 first:mt-0" : "mt-1";
  if (message.role === "user") {
    const images = message.images ?? [];
    return (
      <div className={`flex flex-col items-end gap-1 ${spacing}`}>
        {images.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1 sm:max-w-[75%]">
            {images.map((src, i) => (
              <button key={i} type="button" onClick={() => onOpenPhoto(src)} aria-label={`Ver foto ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- foto local (data URL) */}
                <img
                  src={src}
                  alt={`Foto ${i + 1}`}
                  className={`rounded-2xl border border-white/10 object-cover ${images.length === 1 ? "max-h-64 max-w-[15rem]" : "h-28 w-28"}`}
                />
              </button>
            ))}
          </div>
        )}
        {message.content && (
          <div
            className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] bg-[#1450d8] px-4 py-2.5 text-[15px] leading-relaxed text-white sm:max-w-[75%] ${
              lastOfGroup ? "rounded-br-md" : ""
            }`}
          >
            {message.content}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`bubble-in flex ${spacing}`}>
      <div
        className={`max-w-[82%] whitespace-pre-wrap break-words rounded-[20px] bg-white px-4 py-2.5 text-[15px] leading-relaxed text-[#0b1840] sm:max-w-[75%] ${
          lastOfGroup ? "rounded-bl-md" : ""
        }`}
      >
        <RichText text={message.content} />
      </div>
    </div>
  );
}
