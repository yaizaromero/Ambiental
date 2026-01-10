import { AutoProcessor, MultiModalityCausalLM, env } from "@huggingface/transformers";

env.useBrowserCache = true;
env.allowLocalModels = false;

env.backends.onnx.wasm.proxy = false; 

const MODEL_ID = "onnx-community/Janus-Pro-1B-ONNX";

let model = null;
let processor = null;

self.onmessage = async (e) => {
    const { type, image, prompt } = e.data;
    switch (type) {
        case 'load': await load(); break;
        case 'analyze': await analyze(image, prompt); break;
    }
};

async function load() {
    self.postMessage({ status: 'init' });

    try {
        processor = await AutoProcessor.from_pretrained(MODEL_ID);
        
        self.postMessage({ status: 'loading_model' });
        
        model = await MultiModalityCausalLM.from_pretrained(MODEL_ID, {
            device: "webgpu",
            dtype: "q4", 
            use_external_data_format: false,
            
            progress_callback: (data) => {
                if (data.status === 'progress' && data.total > 10000000) {
                    const percent = data.total ? Math.round((data.loaded / data.total) * 100) : 0;
                    self.postMessage({ status: 'progress', percent: percent });
                }
            }
        });

        self.postMessage({ status: 'ready' });
    } catch (err) {
        console.error(err);
        self.postMessage({ status: 'error', message: "Error: " + err.message });
    }
}

async function analyze(imageUrl, userPrompt) {
    if (!model || !processor) return;

    self.postMessage({ status: 'thinking' });

    try {
        const messages = [
            { 
                role: "user", 
                content: userPrompt || "Describe this UI sketch and suggest improvements." 
            }
        ];

        const inputs = await processor(messages, imageUrl);

        const outputs = await model.generate({
            ...inputs,
            max_new_tokens: 300, 
            do_sample: false,
        });

        const result = processor.batch_decode(outputs, { skip_special_tokens: true })[0];
        const finalResponse = result.split("Assistant:").pop()?.trim() || result;

        self.postMessage({ status: 'done', result: finalResponse });

    } catch (err) {
        console.error(err);
        self.postMessage({ status: 'error', message: "Error: " + err.message });
    }
}