// Text with its mathematics typeset and its glossary terms marked: hovering or focusing a term
// shows its definition (GlossaryPopover), Enter or a click opens the guide there. Terms are
// found by themselves in plain text (each once per block), or written as [[id|shown text]]
// ([[id]] alone shows the id, which is then the word itself: [[colour]]).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { texHtml } from "../../layout/tex";
import { proseParts } from "../../layout/proseTex";
import { usePlayback } from "../../playback/store";
import { glossPieces, TERM_BY_ID, termOfSymbol } from "./terms";
import "./glossary.css";

const MARKUP = /\[\[([\w-]+)(?:\|([^\]]+))?\]\]/g;

/** The text without the [[id|…]] markup, as it reads. */
export function plainOf(text: string): string {
  return text.replace(MARKUP, (_, id: string, shown?: string) => shown ?? id);
}

function TermSpan({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span className="term" data-term={id} tabIndex={0} aria-describedby="term-popover">
      {children}
    </span>
  );
}

type Token =
  | { t: "text"; v: string; term?: string }
  | { t: "tex"; v: string; src: string; term?: string }
  | { t: "markup"; id: string; shown: string };

/** Typeset symbols and plain words; terms marked when `gloss` (and added to `seen`). */
function proseTokens(text: string, seen: Set<string>, gloss: boolean): Token[] {
  return proseParts(text).flatMap((p): Token[] => {
    if (p.t === "tex") {
      const id = gloss ? termOfSymbol(p.src) : undefined;
      if (!id || seen.has(id)) return [{ t: "tex", v: p.v, src: p.src }];
      seen.add(id);
      return [{ t: "tex", v: p.v, src: p.src, term: id }];
    }
    if (!gloss) return [{ t: "text", v: p.v }];
    return glossPieces(p.v, seen).map((g) => ({ t: "text", v: g.text, term: g.term }));
  });
}

/** The pieces of a text, and the terms marked once it is read (`skip` plus its own). Pure. */
function tokensOf(text: string, skip: ReadonlySet<string>, gloss: boolean): { tokens: Token[]; seen: Set<string> } {
  const seen = new Set(skip);
  // a term written as markup is marked there, not where the same word happens to come first
  for (const m of text.matchAll(MARKUP)) seen.add(m[1]!);
  const tokens: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKUP)) {
    tokens.push(...proseTokens(text.slice(last, m.index), seen, gloss));
    const id = m[1]!;
    tokens.push({ t: "markup", id, shown: m[2] ?? id });
    last = (m.index ?? 0) + m[0].length;
  }
  tokens.push(...proseTokens(text.slice(last), seen, gloss));
  return { tokens, seen };
}

/** For blocks read one after the other (the paragraphs of a page): the terms each block must
 *  not mark again, so that a term is marked only where it first appears. */
export function skipsFor(texts: string[]): ReadonlySet<string>[] {
  const out: ReadonlySet<string>[] = [];
  let seen: ReadonlySet<string> = new Set();
  for (const t of texts) {
    out.push(seen);
    seen = tokensOf(t, seen, true).seen;
  }
  return out;
}

function render(tokens: Token[], key: string): ReactNode[] {
  return tokens.map((k, i) => {
    if (k.t === "markup") {
      return (
        <TermSpan key={`${key}${i}`} id={k.id}>
          {render(tokensOf(k.shown, new Set(), false).tokens, `${key}${i}.`)}
        </TermSpan>
      );
    }
    if (k.t === "tex") {
      const html = { __html: texHtml(k.v) };
      return k.term ? (
        <span key={`${key}${i}`} className="tex term" data-term={k.term} tabIndex={0} aria-describedby="term-popover" dangerouslySetInnerHTML={html} />
      ) : (
        <span key={`${key}${i}`} className="tex" title={k.src} dangerouslySetInnerHTML={html} />
      );
    }
    return k.term ? (
      <TermSpan key={`${key}${i}`} id={k.term}>
        {k.v}
      </TermSpan>
    ) : (
      <span key={`${key}${i}`}>{k.v}</span>
    );
  });
}

/** Text with its symbols typeset and its terms marked (each once; none of `skip`). */
export function Glossed({ text, className, gloss = true, skip }: { text: string; className?: string; gloss?: boolean; skip?: ReadonlySet<string> }) {
  const tokens = useMemo(() => tokensOf(text, skip ?? new Set(), gloss).tokens, [text, skip, gloss]);
  return (
    <span className={className} data-plain={plainOf(text)}>
      {render(tokens, "g")}
    </span>
  );
}

interface Shown {
  id: string;
  rect: DOMRect;
}

/** The one popover of the page, for every [data-term] element (event delegation). */
export function GlossaryPopover() {
  const [shown, setShown] = useState<Shown | null>(null);
  const hide = useRef<number | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);
  const openHelp = usePlayback((s) => s.openHelp);

  useEffect(() => {
    const termOf = (t: EventTarget | null) => (t instanceof Element ? (t.closest("[data-term]") as HTMLElement | null) : null);
    const show = (el: HTMLElement) => {
      window.clearTimeout(hide.current);
      setShown({ id: el.dataset.term!, rect: el.getBoundingClientRect() });
    };
    const later = () => {
      window.clearTimeout(hide.current);
      hide.current = window.setTimeout(() => setShown(null), 250);
    };
    const over = (e: Event) => {
      const el = termOf(e.target);
      if (el) show(el);
      else if (box.current?.contains(e.target as Node)) window.clearTimeout(hide.current);
    };
    const out = (e: Event) => {
      if (termOf(e.target) || box.current?.contains(e.target as Node)) later();
    };
    const open = (el: HTMLElement) => {
      const term = TERM_BY_ID[el.dataset.term ?? ""];
      if (!term) return;
      setShown(null);
      openHelp(term.anchor);
    };
    const click = (e: MouseEvent) => {
      const el = termOf(e.target);
      if (!el) return;
      e.stopPropagation();
      open(el);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShown(null);
      const el = termOf(e.target);
      if (el && e.key === "Enter") {
        e.preventDefault();
        open(el);
      }
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", over);
    document.addEventListener("focusout", out);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", over);
      document.removeEventListener("focusout", out);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key);
    };
  }, [openHelp]);

  const term = shown ? TERM_BY_ID[shown.id] : undefined;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!shown || !box.current) return setPos(null);
    const w = box.current.offsetWidth;
    const h = box.current.offsetHeight;
    const r = shown.rect;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
    setPos({ left, top });
  }, [shown]);

  if (!shown || !term) return null;
  return (
    <div
      ref={box}
      id="term-popover"
      className="term-popover"
      role="tooltip"
      data-testid="term-popover"
      data-shows={term.id}
      style={pos ?? { left: 0, top: 0, opacity: 0 }}
      onClick={() => {
        setShown(null);
        openHelp(term.anchor);
      }}
    >
      <strong>
        <Glossed text={term.label} gloss={false} />
      </strong>
      <span className="term-text">
        <Glossed text={term.text} gloss={false} />
      </span>
      <span className="term-more muted">Click or press Enter for the guide.</span>
    </div>
  );
}
