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
        'английский пейзажный стиль': 'classic English landscape style, natural cottage aesthetic, lush perennial borders',
        'китайский азиатский стиль': 'Chinese oriental style, zen atmosphere, rocks and gravel',
        'хай-тек': 'high-tech style, modern materials, sharp geometric lines, minimalist lighting',
        'кантри деревенский стиль': 'rustic country style, cozy rural atmosphere, wildflowers',
        'классический регулярный стиль': 'classic formal style, symmetrical layout, neat hedges',
        'прованс': 'French Provence style, lavender fields, gravel paths, light stone accents, southern European atmosphere',
        'скандинавский стиль': 'Scandinavian style, Nordic minimalism, natural textures',
        'средиземноморский стиль': 'Mediterranean style, warm coastal atmosphere, terracotta pots',
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
                const modules = getVal(fields.modules); 
                const imageUrl = getVal(fields.image_url);

                let promptParts = [
                    "Professional landscape design architecture modification",
                    "highly detailed garden overhaul integration"
                ];

                if (modules) {
                    promptParts.push(`CHIEF TASK: seamlessly build, dig and integrate ${modules} directly into the ground on the foreground and middle ground`);
                } else {
                    promptParts.push("completely replacing the dirty soil with a beautiful fresh neat green lawn grass");
                }

                if (style) {
                    const translatedStyle = styleTranslations[style.toLowerCase()] || style;
                    promptParts.push(`the entire garden must be heavily stylized in ${translatedStyle}`);
                }

                if (custom) {
                    promptParts.push(`${custom}`);
                }

                promptParts.push("KEEP and preserve the main wooden fence, background trees, houses, and cars from the original photo completely intact and unchanged");
                promptParts.push("do not alter or modify the shape of the existing fence or pre-existing buildings");
                promptParts.push("photorealistic masterwork, 8k resolution, crisp professional landscape photography, beautiful daylight lighting");

                const finalPrompt = promptParts.join(', ');
                console.log("Новый прокачанный промт:", finalPrompt);

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
                pollFormData.append('prompt', finalPrompt);
                pollFormData.append('model', 'klein');
                pollFormData.append('response_format', 'b64_json'); 

                const currentStrength = modules ? '0.50' : '0.40';
                pollFormData.append('strength', currentStrength);

                const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
                pollFormData.append('image', imageBlob, 'image.jpg');

                const pollRes = await fetch('https://gen.pollinations.ai/v1/images/edits', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${POLLINATIONS_API_KEY}` },
                    body: pollFormData
                });

                const pollData = await pollRes.json();
                if (!pollRes.ok) throw new Error(pollData.error?.message || "Ошибка Pollinations");

                const result = pollData.data?.[0];

                // Фоновая проверка баланса
                try {
                    const balanceRes = await fetch('https://gen.pollinations.ai/account/balance', {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${POLLINATIONS_API_KEY}` }
                    });

                    if (balanceRes.ok) {
                        const balanceData = await balanceRes.json();
                        const currentBalance = balanceData.balance;

                        if (currentBalance < 10.0) {
                            const alertText = `🚨 ВНИМАНИЕ! Баланс Pollinations API на исходе! Осталось всего: $${currentBalance}. Пожалуйста, пополните счет, чтобы генерация у клиентов не остановилась.`;

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

                            const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN;
                            const MAX_CHAT_ID = process.env.MAX_CHAT_ID;

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
