// Learn: a full screen over the simulator that tells the protocol in ten short chapters, each
// with a looping animation of a run computed by the engine, the formulas behind it (folded),
// and a button that loads the run into the simulator. A glossary page lists every term.
import { useEffect, useMemo, useRef } from "react";
import { Glossed, skipsFor } from "../components/glossary/Glossed";
import { TERMS } from "../components/glossary/terms";
import { renderMath } from "../help/markdown";
import { usePlayback } from "../playback/store";
import { CHAPTERS, CHAPTER_BY_ID, GLOSSARY_PAGE, type Chapter } from "./chapters";
import { MiniPlayer } from "./MiniPlayer";
import { useLearn } from "./route";
import { loadLearnTraj } from "./trajectories";
import "./learn.css";

export function LearnButton() {
  const open = useLearn((s) => s.open);
  return (
    <button className="btn" title="Learn how this quantum RAM works: ten short chapters with animations" data-testid="open-learn" onClick={() => open()}>
      Learn
    </button>
  );
}

/** Load the chapter's run into the simulator and play it, pausing at the key moments. */
async function tryIt(ch: Chapter) {
  const traj = await loadLearnTraj(ch.tryIt.traj);
  const p = usePlayback.getState();
  p.load(traj);
  usePlayback.setState({
    preset: ch.tryIt.preset,
    setupOpen: false,
    detailsOpen: false,
    compareOpen: false,
    helpOpen: false,
  });
  useLearn.getState().close();
  p.setGuided(true);
  if (!usePlayback.getState().playing) usePlayback.getState().togglePlay();
}

function Formulas({ ch }: { ch: Chapter }) {
  return (
    <details className="learn-formulas" data-testid="learn-formulas">
      <summary title="Show the formulas of this chapter, in the paper's notation">Formulas</summary>
      {ch.formulas.map((f, i) => (
        <div key={i} className="learn-formula">
          <div className="learn-math" dangerouslySetInnerHTML={{ __html: renderMath(f.tex, true) }} />
          <p className="muted">
            <Glossed text={f.note} gloss={false} />
          </p>
        </div>
      ))}
    </details>
  );
}

function ChapterPage({ ch }: { ch: Chapter }) {
  const openHelp = usePlayback((s) => s.openHelp);
  const go = useLearn((s) => s.open);
  const i = CHAPTERS.indexOf(ch);
  const prev = CHAPTERS[i - 1];
  const next = CHAPTERS[i + 1];
  // a term is marked once per chapter
  const skips = useMemo(() => skipsFor(ch.body), [ch]);
  return (
    <article className="learn-chapter" data-testid="learn-chapter" data-chapter={ch.id}>
      <div className="learn-text">
        <p className="learn-kicker muted">
          Chapter {i + 1} of {CHAPTERS.length}
        </p>
        <h1 id="learn-title" tabIndex={-1}>{ch.title}</h1>
        {ch.body.map((p, j) => (
          <p key={j}>
            <Glossed text={p} skip={skips[j]} />
          </p>
        ))}
        <Formulas ch={ch} />
        <div className="learn-actions">
          <button className="btn primary" data-testid="learn-try" title="Load this run into the simulator and play it, pausing at the key moments" onClick={() => void tryIt(ch)}>
            Try it in the simulator
          </button>
          <button className="btn" data-testid="learn-guide" title="Open the user guide where this is explained in full" onClick={() => openHelp(ch.guide)}>
            More in the guide
          </button>
        </div>
        <nav className="learn-pager" aria-label="Chapters">
          {prev ? (
            <button className="btn" data-testid="learn-prev" title={`The previous chapter: ${prev.title}`} onClick={() => go(prev.id)}>
              ← {prev.title}
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button className="btn" data-testid="learn-next" title={`The next chapter: ${next.title}`} onClick={() => go(next.id)}>
              {next.title} →
            </button>
          ) : (
            <button className="btn" data-testid="learn-next" title="The list of the terms used in the chapters" onClick={() => go(GLOSSARY_PAGE)}>
              Glossary →
            </button>
          )}
        </nav>
      </div>
      <div className="learn-anim">
        <MiniPlayer clip={ch.clip} title={ch.title} />
      </div>
    </article>
  );
}

function GlossaryPage() {
  const openHelp = usePlayback((s) => s.openHelp);
  const terms = useMemo(() => [...TERMS].sort((a, b) => a.label.localeCompare(b.label)), []);
  return (
    <article className="learn-glossary" data-testid="learn-glossary">
      <h1 id="learn-title" tabIndex={-1}>Glossary</h1>
      <p className="muted">
        The words of the protocol, in plain terms. Wherever one of them is underlined, in Learn or in the simulator, pointing at it shows its
        definition and a click opens the guide.
      </p>
      <dl>
        {terms.map((t) => (
          <div key={t.id} className="learn-term" data-term-entry={t.id}>
            <dt>
              <Glossed text={t.label} gloss={false} />
            </dt>
            <dd>
              <Glossed text={t.text} gloss={false} />{" "}
              <button className="linkish" title="Open the user guide where this term is defined" onClick={() => openHelp(t.anchor)}>
                In the guide
              </button>
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function Learn() {
  const page = useLearn((s) => s.page);
  const go = useLearn((s) => s.open);
  const close = useLearn((s) => s.close);
  const main = useRef<HTMLElement>(null);
  const nav = useRef<HTMLElement>(null);
  const open = page !== null;

  // the simulator waits while Learn is open
  useEffect(() => {
    if (open) usePlayback.setState({ playing: false });
  }, [open]);

  // a new page starts at its top, with the focus on its title for screen readers; the list
  // of chapters (a row in narrow windows) keeps the current one in view
  useEffect(() => {
    if (!open) return;
    nav.current?.querySelector("[aria-current='page']")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    main.current?.scrollTo?.({ top: 0 });
    main.current?.querySelector<HTMLElement>("#learn-title")?.focus({ preventScroll: true });
  }, [open, page]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || usePlayback.getState().helpOpen) return;
      if (document.querySelector("[data-testid='term-popover']")) return; // Esc hides the popover first
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;
  const ch = CHAPTER_BY_ID[page];
  const glossary = page === GLOSSARY_PAGE;
  return (
    <div className="learn" data-testid="learn" role="dialog" aria-modal="true" aria-labelledby="learn-title">
      <header className="learn-head">
        <strong className="brand">Learn</strong>
        <span className="muted learn-sub">How the quantum-walker qRAM works, in ten short chapters</span>
        <span className="spacer" />
        <button className="btn" data-testid="learn-close" title="Close Learn and go back to the simulator (Esc)" onClick={close}>
          Back to the simulator
        </button>
      </header>
      <div className="learn-body">
        <nav className="learn-nav" aria-label="Learn" ref={nav}>
          <ol>
            {CHAPTERS.map((c, i) => (
              <li key={c.id}>
                <button
                  className={`learn-nav-item${c.id === page ? " active" : ""}`}
                  data-testid={`learn-nav-${c.id}`}
                  aria-current={c.id === page ? "page" : undefined}
                  title={`Chapter ${i + 1}: ${c.title}`}
                  onClick={() => go(c.id)}
                >
                  <span className="learn-nav-num mono">{i + 1}</span>
                  <span>{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <button
            className={`learn-nav-item glossary${glossary ? " active" : ""}`}
            data-testid="learn-nav-glossary"
            aria-current={glossary ? "page" : undefined}
            title="Every term of the protocol, with its definition"
            onClick={() => go(GLOSSARY_PAGE)}
          >
            <span className="learn-nav-num mono">≡</span>
            <span>Glossary</span>
          </button>
        </nav>
        <main className="learn-main" ref={main}>
          {ch ? <ChapterPage key={ch.id} ch={ch} /> : glossary ? <GlossaryPage /> : <ChapterPage ch={CHAPTERS[0]!} />}
        </main>
      </div>
    </div>
  );
}
