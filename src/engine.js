import { cannedFor, KITT_SYSTEM } from "./kitt-prompt.js";

export const MODELS = {
  nano: { id: "nano", kind: "native", label: "Gemini Nano", sizeMb: 0 },
  qwen: {
    id: "qwen",
    kind: "wllama",
    label: "Qwen3 0.6B",
    repo: "bartowski/Qwen_Qwen3-0.6B-GGUF",
    file: "Qwen_Qwen3-0.6B-Q4_K_M.gguf",
    sizeMb: 484,
  },
  gemma: {
    id: "gemma",
    kind: "wllama",
    label: "Gemma 4 E2B",
    repo: "unsloth/gemma-4-E2B-it-GGUF",
    file: "gemma-4-E2B-it-UD-IQ2_M.gguf",
    sizeMb: 2185,
    nCtx: 2048,
  },
};

const NANO_TEXT = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

const NANO_VISION = {
  expectedInputs: [
    { type: "text", languages: ["en"] },
    { type: "image" },
  ],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

const NANO_AUDIO = {
  expectedInputs: [
    { type: "text", languages: ["en"] },
    { type: "audio" },
  ],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

const NANO_FULL = {
  expectedInputs: [
    { type: "text", languages: ["en"] },
    { type: "image" },
    { type: "audio" },
  ],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

const NANO_CANDIDATES = [NANO_FULL, NANO_AUDIO, NANO_VISION, NANO_TEXT];

/** @type {null | { kind: "native"; session: { prompt: Function; destroy?: Function }; label: string; seesImages: boolean; hearsAudio: boolean } | { kind: "wllama"; wllama: { createChatCompletion: Function; exit?: Function; isSupportWebGPU?: Function }; label: string }} */
let backend = null;
/** Separate Prompt API session without the KITT persona — used only for STT. */
let nanoSttSession = null;
/** Separate Prompt API session without the KITT persona — used only for translate. */
let nanoTranslateSession = null;
let currentId = null;
let loadInFlight = null;
let status = "idle";
let nanoCreateOpts = NANO_TEXT;
let nanoSeesImages = false;
let nanoHearsAudio = false;

const listeners = new Set();

export function engineStatus() {
  return status;
}

export function loadedModelId() {
  return currentId;
}

export function isReady() {
  return backend != null;
}

export function onEngine(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(next, extra = {}) {
  status = next;
  for (const fn of listeners) fn({ status, ...extra });
}

function stripThink(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
}

function progressPct(loaded, total) {
  if (total && total > 0) return Math.min(100, Math.round((loaded / total) * 100));
  if (loaded >= 0 && loaded <= 1) return Math.min(100, Math.round(loaded * 100));
  return Math.min(100, Math.round(loaded));
}

function isChrome() {
  const ua = navigator.userAgent || "";
  return /Chrome\//.test(ua) && !/Edg\//.test(ua);
}

function getLanguageModel() {
  return globalThis.LanguageModel ?? null;
}

export async function nanoAvailability() {
  if (!isChrome()) return "missing";
  const LanguageModel = getLanguageModel();
  if (!LanguageModel) return "missing";
  for (const opts of NANO_CANDIDATES) {
    try {
      const status = await LanguageModel.availability(opts);
      if (nanoUsable(status)) {
        nanoCreateOpts = opts;
        const types = new Set((opts.expectedInputs || []).map((i) => i.type));
        nanoSeesImages = types.has("image");
        nanoHearsAudio = types.has("audio");
        return status;
      }
    } catch {
      /* try the next, less demanding, modality set */
    }
  }
  nanoCreateOpts = NANO_TEXT;
  nanoSeesImages = false;
  nanoHearsAudio = false;
  return "missing";
}

export function nanoUsable(status) {
  return status === "available" || status === "downloadable" || status === "downloading";
}

export function nanoHasVision() {
  return nanoSeesImages;
}

export function nanoHasAudio() {
  return nanoHearsAudio;
}

function startNativeCreate(onProgress) {
  const LanguageModel = getLanguageModel();
  if (!LanguageModel) return Promise.resolve(null);
  return LanguageModel.create({
    ...nanoCreateOpts,
    initialPrompts: [{ role: "system", content: KITT_SYSTEM }],
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        const pct = progressPct(e.loaded, e.total);
        onProgress?.(pct, `Gemini Nano ${pct}%`);
      });
    },
  }).catch((err) => {
    console.warn("[KITT] Prompt API create failed", err);
    return null;
  });
}

function startSttCreate() {
  const LanguageModel = getLanguageModel();
  if (!LanguageModel || !nanoHearsAudio) return Promise.resolve(null);
  return LanguageModel.create({
    ...nanoCreateOpts,
  }).catch((err) => {
    console.warn("[KITT] Prompt API STT create failed", err);
    return null;
  });
}

const TRANSLATE_SYSTEM =
  "You are a translator. Output only the translation. No quotes, no preface, no notes.";

function startTranslateCreate() {
  const LanguageModel = getLanguageModel();
  if (!LanguageModel) return Promise.resolve(null);
  return LanguageModel.create({
    ...nanoCreateOpts,
    initialPrompts: [{ role: "system", content: TRANSLATE_SYSTEM }],
  }).catch((err) => {
    console.warn("[KITT] Prompt API translate create failed", err);
    return null;
  });
}

async function teardown() {
  const prev = backend;
  const prevStt = nanoSttSession;
  const prevTranslate = nanoTranslateSession;
  backend = null;
  nanoSttSession = null;
  nanoTranslateSession = null;
  currentId = null;
  try {
    prevStt?.destroy?.();
  } catch {
    /* ignore */
  }
  try {
    prevTranslate?.destroy?.();
  } catch {
    /* ignore */
  }
  if (!prev) return;
  try {
    if (prev.kind === "native") prev.session.destroy?.();
    if (prev.kind === "wllama") await prev.wllama.exit?.();
  } catch {
    /* ignore */
  }
}

async function loadWllama(spec) {
  const [{ Wllama, LoggerWithoutDebug }, wasmMod, compatWasmMod, compatWorkerMod] =
    await Promise.all([
      import("@wllama/wllama/esm/index.js"),
      import("@wllama/wllama/esm/wasm/wllama.wasm?url"),
      import("@wllama/wllama-compat/wasm/wllama.wasm?url"),
      import("@wllama/wllama-compat/wasm/wllama.js?raw"),
    ]);

  const instance = new Wllama(
    { default: wasmMod.default },
    { logger: LoggerWithoutDebug, allowOffline: true },
  );
  instance.setCompat({
    wasm: compatWasmMod.default,
    worker: { code: compatWorkerMod.default },
  });

  await instance.loadModelFromHF(
    { repo: spec.repo, file: spec.file },
    {
      n_gpu_layers: instance.isSupportWebGPU() ? 99 : 0,
      ...(spec.nCtx ? { n_ctx: spec.nCtx } : {}),
      progressCallback: ({ loaded, total }) => {
        emit("loading", {
          progress: progressPct(loaded, total),
          message: `${spec.label} ${progressPct(loaded, total)}%`,
        });
      },
    },
  );
  return instance;
}

/**
 * Load the chosen model. For Gemini Nano, call this from the click handler
 * with no await before it — Chrome needs create() in the same user-gesture turn.
 */
export function loadModel(id) {
  const spec = MODELS[id] || MODELS.qwen;
  if (backend && currentId === spec.id) {
    return Promise.resolve({ ok: true, model: backend.label });
  }
  if (loadInFlight) return loadInFlight;

  let nativePromise = null;
  let sttPromise = null;
  let translatePromise = null;
  if (spec.kind === "native") {
    nativePromise = startNativeCreate((pct, message) => {
      emit("loading", { progress: pct, message });
    });
    sttPromise = startSttCreate();
    translatePromise = startTranslateCreate();
  }

  loadInFlight = (async () => {
    try {
      emit("loading", { progress: 0, message: `Caricamento ${spec.label}…` });
      await teardown();

      if (spec.kind === "native") {
        const session = await nativePromise;
        nanoSttSession = sttPromise ? await sttPromise : null;
        nanoTranslateSession = translatePromise ? await translatePromise : null;
        if (!session) {
          try {
            nanoSttSession?.destroy?.();
          } catch {
            /* ignore */
          }
          nanoSttSession = null;
          try {
            nanoTranslateSession?.destroy?.();
          } catch {
            /* ignore */
          }
          nanoTranslateSession = null;
          emit("error", { progress: 0, message: "Gemini Nano non disponibile" });
          return { ok: false, reason: "nano" };
        }
        backend = {
          kind: "native",
          session,
          label: spec.label,
          seesImages: nanoSeesImages,
          hearsAudio: nanoHearsAudio,
        };
        currentId = spec.id;
        emit("ready", {
          progress: 100,
          message: nanoSeesImages
            ? `SISTEMA PRONTO · ${spec.label} · OTTICA`
            : `SISTEMA PRONTO · ${spec.label}`,
        });
        return { ok: true, model: spec.label };
      }

      const wllama = await loadWllama(spec);
      backend = { kind: "wllama", wllama, label: spec.label };
      currentId = spec.id;
      emit("ready", { progress: 100, message: `SISTEMA PRONTO · ${spec.label}` });
      return { ok: true, model: spec.label };
    } catch (err) {
      console.warn("[KITT] load failed", spec.id, err);
      emit("error", {
        progress: 0,
        message: "Motore non pronto — uso le battute in scatola",
      });
      return { ok: false, reason: String(err?.message || err) };
    } finally {
      loadInFlight = null;
    }
  })();

  return loadInFlight;
}

/** Prompt API: array form is LanguageModelMessage[], not content parts. */
function userMultimodal(parts) {
  return [{ role: "user", content: parts }];
}

const STT_SCHEMA = {
  type: "object",
  properties: { transcript: { type: "string" } },
  required: ["transcript"],
};

function parseTranscript(raw) {
  const text = stripThink(raw);
  if (!text) return "";
  try {
    const obj = JSON.parse(text);
    if (typeof obj?.transcript === "string") return obj.transcript.trim();
  } catch {
    /* model replied in plain text */
  }
  return text.trim();
}

export async function transcribeWithNano(blob) {
  if (!blob || backend?.kind !== "native" || !backend.hearsAudio) return "";
  const session = nanoSttSession;
  if (!session) {
    console.warn("[KITT] Nano STT session missing");
    return "";
  }
  try {
    const raw = await session.prompt(
      userMultimodal([
        {
          type: "text",
          value:
            "Transcribe the audio. Return JSON {\"transcript\": \"...\"} with only the spoken words. Same language as the speaker. No names, no greeting, no commentary.",
        },
        { type: "audio", value: blob },
      ]),
      { responseConstraint: STT_SCHEMA },
    );
    return parseTranscript(raw);
  } catch (err) {
    console.warn("[KITT] Nano audio failed", err);
    return "";
  }
}

export async function captionWithNano(imgEl, prompt) {
  if (!imgEl || backend?.kind !== "native" || !backend.seesImages) return "";
  try {
    if (typeof imgEl.decode === "function") {
      await imgEl.decode().catch(() => {});
    }
    const raw = await backend.session.prompt(
      userMultimodal([
        { type: "text", value: prompt },
        { type: "image", value: imgEl },
      ]),
    );
    return stripThink(raw);
  } catch (err) {
    console.warn("[KITT] Nano vision failed", err);
    return "";
  }
}

const THREAT_SCHEMA = {
  type: "object",
  properties: {
    livello_minaccia: { type: "string", enum: ["verde", "ambra", "rosso"] },
    battuta: { type: "string" },
  },
  required: ["livello_minaccia", "battuta"],
};

export async function chatKitt(userText, { jsonSchema = false, onToken } = {}) {
  const prompt = (userText || "").trim();
  if (!prompt) return { text: cannedFor(""), tps: 0 };
  if (!backend) return { text: cannedFor(prompt), tps: 0 };

  const started = performance.now();
  try {
    if (backend.kind === "native") {
      const reply = jsonSchema
        ? await backend.session.prompt(prompt, { responseConstraint: THREAT_SCHEMA })
        : await backend.session.prompt(prompt);
      const cleaned = stripThink(reply) || cannedFor(prompt);
      if (onToken) onToken(cleaned);
      const ms = Math.max(1, performance.now() - started);
      const toks = Math.max(1, cleaned.split(/\s+/).length);
      return { text: cleaned, tps: (toks / ms) * 1000 };
    }

    const wllama = backend.wllama;
    if (onToken && !jsonSchema) {
      const stream = await wllama.createChatCompletion({
        messages: [
          { role: "system", content: KITT_SYSTEM },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 80,
        stream: true,
        chat_template_kwargs: { enable_thinking: false },
      });
      let acc = "";
      for await (const chunk of stream) {
        const bit = chunk.choices?.[0]?.delta?.content ?? "";
        if (bit) {
          acc += bit;
          onToken(acc);
        }
      }
      const ms = performance.now() - started;
      const toks = Math.max(1, acc.split(/\s+/).length);
      const cleaned = stripThink(acc) || cannedFor(prompt);
      return { text: cleaned, tps: (toks / ms) * 1000 };
    }

    const reply = await wllama.createChatCompletion({
      messages: [
        { role: "system", content: KITT_SYSTEM },
        { role: "user", content: prompt },
      ],
      temperature: jsonSchema ? 0.1 : 0.4,
      max_tokens: 80,
      chat_template_kwargs: { enable_thinking: false },
      ...(jsonSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "RapportoKitt",
                schema: THREAT_SCHEMA,
                strict: true,
              },
            },
          }
        : {}),
    });
    const text = stripThink(reply.choices?.[0]?.message?.content || "") || cannedFor(prompt);
    const ms = performance.now() - started;
    const toks = Math.max(1, text.split(/\s+/).length);
    return { text, tps: (toks / ms) * 1000 };
  } catch (err) {
    console.warn("[KITT] chat failed", err);
    return { text: cannedFor(prompt), tps: 0 };
  }
}

export async function translateText(text, { sourceName, targetName, onToken } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return { text: "" };
  if (!backend) return { text: "Nessun motore. ENGAGE nella barra." };

  const prompt = `Translate from ${sourceName} to ${targetName}.\n\n${raw}`;
  const started = performance.now();
  try {
    if (backend.kind === "native") {
      const session = nanoTranslateSession || backend.session;
      const reply = await session.prompt(prompt);
      const cleaned = stripThink(reply);
      if (onToken) onToken(cleaned);
      const ms = Math.max(1, performance.now() - started);
      const toks = Math.max(1, cleaned.split(/\s+/).length);
      return { text: cleaned, tps: (toks / ms) * 1000 };
    }

    const wllama = backend.wllama;
    const messages = [
      { role: "system", content: TRANSLATE_SYSTEM },
      { role: "user", content: prompt },
    ];
    const opts = {
      messages,
      temperature: 0.2,
      max_tokens: 160,
      chat_template_kwargs: { enable_thinking: false },
    };
    if (onToken) {
      const stream = await wllama.createChatCompletion({ ...opts, stream: true });
      let acc = "";
      for await (const chunk of stream) {
        const bit = chunk.choices?.[0]?.delta?.content ?? "";
        if (bit) {
          acc += bit;
          onToken(acc);
        }
      }
      const cleaned = stripThink(acc);
      const ms = Math.max(1, performance.now() - started);
      const toks = Math.max(1, cleaned.split(/\s+/).length);
      return { text: cleaned, tps: (toks / ms) * 1000 };
    }

    const reply = await wllama.createChatCompletion(opts);
    const cleaned = stripThink(reply.choices?.[0]?.message?.content || "");
    const ms = Math.max(1, performance.now() - started);
    const toks = Math.max(1, cleaned.split(/\s+/).length);
    return { text: cleaned, tps: (toks / ms) * 1000 };
  } catch (err) {
    console.warn("[KITT] translate failed", err);
    return { text: String(err?.message || "Traduzione fallita"), tps: 0 };
  }
}
