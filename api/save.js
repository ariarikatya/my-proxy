import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Обработка GET запроса для Яндекса (теперь всё в одном файле)
    if (req.method === 'GET' && req.query.yandexId) {
        try {
            const yandCheck = await fetch(`https://llm.api.cloud.yandex.net/operations/${req.query.yandexId}`, {
                headers: { "Authorization": `Api-Key AQVN3DbXYRvQvQg9p2ylCnR5eSVfi_hfQqnJhzQK` }
            });
            const yandData = await yandCheck.json();
            return res.status(200).json(yandData);
        } catch (e) {
            return res.status(200).json({ error: e.message });
        }
    }

    const form = new IncomingForm();
    return new Promise((resolve) => {
        form.parse(req, async (err, fields, files) => {
            try {
                const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
                if (!file) throw new Error("Файл не найден");
                const fileData = fs.readFileSync(file.filepath);
                const engine = Array.isArray(fields.engine) ? fields.engine[0] : fields.engine;
                const modules = Array.isArray(fields.modules) ? fields.modules.join(', ') : fields.modules;

                // --- ЯНДЕКС (Запуск) ---
                if (engine === 'yandex') {
                    const yandRes = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync", {
                        method: "POST",
                        headers: { "Authorization": `Api-Key AQVN3DbXYRvQvQg9p2ylCnR5eSVfi_hfQqnJhzQK`, "x-folder-id": "b1ge0eghvcu1vefb33qi" },
                        body: JSON.stringify({
                            modelUri: `art://b1ge0eghvcu1vefb33qi/yandex-art/latest`,
                            messages: [{ weight: 1, text: `Landscape design, photorealistic, ${modules}` }]
                        })
                    });
                    const op = await yandRes.json();
                    return res.status(200).json({ success: true, provider: 'yandex', operationId: op.id });
                }

                // --- СБЕР ---
                const authRes = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Basic MDE5ZGExY2EtM2Q5Mi03MzdlLWEyNGYtNDkzNmVhMTRhNDYyOmFjYWVkOTgyLWUyYTAtNDcwZS04YTk5LTk4ZTE1NjgzNmU5Yg==`, 
                        'Content-Type': 'application/x-www-form-urlencoded', 
                        'RqUID': '6f0b1291-c7f1-43c2-83b2-e4642744c807' 
                    },
                    body: 'scope=GIGACHAT_API_PERS'
                });
                const { access_token } = await authRes.json();

                const sberForm = new FormData();
                sberForm.append('file', new Blob([fileData]), 'img.jpg');
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
                        // Промт: просим ТОЛЬКО картинку
                        messages: [{ role: "user", content: `<img src="${upData.id}"> Нарисуй ландшафтный дизайн участка: ${modules}. В ответе пришли ТОЛЬКО тег img и ничего больше.` }]
                    })
                });
                const genData = await genRes.json();
                
                if (!genData.choices) throw new Error("GigaChat пустой ответ: " + JSON.stringify(genData));
                
                const content = genData.choices[0].message.content;
                const imgMatch = content.match(/<img src="([^"]+)"/);

                if (imgMatch) {
                    const resultId = imgMatch[1];
                    let attempts = 0;
                    let fileRes;
                    
                    while (attempts < 5) {
                        await new Promise(r => setTimeout(r, 2500));
                        fileRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${resultId}/content`, {
                            headers: { 'Authorization': `Bearer ${access_token}` }
                        });
                        if (fileRes.ok) break;
                        attempts++;
                    }

                    if (!fileRes.ok) throw new Error("Сбер долго думает (attempts exceeded).");
                    
                    const buffer = await fileRes.arrayBuffer();
                    return res.status(200).json({ success: true, imageUrl: `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}` });
                }
                
                // ВАЖНО: Если img тега нет, мы выбрасываем ошибку с текстом от Сбера
                throw new Error("Сбер прислал текст вместо фото: " + content.substring(0, 50));

            } catch (e) {
                res.status(200).json({ success: false, error: e.message });
            }
            resolve();
        });
    });
}
