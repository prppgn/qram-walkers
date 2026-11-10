// User guide drawer: tabs per page, opens at the anchor an ⓘ button asked for.
import { useEffect, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { GUIDE, pageOfAnchor } from "../help/guide";
import { usePlayback } from "../playback/store";

export function HelpPanel() {
  const { helpOpen, helpAnchor, closeHelp } = usePlayback();
  const [page, setPage] = useState(GUIDE[0]?.id ?? "");
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!helpOpen) return;
    const target = helpAnchor ? pageOfAnchor(helpAnchor) : undefined;
    if (target) setPage(target.id);
  }, [helpOpen, helpAnchor]);

  useEffect(() => {
    if (!helpOpen || !body.current) return;
    if (!helpAnchor) {
      body.current.scrollTop = 0;
      return;
    }
    const el = body.current.querySelector<HTMLElement>(`[id="${helpAnchor}"]`);
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.classList.add("help-target");
      const t = setTimeout(() => el.classList.remove("help-target"), 1600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [helpOpen, helpAnchor, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeHelp();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHelp]);

  if (!helpOpen) return null;
  const current = GUIDE.find((p) => p.id === page) ?? GUIDE[0];
  return (
    <aside className="help-panel" data-testid="help-panel" aria-label="User guide">
      <header className="help-head">
        <strong>User guide</strong>
        <nav className="help-tabs">
          {GUIDE.map((p) => (
            <button
              key={p.id}
              className={`btn ${p.id === page ? "active" : ""}`}
              title={`Open the page "${p.title || p.tab}"`}
              onClick={() => {
                setPage(p.id);
                usePlayback.setState({ helpAnchor: null });
              }}
            >
              {p.tab}
            </button>
          ))}
        </nav>
        <button className="btn icon" title="Close the guide (Esc)" aria-label="Close the guide" onClick={closeHelp}>
          ✕
        </button>
      </header>
      <div className="help-body" ref={body}>
        {current ? (
          <article
            className="guide"
            onClick={(e) => {
              // Cross-page links of the guide: "gates.md#gate-U", "#anchor", "faq.md".
              const a = (e.target as HTMLElement).closest("a");
              const href = a?.getAttribute("href") ?? "";
              const m = /^(?:\.\/)?([\w-]+)\.md(?:#([\w-]+))?$|^#([\w-]+)$/.exec(href);
              if (!a) return;
              if (!m) {
                a.setAttribute("target", "_blank");
                a.setAttribute("rel", "noreferrer");
                return;
              }
              e.preventDefault();
              const anchor = m[2] ?? m[3] ?? null;
              if (m[1]) setPage(m[1]);
              usePlayback.setState({ helpAnchor: anchor });
            }}
            dangerouslySetInnerHTML={{ __html: current.html }}
          />
        ) : (
          <p className="muted">The guide pages are not available in this build.</p>
        )}
        <footer className="help-cite muted">
          G. De Riso, G. Catalano, S. Lloyd, V. Giovannetti, D. De Santis, <em>A resource-efficient
          quantum-walker Quantum RAM</em>, arXiv:2508.02855.
        </footer>
      </div>
    </aside>
  );
}
