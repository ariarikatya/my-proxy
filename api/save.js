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
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // --- ОБЩАЯ АВТОРИЗАЦИЯ СБЕРА (для GET и POST) ---
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

    // --- ОБРАБОТКА GET (Проверка статуса) ---
    if (req.method === 'GET') {
        const { yandexId, sberId } = req.query;

        try {
            if (yandexId) {
                const yandCheck = await fetch(`https://llm.api.cloud.yandex.net/operations/${yandexId}`, {
                    headers: { "Authorization": `Api-Key ${YANDEX_API_KEY}` }
                });
                const yandData = await yandCheck.json();
                return res.status(200).json(yandData);
            }

            if (sberId) {
                const token = await getSberToken();
                const fileRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${sberId}/content`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (fileRes.ok) {
                    const buffer = await fileRes.arrayBuffer();
                    return res.status(200).json({ 
                        done: true, 
                        image: Buffer.from(buffer).toString('base64') 
                    });
                } else {
                    return res.status(200).json({ done: false });
                }
            }
        } catch (e) {
            return res.status(200).json({ error: e.message });
        }
    }

    // --- ОБРАБОТКА POST (Запуск генерации) ---
    const form = new IncomingForm();
    return new Promise((resolve) => {
        form.parse(req, async (err, fields, files) => {
            try {
                const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
                if (!file) throw new Error("Файл не найден");
                const fileData = fs.readFileSync(file.filepath);

                const engine = Array.isArray(fields.engine) ? fields.engine[0] : (fields.engine || "sber");
                const rawModules = Array.isArray(fields.modules) ? fields.modules.join(", ") : (fields.modules || "");
                const customRequest = Array.isArray(fields.customRequest) ? fields.customRequest[0] : (fields.customRequest || "");
                const style = Array.isArray(fields.style) ? fields.style[0] : (fields.style || "природный");

                const finalPrompt = `ЗАДАЧА: Ландшафтный дизайн. СТИЛЬ: ${style}. ИСХОДНОЕ ФОТО — ЭТО ЖЕСТКИЙ ПЛАН. СОХРАНИ БЕЗ ИЗМЕНЕНИЙ: все строения, здания, архитектуру. ИЗМЕНИ ТОЛЬКО ЗЕМЛЮ: добавь туда ${rawModules}. ${customRequest}. Результат: фотореализм.`;

                if (engine === 'yandex') {
                    const yandRes = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync", {
                        method: "POST",
                        headers: { "Authorization": `Api-Key ${YANDEX_API_KEY}`, "x-folder-id": YANDEX_FOLDER_ID },
                        body: JSON.stringify({
                            modelUri: `art://${YANDEX_FOLDER_ID}/yandex-art/latest`,
                            messages: [
                                { weight: 1, text: finalPrompt },
                                { weight: 0.7, image: fileData.toString('base64') } 
                            ]
                        })
                    });
                    const op = await yandRes.json();
                    res.status(200).json({ success: true, provider: 'yandex', operationId: op.id });
                    return resolve();
                }

                // СБЕР (Kandinsky)
                const access_token = await getSberToken();

                const sberForm = new FormData();
                sberForm.append('file', new Blob([fileData]), 'image.jpg');
                sberForm.append('purpose', 'general');

                const upRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/files', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${access_token}` },
                    body: sberForm
                });
                const upData = await upRes.json();

                const genRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
                    body: JSON.stringify({
                        model: "GigaChat",
                        messages: [
                            { role: "system", content: "Ты — бот-художник. ПИСАТЬ ТЕКСТ ЗАПРЕЩЕНО. СРАЗУ РИСУЙ." },
                            { role: "user", content: `На основе этого фото сделай дизайн, сохранив все постройки: ${finalPrompt} <img src="${upData.id}">` }
                        ],
                        function_call: "auto"
                    })
                });
                
                const genData = await genRes.json();
                const content = genData.choices?.[0]?.message?.content || "";
                const imgMatch = content.match(/<img src="([^"]+)"/);

                if (imgMatch) {
                    // Просто отдаем ID картинки фронтенду
                    res.status(200).json({ success: true, provider: 'sber', operationId: imgMatch[1] });
                } else {
                    throw new Error("Сбер не принял запрос на генерацию.");
                }

            } catch (e) {
                res.status(200).json({ success: false, error: e.message });
            }
            resolve();
        });
    });
}
