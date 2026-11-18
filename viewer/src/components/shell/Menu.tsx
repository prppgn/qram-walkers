// A button that opens a small menu under it; closes on a click outside, on Escape and
// (unless `keepOpen`) when an item is chosen.
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Menu(props: {
  label: ReactNode;
  title: string;
  testId: string;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="menu" ref={box}>
      <button
        className={`btn${open ? " active" : ""}`}
        title={props.title}
        aria-haspopup="true"
        aria-expanded={open}
        data-testid={props.testId}
        onClick={() => setOpen(!open)}
      >
        {props.label} ▾
      </button>
      {open && (
        <div className={`menu-pop ${props.align === "right" ? "right" : ""}`} role="menu" data-testid={`${props.testId}-menu`}>
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
