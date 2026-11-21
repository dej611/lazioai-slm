import { chatKitt, loadedModelId, nanoHasAudio, transcribeWithNano } from "../engine.js";
import { getRecognizer } from "../speech.js";

const SUGGESTIONS = [
  { id: "status", label: "Rapporto di stato", prompt: "Rapporto di stato. Sei operativo?" },
  { id: "route", label: "Rotta per Lazio AI", prompt: "Traccia la rotta per Lazio AI." },
  { id: "skynet", label: "Sei Skynet?", prompt: "Sei Skynet?" },
];

const NOTE_NANO =
  "Gemini Nano: lo STT è la Prompt API. L'audio resta nel browser.";
const NOTE_GOOGLE =
  "Lo SLM resta nel browser. Lo STT di Chrome spesso no: l'audio può andare a Google.";

function recorderMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
}

function useNanoAudio() {
  return loadedModelId() === "nano" && nanoHasAudio();
}

export function mountVoice(root) {
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";

  const panel = document.createElement("div");
  panel.className = "kitt-panel";
  panel.innerHTML = `
    <div class="kitt-panel-label">VOCE · MICROFONO → TESTO</div>
    <div class="eq" aria-hidden="true"></div>
    <p class="kitt-caption" data-heard>Tieni premuto PARLA, oppure tocca un chip.</p>
    <p class="kitt-caption kitt-caption--reply" data-reply></p>
    <div class="kitt-chips" data-chips></div>
    <button type="button" class="kitt-rocker kitt-rocker--big" data-talk>PARLA</button>
    <p class="kitt-note" data-stt-note>${NOTE_GOOGLE}</p>
  `;
  root.appendChild(panel);
  panel.querySelector(".eq").innerHTML = "<i></i>".repeat(12);

  const heard = panel.querySelector("[data-heard]");
  const reply = panel.querySelector("[data-reply]");
  const talk = panel.querySelector("[data-talk]");
  const note = panel.querySelector("[data-stt-note]");
  const chips = panel.querySelector("[data-chips]");
  chips.innerHTML = SUGGESTIONS.map(
    (c) => `<button type="button" class="chip" data-chip="${c.id}">${c.label}</button>`,
  ).join("");

  function syncNote() {
    note.textContent = useNanoAudio() ? NOTE_NANO : NOTE_GOOGLE;
  }
  syncNote();

  async function ask(text) {
    heard.textContent = `MICHAEL » ${text}`;
    root.classList.add("is-talking");
    const { text: out } = await chatKitt(text, {
      onToken: (acc) => {
        reply.textContent = `KITT » ${acc}`;
      },
    });
    reply.textContent = `KITT » ${out}`;
    root.classList.remove("is-talking");
  }

  chips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chip]");
    if (!btn) return;
    const spec = SUGGESTIONS.find((c) => c.id === btn.dataset.chip);
    if (spec) void ask(spec.prompt);
  });

  const rec = getRecognizer();
  let listening = false;
  let wantStop = false;
  /** @type {null | (() => Promise<Blob>)} */
  let stopNanoRec = null;

  rec?.addEventListener("result", async (ev) => {
    const text = ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript;
    if (!text) return;
    await ask(text);
  });

  rec?.addEventListener("error", () => {
    listening = false;
    talk.classList.remove("is-hot");
    heard.textContent = "Microfono non disponibile. Prova un chip.";
  });

  rec?.addEventListener("end", () => {
    listening = false;
    talk.classList.remove("is-hot");
  });

  async function startNano() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = recorderMime();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks = [];
    recorder.addEventListener("dataavailable", (e) => {
      if (e.data?.size) chunks.push(e.data);
    });
    recorder.start(200);
    return () =>
      new Promise((resolve) => {
        recorder.addEventListener(
          "stop",
          () => {
            stream.getTracks().forEach((t) => t.stop());
            resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
          },
          { once: true },
        );
        if (recorder.state === "recording") recorder.stop();
        else {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        }
      });
  }

  async function start() {
    if (listening) return;
    syncNote();
    wantStop = false;
    listening = true;
    talk.classList.add("is-hot");
    heard.textContent = "In ascolto…";

    if (useNanoAudio()) {
      try {
        const stopper = await startNano();
        if (wantStop) {
          listening = false;
          talk.classList.remove("is-hot");
          await stopper();
          return;
        }
        stopNanoRec = stopper;
      } catch {
        listening = false;
        talk.classList.remove("is-hot");
        heard.textContent = "Microfono non disponibile. Prova un chip.";
      }
      return;
    }

    if (!rec) {
      listening = false;
      talk.classList.remove("is-hot");
      heard.textContent = "Niente microfono. Usa i chip, oppure Chrome.";
      return;
    }
    try {
      rec.start();
    } catch {
      listening = false;
      talk.classList.remove("is-hot");
    }
  }

  async function stop() {
    wantStop = true;
    if (stopNanoRec) {
      const done = stopNanoRec;
      stopNanoRec = null;
      listening = false;
      talk.classList.remove("is-hot");
      const blob = await done();
      if (!blob || blob.size < 400) {
        heard.textContent = "Troppo corto. Tieni premuto PARLA.";
        return;
      }
      heard.textContent = "Trascrizione locale…";
      reply.textContent = "";
      const text = await transcribeWithNano(blob);
      if (text) {
        heard.textContent = `MICHAEL » ${text}`;
        await ask(text);
      } else heard.textContent = "Non ho capito. Riprova, o usa un chip.";
      return;
    }
    if (!listening) return;
    try {
      rec?.stop();
    } catch {
      /* already stopped */
    }
  }

  talk.addEventListener("mousedown", () => {
    void start();
  });
  talk.addEventListener("touchstart", (e) => {
    e.preventDefault();
    void start();
  });
  window.addEventListener("mouseup", () => {
    void stop();
  });
  talk.addEventListener("touchend", () => {
    void stop();
  });
}
