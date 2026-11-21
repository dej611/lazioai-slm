import Reveal from "reveal.js";
import RevealHighlight from "reveal.js/plugin/highlight/highlight.esm.js";
import RevealNotes from "reveal.js/plugin/notes/notes.esm.js";
import "reveal.js/dist/reveal.css";
import "reveal.js/plugin/highlight/monokai.css";
import "../style.css";

import { loadModel, loadedModelId, nanoAvailability, nanoHasVision, nanoUsable, onEngine } from "./engine.js";
import { mountChat } from "./demos/chat.js";
import { mountVision } from "./demos/vision.js";
import { mountVoice } from "./demos/voice.js";
import { mountTranslate } from "./demos/translate.js";

const scanner = document.getElementById("kitt-scanner");
const statusEl = document.getElementById("kitt-status-text");
const engageBtn = document.getElementById("kitt-engage");
const slideEngage = document.getElementById("slide-engage");
const engageScanner = document.getElementById("engage-scanner");
const modelSelect = document.getElementById("kitt-model");

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

onEngine(({ message, progress }) => {
  if (message) setStatus(message.toUpperCase());
  if (typeof progress === "number" && scanner) {
    scanner.style.setProperty("--load", `${progress}%`);
  }
});

function fireEngageFx() {
  engageScanner?.classList.add("is-on");
}

slideEngage?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  fireEngageFx();
});

engageBtn?.addEventListener("click", async (e) => {
  e.stopPropagation();
  const id = modelSelect?.value || "qwen";
  engageBtn.disabled = true;
  if (modelSelect) modelSelect.disabled = true;
  engageBtn.textContent = "IN ASCOLTO";
  setStatus("CARICAMENTO MODELLO…");
  const result = await loadModel(id);
  engageBtn.disabled = false;
  if (modelSelect) modelSelect.disabled = false;
  engageBtn.textContent = result.ok ? "SISTEMA PRONTO" : "RIPROVA";
});

modelSelect?.addEventListener("change", () => {
  if (loadedModelId() && loadedModelId() !== modelSelect.value) {
    engageBtn.disabled = false;
    engageBtn.textContent = "ENGAGE";
    setStatus("CAMBIO MOTORE");
  }
});

void nanoAvailability().then((status) => {
  const opt = modelSelect?.querySelector('option[value="nano"]');
  if (!opt) return;
  if (!nanoUsable(status)) {
    opt.disabled = true;
    opt.textContent = "Gemini Nano (solo Chrome)";
    if (modelSelect.value === "nano") modelSelect.value = "qwen";
    return;
  }
  opt.disabled = false;
  opt.textContent = nanoHasVision() ? "Gemini Nano" : "Gemini Nano (solo testo)";
});

function mountDemos(slide) {
  if (!slide) return;
  const chat = slide.querySelector("[data-demo='chat']");
  const vision = slide.querySelector("[data-demo='vision']");
  const voice = slide.querySelector("[data-demo='voice']");
  const translate = slide.querySelector("[data-demo='translate']");
  if (chat) mountChat(chat);
  if (vision) mountVision(vision);
  if (voice) mountVoice(voice);
  if (translate) mountTranslate(translate);
}

function kittShouldBeVisible(slide) {
  return Boolean(slide?.querySelector("[data-demo]"));
}

function syncKittChrome(slide) {
  const on = kittShouldBeVisible(slide);
  const wasOn = document.body.classList.contains("kitt-on");
  document.body.classList.toggle("kitt-on", on);
  if (on !== wasOn) Reveal.layout();
}

Reveal.initialize({
  hash: true,
  center: true,
  transition: "fade",
  transitionSpeed: "fast",
  width: 1280,
  height: 720,
  margin: 0.06,
  minScale: 0.2,
  maxScale: 2.4,
  plugins: [RevealHighlight, RevealNotes],
}).then(() => {
  const slide = Reveal.getCurrentSlide();
  syncKittChrome(slide);
  mountDemos(slide);
  Reveal.on("slidechanged", (event) => {
    syncKittChrome(event.currentSlide);
    mountDemos(event.currentSlide);
  });
});
