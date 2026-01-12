import { 
    AutoProcessor, 
    Florence2ForConditionalGeneration, 
    RawImage, 
    env 
} from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.proxy = false; 

const VISION_MODEL_ID = "onnx-community/Florence-2-base-ft";
// Eliminado TEXT_MODEL_ID

let visionModel, visionProcessor; // Eliminados textModel, textTokenizer

self.onmessage = async (e) => {
    const { type, image, prompt } = e.data;
    if (type === 'load') await load();
    if (type === 'analyze') await analyze(image, prompt);
};

async function load() {
    self.postMessage({ status: 'init' });
    try {
        self.postMessage({ status: 'loading_model', message: "Cargando Visión..." });
        visionProcessor = await AutoProcessor.from_pretrained(VISION_MODEL_ID);
        try {
            visionModel = await Florence2ForConditionalGeneration.from_pretrained(VISION_MODEL_ID, {
                device: "webgpu", dtype: "q4", use_external_data_format: false,
            });
        } catch (e) {
            visionModel = await Florence2ForConditionalGeneration.from_pretrained(VISION_MODEL_ID, {
                device: "wasm", dtype: "q8", use_external_data_format: false,
            });
        }

        // Eliminada la carga del modelo de texto (Cerebro)

        self.postMessage({ status: 'ready' });
    } catch (err) {
        self.postMessage({ status: 'error', message: err.message });
    }
}

async function analyze(imageUrl, userPrompt) {
    if (!visionModel) return; // Eliminado chequeo de textModel
    self.postMessage({ status: 'analyzing' });

    try {
        const image = await RawImage.read(imageUrl);

        const visionInputs = await visionProcessor(image, "<MORE_DETAILED_CAPTION>");

        const visionOutputs = await visionModel.generate({ ...visionInputs, max_new_tokens: 100, do_sample: false });
        
        const description = visionProcessor.batch_decode(visionOutputs, { skip_special_tokens: false })[0]
            .replace(/<\/?s>/g, '').replace("<MORE_DETAILED_CAPTION>", '').trim();

        console.log("Vision:", description);

        // Eliminada toda la lógica de generación de texto y limpieza de advice aquí.
        
        // En su lugar, devolvemos la descripción y el prompt del usuario para que lo procese el otro worker
        self.postMessage({ 
            status: 'vision_complete', 
            description: description, 
            userPrompt: userPrompt 
        });

    } catch (err) {
        self.postMessage({ status: 'error', message: "Error: " + err.message });
    }
}