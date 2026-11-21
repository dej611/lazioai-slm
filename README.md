# lazioai — LLM locale nel browser: limiti e applicazioni

Talk LazioAI (~35 min), riuso del deck Roma JS. Stesso titolo. Italiano.

## Serve

```bash
cd ~/Work/lazioai-slm
npm install
npm run dev
```

Apri l’URL di Vite (di solito http://localhost:5173). Build: `npm run build` e `npm run preview`.

Chrome (o Edge). WebGPU aiuta. Servono COOP/COEP (già in `vite.config.js`) per i thread WASM di wllama.

## Preload (sera prima)

1. Apri il deck in Chrome.
2. Vai alla slide **ENGAGE** (prima delle demo). Click: parte lo scanner.
3. Sulle demo, scegli il motore (**Qwen3 0.6B**, **Gemma 4 E2B**, o **Gemini Nano** su Chrome) e click **ENGAGE** nella barra. Resta in pagina finché lo status non dice `SISTEMA PRONTO`.
4. Gemma 4 E2B scarica `unsloth/gemma-4-E2B-it-GGUF`, file `gemma-4-E2B-it-UD-IQ2_M.gguf`, circa 2,3 GB. È il GGUF più piccolo di quel repo: i Q4 stanno intorno ai 3,1 GB. Il contesto è fissato a 2048 token. Se non entra in memoria, le demo usano le battute in scatola.
5. Opzionale: sulla slide visione click **GUARDA** una volta. Con **Gemini Nano** è la stessa sessione della chat; con Qwen o Gemma carica SmolVLM in cache.

Il secondo avvio usa la cache: il Wi-Fi della venue non deve salvare il talk.

## Barra

La slide nera **ENGAGE** accende lo scanner. La barra (scanner, MOTORE, **ENGAGE**) compare sulle quattro demo.

## Fallback

Se il modello non carica, chat, visione e voce usano battute in scatola; la traduzione chiede ENGAGE. SpeechRecognition richiede Chrome; con Gemini Nano lo STT è la Prompt API (audio locale). La demo voce è microfono → trascrizione → testo, senza TTS. La traduzione usa il modello in MOTORE, non la Translator API.

## Note relatore

[`SPEAKER-NOTES.md`](SPEAKER-NOTES.md) — anche in `S` (Reveal notes).
