import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
export const config = { api: { bodyParser: false } };

const YANDEX_API_KEY = 'AQVN3DbXYRvQvQg9p2ylCnR5eSVfi_hfQqnJhzQK';
const YANDEX_FOLDER_ID = 'b1ge0eghvcu1vefb33qi'; 
const SBER_CLIENT_ID = '019da1ca-3d92-737e-a24f-4936ea14a462';
const SBER_CLIENT_SECRET = 'acaed982-e2a0-470e-8a99-98e156836e9b';
const TENSOR_API_KEY = 'ak_tensor_noPYu9xL_u9UHxMk9kgU1Ilf7aZ2AIQFJ25NhjkLaOk'; 

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
        const { yandexId, sberId, tensorId, prompt } = req.query;
        try {
            if (yandexId) {
                const yandCheck = await fetch(`https://llm.api.cloud.yandex.net/operations/${yandexId}`, {
                    headers: { "Authorization": `Api-Key ${YANDEX_API_KEY}` }
                });
                const data = await yandCheck.json();
                if (data.done) return res.status(200).json({ done: true, image: data.response.image });
                return res.status(200).json({ done: false });
            }

            if (tensorId) {
                const tensorCheck = await fetch(`https://api.tensor.art/v1/jobs/${tensorId}`, {
                    headers: { "Authorization": `Bearer ${TENSOR_API_KEY}` }
                });
                const data = await tensorCheck.json();
                // Безопасная проверка статуса
                if (data && data.job && data.job.status === 'SUCCESS') {
                    const imgRes = await fetch(data.job.success_output[0].url);
                    const buffer = await imgRes.arrayBuffer();
                    return res.status(200).json({ done: true, image: Buffer.from(buffer).toString('base64') });
                }
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
                            { role: "system", content: "Ты — ландшафтный дизайнер. Генерируй изображения. Не меняй контуры строений и заборов." },
                            { role: "user", content: `Нарисуй ландшафтный дизайн: ${prompt}. Сохрани забор и дом 1-в-1: <img src="${sberId}">` }
                        ]
                    })
                });
                const genData = await genRes.json();
                const content = genData.choices?.[0]?.message?.content || "";
                const imgMatch = content.match(/<img src="([^"]+)"/);

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
            return res.status(200).json({ done: false, retry: true, error: e.message }); 
        }
    }

    const form = new IncomingForm();
    return new Promise((resolve) => {
        form.parse(req, async (err, fields, files) => {
            try {
                const getVal = (val) => Array.isArray(val) ? val[0] : val;
                const engine = getVal(fields.engine) || "sber";
                const style = getVal(fields.style) || "природный";
                const custom = getVal(fields.customRequest) || "";
                const modules = getVal(fields.modules) || "";

                const finalPrompt = `Lush green grass lawn, landscaping, style: ${style}. Elements: ${modules}. Extra: ${custom}. High quality, 8k, photorealistic. NO stones, NO gravel, NO rocks on the ground.`;

                const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
                const fileData = fs.readFileSync(file.filepath);
                const base64Image = fileData.toString('base64');

                if (engine === 'tensor') {
                    // Используем официальный метод через Workflow Template из документации
                    const tensorRes = await fetch("https://ap-east-1.tensorart.cloud/v1/jobs/workflow/template", {
                        method: "POST",
                        headers: { 
                            "Content-Type": "application/json", 
                            "Authorization": `Bearer ${TENSOR_API_KEY}` 
                        },
                        body: JSON.stringify({
                            // ID шаблона ControlNet со скриншота документации
                            templateId: "6910808619367602085", 
                            fields: {
                                fieldAttrs: [
                                    {
                                        nodeId: "11",
                                        fieldName: "image",
                                        fieldValue: base64Image // Твое исходное фото дома
                                    },
                                    {
                                        nodeId: "14",
                                        fieldName: "ckpt_name",
                                        fieldValue: "681380884898701627" // Твой верный ID для Juggernaut XL
                                    },
                                    {
                                        nodeId: "12",
                                        fieldName: "control_net_name",
                                        // Для XL моделей используем совместимый файл контуров
                                        fieldValue: "diffusers_xl_canny_full.safetensors" 
                                    },
                                    {
                                        nodeId: "10", 
                                        fieldName: "text",
                                        fieldValue: finalPrompt // Твой промпт для дизайна
                                    }
                                ]
                            }
                        })
                    });

                    const data = await tensorRes.json();

                    if (data && data.job && data.job.id) {
                        return res.status(200).json({ 
                            success: true, 
                            provider: 'tensor', 
                            operationId: data.job.id,
                            prompt: finalPrompt 
                        });
                    } else {
                        const errorMsg = data.error?.message || JSON.stringify(data);
                        throw new Error(`Tensor Workflow Error: ${errorMsg}`);
                    }

                }

                } else if (engine === 'yandex') {
                    const yandRes = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync", {
                        method: "POST",
                        headers: { "Authorization": `Api-Key ${YANDEX_API_KEY}`, "x-folder-id": YANDEX_FOLDER_ID },
                        body: JSON.stringify({
                            modelUri: `art://${YANDEX_FOLDER_ID}/yandex-art/latest`,
                            messages: [
                                { weight: 1, text: "Keep the fence exactly as it is. Change only the ground to green grass. " + finalPrompt },
                                { weight: 0.95, image: base64Image }
                            ]
                        })
                    });
                    const op = await yandRes.json();
                    return res.status(200).json({ success: true, provider: 'yandex', operationId: op.id, prompt: finalPrompt });

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
                console.error("Backend Error:", e.message);
                res.status(200).json({ success: false, error: e.message }); 
            }
            resolve();
        });
    });
}
