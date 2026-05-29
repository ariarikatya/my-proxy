import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const config = { 
    api: { bodyParser: false },
    maxDuration: 60 
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

                const finalPrompt = `STRICT IMAGE-TO-IMAGE RECONSTRUCTION AND GEOMETRIC TRACING.
Flat 2D top-down orthographic blueprint look. Pure landscape engineering schematic.

CRITICAL OBJECT MAPPING (ZERO IMMAGINATION ALLOWED):
1. Detect and preserve the EXACT outer perimeter shape, boundaries, and angles of the plot directly from the attached image.
2. Identify all actual prominent visual landmarks and structures present in the image.
3. Translate their precise scale, coordinates, and spatial distribution 1:1 onto the flat 2D layout.
4. STRICT FORBIDDEN ZONE: Do not invent, do not add, and do not suggest any elements that are NOT visible in the source photo.

Graphic Style & Symbology:
- Minimalist engineering schematic style on a stark, solid white background. 
- Crisp, ultra-fine black lines only. No 3D depth, no volumetric shading, no photo textures, no colors.
- Standalone major features are represented as single precise geometric circles with a crosshair.

Russian Typography & Adaptive Legend Table:
- Main Title at the top center exactly: "ПОСАДОЧНЫЙ ЧЕРТЁЖ УЧАСТКА"
- On the right side, draw a clean structured table titled: "Условные обозначения"
- Inside the table, dynamically generate a numbered list ONLY for: ${modules || 'растения'}.`;

                console.log("Отправка быстрого запроса чертежа в Pollinations...");

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
                pollFormData.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg');
                pollFormData.append('prompt', finalPrompt);
                pollFormData.append('model', 'gpt-image-2'); 
                
                // === КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: УБРАЛИ b64_json ===
                // Pollinations вернет ответ моментально, не дожидаясь рендеринга

                const pollRes = await fetch('https://gen.pollinations.ai/v1/images/edits', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${POLLINATIONS_API_KEY}` },
                    body: pollFormData
                });

                const pollData = await pollRes.json();
                if (!pollRes.ok) throw new Error(pollData.error?.message || "Ошибка Pollinations");

                // Получаем прямую URL-ссылку на генерацию
                const resultUrl = pollData.data?.[0]?.url;

                if (!resultUrl) throw new Error("Ссылка от API не получена");

                // Сразу же отдаем её фронтенду! Функция завершается за 2 секунды.
                res.status(200).json({ 
                    success: true, 
                    done: true, 
                    provider: 'pollinations', 
                    image: resultUrl, 
                    isUrl: true 
                });
                return resolve();

            } catch (e) {
                res.status(500).json({ success: false, error: e.message });
                return resolve();
            }
        });
    });
}
