import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
export const config = { api: { bodyParser: false } };

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

    // --- ОПРОС ГОТОВНОСТИ (GET) ---
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
                // Запрос на генерацию по доке Сбера
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
                            { role: "system", content: "Ты — Василий Кандинский. Генерируй изображения по запросу. Текст в ответе запрещен." },
                            { role: "user", content: `Нарисуй ландшафтный дизайн: ${prompt}. Используй это фото как основу: <img src="${sberId}">` }
                        ],
                        function_call: "auto"
                    })
                });

                const genData = await genRes.json();
                const content = genData.choices?.[0]?.message?.content || "";
                const imgMatch = content.match(/<img src="([^"]+)"/);

                if (imgMatch) {
                    // Если получили ID картинки — скачиваем её (GET /files/{id}/content)
                    const fileRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${imgMatch[1]}/content`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const buffer = await fileRes.arrayBuffer();
                    return res.status(200).json({ done: true, image: Buffer.from(buffer).toString('base64') });
                }
                // Если картинки нет в ответе, значит Сбер еще думает или ошибся
                return res.status(200).json({ done: false });
            }
        } catch (e) { 
            // В случае таймаута просто отвечаем false, чтобы фронтенд повторил попытку
            return res.status(200).json({ done: false, retry: true }); 
        }
    }

    // --- ЗАГРУЗКА ИСХОДНИКА (POST) ---
    const form = new IncomingForm();
    return new Promise((resolve) => {
        form.parse(req, async (err, fields, files) => {
            try {
                const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
                const fileData = fs.readFileSync(file.filepath);
                const engine = fields.engine || "sber";
                const style = fields.style || "природный";
                const custom = fields.customRequest || "";
                const finalPrompt = `Стиль: ${style}. ${custom}. Фотореализм.`;

                if (engine === 'yandex') {
                    const yandRes = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync", {
                        method: "POST",
                        headers: { "Authorization": `Api-Key ${YANDEX_API_KEY}`, "x-folder-id": YANDEX_FOLDER_ID },
                        body: JSON.stringify({
                            modelUri: `art://${YANDEX_FOLDER_ID}/yandex-art/latest`,
                            messages: [
                                { weight: 1, text: finalPrompt },
                                { weight: 0.85, image: fileData.toString('base64') }
                            ]
                        })
                    });
                    const op = await yandRes.json();
                    res.status(200).json({ success: true, provider: 'yandex', operationId: op.id });
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
                    // Возвращаем ID загруженного файла
                    res.status(200).json({ success: true, provider: 'sber', operationId: upData.id, prompt: finalPrompt });
                }
            } catch (e) { res.status(200).json({ success: false, error: e.message }); }
            resolve();
        });
    });
}
