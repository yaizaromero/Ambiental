import { 
    AutoProcessor, 
    Florence2ForConditionalGeneration, 
    AutoModelForCausalLM, 
    AutoTokenizer, 
    RawImage, 
    env 
} from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.proxy = false; 

const VISION_MODEL_ID = "onnx-community/Florence-2-base-ft";
const TEXT_MODEL_ID = "Xenova/Qwen1.5-0.5B-Chat";

let visionModel, visionProcessor, textModel, textTokenizer;

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
                device: "webgpu", dtype: { embed_tokens: "q4", vision_encoder: "q4", encoder: "q4", decoder_model_lm_head: "q4" }, use_external_data_format: false,
            });
        } catch (e) {
            visionModel = await Florence2ForConditionalGeneration.from_pretrained(VISION_MODEL_ID, {
                device: "wasm", dtype: "q8", use_external_data_format: false,
            });
        }

        self.postMessage({ status: 'loading_model', message: "Cargando Cerebro..." });
        textTokenizer = await AutoTokenizer.from_pretrained(TEXT_MODEL_ID);
        textModel = await AutoModelForCausalLM.from_pretrained(TEXT_MODEL_ID, {
            device: "webgpu", dtype: "q4", use_external_data_format: false,
        });

        self.postMessage({ status: 'ready' });
    } catch (err) {
        self.postMessage({ status: 'error', message: err.message });
    }
}

async function analyze(imageUrl, userPrompt) {
    if (!visionModel || !textModel) return;
    self.postMessage({ status: 'thinking' });

    try {
        const image = await RawImage.read(imageUrl);

        const visionInputs = await visionProcessor(image, "<MORE_DETAILED_CAPTION>");

        const visionOutputs = await visionModel.generate({ ...visionInputs, max_new_tokens: 100, do_sample: false });
        
        const description = visionProcessor.batch_decode(visionOutputs, { skip_special_tokens: false })[0]
            .replace(/<\/?s>/g, '').replace("<MORE_DETAILED_CAPTION>", '').trim();

        console.log("Vision:", description);

        const messages = [
            { 
                role: "system", 
                content: `You are a strict UX Auditor. 
                Task: Analyze the UI element described and list 3 specific improvements.
                
                Constraints:
                - Do NOT hallucinate features not mentioned.
                - Keep it purely technical (Contrast, Spacing, Labeling, Usability).
                - Use English ONLY.
                - SHORT answers. Maximum 15 words per point.
                - Output format: Numbered list 1, 2, 3.` 
            },
            { 
                role: "user", 
                content: `UI Element Description: "${description}"
                User Question: "${userPrompt}"
                
                Provide 3 actionable recommendations:` 
            }
        ];

        const textInputs = await textTokenizer.apply_chat_template(messages, {
            add_generation_prompt: true, return_dict: true,
        });

        const textOutputs = await textModel.generate({
            ...textInputs, 
            max_new_tokens: 200, 
            do_sample: true, 
            temperature: 0.2,
            repetition_penalty: 1.2,
            top_k: 20
        });

        let advice = textTokenizer.batch_decode(textOutputs, { skip_special_tokens: true })[0];
        advice = advice.split("assistant").pop().trim();
        advice = advice.replace(/\*\*/g, "").replace(/__/g, "");
        advice = advice.replace(/[\u4e00-\u9fa5]/g, "");

        const result = `VISUAL ANALYSIS
${description}

RECOMMENDATIONS
${advice}`;

        self.postMessage({ status: 'done', result: result });

    } catch (err) {
        self.postMessage({ status: 'error', message: "Error: " + err.message });
    }
}