import { loadedModelId, MODELS, translateText } from "../engine.js";

const LANGS = [
  { id: "it", name: "Italiano" },
  { id: "en", name: "English" },
  { id: "fr", name: "Français" },
  { id: "es", name: "Español" },
  { id: "de", name: "Deutsch" },
];

const SAMPLES = [
  { id: "it", label: "Frase IT", lang: "it", text: "Siamo a LazioAI: un modello piccolo gira in questa scheda, senza server." },
  { id: "en", label: "Frase EN", lang: "en", text: "A small model is running in this tab. No server, no API key." },
];

function langName(id) {
  return LANGS.find((l) => l.id === id)?.name || id;
}

function motorLabel() {
  const id = loadedModelId();
  return id ? MODELS[id].label : "nessun motore";
}

export function mountTranslate(root) {
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";

  const options = LANGS.map((l) => `<option value="${l.id}">${l.name}</option>`).join("");
  const panel = document.createElement("div");
  panel.className = "kitt-panel";
  panel.innerHTML = `
    <div class="kitt-panel-label">TRADUZIONE · SLM</div>
    <div class="eq" aria-hidden="true"></div>
    <div class="kitt-lang-row">
      <label>DA <select data-src>${options}</select></label>
      <label>A <select data-tgt>${options}</select></label>
    </div>
    <textarea class="kitt-input kitt-input--area" data-in maxlength="400" placeholder="Testo da tradurre…"></textarea>
    <div class="kitt-chips" data-chips></div>
    <button type="button" class="kitt-rocker" data-go>TRADUCI</button>
    <p class="kitt-caption kitt-caption--reply" data-out></p>
    <p class="kitt-meter" data-meter>tok/s —</p>
    <p class="kitt-note" data-note></p>
  `;
  root.appendChild(panel);
  panel.querySelector(".eq").innerHTML = "<i></i>".repeat(12);

  const src = panel.querySelector("[data-src]");
  const tgt = panel.querySelector("[data-tgt]");
  const input = panel.querySelector("[data-in]");
  const out = panel.querySelector("[data-out]");
  const meter = panel.querySelector("[data-meter]");
  const note = panel.querySelector("[data-note]");
  const chips = panel.querySelector("[data-chips]");
  tgt.value = "en";
  chips.innerHTML = SAMPLES.map(
    (c) => `<button type="button" class="chip" data-chip="${c.id}">${c.label}</button>`,
  ).join("");

  function syncNote() {
    note.textContent = `Motore: ${motorLabel()}. Non è la Translator API.`;
  }
  syncNote();

  async function run() {
    const text = input.value.trim();
    if (!text) return;
    syncNote();
    root.classList.add("is-talking");
    out.textContent = "…";
    const { text: translated, tps } = await translateText(text, {
      sourceName: langName(src.value),
      targetName: langName(tgt.value),
      onToken: (acc) => {
        out.textContent = acc;
      },
    });
    out.textContent = translated;
    meter.textContent = tps ? `${tps.toFixed(1)} tok/s` : "tok/s —";
    root.classList.remove("is-talking");
  }

  panel.querySelector("[data-go]").addEventListener("click", () => {
    void run();
  });
  chips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chip]");
    if (!btn) return;
    const spec = SAMPLES.find((c) => c.id === btn.dataset.chip);
    if (!spec) return;
    src.value = spec.lang;
    input.value = spec.text;
  });
}
