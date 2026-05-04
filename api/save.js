import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const form = new IncomingForm();
    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ success: false });

        try {
            const getVal = (v) => Array.isArray(v) ? v[0] : v;
            const phone = getVal(fields.phone) || 'unknown';
            const style = getVal(fields.style);
            const custom = getVal(fields.customRequest);
            const imageUrl = getVal(fields.image_url);
            // Добавляем получение количества купленных генераций и доработок
            const genCount = getVal(fields.generationsBought) || 1; 
            const refCount = getVal(fields.refinementsBought) || 0;

            const finalPrompt = `Landscape design, ${style} style. ${custom}. Photorealistic, 8k.`;

            // Логика Pollinations (единственная модель)
            let imageBuffer;
            if (imageUrl) {
                const imgRes = await fetch(imageUrl);
                imageBuffer = Buffer.from(await imgRes.arrayBuffer());
            } else {
                const file = files.image?.[0] || files.image;
                if (!file) throw new Error("Фото не выбрано");
                imageBuffer = fs.readFileSync(file.filepath);
            }

            const pollFormData = new globalThis.FormData();
            pollFormData.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg');
            pollFormData.append('prompt', finalPrompt);
            pollFormData.append('model', 'klein');
            pollFormData.append('response_format', 'url');

            const pollRes = await fetch('https://gen.pollinations.ai/v1/images/edits', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.POLLINATIONS_API_KEY}` },
                body: pollFormData
            });

            const pollData = await pollRes.json();
            const resultUrl = pollData.data?.[0]?.url;

            if (resultUrl) {
                // ЗАПИСЬ В leads.txt
                // Формат: Дата | Телефон | Куплено Ген. | Куплено Доработок
                const logEntry = `${new Date().toLocaleString()} | ${phone} | ${genCount} | ${refCount}\n`;
                fs.appendFileSync('./leads.txt', logEntry);

                return res.status(200).json({
                    success: true,
                    done: true,
                    image: resultUrl,
                    isUrl: true
                });
            } else {
                throw new Error("Ошибка генерации");
            }

        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });
}
