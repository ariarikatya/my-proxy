import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CLIENT_ID = '019da1ca-3d92-737e-a24f-4936ea14a462';
const CLIENT_SECRET = 'acaed982-e2a0-470e-8a99-98e156836e9b';
const authKey = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
const HF_TOKEN = "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"; 

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const form = new IncomingForm();
    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error("Form parsing error:", err);
            return res.status(500).json({ success: false, error: "Form parse error" });
        }

        try {
            // Проверяем, пришел ли файл (в разных версиях formidable путь разный)
            const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
            if (!file) throw new Error("File not found in request");

            const fileData = fs.readFileSync(file.filepath);
            const engine = fields.engine ? (Array.isArray(fields.engine) ? fields.engine[0] : fields.engine) : "sber";
            const modules = fields.modules ? (Array.isArray(fields.modules) ? fields.modules.join(', ') : fields.modules) : "landscape design";

           // --- ВАРИАНТ 1: HUGGING FACE (Используем самую актуальную модель) ---
if (engine === 'hf') {
    console.log("Запуск генерации через FLUX...");
    
    // FLUX.1-schnell — сейчас самая стабильная и мощная модель на HF
    const MODEL_ID = "black-forest-labs/FLUX.1-schnell"; 

    const hfResponse = await fetch(
        `https://api-inference.huggingface.co/models/${MODEL_ID}`,
        {
            headers: { 
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json" 
            },
            method: "POST",
            body: JSON.stringify({ 
                inputs: `A professional 3D landscape design project of a backyard, featuring ${modules}. High quality, photorealistic, cinematic lighting, 8k resolution.`,
            })
        }
    );

    // Если модель 404 или 503 (грузится)
    if (!hfResponse.ok) {
        const errorText = await hfResponse.text();
        console.error("HF Детальная ошибка:", errorText);
        
        // Если модель просто не найдена, попробуем "старую добрую" SD 1.5 как план Б
        return res.status(hfResponse.status).json({ 
            success: false, 
            error: `Модель HF (${MODEL_ID}) ответила: ${hfResponse.status}. Попробуйте через минуту.` 
        });
    }
    
    const arrayBuffer = await hfResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    return res.status(200).json({
        success: true,
        imageUrl: `data:image/jpeg;base64,${base64}`
    });
}

            // --- GIGACHAT (СБЕР) ---
            const authResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded', 
                    'RqUID': '6f0b1291-c7f1-43c2-83b2-e4642744c807', 
                    'Authorization': `Basic ${authKey}` 
                },
                body: 'scope=GIGACHAT_API_PERS'
            });
            const authData = await authResponse.json();
            const token = authData.access_token;

            // Загрузка файла в Сбер (через старый добрый метод без лишних библиотек)
            const { id: fileId } = await uploadToSber(fileData, file.originalFilename, token);

            const genResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    model: "GigaChat",
                    messages: [{ role: "user", content: `<img src="${fileId}"> Нарисуй ландшафтный дизайн: ${modules}` }]
                })
            });

            const genData = await genResponse.json();
            const imgMatch = (genData.choices?.[0]?.message?.content || "").match(/<img src="([^"]+)"/);

            if (imgMatch) {
                const resFileId = imgMatch[1];
                const fileRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${resFileId}/content`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const buffer = await fileRes.arrayBuffer();
                return res.status(200).json({ success: true, imageUrl: `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}` });
            }

            throw new Error("GigaChat didn't return an image");

        } catch (error) {
            console.error("SERVER ERROR:", error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    });
}

// Вспомогательная функция для Сбера, чтобы не падал FormData
async function uploadToSber(buffer, filename, token) {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('file', blob, filename);
    formData.append('purpose', 'general');

    const res = await fetch('https://gigachat.devices.sberbank.ru/api/v1/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });
    return res.json();
}
