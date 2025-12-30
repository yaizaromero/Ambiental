import { pipeline, env } from '@xenova/transformers';

// Configuración obligatoria: Desactivar carga de modelos locales del sistema de archivos
// (los descargará de internet la primera vez y los guardará en caché del navegador)
env.allowLocalModels = false;

// Usamos el patrón Singleton para cargar el modelo solo una vez
class OrquestadorPipeline {
    static task = 'zero-shot-classification';
    // Modelo ligero y rápido recomendado para pruebas iniciales
    static model = 'Xenova/mobilebert-uncased-mnli'; 
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

// Escuchar mensajes desde la interfaz (App.jsx)
self.addEventListener('message', async (event) => {
    // Extraemos el texto que nos manda la App
    const { text } = event.data;

    // 1. Cargamos el modelo (si es la primera vez, tardará un poco)
    let classifier = await OrquestadorPipeline.getInstance(x => {
        // Enviamos el progreso de carga a la App (ej: "Cargando 50%...")
        self.postMessage({ status: 'loading', output: x });
    });

    // 2. Definimos las etiquetas de los "Seis Sombreros" [cite: 29]
    // Estas etiquetas ayudan a la IA a entender la intención
    const candidate_labels = [
        "critica negativa riesgo problema", // Sombrero Negro
        "idea creativa nueva alternativa",  // Sombrero Verde
        "dato objetivo hecho numerico",     // Sombrero Blanco
        "emocion sentimiento intuicion",    // Sombrero Rojo
        "beneficio ventaja positivo"        // Sombrero Amarillo
    ];

    // 3. Ejecutamos la clasificación
    let output = await classifier(text, candidate_labels);

    // 4. Enviamos la respuesta de vuelta
    self.postMessage({
        status: 'complete',
        result: output
    });
});