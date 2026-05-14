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
  const styleTranslations = {
    'эконом стиль': 'minimalist functional low-budget garden',
    'английский пейзажный стиль': 'English landscape garden, natural cottage style',
    'китайский азиатский стиль': 'traditional Chinese garden, pagoda, koi pond, bamboo, stone lanterns',
    'хай-тек': 'high-tech modern garden, geometric lines, concrete and steel elements',
    'кантри деревенский стиль': 'rustic country garden, wildflowers, wooden fences',
    'классический регулярный стиль': 'French formal garden, symmetrical hedges, classical statues',
    'прованс': 'French Provence style, lavender fields, stone walls',
    'скандинавский стиль': 'Scandinavian garden, pine trees, minimalist wood deck',
    'средиземноморский стиль': 'Mediterranean garden, terracotta pots, cypress trees, gravel paths',
    'минимализм': 'ultra-modern minimalist landscape, clean lines',
    'природный экостиль': 'wild eco-style garden, biodiversity, natural woodland',
    'модерн': 'art nouveau landscaping, curved paths, decorative ironwork',
    'колониальный стиль': 'colonial plantation garden, large verandas, tropical plants',
    'мавританский стиль': 'Moorish courtyard garden, colorful tiles, central fountain'
};
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
                const style = getVal(fields.style);
                const custom = getVal(fields.customRequest);
                const modules = getVal(fields.modules); // Здесь приходят пруд, розы и т.д.
                const imageUrl = getVal(fields.image_url);

                // СОСТАВЛЯЕМ ПРАВИЛЬНЫЙ ПРОМТ
                let promptParts = ["Landscape design"];
                
                if (style) {
                    // ПРОВЕРКА: Если есть перевод в словаре — берем его, если нет — оставляем оригинал
                    const translatedStyle = styleTranslations[style.toLowerCase()] || style;
                    promptParts.push(`${translatedStyle} style`);
                }
                
                // Добавляем выбранные модули (розы, пруды), если они есть
                if (modules) promptParts.push(`featuring ${modules}`);
                
                if (custom) promptParts.push(`${custom}`);

                // Усиливаем промт профессиональными ключевыми словами
                promptParts.push("photorealistic, 8k, highly detailed, professional landscaping, cinematic lighting, architectural photography");

                const finalPrompt = promptParts.join(', ');

                console.log("Финальный промт, отправляемый в API:", finalPrompt);

                let imageBuffer;
                if (imageUrl) {
                    const imgRes = await fetch(imageUrl);
                    const arrayBuffer = await imgRes.arrayBuffer();
                    imageBuffer = Buffer.from(arrayBuffer);
                } else {
                    const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);
                    if (!file) throw new Error("Фото не выбрано");
                    imageBuffer = fs.readFileSync(file.filepath);
                }

                const pollFormData = new globalThis.FormData();
                pollFormData.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg');
                pollFormData.append('prompt', finalPrompt);
                pollFormData.append('model', 'klein');
                pollFormData.append('response_format', 'b64_json'); 

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
                res.status(500).json({ success: false, error: e.message });
                return resolve();
            }
        });
    });
}
