import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

// КРИТИЧНО ДЛЯ СБЕРА: отключаем строгую проверку SSL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const config = { api: { bodyParser: false } };

const POLLEN_API_KEY = 'sk_eLnt9yXSpvo2QeXy9PJreRZnHoOKazUF';
const YANDEX_API_KEY = 'AQVN3DbXYRvQvQg9p2ylCnR5eSVfi_hfQqnJhzQK';
const YANDEX_FOLDER_ID = 'b1ge0eghvcu1vefb33qi'; 
const SBER_CLIENT_ID = '019da1ca-3d92-737e-a24f-4936ea14a462';
const SBER_CLIENT_SECRET = 'acaed982-e2a0-470e-8a99-98e156836e9b';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const form = new IncomingForm();
    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ success: false, error: "Ошибка парсинга" });

        try {
            const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
            if (!file) throw new Error("Файл не найден");
            const fileData = fs.readFileSync(file.filepath);
            
            const engine = Array.isArray(fields.engine) ? fields.engine[0] : fields.engine;
            const modules = Array.isArray(fields.modules) ? fields.modules.join(', ') : fields.modules;

            // --- 1. POLLINATIONS (FLUX KLEIN) ---
            if (engine === 'pollen') {
                const response = await fetch("https://api.pollinations.ai/v1/images/generate", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${POLLEN_API_KEY}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "klein",
                        prompt: `Landscape design, photorealistic, ${modules}`,
                        image: `data:image/jpeg;base64,${fileData.toString('base64')}`,
                        image_strength: 0.35
                    })
                });
                const data = await response.json();
                if (!data.images) throw new Error("Полина не вернула картинку");
                return res.status(200).json({ success: true, imageUrl: data.images[0].url });
            }

            // --- 2. YANDEX ART (Правильный асинхронный запуск) ---
            if (engine === 'yandex') {
                const response = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync", {
                    method: "POST",
                    headers: { "Authorization": `Api-Key ${YANDEX_API_KEY}`, "x-folder-id": YANDEX_FOLDER_ID },
                    body: JSON.stringify({
                        modelUri: `art://${YANDEX_FOLDER_ID}/yandex-art/latest`,
                        messages: [{ weight: 1, text: `Ландшафтный дизайн, ${modules}, высокое разрешение` }]
                    })
                });
                const operation = await response.json();
                // Возвращаем ID операции, чтобы фронтенд мог "спросить" позже
                return res.status(200).json({ 
                    success: true, 
                    provider: 'yandex', 
                    operationId: operation.id,
                    message: "Картинка генерируется..." 
                });
            }

            // --- 3. СБЕР (Восстановленный рабочий код) ---
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
            
            const authData = await authRes.json();
            const token = authData.access_token;

            // Загрузка файла
            const formData = new FormData();
            formData.append('file', new Blob([fileData]), file.originalFilename);
            formData.append('purpose', 'general');

            const uploadRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/files', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const { id: fileId } = await uploadRes.json();

            // Генерация
            const genRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    model: "GigaChat",
                    messages: [{ role: "user", content: `<img src="${fileId}"> Сделай ландшафтный дизайн: ${modules}` }]
                })
            });
            
            const genData = await genRes.json();
            const content = genData.choices[0].message.content;
            const resFileId = content.match(/<img src="([^"]+)"/)[1];

            // Получение контента
            const fileRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${resFileId}/content`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const buffer = await fileRes.arrayBuffer();
            
            return res.status(200).json({ 
                success: true, 
                imageUrl: `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}` 
            });

        } catch (error) {
            console.error(error);
            res.status(200).json({ success: false, error: error.message });
        }
    });
}
