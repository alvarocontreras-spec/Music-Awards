// --- CONFIGURACIÓN Y VARIABLES GLOBALES ---
let selectedFiles = [];

const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const btnEvaluate = document.getElementById('btnEvaluate');
const statusText = document.getElementById('status');
const resultBox = document.getElementById('resultBox');
const resultsTableBody = document.getElementById('resultsTableBody');
const apiKeyInput = document.getElementById('apiKey');
const taskInstructionsInput = document.getElementById('taskInstructions');

// --- 1. LOCALSTORAGE PARA GEMINI KEY Y TAREAS ---
document.addEventListener('DOMContentLoaded', () => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) apiKeyInput.value = savedKey;
    
    const savedTask = localStorage.getItem('last_audio_task');
    if (savedTask) {
        taskInstructionsInput.value = savedTask;
        statusText.innerText = "Estado: API Key de Gemini y tarea de audio cargadas.";
    }
});

apiKeyInput.addEventListener('input', () => localStorage.setItem('gemini_api_key', apiKeyInput.value.trim()));
taskInstructionsInput.addEventListener('input', () => localStorage.setItem('last_audio_task', taskInstructionsInput.value));

// --- 2. CAPTURA DE MULTI-ARCHIVOS DE AUDIO ---
fileInput.addEventListener('change', (event) => {
    selectedFiles = Array.from(event.target.files);
    
    if (selectedFiles.length > 0) {
        fileList.innerHTML = selectedFiles.map(f => `🎵 ${f.name}`).join('<br>');
        fileList.classList.remove('hidden');
        btnEvaluate.disabled = false;
        statusText.innerText = `Estado: ${selectedFiles.length} audio(s) detectado(s). Listo para evaluar.`;
    } else {
        fileList.classList.add('hidden');
        btnEvaluate.disabled = true;
    }
});

// --- 3. BUCLE DE EVALUACIÓN SECUENCIAL (PROCESAMIENTO DIRECTO) ---
btnEvaluate.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const taskInstructions = taskInstructionsInput.value.trim();

    if (!apiKey) return alert("Por favor, ingresa tu Google Gemini API Key.");
    if (!taskInstructions) return alert("Por favor, ingresa las instrucciones de la tarea.");
    if (selectedFiles.length === 0) return alert("Sube al menos un archivo de audio.");

    btnEvaluate.disabled = true;
    resultBox.classList.remove('hidden');
    resultsTableBody.innerHTML = ""; 

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        statusText.innerText = `Evaluando de forma nativa ${i + 1} de ${selectedFiles.length}: ${file.name}...`;

        try {
            // Convertir el audio a Base64 para mandarlo directo a la IA
            const base64Audio = await convertFileToBase64(file);
            
            // Limpiar el nombre del estudiante desde el archivo
            let fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            let cleanName = fileNameWithoutExt.replace(/[_-]/g, ' ');
            let studentName = cleanName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

            // Generar URL local para reproducir el audio en la tabla
            const audioUrl = URL.createObjectURL(file);

            // Llamar a Gemini 1.5 Flash (Análisis de Audio Nativo con Endpoint definitivo)
            const evaluation = await evaluateAudioWithGemini(apiKey, taskInstructions, base64Audio, file.type, studentName);

            // Insertar fila en la tabla
            appendAudioResultRow(studentName, audioUrl, evaluation.veredicto, evaluation.cleanText);

        } catch (error) {
            console.error(error);
            appendAudioResultRow(file.name, "", "ERROR", `Error al procesar: ${error.message}`);
        }
    }

    statusText.innerText = "Estado: ¡Evaluación masiva de audio completada!";
    btnEvaluate.disabled = false;
});

// --- 4. FUNCIONES ENLACE A GOOGLE GEMINI API ---

function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

async function evaluateAudioWithGemini(apiKey, taskInstructions, base64Data, mimeType, studentName) {
    // URL Corregida de forma definitiva para evitar el error de modelo no encontrado
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const promptText = `
Actúa como un evaluador experto de inglés nivel A2 según el MCER. Vas a escuchar el archivo de audio adjunto.

IMPORTANTE:
- Analiza de forma nativa el contenido hablado, pero también aspectos acústicos como la fluidez (pausas, titubeos, ritmo) y la velocidad apropiada para el nivel A2.
- El nombre del estudiante es: "${studentName}".

## TAREA ASIGNADA
${taskInstructions}

## CRITERIOS DE EVALUACIÓN
1. Task Achievement: ¿Respondió la tarea y transmitió la información requerida?
2. Fluency: ¿El ritmo es constante o hay pausas y titubeos excesivos para nivel A2?
3. Grammar & Vocabulary: ¿Las estructuras y palabras usadas son correctas para el nivel?

## RESULTADO
Determina uno de los siguientes resultados: CUMPLE TOTALMENTE, CUMPLE PARCIALMENTE o NO CUMPLE.

Responde EXACTAMENTE con este formato (No agregues introducciones, ve directo a las etiquetas):

VEREDICTO: [CUMPLE TOTALMENTE / CUMPLE PARCIALMENTE / NO CUMPLE]

### 💪 Lo que haces bien
(Escribe un único párrafo corto que contenga EXACTAMENTE TRES ORACIONES completas comentando lo positivo de su vocabulario, mensaje o fluidez acústica).

### 🛠️ Lo que puedes mejorar
(Escribe un único párrafo corto que contenga EXACTAMENTE TRES ORACIONES completas. Señala el error de gramática o el problema de fluidez/pausas más crítico detectado al escucharlo, y dale un consejo directo).
`;

    const payload = {
        contents: [{
            parts: [
                { inlineData: { mimeType: mimeType, data: base64Data } }, 
                { text: promptText }
            ]
        }],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 350
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || "Error en la comunicación con Gemini.");
    }

    const data = await response.json();
    const rawContent = data.candidates[0].content.parts[0].text.trim();

    // Extraer Veredicto
    let veredicto = "CUMPLE PARCIALMENTE";
    if (rawContent.includes("CUMPLE TOTALMENTE")) veredicto = "CUMPLE TOTALMENTE";
    else if (rawContent.includes("NO CUMPLE")) veredicto = "NO CUMPLE";

    // Remover la línea del veredicto para dejar solo el feedback de 3 oraciones
    let cleanText = rawContent.replace(/VEREDICTO:.*\n?/i, '').trim();

    return { veredicto, cleanText };
}

function appendAudioResultRow(studentName, audioUrl, veredicto, feedbackText) {
    let badgeClass = "badge-parcial";
    if (veredicto === "CUMPLE TOTALMENTE") badgeClass = "badge-total";
    if (veredicto === "NO CUMPLE" || veredicto === "ERROR") badgeClass = "badge-no";

    const tr = document.createElement('tr');
    const formattedFeedback = feedbackText.replace(/\n/g, '<br>');
    
    const audioControlHTML = audioUrl ? `<audio src="${audioUrl}" controls></audio>` : `<span>N/A</span>`;

    tr.innerHTML = `
        <td><strong>${studentName}</strong></td>
        <td>${audioControlHTML}</td>
        <td><span class="badge ${badgeClass}">${veredicto}</span></td>
        <td class="feedback-text">${formattedFeedback}</td>
        <td><button class="btn-copy-row">Copiar</button></td>
    `;

    tr.querySelector('.btn-copy-row').addEventListener('click', async () => {
        try {
            const copyContent = `Estudiante: ${studentName}\nVeredicto: ${veredicto}\n\n${feedbackText}`;
            await navigator.clipboard.writeText(copyContent);
            alert(`Feedback de ${studentName} copiado.`);
        } catch (err) {
            alert("Error al copiar.");
        }
    });

    resultsTableBody.appendChild(tr);
}
