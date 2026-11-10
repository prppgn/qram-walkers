// CSV of the events of a trajectory: the columns of `qramsim export --format csv-events`.
import type { EventJSON, Trajectory } from "../model/types";

const quote = (v: unknown): string => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function eventsCsv(traj: Trajectory): string {
  const rows = ["t,kind,gate,phase,k,fired_in,text"];
  for (const f of traj.frames) {
    for (const e of f.events) {
      const x = e as EventJSON & { gate?: string; phase?: string; k?: number; fired_in?: number[] };
      const cells = [f.t, x.kind, x.gate, x.phase, x.k, (x.fired_in ?? []).join(" "), x.text];
      rows.push(cells.map(quote).join(","));
    }
  }
  return `${rows.join("\r\n")}\r\n`;
}
