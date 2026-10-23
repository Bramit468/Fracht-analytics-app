"use client";

import { MessageSquare, RotateCcw, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MAX_QUESTION_LENGTH, type ChatTurn } from "@/lib/assistant-chat";

const EXAMPLES = [
  "Kokia šio mėnesio marža?",
  "Kuri fura šiemet uždirbo mažiausiai?",
  "Kurie užsakovai vėluoja mokėti?",
];

/**
 * „Klausk Bramit“ – pokalbis apie įmonės reisus (#208).
 *
 * Gyvena maketo lygyje, todėl pereinant tarp puslapių pokalbis nedingsta.
 * Istorija – tik šioje naršyklės kortelėje: perkrovus prasideda iš naujo.
 */
export function AssistantChat() {
  /** Ar serveryje yra OpenAI raktas. Kol nežinoma – mygtuko nėra. */
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/klausk")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { enabled?: boolean } | null) => { if (active) setEnabled(body?.enabled === true); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns, busy, error]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const next: ChatTurn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/klausk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const body: { answer?: string; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok || !body.answer) {
        setError(body.error ?? "Nepavyko atsakyti. Bandykite dar kartą.");
        return;
      }
      setTurns([...next, { role: "assistant", content: body.answer }]);
    } catch {
      setError("Nėra ryšio. Bandykite dar kartą.");
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  if (!enabled) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-accent py-2.5 pl-3.5 pr-4 text-sm font-medium text-accent-ink shadow hover:bg-accent/90 print:hidden"
      >
        <MessageSquare aria-hidden className="size-4" strokeWidth={1.75} />
        Klausk
      </button>
    );
  }

  return (
    <section
      aria-label="Klausk Bramit"
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
      className="fixed inset-x-2 bottom-2 top-16 z-40 flex flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow sm:inset-x-auto sm:right-4 sm:top-auto sm:bottom-4 sm:h-[min(600px,calc(100vh-2rem))] sm:w-[400px] print:hidden"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">Klausk Bramit</h2>
        <div className="flex items-center gap-0.5 text-muted">
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => { setTurns([]); setError(""); }}
              title="Naujas pokalbis"
              aria-label="Naujas pokalbis"
              className="grid size-7 place-items-center rounded-md hover:bg-raised hover:text-ink"
            >
              <RotateCcw aria-hidden className="size-3.5" strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Uždaryti"
            aria-label="Uždaryti"
            className="grid size-7 place-items-center rounded-md hover:bg-raised hover:text-ink"
          >
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div ref={list} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {turns.length === 0 && (
          <div>
            <p className="text-muted">
              Klauskite apie reisus, furas, užsakovus ar apmokėjimus. Skaičiai imami iš jūsų išsaugotų reisų.
            </p>
            <ul className="mt-3 space-y-1.5">
              {EXAMPLES.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => void ask(example)}
                    className="w-full rounded-md border border-line px-3 py-2 text-left hover:bg-page"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {turns.map((turn, index) => (
          <div key={index} className={turn.role === "user" ? "flex justify-end" : undefined}>
            <p
              className={
                turn.role === "user"
                  ? "max-w-[85%] whitespace-pre-wrap rounded-lg bg-raised px-3 py-2"
                  : "whitespace-pre-wrap leading-relaxed"
              }
            >
              {turn.content}
            </p>
          </div>
        ))}

        {busy && <p role="status" className="text-muted">Ieškau duomenų…</p>}
        {error && <p role="alert" className="text-bad">{error}</p>}
      </div>

      <form
        onSubmit={(event) => { event.preventDefault(); void ask(draft); }}
        className="flex items-end gap-2 border-t border-line p-3"
      >
        <label className="sr-only" htmlFor="klausk-input">Klausimas</label>
        <textarea
          id="klausk-input"
          ref={input}
          rows={1}
          value={draft}
          maxLength={MAX_QUESTION_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask(draft);
            }
          }}
          placeholder="Jūsų klausimas"
          className="max-h-32 min-h-9 flex-1 resize-none rounded-md border border-line-strong px-3 py-2 text-sm focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || draft.trim() === ""}
          aria-label="Siųsti"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-accent-ink disabled:opacity-40"
        >
          <SendHorizontal aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
      </form>
      <p className="px-3 pb-2 text-[11px] text-muted">AI gali klysti – svarbius skaičius patikrinkite suvestinėje.</p>
    </section>
  );
}
