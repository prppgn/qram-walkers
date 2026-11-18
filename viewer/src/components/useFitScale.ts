// Zoom of a drawing shown with a viewBox (preserveAspectRatio "meet"): the scale from scene
// units to screen pixels, so that its text can be kept at 13 px or more (layout/lod.ts).
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { gateSpots, lodClasses, lodFor } from "../layout/lod";
import type { MetaJSON } from "../model/types";
import type { Layout } from "../layout/unfoldedH";

export function useFitScale(box: { w: number; h: number }): [RefObject<SVGSVGElement>, number] {
  const ref = useRef<SVGSVGElement>(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setK(Math.min(width / box.w, height / box.h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box.w, box.h]);
  return [ref, k];
}

/** Class and style of an svg that shows `layout` at zoom `k`. */
export function lodProps(layout: Layout, meta: MetaJSON, k: number): { className: string; style: CSSProperties } {
  return { className: lodClasses(lodFor(layout, k, 1, gateSpots(layout, meta))), style: { "--tk": k } as CSSProperties };
}
