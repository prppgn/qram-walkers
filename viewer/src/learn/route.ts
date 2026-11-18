// Learn lives at #learn (the first chapter) and #learn/<page> (a chapter or the glossary), so
// a chapter can be linked and the browser's Back button works. This store mirrors the hash.
import { create } from "zustand";
import { CHAPTERS } from "./chapters";

/** The page a hash shows, or null when it is not a Learn hash. */
export function pageOfHash(hash: string): string | null {
  if (hash === "#learn" || hash === "#learn/") return CHAPTERS[0]!.id;
  const m = /^#learn\/([\w-]+)$/.exec(hash);
  return m ? m[1]! : null;
}

const hashNow = () => (typeof window === "undefined" ? "" : window.location.hash);

export interface LearnState {
  /** The page shown, or null when Learn is closed. */
  page: string | null;
  open(page?: string): void;
  close(): void;
}

export const useLearn = create<LearnState>((set) => ({
  page: pageOfHash(hashNow()),
  open(page) {
    const hash = page ? `#learn/${page}` : "#learn";
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    set({ page: pageOfHash(hash) });
  },
  close() {
    if (pageOfHash(window.location.hash) !== null) {
      window.history.pushState(null, "", window.location.pathname + window.location.search);
    }
    set({ page: null });
  },
}));

if (typeof window !== "undefined") {
  const sync = () => useLearn.setState({ page: pageOfHash(window.location.hash) });
  window.addEventListener("hashchange", sync);
  window.addEventListener("popstate", sync);
}
