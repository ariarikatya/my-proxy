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
    const moduleTranslations = {
    'идеальный газон': 'perfect fresh green lawn grass',
    'плодовые деревья': 'fruiting orchard trees with apples and pears',
    'огород': 'organized vegetable garden beds, neat raised patches',
    'миксбордер': 'lush layered perennial mixborder flowerbed along the edge',
    'камни': 'decorative landscape boulders, natural stones, rock accents',
    'прудик': 'small peaceful garden pond with water lilies and clear water',
    'злаки': 'ornamental tall fluffy grasses, tufted meadow-grass',
    'розы': 'gorgeous blooming rose bushes, vibrant roses in full bloom',
    'карликовые растения': 'charming dwarf shrubs and miniature miniature plants',
    'на штамбе': 'elegant topiary trees on a single high stem, standard trees',
    'хвойные': 'evergreen coniferous plants, small pine and thuja bushes',
    'живые изгороди': 'neatly sheared dense green hedge row'
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
    const modules = getVal(fields.modules); // Тут прилетает строка типа "Идеальный газон, Розы"
    const imageUrl = getVal(fields.image_url);

    let corePrompt = [];

    // 2. РАЗБИРАЕМ И ПЕРЕВОДИМ МНОЖЕСТВЕННЫЕ ФИЛЬТРЫ:
    if (modules && modules.trim().length > 0) {
        // Режем строку по запятым на отдельные элементы
        const chosenModules = modules.split(',')
            .map(item => item.trim().toLowerCase()) // переводим в нижний регистр и убираем пробелы
            .filter(item => item.length > 0);

        // Переводим каждый элемент через наш словарь
        const translatedModules = chosenModules.map(mod => {
            return moduleTranslations[mod] || mod; // Если слова нет в словаре, оставит как есть
        });

        // Запихиваем переведенные модули в главный фокус промта
        corePrompt.push(`CRITICAL TASK: Beautifully plant, build, and integrate these elements directly into the foreground and middle ground: ${translatedModules.join(', ')}`);
    } else {
        // Если ничего не выбрано — просто фигачим траву
        corePrompt.push("CRITICAL TASK: cover the entire ground with a beautiful fresh neat green lawn grass");
    }

    // 3. Добавляем стиль
    if (style) {
        const translatedStyle = styleTranslations[style.toLowerCase().trim()] || style;
        corePrompt.push(`overall garden design style: ${translatedStyle}`);
    }

    if (custom) {
        corePrompt.push(`user custom instruction: ${custom}`);
    }

    // Технические хвосты
    corePrompt.push("professional landscape architecture design photography");
    corePrompt.push("PRESERVE COMPLETELY UNCHANGED: the original wooden fence, background houses, cars, background trees, and overall layout must remain 100% identical and untouched");
    corePrompt.push("do not alter existing buildings or change the fence structure");
    corePrompt.push("photorealistic, hyperrealistic masterwork, 8k resolution, crisp daytime lighting");

    const finalPrompt = corePrompt.join(', ');
    console.log("🔥 НАСТОЯЩИЙ ПРОКАЧАННЫЙ ПРОМТ ДЛЯ СЕТИ:", finalPrompt);

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

                const currentStrength = modules ? '0.55' : '0.40';
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

                        if (currentBalance < 10.001) {
                            const now = Date.now();
                            const cooldown = 24 * 60 * 60 * 1000; 

                            // 🔥 ФИКС: Безопасно достаем сохраненный таймер из глобального окружения
                            let lastAlertTime = global.lastAlertTime || 0;

                            if (now - lastAlertTime > cooldown) {
                                // 🔥 ФИКС: Записываем новое время в глобальный объект, чтобы оно не стерлось
                                global.lastAlertTime = now; 

                                const alertText = `🚨 ВНИМАНИЕ! Баланс Pollinations API на исходе! Осталось всего: $${currentBalance}.\n\nПожалуйста, пополните счет: https://enter.pollinations.ai`;

                                console.log("📬 Лимит пройден. Отправка алерта в Formspark...");
                                await fetch('https://submit-form.com/7MSGuX47l', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                                    body: JSON.stringify({ email: 'ariarikaty@gmail.com', message: alertText })
                                }).then(r => console.log(`Formspark ответ: ${r.status}`))
                                  .catch(e => console.error("Ошибка Formspark:", e));

                                // --- ИНТЕГРАЦИЯ С ВК ---
                                const VK_BOT_TOKEN = process.env.VK_BOT_TOKEN;
                                const VK_USER_ID = process.env.VK_USER_ID;

                                if (VK_BOT_TOKEN && VK_USER_ID) {
                                    console.log("📲 Отправка алерта во ВКонтакте...");
                                    
                                    const vkParams = new URLSearchParams({
                                        user_id: VK_USER_ID,
                                        message: alertText,
                                        access_token: VK_BOT_TOKEN,
                                        v: '5.131',
                                        random_id: Math.floor(Math.random() * 2147483647).toString()
                                    });

                                    await fetch(`https://api.vk.com/method/messages.send`, {
                                        method: 'POST',
                                        body: vkParams
                                    }).then(async (r) => {
                                        const vkData = await r.json();
                                        if (vkData.error) {
                                            console.error("❌ Ошибка API ВК:", vkData.error.error_msg);
                                        } else {
                                            console.log("✅ Уведомление в ВК успешно отправлено!");
                                        }
                                    }).catch(e => console.error("Ошибка сети при запросе к ВК:", e));
                                } else {
                                    console.log("⚠️ Переменные VK_BOT_TOKEN или VK_USER_ID не настроены.");
                                }
                            } else {
                                console.log("⏳ Уведомление заблокировано: суточный кулдаун еще не истек.");
                            }
                        }
                    }
                } catch (balanceError) {
                    console.error("Ошибка в блоке уведомлений:", balanceError);
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
