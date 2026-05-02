import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const config = { 
    api: { bodyParser: false },
    maxDuration: 60 
};

// --- КОНФИГУРАЦИЯ CLOUDFLARE ---
const CF_ACCOUNT_ID = 'ВАШ_ACCOUNT_ID_ЗДЕСЬ';
const CF_API_TOKEN = 'ВАШ_API_TOKEN_ЗДЕСЬ';

const YANDEX_API_KEY = 'AQVN3DbXYRvQvQg9p2ylCnR5eSVfi_hfQqnJhzQK';
const YANDEX_FOLDER_ID = 'b1ge0eghvcu1vefb33qi'; 
const SBER_CLIENT_ID = '019da1ca-3d92-737e-a24f-4936ea14a462';
const SBER_CLIENT_SECRET = 'acaed982-e2a0-470e-8a99-98e156836e9b';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const getSberToken = async () => {
        const authKey = Buffer.from(`${SBER_CLIENT_ID}:${SBER_CLIENT_SECRET}`).toString('base64');
        const authRes = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
            method: 'POST',
            headers: { 
                'Authorization': `Basic ${authKey}`, 
                'Content-Type': 'application/x-www-form-urlencoded', 
                'RqUID': '6f0b1291-c7f1-43c2-83b2-e4642744c807' 
            },
            body: 'scope=GIGACHAT_API_PERS'
        });
        const data = await authRes.json();
        return data.access_token;
    };

    // --- ОБРАБОТКА GET (Опрос статуса) ---
    if (req.method === 'GET') {
        const { yandexId, sberId, prompt } = req.query;
        try {
            if (yandexId) {
                const yandCheck = await fetch(`https://llm.api.cloud.yandex.net/operations/${yandexId}`, {
                    headers: { "Authorization": `Api-Key ${YANDEX_API_KEY}` }
                });
                const data = await yandCheck.json();
                if (data.done) return res.status(200).json({ done: true, image: data.response.image });
                return res.status(200).json({ done: false });
            }

            if (sberId) {
                const token = await getSberToken();
                const genRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "GigaChat",
                        messages: [
                            { role: "system", content: "Ты — ландшафтный дизайнер. Генерируй изображения." },
                            { role: "user", content: `Нарисуй ландшафтный дизайн: ${prompt}. <img src="${sberId}">` }
                        ]
                    })
                });
                const genData = await genRes.json();
                const imgMatch = (genData.choices?.[0]?.message?.content || "").match(/<img src="([^"]+)"/);

                if (imgMatch) {
                    const fileRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${imgMatch[1]}/content`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const buffer = await fileRes.arrayBuffer();
                    return res.status(200).json({ done: true, image: Buffer.from(buffer).toString('base64') });
                }
                return res.status(200).json({ done: false });
            }
        } catch (e) { 
            return res.status(200).json({ done: false, error: e.message }); 
        }
    }

    // --- ОБРАБОТКА POST (Запуск генерации) ---
    const form = new IncomingForm();
    return new Promise((resolve) => {
        form.parse(req, async (err, fields, files) => {
            try {
                const getVal = (val) => Array.isArray(val) ? val[0] : val;
                const engine = getVal(fields.engine) || "sber";
                const style = getVal(fields.style) || "природный";
                const custom = getVal(fields.customRequest) || "";
                const modules = getVal(fields.modules) || "";
                const finalPrompt = `Professional landscaping design, style: ${style}. Elements: ${modules}. Extra: ${custom}. High quality, photorealistic, 8k. Keep original house structure.`;

                const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
                const fileData = fs.readFileSync(file.filepath);

                // --- ЛОГИКА CLOUDFLARE (замена Тензора) ---
                if (engine === 'tensor') {
                    console.log("Using Cloudflare Workers AI...");
                    
                    const cfResponse = await fetch(
                        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/runwayml/stable-diffusion-v1-5-img2img`,
                        {
                            method: "POST",
                            headers: { 
                                "Authorization": `Bearer ${CF_API_TOKEN}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                prompt: finalPrompt,
                                image: [...new Uint8Array(fileData)], // Конвертируем Buffer в массив для Cloudflare
                                strength: 0.6, // Баланс между оригиналом и дизайном
                                num_steps: 20
                            }),
                        }
                    );

                    if (!cfResponse.ok) {
                        const errorData = await cfResponse.json();
                        throw new Error(`Cloudflare Error: ${JSON.stringify(errorData)}`);
                    }

                    // Cloudflare возвращает сразу бинарный файл картинки
                    const imageBuffer = await cfResponse.arrayBuffer();
                    const base64Image = Buffer.from(imageBuffer).toString('base64');

                    // Так как Cloudflare отвечает мгновенно, мы сразу возвращаем "done"
                    return res.status(200).json({ 
                        success: true, 
                        done: true, 
                        provider: 'cloudflare', 
                        image: base64Image 
                    });
                }

                // Логика Yandex и Sber остается без изменений...
                if (engine === 'yandex') {
                    const yandRes = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync", {
                        method: "POST",
                        headers: { "Authorization": `Api-Key ${YANDEX_API_KEY}`, "x-folder-id": YANDEX_FOLDER_ID },
                        body: JSON.stringify({
                            modelUri: `art://${YANDEX_FOLDER_ID}/yandex-art/latest`,
                            messages: [
                                { weight: 1, text: finalPrompt },
                                { weight: 0.8, image: fileData.toString('base64') }
                            ]
                        })
                    });
                    const op = await yandRes.json();
                    return res.status(200).json({ success: true, provider: 'yandex', operationId: op.id });

                } else {
                    const token = await getSberToken();
                    const sberFormData = new FormData();
                    sberFormData.append('file', new Blob([fileData]), 'image.jpg');
                    sberFormData.append('purpose', 'general');

                    const upRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/files', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: sberFormData
                    });
                    const upData = await upRes.json();
                    return res.status(200).json({ success: true, provider: 'sber', operationId: upData.id, prompt: finalPrompt });
                }
            } catch (e) { 
                res.status(200).json({ success: false, error: e.message }); 
            }
            resolve();
        });
    });
}
