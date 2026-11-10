import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme/theme.css";
import "./app.css";
import { App } from "./App";
import { RenderStage } from "./components/RenderStage";
import { holdSession } from "./engine/client";

// ?render: the bare stage driven by the headless exports (`qramsim video`, `qramsim figure`).
const headless = new URLSearchParams(window.location.search).has("render");

if (!headless) void holdSession();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {headless ? <RenderStage /> : <App />}
  </StrictMode>,
);
