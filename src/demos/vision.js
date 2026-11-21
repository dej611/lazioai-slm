import { CANNED } from "../kitt-prompt.js";
import { captionWithNano, loadedModelId } from "../engine.js";

const PROPS = [
  { id: "scanner", src: "/props/scanner.png", caption: CANNED.visualScanner, label: "Scanner" },
  { id: "lazioai", src: "/props/lazioinnova.png", caption: CANNED.visualLazioInnova, label: "Lazio Innova" },
  { id: "gazzetta", src: "/props/gazzetta.png", caption: CANNED.visualGazzetta, label: "Gazzetta" },
];

const VISION_PROMPT =
  "Describe this image in Italian in one or two short sentences. Address the user as Michael.";

let vision = null;

function usableCaption(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length < 12) return "";
  if (/^\d+([.,]\d+)?$/.test(t)) return "";
  const digits = (t.match(/\d/g) || []).length;
  if (digits > 0 && digits >= t.length * 0.4) return "";
  return t;
}

async function loadVision(onProgress) {
  if (vision) return vision;
  onProgress("Caricamento SmolVLM…");
  const { AutoProcessor, AutoModelForVision2Seq, RawImage } = await import(
    "@huggingface/transformers"
  );
  const modelId = "HuggingFaceTB/SmolVLM-256M-Instruct";
  const device = navigator.gpu ? "webgpu" : "wasm";
  const processor = await AutoProcessor.from_pretrained(modelId, {
    progress_callback: (ev) => {
      if (ev && ev.progress != null) onProgress(`SmolVLM ${Math.round(ev.progress)}%`);
    },
  });
  const model = await AutoModelForVision2Seq.from_pretrained(modelId, {
    dtype: device === "webgpu" ? "fp16" : "q8",
    device,
  });
  vision = { processor, model, RawImage };
  return vision;
}

async function captionWithSmolVlm(url, onProgress) {
  const { processor, model, RawImage } = await loadVision(onProgress);
  const image = await RawImage.fromURL(url);
  const messages = [
    {
      role: "user",
      content: [{ type: "image" }, { type: "text", text: VISION_PROMPT }],
    },
  ];
  const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await processor(prompt, [image], { do_image_splitting: false });
  const output = await model.generate({ ...inputs, max_new_tokens: 80 });
  const inputLen = inputs.input_ids.dims.at(-1);
  const generated = output.slice(null, [inputLen, null]);
  const decoded = processor.batch_decode(generated, { skip_special_tokens: true })[0] || "";
  return usableCaption(decoded);
}

async function captionFromImage(imgEl, fallback, onProgress) {
  const pickedNano = document.getElementById("kitt-model")?.value === "nano";
  if (loadedModelId() === "nano" || (pickedNano && !loadedModelId())) {
    onProgress?.("Gemini Nano…");
    const nano = usableCaption(await captionWithNano(imgEl, VISION_PROMPT));
    if (nano) return nano;
    return fallback;
  }
  try {
    const vlm = await captionWithSmolVlm(imgEl.src, onProgress);
    if (vlm) return vlm;
  } catch (err) {
    console.warn("[KITT] SmolVLM failed", err);
  }
  return fallback;
}

export function mountVision(root) {
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";

  const panel = document.createElement("div");
  panel.className = "kitt-panel";
  panel.innerHTML = `
    <div class="kitt-panel-label">OTTICA · IMMAGINE → TESTO → VOCE</div>
    <div class="vision-row">
      <img class="vision-frame" data-img alt="Immagine da descrivere" src="${PROPS[0].src}"/>
      <div class="vision-side">
        <div class="kitt-chips" data-props></div>
        <label class="kitt-file">CARICA FILE<input type="file" accept="image/*" data-file/></label>
        <button type="button" class="kitt-rocker" data-look>GUARDA</button>
        <p class="kitt-caption" data-caption>In attesa di contatto visivo.</p>
      </div>
    </div>
  `;
  root.appendChild(panel);

  const img = panel.querySelector("[data-img]");
  const caption = panel.querySelector("[data-caption]");
  const props = panel.querySelector("[data-props]");
  const file = panel.querySelector("[data-file]");
  const look = panel.querySelector("[data-look]");
  props.innerHTML = PROPS.map(
    (p) => `<button type="button" class="chip" data-prop="${p.id}">${p.label}</button>`,
  ).join("");

  let current = PROPS[0];
  let objectUrl = null;

  props.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-prop]");
    if (!btn) return;
    current = PROPS.find((p) => p.id === btn.dataset.prop) || PROPS[0];
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    img.src = current.src;
  });

  file.addEventListener("change", () => {
    const f = file.files && file.files[0];
    if (!f) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(f);
    img.src = objectUrl;
    current = { ...current, src: objectUrl, caption: CANNED.visualUpload };
  });

  look.addEventListener("click", async () => {
    root.classList.add("is-talking");
    look.disabled = true;
    caption.textContent = "Analisi ottica in corso…";
    const text = await captionFromImage(img, current.caption, (msg) => {
      caption.textContent = msg;
    });
    caption.textContent = text;
    look.disabled = false;
    root.classList.remove("is-talking");
  });
}
