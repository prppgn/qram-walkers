// Gate windows on the tree (pure, from trajectory metadata): which sites each gate
// type covers at each level, for drawing bands and flashes.
import type { MetaJSON } from "../model/types";

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (d: number) => [...String(d)].map((c) => SUP[Number(c)]).join("");

export const TREE_GATES = new Set(["U", "U_in", "U_B"]);

export interface WindowGroup {
  key: string;
  type: string;
  level: number;
  sites: [number, number]; // lowest and highest window site
  control: number | null;
  label: string;
  tip: string;
}

/** Gate windows on the tree, one group per (type, level): Û⁽ᵈ⁾ covers the whole edge,
 *  Û_in / Û_B their short windows (backup: sites 3–2 and 4–2; qudit short range: 2–1);
 *  the many Û_B instances of a level share one window. */
export function windowGroups(meta: MetaJSON): WindowGroup[] {
  const groups = new Map<string, WindowGroup>();
  for (const g of meta.gates) {
    if (!TREE_GATES.has(g.type)) continue;
    const key = `${g.type}:${g.level}`;
    if (groups.has(key)) continue;
    const lo = Math.min(...g.window);
    const hi = Math.max(...g.window);
    const name = g.type === "U" ? "Û" : g.type === "U_in" ? "Û_in" : "Û_B";
    const tip =
      g.type === "U"
        ? `${g.label}: window = every site of the edge; control = site ${g.control_site} (A${g.level})`
        : g.type === "U_in"
          ? `Û_in at level ${g.level}: control A${g.level} on site ${g.control_site}, target on site ${g.target_sites.join(", ")}`
          : `Û_B at level ${g.level}: control (blue) on site ${g.control_site}, target${g.target_sites.length > 1 ? "s" : ""} on site${g.target_sites.length > 1 ? "s" : ""} ${g.target_sites.join(" and ")}; fires once per control walker`;
    groups.set(key, {
      key,
      type: g.type,
      level: g.level,
      sites: [lo, hi],
      control: g.control_site,
      label: `${name}${"⁽" + sup(g.level) + "⁾"}`,
      tip,
    });
  }
  return [...groups.values()];
}

