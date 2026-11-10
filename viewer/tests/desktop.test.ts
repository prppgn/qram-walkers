// The desktop app's window has no browser downloads: exports go through its save dialog.
import { afterEach, describe, expect, it, vi } from "vitest";
import { download, toBase64 } from "../src/export/figure";

const global = globalThis as { window?: unknown };

describe("download in the desktop app", () => {
  afterEach(() => {
    delete global.window;
  });

  it("hands the bytes, base64-encoded, to the window's save dialog", async () => {
    const save_file = vi.fn(async () => "/somewhere/a.tex");
    global.window = { pywebview: { api: { save_file } } };
    await download("a.tex", "Ŝ |∅⟩ → |R⟩", "application/x-tex");
    expect(save_file).toHaveBeenCalledOnce();
    const [name, data] = save_file.mock.calls[0] as unknown as [string, string];
    expect(name).toBe("a.tex");
    expect(Buffer.from(data, "base64").toString("utf-8")).toBe("Ŝ |∅⟩ → |R⟩");
  });

  it("encodes binary data larger than one chunk", async () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 7) % 256);
    const encoded = await toBase64(new Blob([bytes]));
    expect(Buffer.from(encoded, "base64").equals(Buffer.from(bytes))).toBe(true);
  });
});
