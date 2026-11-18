// The Welcome dialog (first visit) and the tutorial: a dimmed page with the parts of the
// current step lit, and a card with the step's text and Back / Next / Skip / Got it.
// Keyboard: → next, ← back, Esc skip, Tab stays inside the card.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { usePlayback } from "../../playback/store";
import { Scripted } from "../panels/KetPanel";
import { placeCard, type Box } from "./place";
import { TOUR_STEPS } from "./steps";
import { TOUR_PRESET, useTour } from "./tourStore";
import "./tour.css";

const PAD = 6; // room around a lit part

/** One lit area per selector: the union of its visible matches, inside the window. */
export function measure(selectors: string[]): Box[] {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const out: Box[] = [];
  for (const sel of selectors) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      x0 = Math.min(x0, r.left);
      y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right);
      y1 = Math.max(y1, r.bottom);
    }
    if (x0 === Infinity) continue;
    const x = Math.max(2, x0 - PAD);
    const y = Math.max(2, y0 - PAD);
    const w = Math.min(W - 2, x1 + PAD) - x;
    const h = Math.min(H - 2, y1 + PAD) - y;
    if (w > 0 && h > 0) out.push({ x, y, w, h });
  }
  return out;
}

/** Keep Tab and Shift+Tab inside `box`. */
function trapTab(e: ReactKeyboardEvent, box: HTMLElement | null) {
  if (e.key !== "Tab" || !box) return;
  const items = [...box.querySelectorAll<HTMLElement>("button:not([disabled])")];
  if (!items.length) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function TutorialButton() {
  const start = useTour((s) => s.start);
  return (
    <button className="btn" title="Take the guided tour of the interface (8 steps, on the example E1)" data-testid="open-tutorial" onClick={start}>
      Tutorial
    </button>
  );
}

export function Welcome() {
  const open = useTour((s) => s.welcome);
  const start = useTour((s) => s.start);
  const dismiss = useTour((s) => s.dismissWelcome);
  const card = useRef<HTMLDivElement>(null);
  const go = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    go.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, dismiss]);

  if (!open) return null;
  return (
    <div className="tour-backdrop" data-testid="welcome">
      <div
        className="tour-card welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-text"
        ref={card}
        onKeyDown={(e) => trapTab(e, card.current)}
      >
        <h2 id="welcome-title">Welcome to qram-walkers</h2>
        <div id="welcome-text">
          <p>
            This program simulates a quantum RAM: a memory that can be read at a superposition of addresses. Quantum
            walkers carry the address down a binary tree, pick up the stored bits and bring them back. Every colour and
            number comes from an exact simulation of the protocol of arXiv:2508.02855.
          </p>
          <p>A short tutorial, eight steps and about two minutes, shows what you are looking at.</p>
        </div>
        <footer className="tour-buttons">
          <span className="muted tour-hint">You can take it later from Tutorial in the top bar.</span>
          <button className="btn" title="Close this message and go to the program (Esc)" data-testid="welcome-skip" onClick={dismiss}>
            Skip
          </button>
          <button ref={go} className="btn primary" title="Start the guided tour of the interface" data-testid="welcome-start" onClick={start}>
            Start tutorial
          </button>
        </footer>
      </div>
    </div>
  );
}

export function Tour() {
  const step = useTour((s) => s.step);
  const { next, back, finish } = useTour.getState();
  const traj = usePlayback((s) => s.traj);
  const preset = usePlayback((s) => s.preset);
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [holes, setHoles] = useState<Box[]>([]);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // the card slides from step to step, but appears in place
  const [slide, setSlide] = useState(false);
  const open = step !== null;
  const current = open ? TOUR_STEPS[step] : undefined;

  // the frame of the step, once E1 is loaded
  useEffect(() => {
    if (!current || !traj || preset !== TOUR_PRESET) return;
    usePlayback.getState().seek(current.frame(traj));
  }, [current, traj, preset]);

  // in a narrow window the page scrolls: bring the lit parts into view (the tree as a whole)
  useEffect(() => {
    if (!current) return;
    for (const sel of current.targets) {
      const el = document.querySelector(sel);
      const box = el instanceof SVGElement ? el.closest("[data-testid='tree-canvas']") : el;
      box?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [current]);

  // follow the lit parts while the page moves (fit, lens, window size)
  useEffect(() => {
    if (!current) return;
    let raf = 0;
    let last = "";
    const loop = () => {
      const now = measure(current.targets);
      const key = JSON.stringify(now);
      if (key !== last) {
        last = key;
        setHoles(now);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [current]);

  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const avoid = current?.avoid ? (measure([current.avoid])[0] ?? null) : null;
    setPos(placeCard(holes, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight, avoid));
  }, [holes, step, current]);
  useEffect(() => {
    if (!open) {
      setPos(null);
      setSlide(false);
      return;
    }
    if (!pos || slide) return;
    const raf = requestAnimationFrame(() => setSlide(true));
    return () => cancelAnimationFrame(raf);
  }, [open, pos, slide]);

  // focus: the main button at each step; back where it was when the tour closes
  useEffect(() => {
    if (!open) return;
    if (!returnFocus.current) returnFocus.current = document.activeElement as HTMLElement | null;
    primary.current?.focus();
  }, [open, step]);
  useEffect(() => {
    if (open) return;
    returnFocus.current?.focus?.();
    returnFocus.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else if (e.key === "Escape") finish(false);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, next, back, finish]);

  if (!current || step === null) return null;
  const lastStep = step === TOUR_STEPS.length - 1;
  return (
    <div className="tour" data-testid="tour" data-step={current.id} data-lit={holes.length}>
      <svg className="tour-shade" aria-hidden="true">
        <defs>
          <mask id="tour-mask">
            <rect x={0} y={0} width="100%" height="100%" fill="white" />
            {holes.map((h, i) => (
              <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx={8} fill="black" />
            ))}
          </mask>
        </defs>
        <rect className="tour-dim" x={0} y={0} width="100%" height="100%" mask="url(#tour-mask)" />
        {holes.map((h, i) => (
          <rect key={i} className="tour-ring" x={h.x} y={h.y} width={h.w} height={h.h} rx={8} />
        ))}
      </svg>
      <div
        className={slide ? "tour-card slide" : "tour-card"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        ref={card}
        style={pos ? { left: pos.x, top: pos.y } : { left: 0, top: 0, opacity: 0 }}
        onKeyDown={(e) => trapTab(e, card.current)}
      >
        <header className="tour-head">
          <span className="tour-count mono" data-testid="tour-count">
            {step + 1} / {TOUR_STEPS.length}
          </span>
          <h2 id="tour-title">
            <Scripted text={current.title} />
          </h2>
        </header>
        <p id="tour-text" className="tour-text" aria-live="polite">
          <Scripted text={current.text} />
        </p>
        <footer className="tour-buttons">
          <button className="btn" title="Close the tutorial (Esc)" data-testid="tour-skip" onClick={() => finish(false)}>
            Skip
          </button>
          <span className="spacer" />
          <button className="btn" title="The previous step (←)" data-testid="tour-back" disabled={step === 0} onClick={back}>
            Back
          </button>
          <button
            ref={primary}
            className="btn primary"
            title={lastStep ? "Close the tutorial and play E1 from the start, pausing at the key moments" : "The next step (→)"}
            data-testid={lastStep ? "tour-done" : "tour-next"}
            onClick={next}
          >
            {lastStep ? "Got it" : "Next"}
          </button>
        </footer>
      </div>
    </div>
  );
}
