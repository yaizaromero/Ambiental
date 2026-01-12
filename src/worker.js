import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.0";

const WHISPER_SAMPLING_RATE = 16000;


let contextBuffer = "";
const MAX_CONTEXT_CHARS = 300; 


let asr = null;
let processing = false;

async function load() {
  try {
    self.postMessage({ status: "loading", data: "Loading model..." });

    const deviceUse = ("gpu" in navigator) ? "webgpu" : "wasm";

    asr = await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-small",
      { device: deviceUse, dtype: "q4", }
    );

    self.postMessage({
      status: "loading",
      data: "Warming up model..."
    });

    const dummyAudio = new Float32Array(WHISPER_SAMPLING_RATE * 5);
    await asr(dummyAudio);



    self.postMessage({ status: "ready" });
  } catch (err) {
    self.postMessage({ status: "error", data: String(err?.stack || err) });
  }
}

async function generate({ audio }) {
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
        prompt: contextBuffer,
      },
    });

    const text = out.text?.trim();

    // actualizar buffer de contexto
    if (text) {
      contextBuffer += " " + text;

      // limitar tamaño del contexto
      if (contextBuffer.length > MAX_CONTEXT_CHARS) {
        contextBuffer = contextBuffer.slice(-MAX_CONTEXT_CHARS);
      }
    }

    self.postMessage({
        status: "debug_context",
        data: contextBuffer,
        });


    self.postMessage({
      status: "complete",
      output: text,
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

self.postMessage({ status: "booted" });
