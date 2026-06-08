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

// --- 3. BUCLE DE EVALUACIÓN SECUENCIAL ---
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
            const base64Audio = await convertFileToBase64(file);
            
            // Limpiar el nombre del estudiante desde el archivo
            let fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            let cleanName = fileNameWithoutExt.replace(/[_-]/g, ' ');
            let studentName = cleanName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

            const audioUrl = URL.createObjectURL(file);

            // Llamar a Gemini 2.5 Flash
            const feedbackText = await evaluateAudioWithGemini(apiKey, taskInstructions, base64Audio, file.type, studentName);

            // Insertar fila en la tabla (Ya no pasamos ni mostramos veredicto)
            appendAudioResultRow(studentName, audioUrl, feedbackText);

        } catch (error) {
            console.error(error);
            appendAudioResultRow(file.name, "", `Error al procesar: ${error.message}`);
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const promptText = `
Actúa como un evaluador experto de inglés nivel A2 según el MCER. Vas a escuchar el archivo de audio adjunto.

IMPORTANTE:
- Analiza de forma nativa el contenido hablado, pero también aspectos acústicos como la fluidez (pausas, titubeos, ritmo) y la velocidad apropiada para el nivel A2.
- El nombre del estudiante es: "${studentName}".
- Tu tono debe ser extremadamente motivador, empático y pedagógico.
- NO incluyas clasificaciones de nivel, notas o veredictos globales. Ve directo al grano con el formato solicitado.

## TAREA ASIGNADA
${taskInstructions}

## CRITERIOS DE EVALUACIÓN
1. Task Achievement: ¿Respondió la tarea y transmitió la información requerida?
2. Fluency: ¿El ritmo es constante o hay pausas y titubeos excesivos para nivel A2?
3. Grammar & Vocabulary: ¿Las estructuras y palabras usadas son correctas para el nivel?

Responde EXACTAMENTE con este formato (No agregues introducciones, ve directo a las etiquetas):

Lo bueno: ¡Excelente uso de [mencionar un acierto gramatical, vocabulario o conector usado por el alumno]! Me encantó que [mencionar un comentario positivo, ameno o motivador sobre su esfuerzo o contenido].

Para mejorar: Recuerda [explicar el error más crítico de forma simple, ej: ponerle la "s" al verbo cuando hablas de ella]: "[mostrar el ejemplo corregido entre comillas]". ¡Sigue practicando así de bien, vas por excelente camino!
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
    return data.candidates[0].content.parts[0].text.trim();
}

function appendAudioResultRow(studentName, audioUrl, feedbackText) {
    const tr = document.createElement('tr');
    const formattedFeedback = feedbackText.replace(/\n/g, '<br>');
    
    const audioControlHTML = audioUrl ? `<audio src="${audioUrl}" controls></audio>` : `<span>N/A</span>`;

    // Se eliminó por completo la celda del Veredicto en el HTML dinámico
    tr.innerHTML = `
        <td><strong>${studentName}</strong></td>
        <td>${audioControlHTML}</td>
        <td class="feedback-text">${formattedFeedback}</td>
        <td><button class="btn-copy-row">Copiar</button></td>
    `;

    tr.querySelector('.btn-copy-row').addEventListener('click', async () => {
        try {
            const copyContent = `Estudiante: ${studentName}\n\n${feedbackText}`;
            await navigator.clipboard.writeText(copyContent);
            alert(`Feedback de ${studentName} copiado.`);
        } catch (err) {
            alert("Error al copiar.");
        }
    });

    resultsTableBody.appendChild(tr);
}
