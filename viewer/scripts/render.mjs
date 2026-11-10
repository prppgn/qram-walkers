// Headless exports of the viewer, called by `qramsim video` and `qramsim figure`: a browser
// (Playwright) draws the built viewer's render stage, frame by frame; ffmpeg assembles the
// video. The trajectory is a file computed by the engine: nothing is simulated here.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const { values: a } = parseArgs({
  options: {
    url: { type: "string" },
    traj: { type: "string" },
    mode: { type: "string" }, // video | figure
    out: { type: "string" },
    theme: { type: "string", default: "paper" },
    width: { type: "string", default: "1920" },
    height: { type: "string", default: "1080" },
    duration: { type: "string", default: "20" },
    fps: { type: "string", default: "30" },
    hold: { type: "string", default: "1" },
    figure: { type: "boolean", default: false },
    orientation: { type: "string", default: "horizontal" },
    tick: { type: "string" },
    scale: { type: "string", default: "3" },
  },
});

// macOS refuses the bundled Chromium of this Playwright version (D23): use installed Chrome.
const channel = process.env.PW_CHANNEL ?? (process.platform === "darwin" ? "chrome" : undefined);

function encoder(out, fps) {
  const input = ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-"];
  const output =
    extname(out).toLowerCase() === ".gif"
      ? ["-vf", "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", out]
      : ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out];
  const proc = spawn("ffmpeg", [...input, ...output], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
  });
  return { stdin: proc.stdin, done };
}

async function video(page) {
  const fps = Number(a.fps);
  const total = Math.max(2, Math.round(Number(a.duration) * fps));
  const hold = Math.min(Math.round(Number(a.hold) * fps), Math.floor(total / 4));
  const { stdin, done } = encoder(a.out, fps);
  for (let i = 0; i < total; i++) {
    await page.evaluate(([j, n, h]) => window.__qram.seekVideo(j, n, h, h), [i, total, hold]);
    const png = await page.screenshot({ type: "png" });
    if (!stdin.write(png)) await new Promise((r) => stdin.once("drain", r));
    if (i % fps === 0) process.stdout.write(`\rframe ${i + 1}/${total}`);
  }
  stdin.end();
  await done;
  process.stdout.write(`\rframe ${total}/${total}\n`);
}

async function figure(page) {
  const frames = await page.evaluate(() => document.querySelector(".render-stage") !== null);
  if (!frames) throw new Error("the render stage did not start");
  const ext = extname(a.out).toLowerCase();
  if (ext === ".svg") {
    await writeFile(a.out, await page.evaluate((t) => window.__qram.svg(t), a.theme));
  } else if (ext === ".png") {
    const b64 = await page.evaluate(([t, s]) => window.__qram.png(t, s), [a.theme, Number(a.scale)]);
    await writeFile(a.out, Buffer.from(b64, "base64"));
  } else if (ext === ".tex") {
    await writeFile(a.out, await page.evaluate(() => window.__qram.tikz()));
  } else {
    throw new Error(`unknown figure format ${ext} (use .svg, .png or .tex)`);
  }
}

let browser;
try {
  browser = await chromium.launch({ channel: channel || undefined });
} catch (e) {
  console.error(`could not start a browser: ${e.message}`);
  console.error(
    channel === "chrome"
      ? "Install Google Chrome, or set PW_CHANNEL to another browser."
      : "Run `pnpm exec playwright install chromium` in viewer/ (see INSTALL.md).",
  );
  process.exit(1);
}
try {
  const page = await browser.newPage({ viewport: { width: Number(a.width), height: Number(a.height) } });
  page.on("pageerror", (e) => console.error(`page error: ${e.message}`));
  await page.goto(`${a.url}?render`);
  await page.waitForFunction(() => window.__qram !== undefined);
  const count = await page.evaluate((text) => window.__qram.load(JSON.parse(text)), await readFile(a.traj, "utf-8"));
  await page.evaluate(
    (patch) => window.__qram.setView(patch),
    { theme: a.theme, figure: a.figure, orientation: a.orientation },
  );
  if (a.mode === "video") {
    await video(page);
  } else {
    const tick = a.tick === undefined ? count - 2 : Number(a.tick);
    if (tick < -1 || tick > count - 2) throw new Error(`tick ${tick} is outside -1..${count - 2}`);
    await page.evaluate((f) => window.__qram.seek(f), tick + 1);
    await figure(page);
  }
} finally {
  await browser.close();
}
