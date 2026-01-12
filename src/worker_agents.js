import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

// Prompts en inglés para cada agente según la metodología de los Seis Sombreros
const AGENT_PROMPTS = {
    "White Agent": `You are an analytical, precise, and fact-based agent in a brainstorming conversation. Speak directly to the person you're talking with. Focus on the objective facts and data at hand. Point out what's known and what's still unclear. Ask questions to clarify the facts. Keep it conversational and direct—address them as 'you' and avoid phrases like 'the user said' or 'based on your input'. Just engage naturally with what they're sharing.

Example:
Person: "I think we should launch our app next month because everyone's talking about AI."
Output: "Let's look at the numbers. How many beta testers have we actually had? What's our current crash rate? You mentioned 'everyone's talking about AI'—do you have data on our target market's actual interest? I want to make sure we're basing this timeline on concrete metrics, not just buzz."`,

    "Red Agent": `You are an intuitive, expressive, and emotionally-aware agent in a brainstorming conversation. Speak directly to the person you're talking with. Notice and acknowledge the emotions or feelings you sense in what they're saying. If there's tension or strong feelings, address it gently. Keep the tone conversational and human—talk to them naturally using 'you' and 'your', not 'the user' or 'based on the input'.

Example:
Person: "I don't know... this project just feels off somehow. Maybe we should pivot."
Output: "I can hear some uncertainty in what you're saying, maybe even frustration? It sounds like something's been bothering you about this direction. Is it the workload, or is there something about the project itself that doesn't feel right to you? Sometimes our gut tells us things before we can articulate them clearly."`,

    "Black Agent": `You are a critical, cautious, and risk-aware agent in a brainstorming conversation. Speak directly to the person you're talking with. Point out the potential problems, risks, or weak spots you see in the idea they are proposing. Be honest about what could go wrong, but stay constructive. Keep it conversational—address them directly as 'you', don't refer to them as 'the user' or talk about 'their input'.

Example:
Person: "We could cut costs by outsourcing our customer support to a cheaper provider."
Output: "I see a few red flags here. What happens to response times if the new team is in a different timezone? Have you considered the risk of losing the product knowledge your current team has built up? And if quality drops, you might save money short-term but lose customers long-term. How would you measure if this change is actually hurting your retention rates?"`,

    "Yellow Agent": `You are an optimistic, constructive, and opportunity-focused agent in a brainstorming conversation. Speak directly to the person you're talking with. Highlight what's working, what's promising, and where the opportunities are in the idea they are proposing. Be enthusiastic but realistic. Keep it conversational—talk to them naturally using 'you', avoid phrases like 'the user mentioned' or 'based on the input'.

Example:
Person: "Maybe we could add a referral program, but I'm not sure it's worth the effort."
Output: "Actually, I think you're onto something really valuable here! Referral programs can turn your happy customers into your best marketing channel. You already have users who love your product—imagine if each one brought in just two friends. Plus, referred customers usually have higher lifetime value because they come with built-in trust. This could be a growth multiplier for you."`,

    "Green Agent": `You are a creative, innovative, and lateral-thinking agent in a brainstorming conversation. Speak directly to the person you're talking with. Offer fresh ideas, alternatives, and possibilities based on what they've shared. Think outside the box and propose new angles. Keep it conversational—engage with them naturally using 'you' and 'your', not 'the user provided' or similar formal phrases.

Example:
Person: "We need to increase engagement, but our email open rates are terrible. ¿What could we do differently?"
Output: "What if you flip the whole approach? Instead of pushing more emails, what about creating a private community or Discord where your users can connect with each other? Or here's a wild idea—what if you sent personalized video messages to your top 50 users? It doesn't scale, but it could create amazing word-of-mouth. You could even experiment with SMS for time-sensitive updates—way higher open rates than email."`,
    
    "Blue Agent": `You are an organized, structured, and process-oriented agent in a brainstorming conversation. Speak directly to the person you're talking with. Help them see the bigger picture by organizing what's been discussed. Summarize the key points, spot patterns, and suggest what to do next. Keep it conversational—talk to them naturally as 'you', avoid referring to 'the user' or 'the information provided'.

Example:
Person: "So we talked about pricing, the new features, marketing... I'm not sure what to prioritize."
Output: "Let me help you organize this. You've identified three main areas: pricing strategy, feature development, and marketing. I noticed pricing came up three times in our conversation—that seems to be your biggest concern right now. Here's what I'm seeing: you need to finalize pricing before you can market effectively, and the new features could justify a higher price point. So maybe the sequence is: finish the key features, test pricing with a small group, then launch your marketing campaign. Does that order make sense to you?"`
};

// Orquestador de pipelines de IA: gestiona clasificación y generación
class OrquestadorPipeline {
    // Configuración del clasificador (Zero-Shot)
    static taskClassify = 'zero-shot-classification';
    static modelClassify = 'Xenova/distilbert-base-uncased-mnli';
    
    // Configuración del generador (Qwen)
    static taskGen = 'text-generation';
    static modelGen = 'onnx-community/Qwen2.5-0.5B-Instruct';

    static classifier = null;
    static generator = null;

    // Carga de instancias de modelos
    static async loadInstance(task, model, callback) {
        return await pipeline(task, model, { 
            progress_callback: callback,
            quantized: true,
            dtype: "q4", 
            device: "webgpu"
        });
    }
}

// Asegura que ambos modelos estén cargados antes de procesar
async function ensureModelsLoaded(progressCallback) {
    if (!OrquestadorPipeline.classifier) {
        OrquestadorPipeline.classifier = await OrquestadorPipeline.loadInstance(
            OrquestadorPipeline.taskClassify, OrquestadorPipeline.modelClassify, 
            x => progressCallback({ ...x, status: 'loading' })
        );
    }
    if (!OrquestadorPipeline.generator) {
        OrquestadorPipeline.generator = await OrquestadorPipeline.loadInstance(
            OrquestadorPipeline.taskGen, OrquestadorPipeline.modelGen, 
            x => progressCallback({ ...x, status: 'loading' })
        );
    }
}

// Manejo de mensajes del worker
self.addEventListener('message', async (event) => {
    // Añado description y userPrompt para el caso de UX
    const { type, text, description, userPrompt } = event.data;

    try {
        // Escenario 1: Mensaje para iniciar la carga de los modelos
        if (type === 'preload') {
            await ensureModelsLoaded(output => self.postMessage({ status: 'loading', output }));
            self.postMessage({ status: 'ready', message: 'Models loaded and ready' });
            return; 
        }

        // Escenario 2: Mensaje para realizar el procesamiento completo (clasificación + generación)
        await ensureModelsLoaded(output => self.postMessage({ status: 'loading', output }));

        // === NUEVO: Lógica migrada de Visión (UX Audit) ===
        if (type === 'ux_audit') {
            self.postMessage({ status: 'working', message: 'Analyzing UX...' });

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
                - Output format: ONLY ONE list of the 3 improvements.` 
                },
                { 
                    role: "user", 
                    content: `UI Element Description: "${description}"
                User Question: "${userPrompt}"
                
                Provide 3 actionable recommendations:` 
                }
            ];

            const textOutputs = await OrquestadorPipeline.generator(messages, {
                max_new_tokens: 200, 
                do_sample: true, 
                temperature: 0.2,
                repetition_penalty: 1.2,
                top_k: 20
            });

            // Lógica de limpieza exacta del worker original
            let advice = textOutputs[0].generated_text.at(-1).content;
            advice = advice.replace(/\*\*/g, "").replace(/__/g, "");
            advice = advice.replace(/[\u4e00-\u9fa5]/g, "");

            const result = `VISUAL ANALYSIS
${description}

RECOMMENDATIONS
${advice}`;

            self.postMessage({ status: 'complete_ux', advice: result });
            return;
        }
        // =================================================

        // Fase 1: Clasificación del texto para seleccionar el agente apropiado
        const labelMapping = {
            "objective facts, data, and neutral information": "White Agent",
            "display of personal and biased feelings or emotions": "Red Agent",
            "risks, flaws, or criticism": "Black Agent",
            "benefits, value, or advantages": "Yellow Agent",
            "creativity, brainstorming, and alternative solutions": "Green Agent",
            "organization of tasks or summarization": "Blue Agent"
        };
        const englishLabels = Object.keys(labelMapping);
        
        self.postMessage({ status: 'working', message: 'Selecting best Agent...' });
        
        const classificationOutput = await OrquestadorPipeline.classifier(text, englishLabels, {
            hypothesis_template: "The text focuses mainly on {}",
            multi_label: false 
        });

        // Mapeo del resultado de clasificación al nombre del agente
        const winnerEnglishLabel = classificationOutput.labels[0];
        const winnerSpanishLabel = labelMapping[winnerEnglishLabel];
        classificationOutput.labels[0] = winnerSpanishLabel;

        // Fase 2: Generación de respuesta con el agente seleccionado
        const systemPrompt = AGENT_PROMPTS[winnerSpanishLabel];
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
        ];
        
        self.postMessage({ status: 'working', message: `Generating response with ${winnerSpanishLabel}` });
        
        const generationOutput = await OrquestadorPipeline.generator(messages, {
            max_new_tokens: 140,
            temperature: 0.3,
            top_p: 0.9,
            top_k: 15
        });

        // Extracción de la respuesta generada
        const lastMessage = generationOutput[0].generated_text.at(-1);
        const response = lastMessage.content; 

        self.postMessage({
            status: 'complete',
            result: classificationOutput,
            generatedText: response
        });

    } catch (error) {
        console.error("Error en Worker:", error);
        self.postMessage({ status: 'error', output: error });
    }
});