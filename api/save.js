import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';
import FormData from 'form-data'; // Нужно добавить в package.json

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const config = { 
    api: { bodyParser: false },
    maxDuration: 60 
};

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const YANDEX_API_KEY = process.env.YANDEX_API_KEY;
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID;
const SBER_CLIENT_ID = process.env.SBER_CLIENT_ID;
const SBER_CLIENT_SECRET = process.env.SBER_CLIENT_SECRET;
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY; // Добавь в переменные Vercel

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
                            { role: "system", content: "Ты — ландшафтный дизайнер." },
                            { role: "user", content: `Нарисуй: ${prompt}. <img src="${sberId}">` }
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
        } catch (e) { return res.status(200).json({ done: false, error: e.message }); }
    }

    const form = new IncomingForm();
    return new Promise((resolve) => {
        form.parse(req, async (err, fields, files) => {
            try {
                const getVal = (val) => Array.isArray(val) ? val[0] : val;
                const engine = getVal(fields.engine);
                const style = getVal(fields.style);
                const custom = getVal(fields.customRequest);
                const modules = getVal(fields.modules);
                const finalPrompt = `Landscape design, ${style} style, ${modules}. ${custom}. Photorealistic, 8k.`;

                const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
                const fileData = fs.readFileSync(file.filepath);

                // --- ИСПРАВЛЕННЫЙ БЛОК: POLLINATIONS (KLEIN) ---
// --- БРОНИРОВАННЫЙ БЛОК: POLLINATIONS ---
if (engine === 'pollinations') {
    try {
        const pollFormData = new FormData();
        
        // Добавляем файл именно так, как требует спецификация multipart
        pollFormData.append('image', fileData, { 
            filename: 'input_image.jpg', 
            contentType: 'image/jpeg' 
        });
        
        pollFormData.append('model', 'klein'); 
        pollFormData.append('prompt', finalPrompt);
        pollFormData.append('response_format', 'b64_json');

        // Попробуем сменить эндпоинт на более стабильный для генерации по фото
        const pollRes = await fetch('https://gen.pollinations.ai/v1/images/generations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${POLLINATIONS_API_KEY}`,
                ...pollFormData.getHeaders()
            },
            body: pollFormData
        });

        // КРИТИЧЕСКИЙ МОМЕНТ: проверяем тип контента перед парсингом
        const contentType = pollRes.headers.get("content-type");
        const responseText = await pollRes.text();

        if (!pollRes.ok) {
            console.error("API Error:", responseText);
            return res.status(pollRes.status).json({ 
                success: false, 
                error: `Pollinations API вернул ${pollRes.status}. Проверь ключ или лимиты.` 
            });
        }

        if (contentType && contentType.includes("application/json")) {
            const pollData = JSON.parse(responseText);
            const resultImg = pollData.data[0].b64_json || pollData.data[0].url;

            return res.status(200).json({ 
                success: true, 
                done: true, 
                provider: 'pollinations', 
                image: resultImg,
                isUrl: resultImg.startsWith('http')
            });
        } else {
            // Если пришел не JSON (тот самый случай с '<')
            return res.status(500).json({ 
                success: false, 
                error: "Сервер прислал HTML вместо данных. Возможно, неверный URL API." 
            });
        }

    } catch (pollErr) {
        return res.status(500).json({ success: false, error: "Ошибка Pollinations: " + pollErr.message });
    }
}

                // --- ЯНДЕКС ---
                if (engine === 'yandex') {
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
                    return res.status(200).json({ success: true, provider: 'yandex', operationId: op.id });
                }

                // --- СБЕР (ПО УМОЛЧАНИЮ) ---
                const token = await getSberToken();
                const sberFormData = new FormData();
                sberFormData.append('file', fileData, 'image.jpg');
                sberFormData.append('purpose', 'general');

                const upRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/files', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: sberFormData
                });
                const upData = await upRes.json();
                return res.status(200).json({ success: true, provider: 'sber', operationId: upData.id, prompt: finalPrompt });

            } catch (e) { res.status(200).json({ success: false, error: e.message }); }
            resolve();
        });
    });
}
