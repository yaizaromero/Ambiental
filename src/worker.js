import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0";

// Configuración para evitar errores de red/cache en Vite
env.allowLocalModels = false;
env.useBrowserCache = true;

const TASK_NAME = "image-to-text";
const MODEL_NAME = "Xenova/vit-gpt2-image-captioning";

let captioner = null;

self.onmessage = async (e) => {
    const { type, image } = e.data;
    
    switch (type) {
        case 'load':
            await load();
            break;
        case 'analyze':
            await analyze(image);
            break;
    }
};

async function load() {
    self.postMessage({ status: 'init' });

    try {
        captioner = await pipeline(TASK_NAME, MODEL_NAME, {
            device: 'wasm', // CPU para evitar alucinaciones
            dtype: 'q8',    // Ligero
            progress_callback: (data) => {
                if (data.status === 'progress') {
                    const percent = data.total ? Math.round((data.loaded / data.total) * 100) : 0;
                    self.postMessage({ status: 'progress', percent: percent });
                }
            }
        });

        self.postMessage({ status: 'ready' });
    } catch (err) {
        self.postMessage({ status: 'error', message: err.message });
    }
}

async function analyze(imageUrl) {
    if (!captioner) return;

    self.postMessage({ status: 'thinking' });

    try {
        const output = await captioner(imageUrl, {
            max_new_tokens: 50,
            do_sample: false
        });

        self.postMessage({ 
            status: 'complete', 
            result: output[0].generated_text 
        });

    } catch (err) {
        self.postMessage({ status: 'error', message: err.message });
    }
}