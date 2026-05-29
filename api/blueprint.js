import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const config = { 
    api: { bodyParser: false }
};

const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const form = new IncomingForm();
    return new Promise((resolve) => {
        form.parse(req, async (err, fields, files) => {
            if (err) { 
                res.status(500).json({ success: false, error: "Ошибка разбора формы" }); 
                return resolve(); 
            }

            try {
                const getVal = (val) => Array.isArray(val) ? val[0] : val;
                const modules = getVal(fields.modules); 
                const imageUrl = getVal(fields.image_url);

                // Максимально короткий и понятный для модели промт (чтобы ускорить генерацию)
                const finalPrompt = `Convert to 2D landscape architecture blueprint. Top-down orthographic view, CAD engineering schematic style, solid white background, sharp black lines only. Mark zones for: ${modules || 'plants'}. Title: "ПОСАДОЧНЫЙ ЧЕРТЁЖ УЧАСТКА".`;

                console.log("Отправка запроса в gpt-image-2...");

                let imageBuffer;
                if (imageUrl) {
                    const imgRes = await fetch(imageUrl);
                    const arrayBuffer = await imgRes.arrayBuffer();
                    imageBuffer = Buffer.from(arrayBuffer);
                } else {
                    const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
                    if (!file) throw new Error("Фото не получено");
                    imageBuffer = fs.readFileSync(file.filepath);
                }

                const pollFormData = new globalThis.FormData();
                pollFormData.append('prompt', finalPrompt);
                pollFormData.append('model', 'gpt-image-2'); // Оставляем твою любимую модель
                pollFormData.append('response_format', 'b64_json'); 

                const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
                pollFormData.append('image', imageBlob, 'blueprint.jpg');

                const pollRes = await fetch('https://gen.pollinations.ai/v1/images/edits', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${POLLINATIONS_API_KEY}` },
                    body: pollFormData
                });

                const pollData = await pollRes.json();
                if (!pollRes.ok) throw new Error(pollData.error?.message || "Ошибка Pollinations");

                const result = pollData.data?.[0];

                res.status(200).json({ 
                    success: true, 
                    done: true, 
                    provider: 'pollinations', 
                    image: result?.b64_json || result?.url, 
                    isUrl: !!result?.url 
                });
                return resolve();

            } catch (e) {
                console.error("Ошибка чертежа:", e.message);
                res.status(500).json({ success: false, error: e.message });
                return resolve();
            }
        });
    });
}
