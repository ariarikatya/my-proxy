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
    'эконом стиль': 'simple functional garden, budget-friendly materials',
    'английский пейзажный стиль': 'English landscape style, natural aesthetic',
    'китайский азиатский стиль': 'Chinese oriental style, zen atmosphere',
    'хай-тек': 'high-tech style, modern materials, sharp geometric lines',
    'кантри деревенский стиль': 'rustic country style, cozy rural atmosphere',
    'классический регулярный стиль': 'classic formal style, symmetrical layout',
    'прованс': 'French Provence style, southern European garden mood',
    'скандинавский стиль': 'Scandinavian style, Nordic minimalism, natural textures',
    'средиземноморский стиль': 'Mediterranean style, warm coastal atmosphere',
    'минимализм': 'minimalist style, clean simple lines, spacious',
    'природный экостиль': 'natural eco-style, sustainable look',
    'модерн': 'modernist landscape, elegant flowing shapes',
    'колониальный стиль': 'colonial garden style, traditional estate look',
    'мавританский стиль': 'Moorish decorative style, oriental ornamental mood'
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

                // --- АБСОЛЮТНО УНИВЕРСАЛЬНЫЙ ПРОМТ ДЛЯ ЛЮБЫХ УЧАСТКОВ ---
let promptParts = [
    "Professional landscape design modification integration",
    "the new landscape elements must be placed strictly on the empty ground soil surfaces and lawn zones"
];

// Добавляем выбранные модули (розы, пруды, теплицы)
if (modules) {
    promptParts.push(`beautifully adding and integrating ${modules} into the landscape layout`);
} else {
    promptParts.push("adding fresh neat green lawn grass");
}

// Добавляем выбранный стиль ландшафта
if (style) {
    const translatedStyle = styleTranslations[style.toLowerCase()] || style;
    promptParts.push(`stylized in ${translatedStyle}`);
}

if (custom) {
    promptParts.push(`${custom}`);
}

// КРИТИЧЕСКИЙ БЛОК: Запрещаем ИИ перестраивать то, что уже есть на фото (дома, бани, заборы, бассейны)
promptParts.push("KEEP and preserve all existing buildings, houses, structures, fences, and background elements from the original photo completely intact and unchanged");
promptParts.push("do not alter or change any pre-existing architectural objects on the source image");

// Качественные модификаторы (без ключевых слов "architectural", чтобы ИИ не вздумал перестраивать архитектуру)
promptParts.push("photorealistic garden, 8k resolution, highly detailed plants and flowers, realistic natural daylight, crisp professional photography");

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
              
                pollFormData.append('strength', '0.40');

                const pollRes = await fetch('https://gen.pollinations.ai/v1/images/edits', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${POLLINATIONS_API_KEY}` },
                    body: pollFormData
                });

                const pollData = await pollRes.json();
                if (!pollRes.ok) throw new Error(pollData.error?.message || "Ошибка Pollinations");

                const result = pollData.data?.[0];

                // === ФОНОВАЯ ПРОВЕРКА БАЛАНСА И УВЕДОМЛЕНИЯ ===
                try {
                    const balanceRes = await fetch('https://gen.pollinations.ai/account/balance', {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${POLLINATIONS_API_KEY}` }
                    });

                    if (balanceRes.ok) {
                        const balanceData = await balanceRes.json();
                        const currentBalance = balanceData.balance;
                        console.log("Текущий баланс:", currentBalance);

                        // Уведомляем, если баланс упал ниже $10.0
                        if (currentBalance < 10.0) {
                            const alertText = `🚨 ВНИМАНИЕ! Баланс Pollinations API на исходе! Осталось всего: $${currentBalance}. Пожалуйста, пополните счет, чтобы генерация у клиентов не остановилась.`;

                            // 1. ОТПРАВКА НА ПОЧТУ (через твой Formspark)
                            fetch('https://submit-form.com/7MSGuX47l', {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json'
                                },
                                body: JSON.stringify({
                                    email: 'ariarikaty@gmail.com',
                                    message: alertText
                                })
                            }).catch(e => console.error("Ошибка отправки почты через Formspark:", e));

                            // 2. ОТПРАВКА В МЕССЕНДЖЕР МАКС (max.ru)
                            const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN; // Токен бота МАКС
                            const MAX_CHAT_ID = process.env.MAX_CHAT_ID;     // Твой Chat ID в МАКС

                            if (MAX_BOT_TOKEN && MAX_CHAT_ID) {
                                fetch(`https://api.max.ru/bot/v1/messages.send`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${MAX_BOT_TOKEN}`
                                    },
                                    body: JSON.stringify({
                                        chat_id: MAX_CHAT_ID,
                                        text: alertText
                                    })
                                }).catch(e => console.error("Ошибка отправки сообщения в МАКС:", e));
                            }
                        }
                    }
                } catch (balanceError) {
                    console.error("Ошибка при фоновой проверке баланса:", balanceError);
                }
                // === КОНЕЦ БЛОКА ПРОВЕРКИ ===

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
