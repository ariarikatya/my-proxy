import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const config = { 
    api: { bodyParser: false },
    maxDuration: 60 
};

const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;

// Инициализируем глобальное хранилище задач в памяти сервера, если его нет
if (!global.blueprintTasks) {
    global.blueprintTasks = {};
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // -------------------------------------------------------------------------
    // 1. ОБРАБОТКА GET-ЗАПРОСА (Фронтенд спрашивает: "Ну что, готово?")
    // -------------------------------------------------------------------------
    if (req.method === 'GET') {
        const { taskId } = req.query;
        
        if (!taskId || !global.blueprintTasks[taskId]) {
            return res.status(404).json({ status: 'error', message: 'Задача не найдена или устарела' });
        }
        
        // Возвращаем текущее состояние: { status: 'pending' } или { status: 'done', imageUrl: '...' }
        return res.status(200).json(global.blueprintTasks[taskId]);
    }

    // -------------------------------------------------------------------------
    // 2. ОБРАБОТКА POST-ЗАПРОСА (Фронтенд прислал форму и картинку на генерацию)
    // -------------------------------------------------------------------------
    if (req.method === 'POST') {
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

                    const finalPrompt = `STRICT 2D IMAGE-TO-IMAGE RECONSTRUCTION. 
Flat 2D top-down orthographic blueprint, landscape engineering schematic style.
1. Trace the EXACT outer perimeter, boundaries, and structure positions 1:1 from the attached photo.
2. STRICT FORBIDDEN ZONE: Do not invent or add any new structures, houses, or elements. If an area is empty in the photo, keep it empty.
3. Style: Stark solid white background, crisp ultra-fine black lines only. No colors, no 3D depth, no shading. Trees as precise circles with central dots, mass plantings as cloud-like technical symbols.
4. Typography & Legend: Top center title "ПОСАДОЧНЫЙ ЧЕРТЁЖ УЧАСТКА". On the right, a structured table titled "Условные обозначения" with a numbered list matching active filters: ${modules || 'растения'}. Draw thin leader lines with callout circles connecting table rows to drawing elements.`;

                    // Читаем картинку во временный буфер сервера
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

                    // Генерируем уникальный ID для этой сессии чертежа
                    const taskId = 'blueprint_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    
                    // Записываем в память, что задача запущенна
                    global.blueprintTasks[taskId] = { status: 'pending', imageUrl: null };

                    // !!! САМЫЙ ВАЖНЫЙ МОМЕНТ !!! 
                    // Отдаем фронтенду taskId МГНОВЕННО (за 50 миллисекунд). Vercel спокоен, 504 ошибки не будет.
                    res.status(200).json({ success: true, taskId: taskId });
                    resolve(); // Освобождаем главный поток ответа

                    // -------------------------------------------------------------------------
                    // ФОНОВЫЙ ПРОЦЕСС: Пингуем Pollinations в фоне, пока фронт крутит лоадер
                    // -------------------------------------------------------------------------
                    (async () => {
                        try {
                            console.log(`[ФОН] Отправка запроса чертежа ${taskId} в Pollinations...`);

                            const pollFormData = new globalThis.FormData();
                            pollFormData.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg');
                            pollFormData.append('prompt', finalPrompt);
                            pollFormData.append('model', 'gpt-image-2'); 
                            pollFormData.append('response_format', 'b64_json'); 

                            const pollRes = await fetch('https://gen.pollinations.ai/v1/images/edits', {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${POLLINATIONS_API_KEY}` },
                                body: pollFormData
                            });

                            const pollData = await pollRes.json();
                            if (!pollRes.ok) throw new Error(pollData.error?.message || "Ошибка Pollinations");

                            const result = pollData.data?.[0];
                            
                            // Формируем финальную строку с картинкой (Base64 или URL)
                            let finalImage = result?.b64_json || result?.url;
                            if (result?.b64_json && !result.b64_json.startsWith('data:')) {
                                finalImage = 'data:image/jpeg;base64,' + result.b64_json;
                            }

                            // Обновляем статус в памяти — картинка ГОТОВА!
                            global.blueprintTasks[taskId] = { 
                                status: 'done', 
                                imageUrl: finalImage 
                            };
                            console.log(`[ФОН] Чертеж ${taskId} успешно сгенерирован!`);

                        } catch (bgErr) {
                            console.error(`[ФОН КРИТ] Ошибка генерации для задачи ${taskId}:`, bgErr.message);
                            // Если всё упало, пишем ошибку, чтобы фронтенд вывел её юзеру, а не завис
                            global.blueprintTasks[taskId] = { 
                                status: 'error', 
                                message: bgErr.message 
                            };
                        }
                    })();

                } catch (e) {
                    res.status(500).json({ success: false, error: e.message });
                    return resolve();
                }
            });
        });
    }
}
