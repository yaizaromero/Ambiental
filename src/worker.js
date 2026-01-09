// worker.js (Vite/React)
// Basado en la plantilla: load() + generate() + warmup + mensajes status. :contentReference[oaicite:4]{index=4}

import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.0";

const WHISPER_SAMPLING_RATE = 16000;

let asr = null;
let processing = false;

async function load() {
  try {
    self.postMessage({ status: "loading", data: "Loading model..." });

    // Intenta WebGPU, si falla usa WASM
    const device = ("gpu" in navigator) ? "webgpu" : "wasm";

    asr = await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-small",
      { device }
    );

    self.postMessage({
      status: "loading",
      data: "Warming up model..."
    });

    // Warmup con 5s de audio dummy (igual que la plantilla) :contentReference[oaicite:5]{index=5}
    const dummyAudio = new Float32Array(WHISPER_SAMPLING_RATE * 5);
    await asr(dummyAudio, {
        generate_kwargs: {
            language: "es",
            task: "transcribe",
        },
        });


    self.postMessage({ status: "ready" });
  } catch (err) {
    self.postMessage({ status: "error", data: String(err?.stack || err) });
  }
}

async function generate({ audio, language }) {
  if (!asr) {
    self.postMessage({ status: "error", data: "ASR not loaded yet" });
    return;
  }
  if (processing) return;
  processing = true;

  try {
    self.postMessage({ status: "start" });

    const out = await asr(audio, {
        generate_kwargs: {
            language: "es",
            task: "transcribe",
        },
        });


    self.postMessage({
      status: "complete",
      output: out.text,
    });
  } catch (err) {
    self.postMessage({ status: "error", data: String(err?.stack || err) });
  } finally {
    processing = false;
  }
}

self.addEventListener("message", async (e) => {
  const { type, data } = e.data || {};
  switch (type) {
    case "load":
      await load();
      break;
    case "generate":
      await generate(data);
      break;
  }
});

// (Opcional) booted al iniciar
self.postMessage({ status: "booted" });
