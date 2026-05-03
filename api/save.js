import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const config = { 
    api: { bodyParser: false },
    maxDuration: 60 
};

const YANDEX_API_KEY = process.env.YANDEX_API_KEY;
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID;
const SBER_CLIENT_ID = process.env.SBER_CLIENT_ID;
const SBER_CLIENT_SECRET = process.env.SBER_CLIENT_SECRET;
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;

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
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        model: "GigaChat",
                        messages: [
                            { role: "system", content: "Ты — профессиональный ландшафтный дизайнер. Ты ОБЯЗАТЕЛЬНО должен нарисовать проект, используя функцию генерации изображения." },
                            { role: "user", content: `Нарисуй проект ландшафтного дизайна: ${prompt}. Используй это фото как основу: <img src="${sberId}">` }
                        ],
                        "function_call": "auto" 
                    })
                });
                
                const genData = await genRes.json();
                const content = genData.choices?.[0]?.message?.content || "";
                const imgMatch = content.match(/<img src="([^"]+)"/);

                if (imgMatch) {
                    const fileId = imgMatch[1];
                    const fileRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${fileId}/content`, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const buffer = await fileRes.arrayBuffer();
                    return res.status(200).json({ done: true, image: Buffer.from(buffer).toString('base64') });
                }

                if (genData.choices?.[0]?.finish_reason === "stop") {
                    return res.status(200).json({ done: true, error: "Нейросеть выдала текст вместо картинки. Попробуйте изменить описание." });
                }
                return res.status(200).json({ done: false });
            }
        } catch (e) { 
            return res.status(500).json({ done: false, error: e.message }); 
        }
    }

    const form = new IncomingForm();
    return new Promise((resolve) => {
        form.parse(req, async (err, fields, files) => {
            if (err) {
                res.status(500).json({ success: false, error: "Ошибка разбора формы" });
                return resolve();
            }

            try {
                const getVal = (val) => Array.isArray(val) ? val[0] : val;
                const engine = getVal(fields.engine);
                const style = getVal(fields.style);
                const custom = getVal(fields.customRequest);
                const modules = getVal(fields.modules);
                
                // Для Сбера лучше подготовить промпт на русском
                const finalPrompt = engine === 'sber' 
                    ? `ландшафт в стиле ${style}, модули: ${modules}. ${custom}`
                    : `Landscape design, ${style} style, ${modules}. ${custom}. Photorealistic, 8k.`;

                const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
                if (!file) throw new Error("Файл не найден");
                const fileData = fs.readFileSync(file.filepath);

                if (engine === 'pollinations') {
                    // ... твой код для pollinations без изменений ...
                }

                if (engine === 'yandex') {
                    // ... твой код для yandex без изменений ...
                    const yandRes = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync", {
                        method: "POST",
                        headers: { "Authorization": `Api-Key ${YANDEX_API_KEY}`, "x-folder-id": YANDEX_FOLDER_ID },
                        body: JSON.stringify({
                            modelUri: `art://${YANDEX_FOLDER_ID}/yandex-art/latest`,
                            messages: [
                                { weight: 1, text: finalPrompt },
                                { weight: 0.9, image: fileData.toString('base64') }
                            ]
                        })
                    });
                    const op = await yandRes.json();
                    res.status(200).json({ success: true, provider: 'yandex', operationId: op.id });
                    return resolve();
                }

                if (engine === 'sber') {
                    const token = await getSberToken();
                    const sberFormData = new globalThis.FormData();
                    const imageBlob = new Blob([fileData], { type: 'image/jpeg' });
                    sberFormData.append('file', imageBlob, 'image.jpg');
                    sberFormData.append('purpose', 'general');

                    const upRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/files', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: sberFormData
                    });

                    const upData = await upRes.json();
                    if (!upRes.ok) throw new Error(upData.message || "Ошибка загрузки в Сбер");

                    res.status(200).json({ 
                        success: true, 
                        provider: 'sber', 
                        operationId: upData.id, 
                        prompt: finalPrompt 
                    });
                    return resolve();
                }
                
                res.status(400).json({ success: false, error: "Неверный движок" });
                return resolve();

            } catch (e) {
                res.status(500).json({ success: false, error: e.message });
                return resolve();
            }
        });
    });
}
