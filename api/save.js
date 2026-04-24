import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const form = new IncomingForm();
    return new Promise((resolve) => {
        form.parse(req, async (err, fields, files) => {
            try {
                const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
                const fileData = fs.readFileSync(file.filepath);
                const engine = Array.isArray(fields.engine) ? fields.engine[0] : fields.engine;
                const modules = Array.isArray(fields.modules) ? fields.modules.join(', ') : fields.modules;

                // --- ПОЛИНА ---
                if (engine === 'pollen') {
                    const response = await fetch("https://api.pollinations.ai/v1/images/generate", {
                        method: "POST",
                        headers: { 
                            "Authorization": `Bearer sk_eLnt9yXSpvo2QeXy9PJreRZnHoOKazUF`, 
                            "Content-Type": "application/json" 
                        },
                        body: JSON.stringify({
                            model: "klein", // Попробуй сменить на 'pollen' или 'flux', если 'klein' не пускает
                            prompt: `Professional landscape design, garden, high resolution, ${modules}`,
                            image: `data:image/jpeg;base64,${fileData.toString('base64')}`,
                            image_strength: 0.4
                        })
                    });
                    const data = await response.json();
                    if (data.error) throw new Error("Pollinations API: " + (data.error.message || data.error));
                    return res.status(200).json({ success: true, imageUrl: data.images[0].url });
                }

                // --- ЯНДЕКС ---
                if (engine === 'yandex') {
                    const yandRes = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync", {
                        method: "POST",
                        headers: { "Authorization": `Api-Key AQVN3DbXYRvQvQg9p2ylCnR5eSVfi_hfQqnJhzQK`, "x-folder-id": "b1ge0eghvcu1vefb33qi" },
                        body: JSON.stringify({
                            modelUri: `art://b1ge0eghvcu1vefb33qi/yandex-art/latest`,
                            messages: [{ weight: 1, text: `Ландшафтный дизайн, сад, фотореализм, ${modules}` }]
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
                sberForm.append('file', new Blob([fileData]), 'image.jpg');
                sberForm.append('purpose', 'general');

                const upRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/files', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${access_token}` },
                    body: sberForm
                });
                const { id: fileId } = await upRes.json();

                const genRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
                    body: JSON.stringify({
                        model: "GigaChat",
                        messages: [{ role: "user", content: `<img src="${fileId}"> Нарисуй ландшафтный дизайн участка: ${modules}. Верни только тег img.` }]
                    })
                });
                const genData = await genRes.json();
                const imgMatch = (genData.choices[0].message.content).match(/<img src="([^"]+)"/);

                if (imgMatch) {
                    const resultId = imgMatch[1];
                    // Ждем 2 секунды, чтобы Сбер успел "проявить" фото
                    await new Promise(r => setTimeout(r, 2000));
                    
                    const fileRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${resultId}/content`, {
                        headers: { 'Authorization': `Bearer ${access_token}` }
                    });
                    
                    if (fileRes.status === 404) throw new Error("Сбер еще не подготовил файл. Попробуйте нажать кнопку еще раз через пару секунд.");
                    
                    const buffer = await fileRes.arrayBuffer();
                    return res.status(200).json({ success: true, imageUrl: `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}` });
                }
                throw new Error("Сбер не сгенерировал картинку.");

            } catch (e) {
                res.status(200).json({ success: false, error: e.message });
            }
            resolve();
        });
    });
}
