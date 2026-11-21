// Test-only preview page: renders one registered slide from the URL, with a
// fixed date, so browser tests can check layout without the player.
// /tests/visual/slides.html?slide=<url-encoded JSON>&date=YYYY-MM-DD
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/app/global.css";
import "./preview.css";
import { AudioProvider } from "../../src/media/AudioProvider.tsx";
import { TodayProvider } from "../../src/slides/calendar/today.tsx";
import { slideRegistry } from "../../src/slides/registry.ts";

const params = new URLSearchParams(window.location.search);
const parsed = slideRegistry.slideSchema.safeParse(
  JSON.parse(params.get("slide") ?? "null"),
);
const [year = 2026, month = 11, day = 20] = (params.get("date") ?? "")
  .split("-")
  .map(Number);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

if (!parsed.success) {
  root.textContent = `Invalid slide: ${parsed.error.message}`;
} else {
  const slide = parsed.data;
  const Slide = await slideRegistry.loadComponent(slide);
  createRoot(root).render(
    <StrictMode>
      <TodayProvider date={{ year, month, day }}>
        <AudioProvider>
          <main className="preview">
            <Slide slide={slide} />
          </main>
        </AudioProvider>
      </TodayProvider>
    </StrictMode>,
  );
}
