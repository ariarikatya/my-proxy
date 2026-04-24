import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

export const config = { api: { bodyParser: false } };

// --- ТВОИ КЛЮЧИ (Впиши их сюда!) ---
const POLLEN_API_KEY = 'ТВОЙ_КЛЮЧ_POLLINATIONS';
const YANDEX_API_KEY = 'ТВОЙ_API_KEY_ЯНДЕКС';
const YANDEX_FOLDER_ID = 'ТВОЙ_FOLDER_ID'; 
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
            const base64Image = fileData.toString('base64');
            
            const engine = fields.engine ? (Array.isArray(fields.engine) ? fields.engine[0] : fields.engine) : "sber";
            const modules = fields.modules ? (Array.isArray(fields.modules) ? fields.modules : fields.modules) : "ландшафтный дизайн";

            // --- ЛОГИКА 1: POLLINATIONS (FLUX KLEIN) ---
            if (engine === 'pollen') {
                const response = await fetch("https://api.pollinations.ai/v1/images/generate", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${POLLEN_API_KEY}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "klein",
                        prompt: `Landscape design, photorealistic, ${modules}, high quality`,
                        image: `data:image/jpeg;base64,${base64Image}`,
                        image_strength: 0.35
                    })
                });
                const data = await response.json();
                return res.status(200).json({ success: true, imageUrl: data.images[0].url });
            }

            // --- ЛОГИКА 2: YANDEX ART ---
            if (engine === 'yandex') {
                const response = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync", {
                    method: "POST",
                    headers: { "Authorization": `Api-Key ${YANDEX_API_KEY}`, "x-folder-id": YANDEX_FOLDER_ID },
                    body: JSON.stringify({
                        modelUri: `art://${YANDEX_FOLDER_ID}/yandex-art/latest`,
                        generationOptions: { seed: Math.floor(Math.random() * 1000) },
                        messages: [{ weight: 1, text: `Ландшафтный дизайн участка, ${modules}, профессиональное фото` }]
                    })
                });
                const operation = await response.json();
                // Яндекс работает долго (асинхронно), тут в идеале нужно ждать завершения, 
                // но для теста вернем ID операции или ошибку, если что-то не так.
                if (!operation.id) throw new Error("Яндекс не принял запрос");
                return res.status(200).json({ success: true, imageUrl: "https://via.placeholder.com/1024x1024.png?text=Yandex_Processing_Wait_60s" });
            }

            // --- ЛОГИКА 3: СБЕР (GIGACHAT) ---
            const authKey = Buffer.from(`${SBER_CLIENT_ID}:${SBER_CLIENT_SECRET}`).toString('base64');
            const authRes = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${authKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'RqUID': '6f0b1291-c7f1-43c2-83b2-e4642744c807' },
                body: 'scope=GIGACHAT_API_PERS'
            });
            const { access_token } = await authRes.json();
            const { id: fileId } = await uploadToSber(fileData, file.originalFilename, access_token);
            const genRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
                body: JSON.stringify({ model: "GigaChat", messages: [{ role: "user", content: `<img src="${fileId}"> Нарисуй ландшафтный дизайн: ${modules}` }] })
            });
            const genData = await genRes.json();
            const resFileId = genData.choices[0].message.content.match(/<img src="([^"]+)"/)[1];
            const fileRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${resFileId}/content`, { headers: { 'Authorization': `Bearer ${access_token}` } });
            const buffer = await fileRes.arrayBuffer();
            return res.status(200).json({ success: true, imageUrl: `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}` });

        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
}

async function uploadToSber(buffer, filename, token) {
    const formData = new FormData();
    formData.append('file', new Blob([buffer]), filename);
    formData.append('purpose', 'general');
    const res = await fetch('https://gigachat.devices.sberbank.ru/api/v1/files', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    return res.json();
}
