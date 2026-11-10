// Shared panel chrome: title, ⓘ button opening the user guide at an anchor, optional
// header controls, collapsible body. Every panel uses it (DESIGN.md §8).
import { useState, type ReactNode } from "react";
import { usePlayback } from "../playback/store";

export function InfoButton({ anchor, topic }: { anchor: string; topic: string }) {
  const openHelp = usePlayback((s) => s.openHelp);
  return (
    <button
      className="info-btn"
      title={`What is this? Open the guide: ${topic}`}
      aria-label={`Help: ${topic}`}
      data-testid={`info-${anchor}`}
      onClick={() => openHelp(anchor)}
    >
      ⓘ
    </button>
  );
}

export function Panel(props: {
  title: string;
  help: string;
  helpTopic?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className={`panel ${props.className ?? ""}`} data-testid={props.testId}>
      <header className="panel-head">
        {props.collapsible !== false && (
          <button
            className="info-btn"
            style={{ color: "var(--ink-2)" }}
            title={open ? "Collapse this panel" : "Expand this panel"}
            aria-label={open ? `Collapse ${props.title}` : `Expand ${props.title}`}
            onClick={() => setOpen(!open)}
          >
            {open ? "▾" : "▸"}
          </button>
        )}
        <span>{props.title}</span>
        <InfoButton anchor={props.help} topic={props.helpTopic ?? props.title} />
        <span className="spacer" />
        {props.actions}
      </header>
      {open && <div className="panel-body">{props.children}</div>}
    </section>
  );
}
