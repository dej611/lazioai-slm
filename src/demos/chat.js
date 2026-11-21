import { chatKitt } from "../engine.js";

const CHIPS = [
  { id: "status", label: "Rapporto di stato", prompt: "Rapporto di stato. Sei operativo?", json: false },
  { id: "route", label: "Rotta per Lazio AI", prompt: "Traccia la rotta per Lazio AI.", json: false },
  { id: "skynet", label: "Sei Skynet?", prompt: "Sei Skynet?", json: false },
  { id: "threat", label: "Livello minaccia", prompt: "Qual è il livello di minaccia in questa sala?", json: true },
];

export function mountChat(root) {
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";

  const panel = document.createElement("div");
  panel.className = "kitt-panel";
  panel.innerHTML = `
    <div class="kitt-panel-label">TERMINALE · TESTO → TESTO</div>
    <div class="eq" aria-hidden="true"></div>
    <div class="kitt-log" data-log></div>
    <div class="kitt-chips" data-chips></div>
    <form class="kitt-form" data-form>
      <input class="kitt-input" data-input type="text" maxlength="180" placeholder="Parla con KITT…" autocomplete="off"/>
      <button class="kitt-rocker" type="submit">INVIA</button>
    </form>
    <p class="kitt-meter" data-meter>tok/s —</p>
  `;
  root.appendChild(panel);
  const eq = panel.querySelector(".eq");
  eq.innerHTML = "<i></i>".repeat(12);

  const log = panel.querySelector("[data-log]");
  const form = panel.querySelector("[data-form]");
  const input = panel.querySelector("[data-input]");
  const meter = panel.querySelector("[data-meter]");
  const chips = panel.querySelector("[data-chips]");
  chips.innerHTML = CHIPS.map(
    (c) => `<button type="button" class="chip" data-chip="${c.id}">${c.label}</button>`,
  ).join("");

  function addLine(who, text) {
    const el = document.createElement("p");
    el.className = `kitt-line kitt-line--${who}`;
    el.textContent = `${who === "kitt" ? "KITT" : "MICHAEL"} » ${text}`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  async function run(prompt, json) {
    root.classList.add("is-talking");
    addLine("user", prompt);
    const out = addLine("kitt", "…");
    const { text, tps } = await chatKitt(prompt, {
      jsonSchema: json,
      onToken: json
        ? undefined
        : (acc) => {
            out.textContent = `KITT » ${acc}`;
            log.scrollTop = log.scrollHeight;
          },
    });
    out.textContent = `KITT » ${text}`;
    meter.textContent = tps ? `${tps.toFixed(1)} tok/s` : "tok/s — fallback";
    root.classList.remove("is-talking");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;
    input.value = "";
    run(prompt, false);
  });

  chips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chip]");
    if (!btn) return;
    const spec = CHIPS.find((c) => c.id === btn.dataset.chip);
    if (spec) run(spec.prompt, Boolean(spec.json));
  });
}
